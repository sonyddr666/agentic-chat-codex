# Agentic Chat Codex

> Local-first agentic chat workspace — um LLM com braço, perna e terminal.

Um ambiente de chat local que transforma um modelo de linguagem em agente operacional. O assistente conversa, lê arquivos, escreve código, roda comandos e produz diffs — tudo dentro de um workspace isolado, com streaming em tempo real e histórico persistente.

---

## ✨ Features

- **Chat agentic** — o modelo decide quando usar ferramentas para ler, escrever, buscar ou executar comandos no workspace
- **7 ferramentas locais** — `list_files`, `read_file`, `search_text`, `write_file`, `write_files`, `apply_patch`, `run_shell`
- **Streaming SSE** — respostas e eventos de ferramentas em tempo real
- **Multi-account auth** — múltiplas contas Codex com scoring automático, refresh e device login
- **Workspace isolado** — path guard impede acesso fora do workspace
- **Diff tracking** — snapshots de arquivos com before/after e unified diff
- **File attachments** — imagens, PDFs e arquivos de texto como contexto
- **Extração de PDF** — zero dependências externas
- **Markdown rico** — headings, listas, tabelas, code blocks com preview HTML/MD
- **Persistência SQLite** — projetos, threads, mensagens, runs e tool calls

---

## 🏗️ Arquitetura

```text
┌─────────────────────────────────────────────────────────┐
│                    Browser (React 19)                    │
│  AppShell → Chat → Composer → Sidebar → Side Panels     │
└──────────────────────────┬──────────────────────────────┘
                           │ fetch + SSE
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Next.js 15 API Routes                   │
│  /auth  /projects  /threads  /runs  /workspace           │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌──────────────┐ ┌────────┐ ┌──────────────┐
     │ Agent Runtime │ │ SQLite │ │ Auth Manager │
     │              │ │  (WAL) │ │              │
     │ Tool Router  │ │        │ │ OAuth/Device │
     │ LLM Provider │ │ Drizzle│ │ Multi-acct   │
     └──────┬───────┘ └────────┘ └──────────────┘
            │
            ▼
     ┌──────────────┐
     │  Workspace   │
     │  Tools       │
     │              │
     │ read / write │
     │ search / sh  │
     │ patch / diff │
     └──────────────┘
```

Documentação detalhada: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🚀 Quick Start

### Pré-requisitos

- **Node.js** ≥ 22 (usa `node:sqlite` nativo)
- **npm** ≥ 10

### Instalação

```bash
git clone https://github.com/seu-usuario/agentic-chat-codex.git
cd agentic-chat-codex
npm install
```

### Configuração

```bash
cp .env.example .env
```

Edite `.env` conforme necessário:

```env
# Modelo Codex a utilizar
CODEX_MODEL=gpt-5.4-mini

# Timeout para requests (ms)
CODEX_TIMEOUT_MS=120000
```

### Auth — Importar credenciais

Coloque seu arquivo de autenticação em `.data/codex-auth.json`, ou importe pela interface (painel Auth → Import).

Para login via device flow, use o botão **Login** no painel Auth.

### Rodar

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## 📁 Estrutura do Projeto

```text
agentic-chat-codex/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes (auth, projects, threads, runs, workspace)
│   │   ├── globals.css         # Design tokens e estilos base
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Entry point → AppShell
│   │
│   ├── components/             # React components
│   │   ├── app-shell.tsx       # Interface principal
│   │   ├── auth-panel.tsx      # Painel de autenticação
│   │   └── rich-message.tsx    # Renderizador markdown
│   │
│   ├── lib/                    # Core business logic
│   │   ├── agent/              # Runtime do agente + tools + path guard
│   │   ├── ai/                 # Provider interface + Codex ChatGPT
│   │   ├── codex/              # Auth manager (OAuth, device flow, multi-account)
│   │   ├── db/                 # SQLite client + schema + repositories
│   │   ├── events/             # Event bus + SSE formatting
│   │   ├── attachments.ts      # File attachment handling
│   │   ├── http.ts             # Response helpers
│   │   ├── pdf-text.ts         # PDF text extraction
│   │   ├── types.ts            # Domain types
│   │   ├── utils.ts            # Common utilities
│   │   └── workspace-manager.ts # Workspace layout + uploads
│   │
│   └── types/                  # Module declarations
│       └── diff.d.ts
│
├── tests/                      # Test suite
│   ├── *.test.ts               # Unit tests (vitest)
│   └── e2e/                    # E2E tests (playwright)
│
├── docs/
│   └── ARCHITECTURE.md         # Arquitetura detalhada
│
├── .data/                      # Runtime data (gitignored)
│   ├── agentic-chat.sqlite     # Database
│   ├── codex-auth.json         # Auth credentials
│   └── workspaces/             # Agent workspaces
│
└── package.json
```

---

## 🧪 Testes

```bash
# Unit tests
npm test

# E2E tests (inicia dev server automaticamente)
npm run test:e2e

# Type checking
npm run typecheck
```

---

## 🛠️ Ferramentas do Agente

O agente pode ser invocado via chat normal ou comandos explícitos:

| Comando | Exemplo | Ação |
|---|---|---|
| `/read <path>` | `/read src/lib/types.ts` | Lê arquivo |
| `/search <query>` | `/search TODO` | Busca texto no workspace |
| `/shell <cmd>` | `/shell npm test` | Executa comando |
| `/write <path>` | `/write hello.txt` + corpo | Cria/sobrescreve arquivo |
| `/patch <path>` | `/patch src/app.ts` + diff | Aplica patch |

O modelo também pode chamar ferramentas automaticamente respondendo JSON:

```json
{"tool": "read_file", "args": {"path": "package.json"}}
```

---

## 🔐 Segurança

- **Path Guard**: todo acesso ao filesystem passa por `WorkspaceGuard`, que impede traversal fora do workspace selecionado
- **Forbidden paths**: `src/`, `.next/`, `node_modules/` e outros diretórios do app são bloqueados
- **Shell timeout**: comandos têm timeout de 20s e output limitado a 64KB
- **Auth isolation**: credenciais ficam em `.data/` (gitignored)

---

## 📜 Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Dev server com hot reload |
| `npm run build` | Build de produção |
| `npm start` | Servidor de produção |
| `npm test` | Testes unitários (vitest) |
| `npm run test:e2e` | Testes E2E (playwright) |
| `npm run typecheck` | Verificação de tipos |

---

## 📄 Licença

Private — uso interno.
