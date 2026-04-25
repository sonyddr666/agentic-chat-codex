# Dois modos de uso do Codex no Agentic

> Estratégia de produto e arquitetura para separar o uso cotidiano do Codex via HTTP do uso profundo do Codex via CLI/MCP.
>
> Ideia central: o `agentic-chat-codex` deve usar o modo normal para conversar, pesquisar, usar skills leves e operar ferramentas simples; e só escalar para Codex CLI/MCP quando a tarefa realmente exigir revisão profunda de código, refatoração ampla, execução de testes, debug ou operação pesada no projeto.

---

## 1. Resumo executivo

O projeto deve ter dois modos claros de operação:

```text
Modo Normal
  -> Codex HTTP
  -> conversa, pesquisa, voz, skills, HTTP requests, arquivos simples

Modo Codex CLI
  -> codex mcp-server
  -> análise profunda de codebase, refactor, testes, debug, execução, sandbox, approvals
```

Em linguagem de produto:

```text
Modo Normal para pensar, conversar e pesquisar.
Modo Codex CLI para operar código de verdade.
```

Ou, no espírito do projeto:

```text
O normal é chat com ferramentas.
O CLI é quando o site apaga a luz, abre a caverna e entra em modo Batman com Doritos de pimenta.
```

A regra principal:

> Não usar Codex CLI para tudo. Usar CLI só quando ele realmente agrega poder operacional.

Isso reduz risco, complexidade, latência, dependência de ambiente local e confusão de UX.

---

## 2. Por que separar os modos

Codex HTTP e Codex CLI/MCP resolvem problemas diferentes.

### 2.1 Codex HTTP

Usa uma chamada direta ao backend Codex:

```text
https://chatgpt.com/backend-api/codex/responses
```

É ideal para:

- conversa normal.
- explicações.
- planejamento.
- geração de texto.
- pesquisa web.
- chamadas HTTP simples.
- skills leves.
- voz.
- histórico.
- geração de arquivos simples.
- HTML/CSS/JS isolado.
- análise de trechos pequenos.
- workflows sem necessidade de shell real.

### 2.2 Codex CLI/MCP

Usa a Codex CLI como runtime agentic:

```text
codex mcp-server
```

É ideal para:

- análise de codebase.
- refatoração ampla.
- alteração de muitos arquivos.
- execução de testes.
- debug iterativo.
- leitura profunda de repo.
- revisão de PR.
- criação de feature complexa.
- tarefas que precisam de sandbox e approvals.
- command output streaming.
- reasoning e eventos internos de agente.

### 2.3 Por que não usar CLI sempre

Usar CLI sempre parece bonito, mas é exagero operacional.

Problemas:

- aumenta latência.
- depende da CLI instalada.
- spawna processo local.
- aumenta superfície de falha.
- aumenta risco com shell e filesystem.
- pode confundir o usuário.
- exige approval/sandbox mesmo em tarefas bobas.
- não é ideal para deploy web simples.
- pode ser desperdício para tarefas textuais.

Exemplo:

```text
Usuário: "Cria um HTML simples de landing page"
```

Isso não precisa de CLI. O modo normal consegue gerar, salvar e mostrar preview.

Mas:

```text
Usuário: "Integra uma landing nova nesse projeto Next, seguindo o design system, rodando typecheck e corrigindo testes"
```

Aqui sim o CLI começa a fazer sentido.

---

## 3. Princípio de produto

O Agentic deve seguir este princípio:

> Usar o menor modo capaz de resolver bem a tarefa.

Isso significa:

```text
Se conversa resolve, use conversa.
Se tool leve resolve, use tool leve.
Se precisa operar repo de verdade, use Codex CLI.
```

Essa estratégia mantém o app rápido e seguro no uso normal, mas poderoso quando necessário.

---

## 4. Definição dos modos

## 4.1 Modo Normal

Nome técnico:

```text
Normal Mode / Codex HTTP Mode
```

Provider:

```text
CodexHttpProvider
```

Ferramentas típicas:

- `web_search`
- `fetch_url`
- `http_request`
- `rss_read`
- `read_file`
- `write_file` simples
- `append_file`
- `search_history`
- `load_thread`
- `skills`
- `voice_stt`
- `voice_tts`

Características:

- rápido.
- simples.
- bom para chat.
- bom para pesquisa.
- bom para voz.
- bom para tarefas curtas.
- bom para deploy.
- menos risco.
- não exige Codex CLI instalada.

Limitações:

- tool calling é JSON-over-text.
- sandbox precisa ser do próprio Agentic.
- approvals precisam ser do próprio Agentic.
- execução de shell deve ser limitada.
- não tem eventos nativos da Codex CLI.

## 4.2 Modo Codex CLI

Nome técnico:

```text
Deep Coding Mode / Codex CLI MCP Mode
```

Provider:

```text
CodexCliMcpProvider
```

Runtime:

```text
codex mcp-server
```

Ferramentas/capacidades típicas:

- leitura profunda de workspace.
- edição de vários arquivos.
- execução de comandos.
- testes.
- build.
- lint.
- sandbox nativo.
- approval policy.
- command output delta.
- agent reasoning delta.
- eventos `task_complete`.
- integração com `cwd`.

Características:

- mais poderoso.
- mais próximo da experiência Codex CLI.
- melhor para coding pesado.
- melhor para debug iterativo.
- melhor para tarefas multi-step.
- melhor para projetos grandes.

Limitações:

- depende de ambiente local.
- depende de `codex` instalado.
- pode não funcionar bem em deploy remoto.
- precisa gerenciar processo filho.
- precisa UI clara de risco.
- não deve ser acionado sem necessidade.

---

## 5. Quando usar o Modo Normal

Usar modo normal como padrão para 80% das tarefas.

### 5.1 Conversa e raciocínio

Exemplos:

```text
Explique essa arquitetura.
Me ajuda a pensar numa UX melhor.
Compare essas duas abordagens.
Crie um plano técnico.
```

Motivo:

- não precisa mexer em repo.
- não precisa shell.
- não precisa sandbox.
- o provider HTTP resolve com menor custo operacional.

### 5.2 Pesquisa e HTTP

Exemplos:

```text
Pesquisa bibliotecas de editor Markdown.
Faz um request nesse endpoint.
Lê esse RSS.
Busca documentação pública.
```

Tools suficientes:

```text
web_search
fetch_url
http_request
rss_read
```

Não precisa CLI.

### 5.3 Voz e conversa contínua

Exemplos:

```text
Vamos conversar por voz sobre esse projeto.
Resume isso em voz.
Fica em live mode e responde minhas dúvidas.
```

Motivo:

- voz é camada de UX do Agentic.
- não precisa runtime Codex CLI.
- modo normal deve ser leve e responsivo.

### 5.4 Skills simples

Exemplos:

```text
Usa uma skill para resumir esse texto.
Transforma isso em README.
Gera um prompt melhor.
Cria uma issue com base nesse plano.
```

Tipos de skills ideais para modo normal:

- Markdown skills.
- text transform skills.
- HTTP skills.
- documentation skills.
- planning skills.
- search skills.

### 5.5 HTML simples e artefatos isolados

Exemplos:

```text
Cria um index.html simples.
Gera uma landing page estática.
Faz um card em HTML/CSS.
Cria um protótipo de página única.
```

Motivo:

- output é isolado.
- não precisa entender projeto inteiro.
- não precisa rodar testes.
- não precisa build.

Modo normal pode:

1. gerar arquivo.
2. salvar no workspace.
3. mostrar preview.
4. ajustar com base no feedback.

---

## 6. Quando usar Codex CLI/MCP

Usar CLI quando a tarefa vira engenharia real de projeto.

### 6.1 Precisa entender codebase

Exemplos:

```text
Analisa a arquitetura desse repo.
Descobre onde esse bug nasce.
Mapeia o fluxo de autenticação.
Explica como o build funciona.
```

Aqui o CLI ajuda porque pode operar com `cwd`, contexto de projeto e eventos de agente.

### 6.2 Precisa alterar vários arquivos

Exemplos:

```text
Refatora o módulo de auth.
Troca o sistema de temas.
Cria uma feature com componentes, API route e testes.
Migra essa lógica para uma camada de serviços.
```

Sinais:

- vários arquivos.
- estrutura de projeto.
- risco de quebrar build.
- precisa verificar padrões existentes.

### 6.3 Precisa rodar comandos

Exemplos:

```text
Roda npm test e corrige.
Roda typecheck.
Corrige erro do build.
Executa lint e aplica ajustes.
```

Aqui o CLI é muito mais adequado, porque command output streaming e sandbox fazem diferença.

### 6.4 Precisa iterar até passar

Exemplos:

```text
Corrige até os testes passarem.
Roda, vê erro, ajusta e roda de novo.
Depura esse erro do build.
```

Esse é o habitat natural do CLI.

### 6.5 Precisa approval/sandbox forte

Exemplos:

```text
Aplica mudanças no repo.
Move arquivos.
Remove código morto.
Instala dependências.
Altera scripts.
```

Essas ações devem usar modo profundo com approvals claros.

---

## 7. Tabela de decisão

| Pedido do usuário | Modo recomendado | Motivo |
|---|---|---|
| Conversar sobre arquitetura | Normal | só raciocínio |
| Pesquisar libs | Normal + web tools | não precisa CLI |
| Fazer HTTP request simples | Normal + http tool | simples e controlado |
| Criar HTML isolado | Normal + file write | sem repo complexo |
| Gerar README | Normal | texto/documentação |
| Explicar erro colado no chat | Normal | não precisa executar |
| Corrigir erro no repo e rodar testes | CLI | precisa shell e iteração |
| Refatorar vários arquivos | CLI | multi-arquivo e risco |
| Analisar codebase inteira | CLI ou híbrido | depende do tamanho |
| Criar feature integrada ao projeto | CLI | precisa contexto real |
| Abrir PR com mudanças | CLI + GitHub tools | ação real multi-etapa |
| Revisar PR grande | CLI + GitHub tools | análise profunda |
| Criar skill de resumo | Normal | skill textual |
| Criar skill que opera repo | CLI na execução | workflow de código |

---

## 8. Router automático de modo

Criar um `ModeRouter` antes do provider.

```text
User request
  ↓
ModeRouter
  ↓
Normal Mode ou Codex CLI Mode
  ↓
Provider
  ↓
Event Normalizer
  ↓
UI / Run log
```

### 8.1 Interface sugerida

```ts
export type AgentMode = "normal" | "cli";

export type ModeDecision = {
  mode: AgentMode;
  confidence: number;
  reasons: string[];
  requiresApproval?: boolean;
};

export interface ModeRouter {
  decide(input: {
    prompt: string;
    projectSelected: boolean;
    filesMentioned: string[];
    explicitMode?: AgentMode | "auto";
    cliAvailable: boolean;
  }): ModeDecision;
}
```

### 8.2 Heurística simples

```ts
function decideMode(input): ModeDecision {
  if (input.explicitMode === "cli") {
    return { mode: "cli", confidence: 1, reasons: ["modo CLI solicitado pelo usuário"] };
  }

  if (input.explicitMode === "normal") {
    return { mode: "normal", confidence: 1, reasons: ["modo normal solicitado pelo usuário"] };
  }

  const score = scorePrompt(input.prompt);

  if (score.cli >= 3 && input.cliAvailable) {
    return {
      mode: "cli",
      confidence: 0.8,
      reasons: score.reasons
    };
  }

  return {
    mode: "normal",
    confidence: 0.7,
    reasons: ["tarefa compatível com conversa/tools leves"]
  };
}
```

### 8.3 Sinais que aumentam score de CLI

Palavras e intenções:

```text
repo
codebase
refactor
refatora
corrige até passar
testes
build
lint
typecheck
debug
PR
branch
commit
múltiplos arquivos
arquitetura do projeto
criar feature
migração
instalar dependência
```

### 8.4 Sinais que reduzem score de CLI

```text
explique
resuma
crie um texto
gere um HTML simples
pesquise
converse
fale em voz
faça um curl
chame esse endpoint
crie documentação
planeje
```

---

## 9. Modo manual

Além do automático, o usuário deve poder escolher.

UI sugerida:

```text
Modo: [ Automático ] [ Normal ] [ Codex CLI ]
```

Ou botão contextual:

```text
Ativar modo Codex CLI para esta tarefa
```

Quando o usuário ativar CLI, mostrar aviso:

```text
Modo Codex CLI usa o runtime local da Codex CLI, pode acessar o workspace, executar comandos sob sandbox e pedir approvals.
```

Isso dá controle e evita surpresa.

---

## 10. Escalada progressiva

Nem toda tarefa começa claramente pesada. O sistema pode começar no modo normal e escalar.

### 10.1 Exemplo

Usuário:

```text
Me ajuda com esse erro do build?
```

Modo normal responde:

```text
Posso analisar se você colar o erro, ou posso entrar em modo Codex CLI para rodar o build e investigar no workspace.
```

Se o usuário autorizar:

```text
Entrar em modo Codex CLI
```

### 10.2 Escalada automática com confirmação

Quando o modo normal detectar necessidade de shell ou repo amplo:

```text
Esta tarefa parece exigir execução de comandos e leitura ampla do projeto.
Deseja ativar Codex CLI para esta tarefa?

[Ativar Codex CLI] [Continuar no modo normal]
```

### 10.3 Escalada sem confirmação

Pode ser permitida se o usuário configurar:

```text
Auto-escalar para CLI em tarefas de código complexas: ligado
```

Mesmo assim, ações perigosas ainda devem exigir approval.

---

## 11. Fallback quando CLI não estiver disponível

Se o usuário pedir uma tarefa pesada, mas `codex` não estiver instalado:

```text
Codex CLI não está disponível neste ambiente.
Posso continuar no modo normal usando tools locais, mas sem sandbox/command events nativos.
```

Opções:

```text
[Continuar no modo normal]
[Configurar Codex CLI]
[Cancelar]
```

Checagens:

```text
codex --version
codex mcp-server --help
```

Mostrar diagnóstico claro:

- CLI não encontrada.
- CLI encontrada mas MCP falhou.
- ChatGPT/Codex auth não disponível.
- Permissão de execução bloqueada.
- Ambiente remoto sem acesso a binário.

---

## 12. UI de provider/capabilities

Mostrar badges para o usuário entender o modo ativo.

### 12.1 Modo Normal

```text
🟢 Normal
Provider: Codex HTTP
Streaming: sim
Contexto nativo: sim, se habilitado
Tools: web, http, files leves, skills, voz
Risco: baixo/médio
```

### 12.2 Modo Codex CLI

```text
🦇 Codex CLI
Provider: codex mcp-server
Reasoning deltas: sim
Command output: sim
Sandbox: sim
Approvals: sim
Risco: alto controlado
```

### 12.3 Motivo da escolha

Quando o modo for automático, mostrar:

```text
Modo escolhido: Codex CLI
Motivos:
- tarefa menciona testes
- tarefa exige alteração no repo
- tarefa pode precisar executar comandos
```

Isso deixa a automação auditável e compreensível.

---

## 13. Event Normalizer

Como os dois providers emitem eventos diferentes, o Agentic precisa de um formato interno único.

```ts
type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_output"; name: string; output: string }
  | { type: "command_output_delta"; stream: "stdout" | "stderr"; text: string }
  | { type: "file_changed"; path: string; diff?: string }
  | { type: "approval_requested"; action: unknown }
  | { type: "task_complete" }
  | { type: "error"; error: string };
```

### 13.1 HTTP mapping

```text
response.output_text.delta -> text_delta
JSON tool call parsed       -> tool_start/tool_output local
final response              -> task_complete
```

### 13.2 CLI MCP mapping

```text
agent_message_delta         -> text_delta
agent_reasoning_delta       -> reasoning_delta
exec_command_output_delta   -> command_output_delta
task_complete               -> task_complete
stream_error/error          -> error
```

---

## 14. Como lidar com tools locais e CLI ao mesmo tempo

Mesmo quando CLI estiver ativa, o Agentic não deve abandonar suas próprias tools.

### 14.1 CLI cuida melhor de

- exploração de repo local.
- comandos.
- testes.
- build.
- refactor.
- edição de código pesada.

### 14.2 Agentic cuida melhor de

- histórico do app.
- skills do usuário.
- web search próprio.
- HTTP requests externos.
- GitHub adapter.
- voz.
- UI e approvals globais.
- auditoria.

### 14.3 Regra

```text
CLI é motor especializado de coding.
Agentic é o sistema operacional: UI, memória, tools externas, permissões e histórico.
```

---

## 15. Segurança por modo

### 15.1 Normal Mode

Riscos:

- HTTP externo.
- escrita simples em arquivo.
- skills custom.
- leitura de histórico.

Proteções:

- validação de URL.
- allowlist/bloqueio de domínios sensíveis.
- approval para HTTP mutável.
- approval para escrita/deleção.
- sandbox de workspace.

### 15.2 CLI Mode

Riscos:

- execução de comandos.
- alterações multi-arquivo.
- instalação de dependências.
- acesso amplo ao workspace.
- possíveis operações destrutivas.

Proteções:

- sandbox mode visível.
- approval policy visível.
- logs de comando.
- diffs antes/depois.
- cancelamento de run.
- audit log persistente.
- jamais usar `danger-full-access` sem aviso explícito.

---

## 16. Policies sugeridas

### 16.1 Default para Normal Mode

```json
{
  "mode": "normal",
  "allowWebSearch": true,
  "allowHttpGet": true,
  "allowHttpMutating": "ask",
  "allowFileRead": true,
  "allowFileWrite": "ask",
  "allowShell": false
}
```

### 16.2 Default para CLI Mode

```json
{
  "mode": "cli",
  "sandbox": "workspace-write",
  "approvalPolicy": "on-request",
  "allowDangerFullAccess": false,
  "showCommandOutput": true,
  "showReasoningSummary": true,
  "persistAuditLog": true
}
```

### 16.3 Perfil seguro

```json
{
  "mode": "auto",
  "autoEscalateCli": false,
  "askBeforeCli": true,
  "askBeforeWrite": true,
  "askBeforeShell": true,
  "askBeforeNetworkMutation": true
}
```

### 16.4 Perfil power user

```json
{
  "mode": "auto",
  "autoEscalateCli": true,
  "askBeforeCli": false,
  "askBeforeWrite": "project-trusted",
  "askBeforeShell": "dangerous-only",
  "sandbox": "workspace-write"
}
```

---

## 17. Exemplos completos de fluxo

### 17.1 HTML simples

Pedido:

```text
Cria um HTML simples de landing page para meu app.
```

Modo escolhido:

```text
Normal
```

Fluxo:

```text
Codex HTTP gera HTML
  ↓
Agentic salva index.html, se usuário quiser
  ↓
preview local
  ↓
ajustes por conversa
```

Motivo:

- não precisa repo.
- não precisa shell.
- não precisa CLI.

### 17.2 Landing integrada no projeto

Pedido:

```text
Cria uma landing integrada ao projeto Next, seguindo o design system, com componente, rota, responsividade e typecheck.
```

Modo escolhido:

```text
Codex CLI
```

Fluxo:

```text
CLI analisa estrutura
  ↓
lê componentes existentes
  ↓
edita arquivos
  ↓
roda typecheck/build
  ↓
correções iterativas
  ↓
mostra diff
```

Motivo:

- multi-arquivo.
- precisa padrões do projeto.
- precisa build/typecheck.

### 17.3 Pesquisa externa

Pedido:

```text
Pesquisa alternativas ao Monaco Editor para Markdown.
```

Modo escolhido:

```text
Normal + web_search
```

Motivo:

- tarefa externa.
- CLI não agrega.

### 17.4 Bug em repo

Pedido:

```text
Corrige esse erro do npm test.
```

Modo escolhido:

```text
Codex CLI
```

Fluxo:

```text
executa npm test
  ↓
lê erro
  ↓
busca arquivos relevantes
  ↓
patch
  ↓
roda de novo
  ↓
repete até passar ou explicar bloqueio
```

---

## 18. Métrica de sucesso

Para validar se dois modos melhoram o produto:

### 18.1 Métricas de UX

- porcentagem de tarefas resolvidas em modo normal.
- porcentagem de escaladas para CLI.
- quantas escaladas foram manuais.
- quantas escaladas foram automáticas.
- quantas escaladas foram canceladas pelo usuário.
- tempo médio até primeira resposta.
- tempo médio de run CLI.

### 18.2 Métricas de segurança

- número de approvals pedidos.
- número de approvals negados.
- comandos bloqueados.
- tentativas de acesso fora do workspace.
- HTTP mutável bloqueado.
- runs cancelados.

### 18.3 Métricas de qualidade

- taxa de sucesso de build/test após CLI.
- número de loops até task_complete.
- quantas respostas HTTP precisaram de fallback para CLI.
- quantas tarefas CLI poderiam ter sido modo normal.

Essas métricas ajudam a ajustar o router.

---

## 19. Implementação sugerida

### 19.1 Arquivos novos

```text
src/lib/mode/mode-router.ts
src/lib/mode/mode-types.ts
src/lib/providers/agent-provider.ts
src/lib/providers/codex-http-provider.ts
src/lib/providers/codex-cli-mcp-provider.ts
src/lib/providers/event-normalizer.ts
src/components/provider/ProviderModeBadge.tsx
src/components/provider/ProviderModeSelector.tsx
src/components/runs/ModeDecisionPanel.tsx
```

### 19.2 Banco de dados

Adicionar em `runs`:

```text
provider_id
mode
mode_decision_reasons
capabilities_snapshot
```

Adicionar tabela opcional:

```text
mode_decisions
```

Campos:

```text
id
run_id
prompt_preview
selected_mode
confidence
reasons_json
created_at
```

### 19.3 Settings

Adicionar configuração por usuário/projeto:

```text
default_mode: auto | normal | cli
auto_escalate_cli: boolean
ask_before_cli: boolean
preferred_cli_sandbox: read-only | workspace-write | danger-full-access
preferred_cli_approval_policy: on-request | on-failure | never
```

---

## 20. Copy de produto sugerido

### 20.1 Explicação curta

```text
Modo Normal usa Codex HTTP para conversar, pesquisar e usar ferramentas leves.
Modo Codex CLI usa a CLI local para tarefas profundas de código com sandbox, approvals e comandos.
```

### 20.2 Aviso ao ativar CLI

```text
Esta tarefa parece exigir operação profunda no projeto. Posso ativar Codex CLI para analisar arquivos, rodar comandos e aplicar mudanças com sandbox e approvals.
```

### 20.3 Fallback sem CLI

```text
Codex CLI não está disponível neste ambiente. Posso continuar no modo normal, mas sem eventos nativos de comando, sandbox da CLI ou loop de coding profundo.
```

### 20.4 Badge divertido

```text
Modo Batman ativo: Codex CLI está operando no workspace com sandbox e approvals.
```

---

## 21. Riscos de design

### 21.1 Escalar demais para CLI

Se o router ativar CLI para qualquer coisinha, o app fica lento e dramático.

Mitigação:

- threshold alto.
- explicar motivo.
- permitir override.
- métricas de uso.

### 21.2 Escalar de menos

Se o router insistir no modo normal para tarefas de repo complexas, o usuário sente que o agente é fraco.

Mitigação:

- detectar palavras de projeto.
- sugerir CLI quando o normal travar.
- botão de escalada visível.

### 21.3 Usuário não entender diferenças

Mitigação:

- badges.
- tooltip.
- motivo da escolha.
- docs simples.

### 21.4 Segurança virar ruído

Se toda ação pedir approval, o usuário cansa.

Mitigação:

- perfis de confiança.
- approvals por projeto.
- remembered approvals.
- bloquear só o que importa.

---

## 22. Conclusão

A melhor estratégia é não transformar o Codex CLI em martelo universal.

O Agentic deve ter:

```text
Modo Normal como padrão.
Modo CLI como escalada poderosa.
```

Modo Normal cuida de:

- conversa.
- voz.
- pesquisa.
- HTTP.
- skills.
- docs.
- HTML simples.
- tarefas leves.

Modo CLI cuida de:

- codebase.
- refactor.
- testes.
- debug.
- shell.
- sandbox.
- approvals.
- tarefas multi-arquivo.

Essa separação deixa o produto mais rápido, seguro, compreensível e forte.

O objetivo final:

```text
Um Agentic que conversa leve no dia a dia,
mas quando precisa operar código de verdade,
entra em modo profundo com Codex CLI.
```

Essa é a evolução certa: não mais um chat tentando fazer tudo do mesmo jeito, mas um sistema com marchas. Primeira marcha para conversa. Quinta marcha para monorepo pegando fogo.
