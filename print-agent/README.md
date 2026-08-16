# Day Lanches Agent

Programa instalavel para Windows que cuida da **impressao automatica** de
comandas quando chega pedido novo, direto na impressora da loja.

O WhatsApp automatico (mensagens de status e atendimento por menu) roda na
VPS, fora deste programa — ver [../whatsapp-agent/README.md](../whatsapp-agent/README.md)
e [../infra/evolution/README.md](../infra/evolution/README.md). Este Agent
cuida somente da impressao.

## Pre-requisitos

- Node.js 18+ instalado
- Impressora instalada no Windows (termica 80mm, 58mm ou A4)
- Computador com internet

## Instalacao (desenvolvimento)

```bash
cd print-agent
npm install
npm run dev
```

## Gerar instalador (.exe)

```bash
npm run build
```

O instalador sera gerado em `print-agent/dist/`:
**Day-Lanches-Agent-Setup.exe**

## Configurar o token no Worker

No terminal, dentro da pasta `worker/`:

```bash
wrangler secret put PRINT_AGENT_TOKEN
```

## Instalar no computador da loja

1. Copie o arquivo `Day-Lanches-Agent-Setup.exe` para o computador
2. Execute o instalador
3. Abra o programa **Day Lanches Agent**

## Configurar

1. Va na aba **Configuracoes**
2. **URL do Worker**: ja vem preenchida
3. **Token do agente**: cole o token configurado no Worker
4. **Impressora**: selecione a impressora do Windows
5. **Tipo de papel**: escolha o tipo correto
6. Clique em **Salvar configuracoes**

## Ativar monitoramento automatico

1. Na aba **Configuracoes**, ative:
   - **Iniciar com Windows**
   - **Iniciar monitoramento automaticamente**
2. Salve as configuracoes

Com isso, ao ligar o computador, o Agent abre sozinho e minimiza na bandeja
(perto do relogio), e a impressao ja comeca a funcionar.

## Bandeja do sistema

O Agent fica rodando na bandeja (perto do relogio):
- Duplo-clique: abre o painel
- Clique direito: menu com opcoes
- Fechar no X: minimiza para bandeja (nao fecha)

Para fechar de verdade: clique direito na bandeja > Sair.

## Testar

### Testar conexao
Clique em **Testar conexao** para verificar comunicacao com o Worker.

### Testar impressao
Clique em **Testar impressao** para enviar comanda de teste.

## Fluxo de impressao

1. Cliente ou balcao cria um pedido
2. Worker marca o pedido como pendente de impressao (`printed_at` vazio)
3. Agent busca pedidos pendentes a cada 5 segundos
4. Agent imprime a comanda na impressora configurada
5. Agent marca o pedido como impresso

## Solucao de problemas

| Problema | Solucao |
|----------|---------|
| "Token invalido" | Verifique se o token e o mesmo do Worker |
| Comanda nao sai | Verifique impressora ligada e selecionada |
| "Erro de conexao" | Verifique internet |
| Agent nao abre com Windows | Ative "Iniciar com Windows" e salve |
