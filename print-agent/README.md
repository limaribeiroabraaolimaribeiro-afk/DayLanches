# Day Lanches Print Agent

Programa instalável para Windows que imprime automaticamente a comanda quando chega qualquer pedido novo no sistema Day Lanches.

## Pré-requisitos

- Node.js 18+ instalado
- Impressora instalada no Windows (térmica 80mm, 58mm ou impressora comum A4)
- Computador com internet

## Instalação (desenvolvimento)

```bash
cd print-agent
npm install
npm run dev
```

## Gerar instalador (.exe)

```bash
npm run build
```

O instalador será gerado em `print-agent/dist/` com o nome:
**Day-Lanches-Print-Agent-Setup.exe**

## Configurar o token no Worker

No terminal, dentro da pasta `worker/`:

```bash
wrangler secret put PRINT_AGENT_TOKEN
```

Digite um token seguro quando solicitado. Depois, use esse mesmo token no Print Agent.

**Nunca commite o token real no código.**

## Instalar no computador da loja

1. Copie o arquivo `Day-Lanches-Print-Agent-Setup.exe` para o computador da loja
2. Execute o instalador e siga as instruções
3. Abra o programa **Day Lanches Print Agent**

## Configurar o Print Agent

1. **URL do Worker**: já vem preenchida, não precisa alterar
2. **Token de impressão**: cole o mesmo token configurado no Worker
3. **Impressora**: selecione a impressora instalada no Windows
4. **Tipo de papel**: escolha o tipo correto (Térmica 80mm, 58mm ou A4)
5. Clique em **Salvar configurações**

## Testar

### Testar conexão
Clique em **Testar conexão** para verificar se o Print Agent consegue se comunicar com o Worker.
- Se mostrar "Conectado com sucesso" está tudo certo.
- Se mostrar erro, verifique o token e a conexão com internet.

### Testar impressão
Clique em **Testar impressão** para enviar uma comanda de teste para a impressora.
- Se a comanda de teste sair na impressora, está funcionando.
- Se não sair, verifique se a impressora está ligada e selecionada corretamente.

## Ativar impressão automática

1. Marque **Impressão automática** como ativada
2. Clique em **Iniciar monitoramento**
3. O Print Agent vai verificar pedidos novos a cada 5 segundos
4. Quando chegar um pedido novo, a comanda será impressa automaticamente

## Iniciar com Windows

Marque a opção **Iniciar com Windows** para que o Print Agent abra automaticamente quando o computador ligar.

## Solução de problemas

| Problema | Solução |
|----------|---------|
| "Token inválido" | Verifique se o token do Print Agent é o mesmo configurado no Worker |
| Comanda não sai | Verifique se a impressora está ligada e selecionada corretamente |
| "Erro de conexão" | Verifique a conexão com internet |
| Impressora não aparece na lista | A impressora precisa estar instalada no Windows |
| Pedido antigo imprimiu | Pedidos sem `printed_at` serão impressos na primeira execução |

## Observações importantes

- A impressora precisa estar instalada no Windows
- A impressora precisa estar ligada
- O Print Agent precisa estar aberto ou configurado para iniciar com Windows
- O computador precisa ter internet
- Se trocar de impressora, selecione a nova impressora no Print Agent
- O Print Agent usa apenas o token próprio (`PRINT_AGENT_TOKEN`), nunca a chave do Supabase
