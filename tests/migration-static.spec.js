// @ts-check
/* Checagem ESTÁTICA da migration SQL — não conecta em nenhum Postgres/Supabase
   real (não temos um banco de testes disponível aqui). Isso confirma que o
   ARQUIVO segue o mesmo padrão de hardening já estabelecido no projeto; não
   substitui rodar a migration de verdade num Supabase de staging antes de ir
   pra produção. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'sql', 'add_management_pin_auto_lock.sql'),
  'utf8'
);

// Remove linhas de comentário (-- ...) antes de checar por palavras-chave de
// SQL de verdade — o arquivo tem comentários em português explicando as
// próprias garantias (ex.: "sem CASCADE", "REVOKE de anon") que, em texto
// livre, contêm as MESMAS palavras que os testes procuram no SQL real.
const sqlWithoutComments = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

test.describe('sql/add_management_pin_auto_lock.sql — hardening estático', () => {
  test('RLS não é tocada e nenhuma policy nova é criada', () => {
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });

  test('management_pin continua sem SELECT direto liberado pra authenticated/anon', () => {
    expect(sql).not.toMatch(/grant\s+select\s+on\s+public\.management_pin/i);
    expect(sql).not.toMatch(/grant\s+all\s+on\s+public\.management_pin\s+to\s+(anon|authenticated)/i);
  });

  test('coluna nova é idempotente (ADD COLUMN IF NOT EXISTS) e tem default/constraint corretos', () => {
    expect(sql).toMatch(/add column if not exists auto_lock_minutes integer not null default 30/i);
    expect(sql).toMatch(/check\s*\(\s*auto_lock_minutes\s+in\s*\(\s*15\s*,\s*30\s*,\s*60\s*,\s*120\s*\)\s*\)/i);
  });

  test('get_management_pin_state() é DROPada antes de recriada (mudança de RETURNS TABLE)', () => {
    const dropIdx = sql.search(/drop function if exists public\.get_management_pin_state\(\)/i);
    const createIdx = sql.search(/create function public\.get_management_pin_state\(\)/i);
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
    expect(sql).toMatch(/returns table\(is_configured boolean, can_manage boolean, auto_lock_minutes integer\)/i);
  });

  test('get_management_pin_state() usa coalesce com default 30 (tabela pode estar vazia)', () => {
    expect(sql).toMatch(/coalesce\(\s*\(select mp\.auto_lock_minutes from public\.management_pin mp where mp\.id = 1\)\s*,\s*30\s*\)/i);
  });

  test('set_management_pin_auto_lock() checa role admin/owner + is_active, igual set_management_pin()', () => {
    const fnMatch = sql.match(/create or replace function public\.set_management_pin_auto_lock[\s\S]*?\$\$;/i);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch[0];
    expect(fn).toMatch(/role in \('admin', 'owner'\)/i);
    expect(fn).toMatch(/coalesce\(p\.is_active, true\) = true/i);
    expect(fn).toMatch(/not_authorized/i);
  });

  test('set_management_pin_auto_lock() rejeita qualquer valor fora de 15/30/60/120', () => {
    const fnMatch = sql.match(/create or replace function public\.set_management_pin_auto_lock[\s\S]*?\$\$;/i);
    expect(fnMatch[0]).toMatch(/input_minutes not in \(15, 30, 60, 120\)/i);
  });

  for (const fn of ['get_management_pin_state', 'set_management_pin_auto_lock']) {
    test(`${fn}(): SECURITY DEFINER + search_path travado + privilégio mínimo (PUBLIC/anon revogados, só authenticated)`, () => {
      const nameEscaped = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(create (?:or replace )?function public\\.${nameEscaped}[\\s\\S]*?)(?=create (?:or replace )?function|notify pgrst|$)`, 'i');
      const block = sql.match(re)?.[1] || '';
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/set search_path = public, pg_temp/i);
      expect(block).toMatch(new RegExp(`revoke all on function public\\.${nameEscaped}\\([^)]*\\) from public`, 'i'));
      expect(block).toMatch(new RegExp(`revoke all on function public\\.${nameEscaped}\\([^)]*\\) from anon`, 'i'));
      expect(block).toMatch(new RegExp(`grant execute on function public\\.${nameEscaped}\\([^)]*\\) to authenticated`, 'i'));
    });
  }

  test('migration não cria PIN nenhum (nenhum INSERT em management_pin com pin_hash)', () => {
    expect(sql).not.toMatch(/insert into public\.management_pin[\s\S]*?pin_hash/i);
  });

  test('notifica o PostgREST antes do COMMIT (dentro da transação)', () => {
    const notifyIdx = sql.search(/notify pgrst, 'reload schema';/i);
    const commitIdx = sql.search(/^commit;/im);
    expect(notifyIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(notifyIdx);
  });

  // AA — migration possui BEGIN/COMMIT ─────────────────────────
  test('AA: toda a migration roda dentro de BEGIN/COMMIT', () => {
    const beginIdx = sql.search(/^begin;/im);
    const commitIdx = sql.search(/^commit;/im);
    expect(beginIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    // COMMIT precisa ser a última instrução real do arquivo (só comentário/linha em branco depois, se algo).
    const afterCommit = sql.slice(commitIdx + 'commit;'.length);
    expect(afterCommit.trim()).toBe('');
  });

  // AB — nenhum statement de verdade roda FORA da transação ──────
  // Proxy estático pra "falha no meio não deixa versão parcial": a garantia
  // de atomicidade é do Postgres (ROLLBACK automático em erro dentro de
  // BEGIN/COMMIT) — o que dá pra checar aqui é que NENHUM DDL/DML do
  // arquivo fica antes do BEGIN ou depois do COMMIT, ou seja, não existe
  // nenhum statement que escaparia dessa garantia transacional.
  test('AB: nenhum DDL/DML roda fora do BEGIN...COMMIT (senão uma falha no meio deixaria resíduo parcial)', () => {
    const beginIdx = sqlWithoutComments.search(/^begin;/im);
    const commitIdx = sqlWithoutComments.search(/^commit;/im);
    expect(beginIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    const before = sqlWithoutComments.slice(0, beginIdx);
    const after = sqlWithoutComments.slice(commitIdx + 'commit;'.length);
    const ddlPattern = /\b(alter table|create( or replace)? function|drop function|grant|revoke|insert into|do \$\$|notify)\b/i;
    expect(before).not.toMatch(ddlPattern);
    expect(after).not.toMatch(ddlPattern);
  });

  // AC — sem CASCADE em nenhum DROP ────────────────────────────
  test('AC: nenhum DROP usa CASCADE (uma dependência não prevista trava o DROP em vez de arrastar tudo)', () => {
    expect(sqlWithoutComments).not.toMatch(/drop[\s\S]{0,60}cascade/i);
  });

  // AD — PIN/hash existente é preservado ───────────────────────
  test('AD: nenhum statement escreve em pin_hash/updated_at/updated_by_email (PIN existente não é tocado)', () => {
    // ALTER TABLE ADD COLUMN nunca escreve em colunas existentes.
    expect(sql).not.toMatch(/\bupdate\s+public\.management_pin\b/i);
    // O único INSERT (upsert em set_management_pin_auto_lock) só pode setar auto_lock_minutes no conflito.
    const onConflictMatch = sql.match(/on conflict \(id\) do update\s+set\s+([^;]+);/i);
    expect(onConflictMatch).toBeTruthy();
    expect(onConflictMatch[1].replace(/\s+/g, ' ').trim()).toBe('auto_lock_minutes = excluded.auto_lock_minutes');
  });

  // AE — segunda execução não duplica a constraint ─────────────
  test('AE: constraint é criada só se ainda não existir (checa pg_constraint, não DROP+ADD)', () => {
    const doBlockMatch = sql.match(/do \$\$[\s\S]*?end \$\$;/i);
    expect(doBlockMatch).toBeTruthy();
    const doBlock = doBlockMatch[0];
    expect(doBlock).toMatch(/select 1 from pg_constraint/i);
    expect(doBlock).toMatch(/conname = 'management_pin_auto_lock_minutes_check'/i);
    expect(doBlock).toMatch(/conrelid = 'public\.management_pin'::regclass/i);
    expect(doBlock).toMatch(/add constraint management_pin_auto_lock_minutes_check/i);
    // Não deve mais existir o padrão antigo (DROP CONSTRAINT IF EXISTS a cada execução).
    expect(sql).not.toMatch(/drop constraint if exists management_pin_auto_lock_minutes_check/i);
  });
});
