const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// SQL is inspected only: no database connection or RPC is executed.
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sql = read('sql/fix_print_agent_owner_access.sql');
const old = read('sql/add_print_agent_activation.sql');
const frontend = read('gestao.js');
const definitions = source => [...source.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\$\$;/gi)];
const functions = definitions(sql);
const stripComments = source => source.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

test('migration is transactional, contains only the three replacements and explicit ACLs', () => {
  expect(functions.map(match => match[1])).toEqual([
    'generate_print_agent_activation_code', 'list_print_agent_devices', 'revoke_print_agent_device',
  ]);
  expect(sql).not.toMatch(/\bCASCADE\b/i);
  const outside = stripComments(sql.replace(/create or replace function[\s\S]*?\$\$;/gi, ''));
  const signatures = ['generate_print_agent_activation_code(text, text, int)', 'list_print_agent_devices()', 'revoke_print_agent_device(uuid)'];
  expect(outside).toBe('BEGIN; ' + signatures.map(signature =>
    `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC; REVOKE ALL ON FUNCTION public.${signature} FROM anon; GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`
  ).join(' ') + ' COMMIT;');
});

for (const [definition, name] of functions) {
  test(`${name}: only the role predicate changes; signatures, security, hashes and logic preserved`, () => {
    const original = definitions(old).find(match => match[1] === name)[0];
    expect(stripComments(definition)).toBe(stripComments(original.replace("p.role = 'admin'", "p.role in ('admin', 'owner')")));
    expect(definition).toMatch(/security definer\s+set search_path = public/i);
    expect(definition).not.toContain('device_token_hash');
    expect(definition).toMatch(/raise exception 'not_authorized' using errcode = '42501'/);
  });

  // Validate the exact complete SQL guard before evaluating its truth table locally.
  // This is a static contract test, not a PostgreSQL integration test.
  for (const role of ['admin', 'owner', 'employee', 'cashier', 'user', 'customer', '', null]) {
    for (const active of [true, false, null]) {
      test(`${name}: role=${role}, is_active=${active} authorization contract`, () => {
        const guard = definition.match(/if not exists \(([\s\S]*?)\) then/)[1];
        expect(stripComments(guard)).toBe("select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'owner') and coalesce(p.is_active, true) = true");
        const allowedRoles = [...guard.matchAll(/'(admin|owner)'/g)].map(match => match[1]);
        const permits = (profileId, uid) => uid != null && profileId === uid && allowedRoles.includes(role) && (active ?? true);
        expect(permits('self', 'self')).toBe(['admin', 'owner'].includes(role) && active !== false);
        expect(permits('other', 'self')).toBe(false);
        expect(permits(null, null)).toBe(false);
      });
    }
  }
}

const cases = [
  ['HTTP 403', { message: 'Forbidden' }, 403, 'permission'],
  ['SQLSTATE', { code: '42501', message: 'permission denied' }, 400, 'permission'],
  ['not_authorized', { message: 'not_authorized' }, undefined, 'permission'],
  ['error status', { status: 403 }, undefined, 'permission'],
  ['error statusCode', { statusCode: '403' }, undefined, 'permission'],
  ['missing RPC', { code: 'PGRST202' }, 404, 'migration'],
  ['undefined function', { code: '42883' }, 404, 'migration'],
  ['missing relation', { code: '42P01' }, 404, 'migration'],
  ['missing table cache', { code: 'PGRST205' }, 404, 'migration'],
  ['missing function message', { message: 'function public.list_print_agent_devices() does not exist' }, 404, 'migration'],
  ['schema cache message', { message: 'Could not find the function public.list_print_agent_devices in the schema cache' }, 404, 'migration'],
  ['generic 404', { message: 'Not found' }, 404, 'generic'],
  ['server failure', { message: 'Internal server error' }, 500, 'generic'],
  ['network failure', new Error('Failed to fetch'), undefined, 'generic'],
  ['authorization takes precedence', { code: 'PGRST202' }, 403, 'permission'],
];

for (const fn of ['loadPrintAgentDevices', 'paGenerateCode']) {
  for (const [label, error, status, kind] of cases) {
    test(`${fn}: ${label} preserves console error and shows ${kind} message`, async () => {
      const logs = [];
      const messages = [];
      const element = { innerHTML: '' };
      const context = vm.createContext({
        getSb: () => ({ rpc: async () => ({ data: null, error, status }) }),
        getCurrentActor: () => ({ email: 'audit-only@example.test' }),
        elid: () => element,
        toast: message => messages.push(message),
        console: { error: (...args) => logs.push(args) },
      });
      vm.runInContext(frontend.slice(frontend.indexOf('function paRpcErrorMessage('), frontend.indexOf('async function paCopyCode(')), context);
      vm.runInContext(frontend.slice(frontend.indexOf('async function loadPrintAgentDevices('), frontend.indexOf('function renderPrintAgentDevices(')), context);
      await vm.runInContext(`${fn}()`, context);
      expect(logs).toHaveLength(1);
      expect(logs[0][1]).toBe(error);
      const message = fn === 'loadPrintAgentDevices' ? element.innerHTML : messages[0];
      if (kind === 'permission') expect(message).toContain('Sua conta não tem permissão para gerenciar os computadores de impressão.');
      else if (kind === 'migration') expect(message).toContain('Execute a migration SQL (add_print_agent_activation.sql)');
      else expect(message).toContain(fn === 'loadPrintAgentDevices'
        ? 'Não foi possível carregar os computadores ativados. Tente novamente.'
        : 'Não foi possível gerar o código de ativação. Tente novamente.');
      if (kind !== 'migration') expect(message).not.toMatch(/migration/i);
    });
  }
}
