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

  function makeQueryBuilder() {
    // Builder genérico: qualquer método de encadeamento (.select/.eq/...)
    // devolve o próprio builder, e o await final resolve sempre a mesma
    // resposta — suficiente pra tudo que gestao.js faz fora do PIN
    // (produtos/pedidos/config), que já trata data=[]/null com fallback.
    const result = { data: [], error: null };
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: () => builder,
      single: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
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
    from() { return makeQueryBuilder(); },
  };
})();
