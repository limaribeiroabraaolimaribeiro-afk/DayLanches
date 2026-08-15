# Day Lanches Agent

Programa instalavel para Windows que cuida da **impressao automatica** de
comandas quando chega pedido novo — isso continua rodando 100% local, e nao
foi alterado pela migracao do WhatsApp para a VPS.

Este Agent tambem tem um modulo de WhatsApp local (Baileys) e um robo de
atendimento por menu, usados no "modo sem VPS" abaixo. Com a VPS em
producao (ver [../whatsapp-agent/README.md](../whatsapp-agent/README.md) e
[../infra/evolution/README.md](../infra/evolution/README.md)), o WhatsApp
passa a ser responsabilidade da VPS e **a aba "Atendimento automatico por
menu" deste Agent deve ficar desativada** para nao responder em duplicidade
ao mesmo cliente. A impressao continua normalmente, sem nenhuma mudanca.

## Modo sem VPS (fallback)

Se a VPS/Evolution API estiver fora do ar ou ainda nao configurada, este
Agent pode assumir o WhatsApp completo sozinho:

- O computador da loja precisa ficar ligado durante o atendimento
- Se o computador desligar, impressao e mensagens param
- Ao ligar de novo, o Agent abre sozinho (se configurado)
- Se WhatsApp desconectar, precisa gerar QR de novo

## Pre-requisitos

- Node.js 18+ instalado
- Impressora instalada no Windows (termica 80mm, 58mm ou A4)
- Computador com internet
- WhatsApp da loja para escanear o QR Code

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

O mesmo token e usado para impressao e notificacoes WhatsApp.

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

## Conectar WhatsApp

1. Va na aba **WhatsApp**
2. Clique em **Conectar WhatsApp**
3. Um QR Code aparece na tela
4. No celular da loja, abra WhatsApp > Aparelhos conectados > Conectar
5. Escaneie o QR Code
6. Status muda para "Conectado"

A sessao fica salva no computador. Nao precisa escanear toda vez.

## Ativar monitoramento automatico

1. Na aba **Configuracoes**, ative:
   - **Iniciar com Windows**
   - **Iniciar monitoramento automaticamente**
2. Salve as configuracoes

Com isso, ao ligar o computador:
- O Agent abre sozinho e minimiza na bandeja (perto do relogio)
- Impressao e WhatsApp ja comecam a funcionar

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

### Testar WhatsApp
Na aba WhatsApp, coloque um telefone de teste e clique em **Enviar mensagem de teste**.

## Fluxo de notificacoes

1. Gestao altera status do pedido (ex: Em preparo)
2. Worker cria registro em `order_notifications`
3. Agent busca notificacoes pendentes a cada 10 segundos
4. Agent envia WhatsApp pelo conector local (Baileys)
5. Agent marca notificacao como enviada

## Solucao de problemas

| Problema | Solucao |
|----------|---------|
| "Token invalido" | Verifique se o token e o mesmo do Worker |
| Comanda nao sai | Verifique impressora ligada e selecionada |
| "Erro de conexao" | Verifique internet |
| WhatsApp desconectou | Va na aba WhatsApp e gere novo QR Code |
| Mensagem nao enviou | Verifique se WhatsApp esta conectado |
| Agent nao abre com Windows | Ative "Iniciar com Windows" e salve |

## Migration SQL

Antes de usar o WhatsApp automatico, execute no Supabase:

```
sql/add_local_agent_notifications.sql
```

Isso cria a tabela `order_notifications` necessaria para a fila de mensagens.
