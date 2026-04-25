# Melhoria Backend: Codex HTTP, Codex CLI MCP e o caminho para um Agentic mais completo

> Documento técnico para explicar a limitação atual do backend Codex usado no `agentic-chat-codex`, comparar com outros projetos que usam Codex via provider/CLI/MCP, e propor uma evolução de backend para tornar o Agentic mais poderoso, flexível e próximo de um ambiente de agente completo.

---

## 1. Resumo executivo

O `agentic-chat-codex` hoje usa o backend Codex por uma rota HTTP direta:

```text
https://chatgpt.com/backend-api/codex/responses
```

Esse caminho é útil e poderoso para chat, streaming, contexto e proxy. Mas ele não entrega automaticamente a experiência completa da Codex CLI, como sandbox, approvals, eventos internos ricos, execução de comandos e tool loop agentic nativo.

A grande conclusão é:

> A limitação não está necessariamente no modelo. A limitação está na interface usada para falar com ele.

Existem pelo menos dois caminhos diferentes para usar Codex:

```text
1. Codex via HTTP backend
   - bom para chat, streaming, proxy, API local, store:true e previous_response_id
   - tools precisam ser emuladas pelo harness local

2. Codex via CLI MCP server
   - bom para coding agent completo
   - expõe eventos ricos, sandbox, approvals, command output e reasoning deltas
   - exige Codex CLI instalada e execução local de processo
```

A proposta deste documento é fazer o `agentic-chat-codex` suportar os dois caminhos:

```text
CodexHttpProvider      -> backend-api/codex/responses
CodexCliMcpProvider   -> codex mcp-server via JSON-RPC
```

Assim, o projeto ganha dois modos:

- **modo HTTP**: ótimo para deploy, API, chat, contexto nativo e compatibilidade.
- **modo CLI MCP**: ótimo para coding local profundo, sandbox, approvals e tool events reais.

---

## 2. Referências pesquisadas

### Projetos internos do ecossistema

| Projeto | Papel | Link |
|---|---|---|
| `agentic-chat-codex` | projeto base atual, com Next.js, SQLite, runtime agentic, tools locais e provider Codex HTTP | https://github.com/sonyddr666/agentic-chat-codex |
| `fluxo-codex` | proxy Flask para Codex HTTP, com `store:true`, `previous_response_id`, Auth Pool e API compatível | https://github.com/sonyddr666/fluxo-codex |
| `chat-md` | laboratório local com voz, tools, workspace, skills Markdown e action blocks | https://github.com/sonyddr666/chat-md |
| `skills-chat` | SkillFlow com login, estado por usuário, skills e filesystem por usuário | https://github.com/sonyddr666/skills-chat |
| `code-chat-skills` | SkillFlow com jobs persistentes, exec allowlist e TTS hardening | https://github.com/sonyddr666/code-chat-skills |

### Projetos externos relevantes

| Projeto | O que ensina | Link |
|---|---|---|
| `opencode-codex-provider` | usa `codex mcp-server` como provider para opencode, via JSON-RPC/MCP | https://github.com/withakay/opencode-codex-provider |
| `Codex-Pool-OpenClaw` | provider/plugin para conectar OpenClaw a Codex-Pool preservando semânticas de tool calling, reasoning e streaming | https://github.com/Codex-Pool/Codex-Pool-OpenClaw |
| `Codex-Pool` | gateway self-hosted com pool de contas, API compatível, painel e proxy `/v1/*` / `/backend-api/codex/*` | https://github.com/Codex-Pool/Codex-Pool |

Arquivos especialmente importantes:

- Provider HTTP atual do Agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/ai/codex-chatgpt-provider.ts
- Runtime atual do Agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/runtime.ts
- Tools atuais do Agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/tools.ts
- Fluxo Codex: https://github.com/sonyddr666/fluxo-codex/blob/main/README.md
- Opencode Codex Provider README: https://github.com/withakay/opencode-codex-provider/blob/main/README.md
- Cliente MCP do opencode provider: https://github.com/withakay/opencode-codex-provider/blob/main/src/codexClient.ts
- Provider MCP do opencode provider: https://github.com/withakay/opencode-codex-provider/blob/main/src/codexProvider.ts
- OpenClaw Codex-Pool plugin: https://github.com/Codex-Pool/Codex-Pool-OpenClaw/blob/main/README.md
- Codex-Pool: https://github.com/Codex-Pool/Codex-Pool/blob/main/README.md

---

## 3. A limitação atual do `agentic-chat-codex`

O provider atual do `agentic-chat-codex` chama o endpoint:

```text
https://chatgpt.com/backend-api/codex/responses
```

Ele monta um payload parecido com:

```json
{
  "model": "gpt-5.4-mini",
  "instructions": "...",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        { "type": "input_text", "text": "..." }
      ]
    }
  ],
  "stream": true,
  "store": false
}
```

Esse fluxo recebe eventos SSE de texto, como:

```text
response.output_text.delta
response.completed
response.output_item.done
```

No código atual, o provider transforma esses deltas em texto e o runtime local tenta detectar tool calls em JSON dentro desse texto.

Exemplo:

```json
{"tool":"read_file","args":{"path":"README.md"}}
```

O runtime local faz:

```text
modelo escreve JSON
        ↓
runtime parseia texto
        ↓
runtime valida tool
        ↓
runtime executa ferramenta local
        ↓
runtime reinjeta resultado no próximo contexto
```

Isso funciona, mas é uma forma artesanal de tool calling. A API HTTP usada não está entregando para o app um evento formal de tool call com schema nativo, sandbox, approvals ou command output streaming.

---

## 4. O que é JSON-over-text

O mecanismo atual do Agentic é melhor descrito como **JSON-over-text**.

O modelo recebe uma instrução no system prompt:

```text
Se precisar usar uma ferramenta, responda somente JSON, sem Markdown e sem texto extra.
```

Depois ele deve produzir algo assim:

```json
{"tool":"search_text","args":{"query":"TODO"}}
```

Ou:

```json
{
  "tools": [
    {"tool":"read_file","args":{"path":"package.json"}},
    {"tool":"read_file","args":{"path":"README.md"}}
  ]
}
```

O runtime local lê esse texto, interpreta como intenção e executa.

### Vantagens

- simples de implementar.
- funciona com qualquer modelo que escreva texto.
- não exige API oficial de tool calling.
- permite controlar tools totalmente no app.
- dá para rodar em deploy onde a CLI Codex não existe.

### Limitações

- o modelo pode misturar texto e JSON.
- o modelo pode errar o schema.
- o modelo pode inventar tool inexistente.
- validação precisa ser local.
- loops precisam ser limitados manualmente.
- ferramenta e resultado são apenas texto para o backend Codex.
- não há evento nativo de approval.
- não há sandbox nativo.
- não há command output delta estruturado.
- não há reasoning/tool event fino vindo do backend.

A conclusão: JSON-over-text é aceitável para um harness próprio, mas não deve ser confundido com tool calling nativo do runtime Codex completo.

---

## 5. O que `fluxo-codex` ensina

O `fluxo-codex` mostra a camada HTTP Codex de forma mais explícita.

Ele existe porque o browser sofre com CORS ao tentar chamar `chatgpt.com` diretamente. O Python/Flask chama o endpoint sem bloqueio de CORS e reemite a resposta para o frontend.

Fluxo:

```text
Browser
  ↓ localhost
server.py Flask
  ↓
chatgpt.com/backend-api/codex/responses
  ↓
Codex SSE
  ↓
server.py reemite deltas
  ↓
Browser renderiza
```

### 5.1 Contexto nativo com `store:true`

Uma das melhores partes do `fluxo-codex` é o uso de:

```json
{
  "store": true,
  "previous_response_id": "resp_..."
}
```

Fluxo:

```text
Mensagem 1
  -> store:true
  -> Codex retorna response_id resp_A
  -> servidor salva session_id -> resp_A

Mensagem 2
  -> previous_response_id: resp_A
  -> Codex carrega contexto anterior
  -> Codex retorna resp_B
  -> servidor atualiza session_id -> resp_B
```

Isso evita reenviar histórico inteiro em toda chamada.

### 5.2 Fallback `store:false`

Quando a conta não aceita `store:true`, o `fluxo-codex` tenta novamente com `store:false`, limpa o `previous_response_id` inválido e mantém histórico local.

Isso evita o erro clássico:

```text
session salva response_id que a conta não consegue continuar
  ↓
próxima chamada envia previous_response_id inválido
  ↓
backend recusa
  ↓
conversa quebra
```

### 5.3 Auth Pool

O `fluxo-codex` também mostra uma estratégia de Auth Pool:

- até 5 slots de conta.
- slot preferido por header.
- rotação automática em 429/rate limit/quota.
- estado persistido.

Essa ideia deve virar parte do backend do Agentic.

### 5.4 Tool loop no `fluxo-codex`

O `fluxo-codex` implementa tool loop via instrução + JSON-RPC textual. Quando `support_tools:true`, o servidor injeta prompt especial e executa até 5 rounds de ferramentas como:

- `search_web`
- `read_file`
- `write_file`
- `search_history`
- `load_chat`
- `list_chats`

Mas isso continua sendo uma orquestração do proxy. O backend Codex HTTP não vira automaticamente um runtime de tools completo.

---

## 6. O que `opencode-codex-provider` ensina

O `opencode-codex-provider` mostra um caminho diferente e mais profundo.

Ele não chama apenas o backend HTTP. Ele spawna a Codex CLI como servidor MCP:

```text
codex mcp-server
```

O código cria um processo filho, fala JSON-RPC por stdin/stdout e chama:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "codex",
    "arguments": {
      "prompt": "...",
      "model": "gpt-5-codex",
      "cwd": "...",
      "approval-policy": "...",
      "sandbox": "..."
    }
  }
}
```

Esse caminho expõe um runtime mais rico.

### 6.1 Eventos ricos

O provider escuta notificações `codex/event...` e processa tipos como:

```text
agent_message_delta
agent_message
agent_reasoning_delta
agent_reasoning
agent_reasoning_section_break
exec_command_output_delta
task_complete
stream_error
error
```

Isso é muito diferente de apenas ler `response.output_text.delta`.

### 6.2 Sandbox e approvals

O provider passa argumentos como:

```text
approval-policy
sandbox
cwd
include-plan-tool
model_reasoning_effort
```

Isso indica que o runtime da CLI Codex entende mais do ambiente de coding:

- diretório de trabalho.
- política de aprovação.
- modo de sandbox.
- esforço de raciocínio.
- saída de comandos.

### 6.3 Tooling parity

O README do `opencode-codex-provider` explica que o objetivo é dar ao opencode acesso ao Codex via ChatGPT/Codex CLI, mantendo:

- sandboxing.
- approvals.
- automação CLI.
- eventos ricos.
- reasoning deltas.
- command output.

Isso mostra que para usar o “Codex completo de coding”, o caminho mais forte é integrar com a CLI/MCP, não apenas chamar o endpoint HTTP.

---

## 7. O que `Codex-Pool` e `OpenClaw` ensinam

### 7.1 Codex-Pool

O `Codex-Pool` é um gateway self-hosted para organizar contas, proxy, modelos, logs, importação e API compatível.

Ele expõe superfícies como:

```text
POST /v1/responses
GET  /v1/responses
POST /backend-api/codex/responses
GET  /backend-api/codex/responses
POST /v1/chat/completions
GET  /v1/models
```

Isso ensina que um backend mais maduro para Codex deve ter:

- pool de contas.
- controle administrativo.
- logs.
- health check.
- proxy compatível.
- configuração de modelos.
- importação de credenciais.
- disponibilidade e fallback.

### 7.2 Codex-Pool-OpenClaw

O plugin `Codex-Pool-OpenClaw` existe para adaptar OpenClaw a Codex-Pool. O README afirma que ele preserva:

- tool calling.
- reasoning.
- streaming.
- semântica de requisição estilo Codex.
- autenticação customizada.
- endpoints locais.

Isso reforça que projetos maduros tratam Codex como uma camada de provider/gateway, não só como uma URL crua.

---

## 8. Comparação dos caminhos de backend

| Capacidade | Codex HTTP direto | Codex Pool/Gateway | Codex CLI MCP |
|---|---:|---:|---:|
| Texto em streaming | sim | sim | sim |
| `store:true` | sim | sim, se gateway suportar | geralmente abstraído pela CLI |
| `previous_response_id` | sim | sim, se gateway suportar | geralmente abstraído pela CLI |
| API externa compatível | precisa implementar | sim | não é foco |
| Auth pool | precisa implementar | sim | depende da CLI/conta local |
| Tool calling nativo de app | não, precisa emular | depende da implementação | runtime CLI já tem eventos/tools |
| Reasoning deltas estruturados | limitado/incerto | depende | sim |
| Command output delta | não nativo | depende | sim |
| Sandbox | manual | depende | sim |
| Approval policy | manual | depende | sim |
| Integração com cwd/projeto | manual | manual/dependente | sim |
| Bom para deploy web | sim | sim | menos, depende da CLI |
| Bom para coding local profundo | médio | médio | alto |
| Complexidade de implementação | média | alta | média/alta |

---

## 9. Proposta: dois providers Codex no Agentic

O `agentic-chat-codex` deve ter dois providers oficiais.

### 9.1 `CodexHttpProvider`

Usa:

```text
/backend-api/codex/responses
```

Com:

- streaming SSE.
- `store:true`.
- `previous_response_id`.
- fallback `store:false`.
- Auth Pool.
- JSON-over-text para tools locais.
- API compatível `/v1`.

Serve para:

- uso em browser/server.
- deploy em Coolify/Vercel-like/self-hosted.
- chat geral.
- API externa.
- contexto nativo.
- ambientes onde a Codex CLI não está instalada.

### 9.2 `CodexCliMcpProvider`

Usa:

```text
codex mcp-server
```

Com:

- JSON-RPC.
- `tools/call`.
- eventos `codex/event`.
- reasoning deltas.
- command output deltas.
- `cwd`.
- sandbox.
- approval policy.
- task complete.

Serve para:

- desenvolvimento local.
- automação de repo.
- edição de código pesada.
- execução de comandos.
- experiência mais próxima da Codex CLI real.

---

## 10. Interface comum de provider

Para suportar os dois caminhos sem bagunçar o runtime, criar uma interface comum.

```ts
export type AgentProviderCapabilities = {
  textStreaming: boolean;
  nativeToolEvents: boolean;
  reasoningDeltas: boolean;
  commandOutputDeltas: boolean;
  sandbox: boolean;
  approvals: boolean;
  previousResponseId: boolean;
  imageInput: boolean;
  fileInput: boolean;
};

export type AgentProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_output"; name: string; output: string }
  | { type: "command_output_delta"; stream: "stdout" | "stderr"; text: string }
  | { type: "file_changed"; path: string; diff?: string }
  | { type: "task_complete" }
  | { type: "error"; error: string };

export interface AgentProvider {
  id: string;
  label: string;
  capabilities: AgentProviderCapabilities;
  stream(input: AgentProviderInput): AsyncIterable<AgentProviderEvent>;
}
```

Assim a UI e o runtime podem receber eventos de qualquer backend no mesmo formato.

---

## 11. Capability badges na UI

A UI deve mostrar claramente qual provider está em uso e quais capacidades estão disponíveis.

Exemplo:

```text
Provider: Codex HTTP
✅ streaming
✅ previous_response_id
✅ imagens/anexos
❌ native tool events
❌ sandbox nativo
❌ approvals nativos
```

Outro exemplo:

```text
Provider: Codex CLI MCP
✅ streaming
✅ reasoning deltas
✅ command output
✅ sandbox
✅ approvals
✅ native agent events
❌ deploy remoto simples
```

Isso evita confusão: o usuário entende por que uma tarefa pode fazer mais em um modo do que em outro.

---

## 12. Melhorias específicas para `CodexHttpProvider`

### 12.1 Implementar thread store

Criar tabela ou estrutura:

```ts
type CodexThreadState = {
  id: string;
  userId: string;
  projectId: string;
  threadId: string;
  model: string;
  storeEnabled: boolean;
  lastResponseId: string | null;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 12.2 Fluxo com `store:true`

```text
create payload
  ↓
if thread.lastResponseId exists:
  set previous_response_id
  ↓
set store:true
  ↓
send request
  ↓
on response.created/completed:
  capture response.id
  save as lastResponseId
```

### 12.3 Fallback `store:false`

```text
send store:true
  ↓
if 400/403/422 related to store or previous_response_id:
  invalidate lastResponseId
  retry with store:false and no previous_response_id
```

### 12.4 Auth Pool

Criar um `CodexAccountPool`:

```ts
type CodexAccount = {
  id: string;
  userId: string;
  label: string;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: string;
  enabled: boolean;
  cooldownUntil?: string | null;
  score: number;
};
```

Eventos:

```text
codex_account_selected
codex_account_refreshed
codex_account_rate_limited
codex_account_rotated
codex_account_failed
```

### 12.5 API compatível

Adicionar rotas:

```text
/api/v1/models
/api/v1/responses
/api/v1/chat/completions
/api/v1/runs
```

Com auth local:

```text
Authorization: Bearer <LOCAL_API_KEY>
```

Isso transforma o Agentic em um gateway local reutilizável.

---

## 13. Melhorias específicas para `CodexCliMcpProvider`

### 13.1 Spawner seguro

Criar módulo:

```text
src/lib/codex-cli/mcp-client.ts
src/lib/codex-cli/mcp-provider.ts
src/lib/codex-cli/process-manager.ts
```

Responsabilidades:

- verificar se `codex` está no PATH.
- iniciar `codex mcp-server`.
- falar JSON-RPC.
- reiniciar se falhar.
- matar processo ao cancelar run.
- capturar stderr.
- aplicar timeout.

### 13.2 Inicialização MCP

Enviar:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "...",
    "capabilities": { "tools": {} },
    "clientInfo": {
      "name": "agentic-chat-codex",
      "version": "..."
    }
  }
}
```

Depois:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

### 13.3 Chamada principal

Chamar a tool `codex`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "codex",
    "arguments": {
      "prompt": "...",
      "model": "gpt-5-codex",
      "cwd": "/path/do/projeto",
      "approval-policy": "on-request",
      "sandbox": "workspace-write",
      "include-plan-tool": false,
      "config": {
        "model_reasoning_effort": "medium"
      }
    }
  }
}
```

### 13.4 Eventos MCP normalizados

Mapear eventos recebidos:

| Evento Codex CLI | Evento interno Agentic |
|---|---|
| `agent_message_delta` | `text_delta` |
| `agent_message` | `text_delta` ou `message_snapshot` |
| `agent_reasoning_delta` | `reasoning_delta` |
| `agent_reasoning` | `reasoning_delta` ou `reasoning_snapshot` |
| `exec_command_output_delta` | `command_output_delta` |
| `task_complete` | `task_complete` |
| `stream_error` | `error` |
| `error` | `error` |

### 13.5 Configuração de sandbox

Expor opções:

```ts
type CodexCliSandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

type CodexCliApprovalPolicy =
  | "untrusted"
  | "on-request"
  | "on-failure"
  | "never";
```

Na UI, jamais esconder quando estiver em modo perigoso:

```text
⚠️ Codex CLI está em danger-full-access
```

---

## 14. Tool Registry unificado

Mesmo com CLI MCP, o Agentic deve manter tools próprias. Nem toda tarefa precisa ser entregue para a CLI.

Criar:

```text
src/lib/tools/registry.ts
```

Interface:

```ts
type ToolDefinition = {
  name: string;
  description: string;
  category: "filesystem" | "shell" | "web" | "http" | "history" | "github" | "skill";
  risk: "low" | "medium" | "high" | "critical";
  schema: unknown;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
};
```

Categorias:

- filesystem.
- shell.
- web.
- http.
- history.
- github.
- skills.
- voice.

---

## 15. Permission Layer obrigatório

Quanto mais backend e tools existirem, maior o risco.

Criar:

```text
src/lib/security/permission-layer.ts
src/lib/security/approval-gate.ts
src/lib/security/audit-log.ts
```

### 15.1 Política de permissão

```ts
type PermissionDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string }
  | { type: "ask"; reason: string };
```

### 15.2 Exemplos

Leitura local:

```text
read_file README.md -> allow
```

Escrita:

```text
write_file src/app.tsx -> ask
```

Shell:

```text
run_shell npm test -> ask
run_shell rm -rf . -> deny
```

HTTP mutável:

```text
http_post https://api... -> ask
http_delete https://api... -> ask ou deny
```

### 15.3 Approvals persistentes

Permitir:

- uma vez.
- nesta conversa.
- neste projeto.
- sempre para esta tool.

Sempre auditável.

---

## 16. Execução de shell: melhorar já

No provider atual, `run_shell` usa shell. É funcional, mas arriscado.

Inspiração do `code-chat-skills`:

- allowlist de binários.
- `shell=true` bloqueado por padrão.
- timeout.
- limite de output.
- variáveis de ambiente controladas.

Proposta:

```ts
type ExecPolicy = {
  allowedBins: string[];
  allowShell: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  envAllowlist: string[];
  requireApproval: boolean;
};
```

Env vars:

```text
AGENTIC_EXEC_ALLOW_SHELL=false
AGENTIC_EXEC_ALLOWED_BINS=node,npm,npx,python,python3,py,bash,sh
AGENTIC_EXEC_TIMEOUT_MS=20000
AGENTIC_EXEC_MAX_OUTPUT_BYTES=65536
```

---

## 17. Jobs/runs reanexáveis

O backend deve permitir que a aba caia sem perder a resposta.

### 17.1 Eventos persistidos

Toda emissão deve ter `seq` monotônico:

```ts
type RunEvent = {
  id: string;
  runId: string;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
};
```

### 17.2 SSE reanexável

Rotas:

```text
GET /api/runs/:runId/events?afterSeq=123
GET /api/runs/:runId/sse?afterSeq=123
```

Fluxo:

```text
frontend acompanha run até seq 50
aba cai
usuário volta
frontend chama /sse?afterSeq=50
backend reenvia eventos 51+
```

### 17.3 Worker de run

O run deve poder continuar sem aba:

```text
POST /api/runs
  -> cria run
  -> enfileira
  -> worker executa
  -> eventos persistidos
  -> UI acompanha ou reanexa
```

---

## 18. Backend modes sugeridos

O Agentic pode ter modos claros:

### 18.1 `http-only`

- usa só Codex HTTP.
- bom para servidor.
- sem CLI local.
- tools locais do próprio Agentic.

### 18.2 `cli-local`

- usa Codex CLI MCP.
- bom para desenvolvimento local.
- sandbox e approvals nativos.
- requer `codex` instalado.

### 18.3 `hybrid`

- escolhe automaticamente.

Regras possíveis:

```text
se tarefa envolve coding local profundo e CLI disponível:
  usar CodexCliMcpProvider
senão:
  usar CodexHttpProvider
```

Ou por escolha manual na UI.

---

## 19. Como melhorar o prompt/system atual

No modo HTTP, como as tools são JSON-over-text, o system prompt precisa ser mais robusto.

Adicionar regras:

```text
Quando precisar de ferramenta, responda somente JSON válido.
Não use Markdown.
Não explique antes da tool.
Não invente ferramentas.
Se não houver tool adequada, responda naturalmente.
Depois de receber resultados de tools, gere resposta final clara.
```

Adicionar fallback:

```text
Se uma ferramenta falhar, explique a falha e proponha alternativa.
Se o usuário pedir ação destrutiva, peça confirmação.
```

E schema mais explícito:

```json
{
  "tool": "read_file",
  "args": {
    "path": "README.md"
  }
}
```

Para várias:

```json
{
  "tools": [
    { "tool": "read_file", "args": { "path": "README.md" } },
    { "tool": "search_text", "args": { "query": "TODO" } }
  ]
}
```

---

## 20. Como lidar com MCP e tools locais ao mesmo tempo

Se o Codex CLI MCP já executa tools, o Agentic ainda pode ter tools próprias. Mas precisa evitar duplicidade confusa.

Modelo:

```text
Provider tools:
  - internas da Codex CLI
  - sandbox/approval nativo

Agentic tools:
  - registry local
  - GitHub
  - web
  - history
  - skills
  - voice
```

Estratégia:

- em modo CLI, deixar a CLI cuidar de coding/shell dentro do workspace.
- em modo HTTP, usar tools locais do Agentic.
- tools externas como GitHub/web/history podem continuar no Agentic em ambos os modos.

---

## 21. GitHub adapter futuro

Com backend forte, o próximo salto é GitHub nativo.

Tools read-only:

```ts
github_list_repos()
github_read_file({ repo, path, ref })
github_search_code({ repo, query })
github_read_issue({ repo, number })
github_read_pr({ repo, number })
```

Tools write, sempre com approval:

```ts
github_create_issue({ repo, title, body })
github_create_branch({ repo, branch, from })
github_update_file({ repo, branch, path, content })
github_create_pr({ repo, branch, base, title, body })
github_comment_pr({ repo, number, body })
```

Isso permitiria:

```text
Analisa meu repo e abre um PR com a correção.
```

Fluxo:

1. ler repo.
2. planejar.
3. pedir aprovação.
4. criar branch.
5. editar arquivos.
6. abrir PR.
7. registrar tudo no run.

---

## 22. Plano de implementação por fases

### Fase 1: Preparar backend para múltiplos providers

- criar interface `AgentProvider`.
- adaptar provider atual para `CodexHttpProvider`.
- normalizar eventos.
- exibir capability badges.
- manter runtime atual funcionando.

### Fase 2: Melhorar Codex HTTP

- `store:true`.
- `previous_response_id`.
- fallback `store:false`.
- Auth Pool.
- detecção de rate limit.
- API `/v1` compatível.

### Fase 3: Criar Codex CLI MCP provider

- spawn `codex mcp-server`.
- inicialização JSON-RPC.
- `tools/call` com `name:"codex"`.
- processar `codex/event`.
- mapear reasoning, messages e command output.
- cancelar processo em abort.
- configurar sandbox e approval.

### Fase 4: Segurança

- Tool Registry.
- Permission Layer.
- Approval Gate.
- Audit Log.
- Exec Policy.

### Fase 5: Runs resilientes

- worker de runs.
- eventos com `seq`.
- SSE reanexável.
- retry/cancel.
- painel de runs.

### Fase 6: Tools avançadas

- web search.
- fetch/crawl/scrape.
- RSS.
- HTTP request.
- history tools.
- GitHub adapter.

### Fase 7: Skills e UX

- Markdown skills.
- code skills.
- skills por usuário/projeto.
- voz STT/TTS.
- live mode.

---

## 23. Exemplo de arquitetura final

```text
agentic-chat-codex
│
├── Providers
│   ├── CodexHttpProvider
│   │   ├── backend-api/codex/responses
│   │   ├── store:true
│   │   ├── previous_response_id
│   │   ├── auth pool
│   │   └── JSON-over-text local tools
│   │
│   └── CodexCliMcpProvider
│       ├── codex mcp-server
│       ├── JSON-RPC tools/call
│       ├── codex/event notifications
│       ├── reasoning deltas
│       ├── command output deltas
│       ├── sandbox
│       └── approvals
│
├── Agent Runtime
│   ├── provider router
│   ├── tool router
│   ├── run worker
│   ├── event normalizer
│   └── retry/cancel
│
├── Tools
│   ├── filesystem
│   ├── shell
│   ├── web
│   ├── http
│   ├── history
│   ├── github
│   └── skills
│
├── Security
│   ├── permission layer
│   ├── approval gate
│   ├── audit log
│   └── exec policy
│
└── UI
    ├── chat
    ├── runs
    ├── diffs
    ├── tools
    ├── approvals
    ├── provider badges
    └── settings
```

---

## 24. Finalidade dessa melhoria

A finalidade não é apenas “fazer funcionar”. É transformar o `agentic-chat-codex` em um agente local-first de verdade.

Ele deve poder operar em dois mundos:

### Mundo 1: server/proxy/API

```text
HTTP Codex + store:true + auth pool + API compatível
```

Ideal para:

- deploy.
- multiusuário.
- histórico.
- proxy.
- chat.
- integração com outros clientes.

### Mundo 2: coding local profundo

```text
Codex CLI MCP + sandbox + approvals + command output
```

Ideal para:

- alterar projeto local.
- rodar testes.
- analisar codebase.
- executar comandos.
- trabalhar como Codex CLI dentro da UI do Agentic.

Unir os dois mundos cria um produto muito mais forte do que escolher só um.

---

## 25. Conclusão

O Agentic atual já tem uma base muito boa, mas está usando o Codex principalmente como backend textual com JSON-over-text para ferramentas.

Outros projetos mostram caminhos mais completos:

- `fluxo-codex` mostra como usar melhor o backend HTTP: `store:true`, `previous_response_id`, fallback e Auth Pool.
- `opencode-codex-provider` mostra como usar a Codex CLI como runtime agentic via `codex mcp-server`.
- `Codex-Pool` mostra como transformar Codex em gateway gerenciado com contas, logs e API compatível.
- `OpenClaw`/Codex-Pool plugin mostra a importância de preservar tool calling, reasoning e streaming no nível do provider.

A recomendação é clara:

```text
não trocar tudo;
não abandonar o provider HTTP;
não depender apenas da CLI;

criar uma arquitetura híbrida com providers plugáveis.
```

Assim o `agentic-chat-codex` pode ser:

- simples quando precisa ser simples.
- profundo quando a CLI está disponível.
- seguro quando executa ações.
- resiliente quando a aba cai.
- compatível quando outros clientes precisam usar.
- extensível quando novas tools e skills aparecem.

Esse é o salto: de chat agentic artesanal para plataforma agentic local-first de verdade.
