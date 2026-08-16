# Day Lanches Impressão

Programa instalável para Windows que cuida **exclusivamente da impressão
automática** de comandas quando chega um pedido novo, direto na impressora
da loja. É um bridge simples entre o sistema online e a impressora — nada
além disso.

O WhatsApp automático (mensagens de status e atendimento por menu) roda na
VPS, fora deste programa — ver [../whatsapp-agent/README.md](../whatsapp-agent/README.md)
e [../infra/evolution/README.md](../infra/evolution/README.md).

## Por que Electron 22

O computador da loja é um HP All-in-One antigo (Windows 7/8/8.1). Electron
23 em diante removeu suporte a essas versões do Windows. Por isso este
projeto fica travado propositalmente em `electron: 22.3.27` (última versão
compatível), pinado sem `^` para nunca ser atualizado sem querer.

**Isso significa que a versão do Electron aqui está fora do ciclo de
segurança oficial do projeto Electron** (suporte oficial encerrado em
10/2023). É uma troca deliberada: compatibilidade com o hardware existente
em vez de recorrer a uma versão de Electron mais nova. Não implemente
auto-update automático neste app — isso poderia baixar uma versão nova do
Electron e quebrar a compatibilidade com esse computador.

## Pré-requisitos para instalar (usuária final)

Nenhum. O instalador `.exe` já contém tudo (Electron embutido). Não é
necessário instalar Node.js, npm, Git ou qualquer outra coisa no computador
da loja.

## Instalação (desenvolvimento)

```bash
cd print-agent
npm install
npm run dev
```

## Gerar o instalador (.exe)

```bash
npm run build
```

Gera um único instalador NSIS em `print-agent/dist/` cobrindo 32 e 64 bits:
**Day-Lanches-Impressao-Setup.exe**

O instalador detecta sozinho a arquitetura do Windows (32 ou 64 bits) — a
usuária não precisa saber qual é.

## Configurar o token no Worker

No terminal, dentro da pasta `worker/`:

```bash
wrangler secret put PRINT_AGENT_TOKEN
```

## Instalar no computador da loja

1. Copie `Day-Lanches-Impressao-Setup.exe` para o computador
2. Dê duplo clique — instalação em um clique, sem perguntas técnicas
3. O programa **Day Lanches Impressão** abre sozinho

## Primeira configuração (feita uma única vez, por quem instala)

A tela principal não tem campos técnicos. A URL do servidor e o token ficam
na tela de **Configuração avançada** (ícone de engrenagem no canto):

1. Clique no ícone de engrenagem
2. **URL do servidor**: já vem preenchida
3. **Token do agente**: cole o token configurado no Worker
4. Clique em **Salvar** (o monitoramento começa sozinho, sem precisar reabrir o app)
5. Volte para a tela principal (seta), escolha a impressora se não for a
   detectada automaticamente, e clique em **Testar impressão**

Depois disso, a Dayane não precisa mexer em mais nada.

## Uso do dia a dia

- **Impressora**: detectada automaticamente ao abrir. Se existir impressora
  padrão do Windows, ela é escolhida sozinha. A escolha fica salva — não
  pergunta de novo. Se a impressora salva sumir, volta pra padrão disponível
  sozinha.
- **Imprimir pedidos automaticamente**: liga/desliga a impressão automática.
- **Iniciar com o Windows**: o programa abre sozinho ao ligar o computador e
  minimiza direto na bandeja (perto do relógio).
- **Monitoramento**: sempre ativo em segundo plano assim que a configuração
  avançada estiver preenchida — não existe botão de iniciar/parar.

## Bandeja do sistema

- Duplo-clique: abre o painel
- Clique direito: menu com "Abrir painel" / "Sair"
- Fechar no X: minimiza para a bandeja (não fecha o programa)

Para fechar de verdade: clique direito na bandeja > Sair.

## Testar

- **Testar impressão** (tela principal): imprime uma comanda simples de
  teste ("DAY LANCHES / Teste de impressão / data e hora / Impressora
  configurada com sucesso").
- **Testar conexão** (Configuração avançada): verifica a comunicação com o
  Worker.
- **Registro técnico** (dentro de Configuração avançada, recolhido por
  padrão): histórico de eventos para quem for diagnosticar um problema —
  nunca aparece para a Dayane na tela principal.

## Fluxo de impressão

1. Cliente ou balcão cria um pedido
2. Worker marca o pedido como pendente de impressão (`printed_at` vazio)
3. O programa busca pedidos pendentes a cada 5 segundos
4. Imprime a comanda na impressora configurada
5. Marca o pedido como impresso no Worker

## Tolerância a falhas

O programa nunca fecha nem trava por: internet fora do ar, Worker
temporariamente indisponível, impressora desligada/sem papel/não encontrada,
ou resposta inválida do servidor. Esses erros ficam só no registro técnico;
na tela principal a Dayane vê apenas **"Tentando reconectar..."** (sem
pop-ups repetidos) até a conexão voltar sozinha.

## Solução de problemas

| Problema | Solução |
|----------|---------|
| Status "Configuração necessária" | Abra a engrenagem e confira URL/token na Configuração avançada |
| "Tentando reconectar..." não some | Verifique a internet do computador |
| Comanda não sai | Verifique se a impressora está ligada e selecionada |
| Impressora não aparece na lista | Instale a impressora no Windows e reabra o programa |
| Programa não abre com Windows | Ative "Iniciar com o Windows" na tela principal |
