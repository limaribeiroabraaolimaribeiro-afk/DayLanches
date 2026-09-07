/* Stub de window.supabaseClient injetado via page.addInitScript() ANTES de
   qualquer script da página rodar. Substitui o SDK real do Supabase (que é
   bloqueado via page.route no helper de teste) para que os testes rodem
   sem rede e sem tocar produção — nenhuma chamada real de auth/RPC sai
   daqui, tudo é respondido em memória pelo próprio navegador do teste.

   Exposto em window.__testAuth para os testes controlarem sessão/RPCs:
     - fireAuthEvent(event, user) → simula onAuthStateChange
     - setRpcResponse(name, fn)   → sobrescreve a resposta de uma RPC
     - getRpcCalls()              → histórico de chamadas .rpc() feitas
     - getSession()               → sessão "atual" simulada
*/
(() => {
  /* Neutraliza o registro do service worker (gestao-sw.js) direto na API,
     em vez de tentar bloquear a requisição de rede: no ambiente de teste,
     um SW já ativo (de alguma execução anterior) intercepta fetch() de
     DENTRO do worker, um target que page.route() do Playwright não enxerga
     — então depois de um page.reload() os stubs de rede paravam de valer e
     o navegador baixava o SDK real do Supabase. Sobrescrever register()
     garante que nenhum SW nunca fica ativo nestes testes, não importa o
     que esteja em cache. gestao.js já trata a falha com .catch(()=>{}). */
  if (window.navigator?.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.reject(new Error('service worker desabilitado nos testes'));
  }

  const state = {
    listeners: [],
    session: null,
    rpcCalls: [],
    rpcResponses: {
      get_management_pin_state: () => ({
        data: [{ is_configured: true, can_manage: true, auto_lock_minutes: 30 }],
        error: null,
      }),
      verify_management_pin: () => ({ data: true, error: null }),
      set_management_pin: () => ({ data: true, error: null }),
      set_management_pin_auto_lock: (params) => {
        const minutes = params?.input_minutes;
        if (![15, 30, 60, 120].includes(minutes)) {
          return { data: null, error: { message: 'invalid_minutes' } };
        }
        return { data: true, error: null };
      },
    },
  };

  // Resposta default por tabela (data=[]/error=null, igual o builder sempre
  // devolveu) — sobrescrita por teste via window.__testAuth.setTableResponse().
  // Não muda nada do comportamento já existente enquanto nenhum teste chamar
  // isso: toda tabela sem handler registrado continua caindo no default.
  state.tableResponses = {};
  state.fromCalls = [];

  function makeQueryBuilder(table) {
    // Builder genérico: qualquer método de encadeamento (.select/.eq/...)
    // devolve o próprio builder e acumula filtros/payload; o await final
    // resolve a resposta registrada pra esta tabela (setTableResponse) ou,
    // por padrão, {data: [], error: null} — suficiente pra tudo que
    // gestao.js faz fora do PIN (produtos/pedidos/config), que já trata
    // data=[]/null com fallback.
    let method = 'select';
    let payload = null;
    const filters = {};
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      single: () => builder,
      insert: (data) => { method = 'insert'; payload = data; return builder; },
      update: (data) => { method = 'update'; payload = data; return builder; },
      upsert: (data) => { method = 'upsert'; payload = data; return builder; },
      delete: () => { method = 'delete'; return builder; },
      then: (resolve, reject) => {
        const call = { table, method, payload, filters: { ...filters } };
        state.fromCalls.push(call);
        const handler = state.tableResponses[table];
        const result = handler ? handler(call) : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
      catch: (reject) => {
        const handler = state.tableResponses[table];
        const result = handler ? handler({ table, method, payload, filters: { ...filters } }) : { data: [], error: null };
        return Promise.resolve(result).catch(reject);
      },
    };
    return builder;
  }

  function fireAuthEvent(event, user) {
    state.session = user ? { user, access_token: 'fake-token-' + Date.now() } : null;
    state.listeners.forEach((cb) => cb(event, state.session));
  }

  window.__testAuth = {
    fireAuthEvent,
    setRpcResponse(name, fn) { state.rpcResponses[name] = fn; },
    getRpcCalls: () => state.rpcCalls.slice(),
    getSession: () => state.session,
    setTableResponse(table, fn) { state.tableResponses[table] = fn; },
    getFromCalls: () => state.fromCalls.slice(),
  };

  window.supabaseClient = {
    auth: {
      signInWithPassword: async () => ({ data: { session: state.session }, error: null }),
      signOut: async () => { fireAuthEvent('SIGNED_OUT', null); return { error: null }; },
      updateUser: async () => ({ data: {}, error: null }),
      getUser: async () => ({ data: { user: state.session?.user || null } }),
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange(cb) {
        state.listeners.push(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const i = state.listeners.indexOf(cb);
                if (i >= 0) state.listeners.splice(i, 1);
              },
            },
          },
        };
      },
    },
    rpc(name, params) {
      state.rpcCalls.push({ name, params });
      const handler = state.rpcResponses[name];
      const result = handler ? handler(params) : { data: null, error: { message: 'rpc_not_mocked: ' + name } };
      return Promise.resolve(result);
    },
    from(table) { return makeQueryBuilder(table); },
  };
})();
