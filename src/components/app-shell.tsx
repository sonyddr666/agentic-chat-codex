"use client";

import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  Files,
  Folder,
  GitCompare,
  History,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  Square,
  Terminal,
  Upload,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, FormEvent } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { RichMessage } from "@/components/rich-message";
import {
  ATTACHMENT_LIMITS,
  attachmentMetadata,
  formatAttachmentSize,
  isPdfAttachment,
  isTextLikeAttachment
} from "@/lib/attachments";
import type {
  ChatAttachment,
  ChatAttachmentMetadata,
  CodexAuthStatus,
  Message,
  Project,
  Run,
  RunEvent,
  Thread,
  ToolCall,
  WorkspaceTreeNode
} from "@/lib/types";

type ProjectsResponse = {
  projects: Project[];
  threads: Thread[];
};

type ThreadResponse = {
  thread: Thread;
  messages: Message[];
  runs: Run[];
  toolCalls: ToolCall[];
};

type WorkspaceFile = {
  path: string;
  content: string;
};

type SidePanel = "files" | "run" | "diff" | "auth" | "options";

type DiffEntry = {
  id: string;
  path: string;
  diff: string;
  createdAt: string;
};

const RUN_EVENT_TYPES: RunEvent["type"][] = [
  "message_delta",
  "tool_start",
  "tool_output",
  "file_changed",
  "diff_ready",
  "error",
  "run_complete"
];

const SIDE_PANELS: Array<{ id: SidePanel; label: string; icon: typeof Files }> = [
  { id: "files", label: "Files", icon: Files },
  { id: "run", label: "Run", icon: Terminal },
  { id: "diff", label: "Diff", icon: GitCompare },
  { id: "auth", label: "Auth", icon: KeyRound },
  { id: "options", label: "Options", icon: Settings }
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

function isVisibleChatMessage(message: Message) {
  if (message.role !== "assistant") {
    return true;
  }

  const content = message.content.trim();
  if (/^(?:```(?:json)?\s*)?\{[\s\S]*"tool"\s*:[\s\S]*"args"\s*:/i.test(content)) {
    return false;
  }

  return ![
    "I inspected the selected workspace and prepared the next step.",
    "Workspace snapshot:",
    "For real model output",
    "No Codex auth accounts configured.",
    "Import auth.json or use device login.",
    "Codex auth is missing",
    "Codex account is missing",
    "Codex HTTP"
  ].some((text) => message.content.includes(text));
}

function EventIcon({ type }: { type: RunEvent["type"] }) {
  if (type === "error") {
    return <XCircle className="h-4 w-4 text-berry" />;
  }

  if (type === "run_complete") {
    return <CheckCircle2 className="h-4 w-4 text-teal" />;
  }

  if (type.startsWith("tool")) {
    return <Terminal className="h-4 w-4 text-amber" />;
  }

  if (type === "file_changed" || type === "diff_ready") {
    return <FileText className="h-4 w-4 text-teal" />;
  }

  return <Bot className="h-4 w-4 text-muted" />;
}

function TreeNode({
  node,
  activePath,
  onSelect
}: {
  node: WorkspaceTreeNode;
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(node.type === "directory");
  const isActive = activePath === node.path;

  if (node.type === "file") {
    return (
      <button
        className={classNames(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-ink transition",
          isActive ? "bg-teal/10 text-teal" : "hover:bg-ink/5"
        )}
        onClick={() => onSelect(node.path)}
        title={node.path}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-ink hover:bg-ink/5"
        onClick={() => setOpen((value) => !value)}
        title={node.path}
      >
        <ChevronRight
          className={classNames("h-4 w-4 shrink-0 transition", open && "rotate-90")}
        />
        <Folder className="h-4 w-4 shrink-0 text-amber" />
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
      {open && node.children ? (
        <div className="ml-4 border-l border-line pl-2">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} activePath={activePath} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-teal/10">
          <Bot className="h-6 w-6 text-teal" />
        </div>
        <div className="text-xl font-semibold">Chat</div>
        <div className="mt-1 text-sm text-muted">Pronto.</div>
      </div>
    </div>
  );
}

function MessageCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <button
      type="button"
      className="group/copy relative grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-ink/5 hover:text-ink"
      onClick={() => void handleCopy()}
      title="Copy message"
      aria-label="Copy message"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-soft transition-opacity group-hover/copy:opacity-100">
        {copied ? "Copied" : "Copy message"}
      </span>
    </button>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > ATTACHMENT_LIMITS.maxSingleBytes) {
    throw new Error(`${file.name} passa do limite de ${formatAttachmentSize(ATTACHMENT_LIMITS.maxSingleBytes)}.`);
  }

  const id = `att_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const mimeType = file.type || "application/octet-stream";

  if (mimeType.startsWith("image/")) {
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      kind: "image",
      dataUrl: await readFileAsDataUrl(file)
    };
  }

  if (!isPdfAttachment(file.name, mimeType) || isTextLikeAttachment(file.name, mimeType)) {
    const text = (await file.text()).slice(0, ATTACHMENT_LIMITS.maxTextChars);
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      kind: "text",
      text
    };
  }

  return {
    id,
    name: file.name,
    mimeType,
    size: file.size,
    kind: "pdf",
    dataUrl: await readFileAsDataUrl(file)
  };
}

function messageAttachments(message: Message): ChatAttachmentMetadata[] {
  const raw = message.metadata?.attachments;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id ?? ""),
      originalName: String(item.originalName ?? item.name ?? "attachment"),
      name: String(item.name ?? "attachment"),
      storedPath: String(item.storedPath ?? ""),
      mimeType: String(item.mimeType ?? "application/octet-stream"),
      size: Number(item.size ?? 0),
      kind:
        item.kind === "image" || item.kind === "text" || item.kind === "pdf"
          ? item.kind
          : "text",
      dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : undefined,
      uploadedAt: String(item.uploadedAt ?? "")
    }));
}

function AttachmentPill({
  attachment,
  onRemove
}: {
  attachment: ChatAttachmentMetadata;
  onRemove?: () => void;
}) {
  const isImage = attachment.kind === "image";

  return (
    <div className="flex max-w-full items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink">
      {isImage && attachment.dataUrl ? (
        <img
          alt=""
          className="h-8 w-8 shrink-0 rounded object-cover"
          src={attachment.dataUrl}
        />
      ) : isImage ? (
        <ImageIcon className="h-4 w-4 shrink-0 text-teal" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-amber" />
      )}
      <span className="min-w-0 truncate">{attachment.name}</span>
      <span className="shrink-0 text-muted">{formatAttachmentSize(attachment.size)}</span>
      {onRemove ? (
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-ink/5"
          onClick={onRemove}
          title="Remover anexo"
          aria-label={`Remover ${attachment.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [activePanel, setActivePanel] = useState<SidePanel>("files");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [threadFilter, setThreadFilter] = useState("");
  const [diffs, setDiffs] = useState<DiffEntry[]>([]);
  const [authStatus, setAuthStatus] = useState<CodexAuthStatus | null>(null);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningRunId, setRunningRunId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isMobileViewport = useCallback(() => {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  }, []);

  const closeLeftOnMobile = useCallback(() => {
    if (isMobileViewport()) {
      setLeftOpen(false);
    }
  }, [isMobileViewport]);

  const settleComposerOnKeyboard = useCallback(() => {
    shouldAutoScrollRef.current = true;
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }, 120);
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const projectThreads = useMemo(
    () => threads.filter((thread) => thread.projectId === activeProjectId),
    [activeProjectId, threads]
  );
  const filteredThreads = useMemo(() => {
    const query = threadFilter.trim().toLowerCase();
    if (!query) {
      return projectThreads;
    }

    return projectThreads.filter((thread) => thread.title.toLowerCase().includes(query));
  }, [projectThreads, threadFilter]);
  const activeThread = useMemo(
    () => projectThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, projectThreads]
  );
  const visibleMessages = useMemo(() => messages.filter(isVisibleChatMessage), [messages]);
  const activeRun = useMemo(
    () => runs.find((run) => run.id === runningRunId) ?? runs[0] ?? null,
    [runningRunId, runs]
  );
  const activeAccountLabel = authStatus?.activeAccount
    ? authStatus.activeAccount.email !== "-"
      ? authStatus.activeAccount.email
      : authStatus.activeAccount.label
    : "No account";
  const messageMeta = useCallback(
    (message: Message) => {
      const metadata = message.metadata ?? {};
      const provider =
        typeof metadata.provider === "string" ? metadata.provider : authStatus?.provider ?? "codex-chatgpt";
      const model = typeof metadata.model === "string" ? metadata.model : authStatus?.model ?? "gpt-5.4-mini";
      const runInfo = message.runId ? `run ${message.runId.replace(/^run_/, "").slice(0, 8)}` : null;
      const time = formatTime(message.createdAt);

      if (message.role === "assistant") {
        return ["Assistente", provider, model, runInfo, time].filter(Boolean).join(" / ");
      }

      return ["Voce", time].join(" / ");
    },
    [authStatus?.model, authStatus?.provider]
  );

  const loadThread = useCallback(async (threadId: string) => {
    const data = await fetchJson<ThreadResponse>(`/api/threads/${threadId}`);
    setMessages(data.messages);
    setRuns(data.runs);
    setToolCalls(data.toolCalls);
  }, []);

  const loadTree = useCallback(async (projectId: string) => {
    const data = await fetchJson<{ tree: WorkspaceTreeNode[] }>(
      `/api/workspace/tree?projectId=${encodeURIComponent(projectId)}`
    );
    setTree(data.tree);
  }, []);

  const loadAuthStatus = useCallback(async () => {
    const data = await fetchJson<CodexAuthStatus>("/api/auth/status");
    setAuthStatus(data);
  }, []);

  const createThreadForProject = useCallback(async (projectId: string) => {
    const data = await fetchJson<{ thread: Thread }>("/api/threads", {
      method: "POST",
      body: JSON.stringify({ projectId, title: "New thread" })
    });
    setThreads((current) => [data.thread, ...current]);
    setActiveThreadId(data.thread.id);
    setMessages([]);
    setRuns([]);
    setToolCalls([]);
    setEvents([]);
    setDiffs([]);
    return data.thread;
  }, []);

  const loadProjects = useCallback(async () => {
    setError(null);
    let data = await fetchJson<ProjectsResponse>("/api/projects");
    if (data.projects.length === 0) {
      const created = await fetchJson<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({})
      });
      data = {
        projects: [created.project],
        threads: []
      };
    }

    setProjects(data.projects);
    setThreads(data.threads);

    const project = data.projects[0];
    setActiveProjectId(project.id);
    await loadTree(project.id);

    const firstThread = data.threads.find((thread) => thread.projectId === project.id);
    if (firstThread) {
      setActiveThreadId(firstThread.id);
      await loadThread(firstThread.id);
    } else {
      await createThreadForProject(project.id);
    }
  }, [createThreadForProject, loadThread, loadTree]);

  useEffect(() => {
    loadProjects()
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setBooting(false));
  }, [loadProjects]);

  useEffect(() => {
    const setViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-vh", `${Math.max(320, Math.floor(height))}px`);
    };

    setViewportHeight();
    window.addEventListener("resize", setViewportHeight);
    window.visualViewport?.addEventListener("resize", setViewportHeight);
    window.visualViewport?.addEventListener("scroll", setViewportHeight);

    return () => {
      window.removeEventListener("resize", setViewportHeight);
      window.visualViewport?.removeEventListener("resize", setViewportHeight);
      window.visualViewport?.removeEventListener("scroll", setViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (isMobileViewport()) {
      setLeftOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    void loadAuthStatus().catch(() => {
      setAuthStatus(null);
    });
  }, [loadAuthStatus]);

  const updateAutoScroll = useCallback(() => {
    const element = chatScrollRef.current;
    if (!element) {
      shouldAutoScrollRef.current = true;
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 180;
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      scrollFrameRef.current = null;
    });
  }, [visibleMessages, runningRunId]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const openPanel = (panel: SidePanel) => {
    setActivePanel(panel);
    setRightOpen(true);
  };

  const selectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setSelectedFile(null);
    setDiffs([]);
    closeLeftOnMobile();
    await loadTree(projectId);

    const firstThread = threads.find((thread) => thread.projectId === projectId);
    if (firstThread) {
      setActiveThreadId(firstThread.id);
      await loadThread(firstThread.id);
    } else {
      await createThreadForProject(projectId);
    }
  };

  const selectThread = async (threadId: string) => {
    shouldAutoScrollRef.current = true;
    setActiveThreadId(threadId);
    setEvents([]);
    setDiffs([]);
    closeLeftOnMobile();
    await loadThread(threadId);
  };

  const selectFile = async (filePath: string) => {
    if (!activeProjectId) {
      return;
    }

    const data = await fetchJson<{ file: WorkspaceFile }>(
      `/api/workspace/file?projectId=${encodeURIComponent(activeProjectId)}&path=${encodeURIComponent(filePath)}`
    );
    setSelectedFile(data.file);
    openPanel("files");
  };

  const handleRunEvent = useCallback(
    (event: RunEvent) => {
      setEvents((current) => {
        if (current.some((item) => item.id === event.id)) {
          return current;
        }

        return [...current, event].slice(-120);
      });

      if (event.type === "message_delta") {
        const messageId = String(event.payload.messageId ?? "");
        const text = String(event.payload.text ?? "");
        if (!messageId || !text) {
          return;
        }

        setMessages((current) => {
          const existing = current.find((message) => message.id === messageId);
          if (!existing) {
            return [
              ...current,
              {
                id: messageId,
                threadId: activeThreadId ?? "",
                runId: event.runId,
                role: "assistant",
                content: text,
                metadata: null,
                createdAt: event.createdAt
              }
            ];
          }

          return current.map((message) =>
            message.id === messageId ? { ...message, content: `${message.content}${text}` } : message
          );
        });
      }

      if (event.type === "diff_ready") {
        setDiffs((current) => {
          if (current.some((item) => item.id === event.id)) {
            return current;
          }

          return [
            ...current,
            {
              id: event.id,
              path: String(event.payload.path ?? "changed file"),
              diff: String(event.payload.diff ?? ""),
              createdAt: event.createdAt
            }
          ].slice(-40);
        });
        setActivePanel("diff");
        setRightOpen(true);
      }

      if (event.type === "error") {
        const message = String(event.payload.error ?? "Run failed.");
        setError(message);
        if (message.toLowerCase().includes("auth")) {
          setActivePanel("auth");
          setRightOpen(true);
        }
      }

      if (event.type === "run_complete" || event.type === "error") {
        setRunningRunId(null);
        if (activeThreadId) {
          void loadThread(activeThreadId);
        }
        if (activeProjectId) {
          void loadTree(activeProjectId);
        }
      }
    },
    [activeProjectId, activeThreadId, loadThread, loadTree]
  );

  const openRunEvents = useCallback(
    (runId: string) => {
      eventSourceRef.current?.close();
      const source = new EventSource(`/api/runs/${runId}/events`);
      eventSourceRef.current = source;

      const listener = (raw: Event) => {
        if (!("data" in raw) || typeof raw.data !== "string" || raw.data.length === 0) {
          return;
        }

        try {
          handleRunEvent(JSON.parse(raw.data) as RunEvent);
        } catch {
          setError("Could not parse a run event from the stream.");
        }
      };

      RUN_EVENT_TYPES.forEach((type) => source.addEventListener(type, listener));
      source.onerror = () => {
        source.close();
        setRunningRunId(null);
      };
    },
    [handleRunEvent]
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) {
        return;
      }

      const available = ATTACHMENT_LIMITS.maxCount - attachments.length;
      if (available <= 0) {
        setAttachmentError(`Limite de ${ATTACHMENT_LIMITS.maxCount} anexos por mensagem.`);
        return;
      }

      const selected = files.slice(0, available);
      const totalBytes =
        attachments.reduce((sum, attachment) => sum + attachment.size, 0) +
        selected.reduce((sum, file) => sum + file.size, 0);

      if (totalBytes > ATTACHMENT_LIMITS.maxTotalBytes) {
        setAttachmentError(
          `Anexos passam do limite total de ${formatAttachmentSize(ATTACHMENT_LIMITS.maxTotalBytes)}.`
        );
        return;
      }

      try {
        const prepared = await Promise.all(selected.map(fileToAttachment));
        setAttachments((current) => [...current, ...prepared].slice(0, ATTACHMENT_LIMITS.maxCount));
        setAttachmentError(
          files.length > selected.length
            ? `Adicionei ${selected.length} anexos. O limite e ${ATTACHMENT_LIMITS.maxCount}.`
            : null
        );
      } catch (attachError) {
        setAttachmentError(
          attachError instanceof Error ? attachError.message : "Nao consegui anexar esse arquivo."
        );
      }
    },
    [attachments]
  );

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentError(null);
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (event.clipboardData.files.length > 0) {
        event.preventDefault();
        void addFiles(event.clipboardData.files);
      }
    },
    [addFiles]
  );

  const handleAttachmentDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      setIsDraggingAttachment(true);
    }
  }, []);

  const handleAttachmentDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setIsDraggingAttachment(false);
  }, []);

  const handleAttachmentDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (event.dataTransfer.files.length > 0) {
        event.preventDefault();
        setIsDraggingAttachment(false);
        void addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = composer.trim();
    const pendingAttachments = attachments;
    const prompt = content || (pendingAttachments.length ? "Analise os anexos." : "");
    if ((!prompt && pendingAttachments.length === 0) || !activeThreadId || runningRunId) {
      return;
    }

    setComposer("");
    setAttachments([]);
    setAttachmentError(null);
    setError(null);
    setEvents([]);
    setDiffs([]);
    shouldAutoScrollRef.current = true;
    setMessages((current) => [
      ...current,
      {
        id: `optimistic_${Date.now()}`,
        threadId: activeThreadId,
        runId: null,
        role: "user",
        content: prompt,
        metadata: pendingAttachments.length
          ? {
              attachments: pendingAttachments.map((attachment) => ({
                ...attachmentMetadata(attachment),
                dataUrl: attachment.kind === "image" ? attachment.dataUrl : undefined
              }))
            }
          : null,
        createdAt: new Date().toISOString()
      }
    ]);

    try {
      const data = await fetchJson<{ run: Run }>(`/api/threads/${activeThreadId}/runs`, {
        method: "POST",
        body: JSON.stringify({ content: prompt, attachments: pendingAttachments })
      });
      setRunningRunId(data.run.id);
      setRuns((current) => [data.run, ...current]);
      setActivePanel("run");
      openRunEvents(data.run.id);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Could not start run.";
      setError(message);
      setRunningRunId(null);
      if (message.includes("No Codex auth") || message.includes("auth")) {
        openPanel("auth");
      }
    }
  };

  const cancelRun = async () => {
    if (!runningRunId) {
      return;
    }

    await fetchJson(`/api/runs/${runningRunId}/cancel`, { method: "POST" });
    eventSourceRef.current?.close();
    setRunningRunId(null);
  };

  return (
    <main className="h-[var(--app-vh)] max-h-[var(--app-vh)] min-h-[var(--app-vh)] overflow-hidden bg-paper text-ink">
      <div className="flex h-full min-w-0">
        <aside
          className={classNames(
            "flex min-h-0 shrink-0 flex-col border-r border-line bg-panel transition-[width,transform] duration-200",
            leftOpen ? "w-[292px] max-[760px]:w-[min(86vw,320px)]" : "w-[68px]",
            "max-[760px]:fixed max-[760px]:inset-y-0 max-[760px]:left-0 max-[760px]:z-30 max-[760px]:h-[var(--app-vh)] max-[760px]:shadow-soft",
            !leftOpen && "max-[760px]:-translate-x-full"
          )}
        >
          <div className="flex h-14 items-center gap-2 border-b border-line px-3">
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-panel hover:bg-paper"
              onClick={() => setLeftOpen((value) => !value)}
              title="Historico"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {leftOpen ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">Agentic Chat</div>
                  <div className="truncate text-xs text-muted">Historico</div>
                </div>
                <button
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ink text-white hover:bg-ink/90"
                  onClick={() => {
                    if (activeProjectId) {
                      void createThreadForProject(activeProjectId).then(closeLeftOnMobile);
                    }
                  }}
                  title="New chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>

          {leftOpen ? (
            <>
              <div className="border-b border-line p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    className="h-9 w-full rounded-md border border-line bg-paper pl-8 pr-2 text-sm outline-none focus:border-teal"
                    value={threadFilter}
                    onChange={(event) => setThreadFilter(event.target.value)}
                    placeholder="Search"
                  />
                </div>
              </div>

              <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted">
                  <Folder className="h-3.5 w-3.5" />
                  Projects
                </div>
                <div className="space-y-1">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={classNames(
                        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                        project.id === activeProjectId ? "bg-teal/10 text-teal" : "hover:bg-ink/5"
                      )}
                      onClick={() => void selectProject(project.id)}
                      title={project.workspacePath}
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">{project.name}</span>
                    </button>
                  ))}
                </div>

                <div className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold uppercase text-muted">
                  <History className="h-3.5 w-3.5" />
                  Chats
                </div>
                <div className="space-y-1">
                  {filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      className={classNames(
                        "w-full rounded-md px-2 py-2 text-left text-sm transition",
                        thread.id === activeThreadId ? "bg-ink text-white" : "hover:bg-ink/5"
                      )}
                      onClick={() => void selectThread(thread.id)}
                      title={thread.title}
                    >
                      <span className="line-clamp-2">{thread.title}</span>
                      <span className="mt-1 block text-xs opacity-65">{formatTime(thread.updatedAt)}</span>
                    </button>
                  ))}
                  {filteredThreads.length === 0 ? (
                    <div className="rounded-md border border-line bg-paper px-3 py-5 text-center text-sm text-muted">
                      No chats
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-line p-3 text-xs text-muted">
                <div className="truncate" title={activeProject?.workspacePath}>
                  {activeProject?.workspacePath ?? "Loading workspace..."}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center gap-2 py-3">
              <button
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-paper"
                onClick={() => {
                  if (activeProjectId) {
                    void createThreadForProject(activeProjectId).then(closeLeftOnMobile);
                  }
                }}
                title="New chat"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
              <button
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-paper"
                onClick={() => setLeftOpen(true)}
                title="Chats"
              >
                <History className="h-4 w-4" />
              </button>
            </div>
          )}
        </aside>

        {leftOpen ? (
          <button
            type="button"
            className="fixed bottom-0 right-0 top-0 z-20 bg-ink/20 backdrop-blur-[1px] max-[760px]:left-[min(86vw,320px)] min-[761px]:hidden"
            onClick={() => setLeftOpen(false)}
            aria-label="Fechar historico"
          />
        ) : null}

        <section
          className="relative z-0 flex min-w-0 flex-1 flex-col bg-panel"
          onDragOver={handleAttachmentDragOver}
          onDragLeave={handleAttachmentDragLeave}
          onDrop={handleAttachmentDrop}
        >
          {isDraggingAttachment ? (
            <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-lg border-2 border-dashed border-teal bg-teal/10 text-sm font-semibold text-teal">
              <div className="flex items-center gap-2 rounded-md bg-panel px-4 py-3 shadow-soft">
                <Upload className="h-4 w-4" />
                Solte para anexar
              </div>
            </div>
          ) : null}
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-3 sm:gap-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-panel hover:bg-paper min-[761px]:hidden"
                onClick={() => setLeftOpen(true)}
                title="Historico"
              >
                <History className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{activeThread?.title ?? "New chat"}</div>
                <div className="truncate text-xs text-muted">
                  {runningRunId ? "Running" : booting ? "Loading" : `Codex / ${activeAccountLabel}`}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                className="hidden h-9 max-w-48 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm hover:bg-paper sm:flex"
                onClick={() => openPanel("auth")}
                title="Auth"
              >
                <KeyRound className="h-4 w-4 text-teal" />
                <span className="truncate">{activeAccountLabel}</span>
              </button>
              <button
                className="grid h-9 w-9 place-items-center rounded-md border border-line bg-panel hover:bg-paper"
                onClick={() => activeThreadId && void loadThread(activeThreadId)}
                title="Refresh chat"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
              <button
                className="grid h-9 w-9 place-items-center rounded-md border border-line bg-panel hover:bg-paper"
                onClick={() => openPanel(rightOpen ? activePanel : "files")}
                title="Painel lateral"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </div>
          </header>

          {error ? (
            <div className="border-b border-berry/30 bg-berry/10 px-4 py-2 text-sm text-berry">
              {error}
            </div>
          ) : null}

          <div
            ref={chatScrollRef}
            className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5"
            onScroll={updateAutoScroll}
          >
            {visibleMessages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-5">
                {visibleMessages.map((message) => {
                  const attached = messageAttachments(message);

                  return (
                    <article
                      key={message.id}
                      className={classNames(
                        "flex gap-2 sm:gap-3",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-white sm:h-8 sm:w-8">
                          <Bot className="h-4 w-4" />
                        </div>
                      ) : null}
                      <div
                        className={classNames(
                          "flex min-w-0 flex-col gap-1",
                          message.role === "user"
                            ? "max-w-[88%] items-end sm:max-w-[82%]"
                            : "w-full max-w-[calc(100%-2.25rem)] items-start sm:max-w-[92%]"
                        )}
                      >
                        <div
                          className={classNames(
                            "min-w-0 rounded-lg border px-3 py-2.5 text-sm leading-6 shadow-soft sm:px-4 sm:py-3",
                            message.role === "user"
                              ? "w-fit max-w-full border-teal/20 bg-teal text-white"
                              : "w-full border-line bg-paper"
                          )}
                        >
                          <RichMessage
                            content={message.content || " "}
                            variant={message.role === "user" ? "user" : "assistant"}
                          />
                          {attached.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attached.map((attachment) => (
                                <AttachmentPill key={attachment.id || attachment.name} attachment={attachment} />
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={classNames(
                            "flex w-full min-w-0 items-center gap-2 px-1 text-[11px] leading-4 text-muted",
                            message.role === "user" ? "justify-end" : "justify-between"
                          )}
                        >
                          {message.role === "user" ? (
                            <MessageCopyButton value={message.content} />
                          ) : null}
                          <span
                            className={classNames(
                              "min-w-0 truncate",
                              message.role === "user" ? "text-right" : "text-left"
                            )}
                          >
                            {messageMeta(message)}
                          </span>
                          {message.role === "assistant" ? (
                            <MessageCopyButton value={message.content} />
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {runningRunId ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-muted shadow-soft">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Thinking</span>
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-line bg-panel p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onSubmit={sendMessage}
          >
            <input
              ref={fileInputRef}
              className="hidden"
              multiple
              type="file"
              onChange={(event) => {
                if (event.target.files) {
                  void addFiles(event.target.files);
                }
                event.currentTarget.value = "";
              }}
            />
            <div className="mx-auto max-w-3xl rounded-md border border-line bg-paper shadow-soft sm:rounded-lg">
              {attachments.length ? (
                <div className="flex flex-wrap gap-2 border-b border-line p-2">
                  {attachments.map((attachment) => (
                    <AttachmentPill
                      key={attachment.id}
                      attachment={{
                        ...attachmentMetadata(attachment),
                        dataUrl: attachment.kind === "image" ? attachment.dataUrl : undefined
                      }}
                      onRemove={() => removeAttachment(attachment.id)}
                    />
                  ))}
                </div>
              ) : null}
              {attachmentError ? (
                <div className="border-b border-amber/30 bg-amber/10 px-3 py-2 text-xs text-ink">
                  {attachmentError}
                </div>
              ) : null}
              <div className="flex items-end gap-2 p-2">
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-panel"
                  onClick={() => fileInputRef.current?.click()}
                  title="Anexar arquivos"
                  aria-label="Anexar arquivos"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  className="thin-scrollbar max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-muted sm:text-sm"
                  placeholder="Mensagem para o chat..."
                  rows={2}
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onFocus={settleComposerOnKeyboard}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      !isMobileViewport()
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {runningRunId ? (
                  <button
                    type="button"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-berry text-white hover:bg-berry/90"
                    onClick={() => void cancelRun()}
                    title="Cancel run"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal text-white hover:bg-teal/90 disabled:opacity-50"
                    disabled={(!composer.trim() && attachments.length === 0) || !activeThreadId}
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>

        {rightOpen ? (
          <button
            type="button"
            className="fixed bottom-0 left-0 top-0 z-30 bg-ink/20 backdrop-blur-[1px] max-[980px]:right-[420px] max-[520px]:hidden min-[981px]:hidden"
            onClick={() => setRightOpen(false)}
            aria-label="Fechar painel lateral"
          />
        ) : null}

        <aside
          className={classNames(
            "flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-line bg-panel transition-[width,transform] duration-200",
            rightOpen
              ? "w-[420px] max-[980px]:fixed max-[980px]:inset-y-0 max-[980px]:right-0 max-[980px]:z-40 max-[980px]:h-[var(--app-vh)] max-[980px]:shadow-soft max-[520px]:w-full"
              : "w-0"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <PanelRight className="h-4 w-4 text-teal" />
              <span>Workspace</span>
            </div>
            <button
              className="grid h-8 w-8 place-items-center rounded-md border border-line bg-panel hover:bg-paper"
              onClick={() => setRightOpen(false)}
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1 border-b border-line p-2 text-xs">
            {SIDE_PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.id}
                  className={classNames(
                    "flex h-9 items-center justify-center gap-1 rounded-md px-2",
                    activePanel === panel.id ? "bg-ink text-white" : "hover:bg-ink/5"
                  )}
                  onClick={() => setActivePanel(panel.id)}
                  title={panel.label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="min-w-0 truncate">{panel.label}</span>
                </button>
              );
            })}
          </div>

          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            {activePanel === "files" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-line bg-paper p-2">
                  {tree.length > 0 ? (
                    tree.map((node) => (
                      <TreeNode
                        key={node.path}
                        node={node}
                        activePath={selectedFile?.path ?? null}
                        onSelect={selectFile}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted">No files found.</div>
                  )}
                </div>
                {selectedFile ? (
                  <div className="rounded-lg border border-line bg-paper">
                    <div className="border-b border-line px-3 py-2 text-sm font-semibold">
                      {selectedFile.path}
                    </div>
                    <pre className="thin-scrollbar max-h-[44vh] overflow-auto p-3 text-xs leading-5">
                      {selectedFile.content}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePanel === "run" ? (
              <div className="space-y-3">
                {activeRun ? (
                  <div className="rounded-lg border border-line bg-paper p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{activeRun.id}</div>
                        <div className="text-xs text-muted">{activeRun.status}</div>
                      </div>
                      {runningRunId ? <Loader2 className="h-4 w-4 animate-spin text-teal" /> : null}
                    </div>
                  </div>
                ) : null}

                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-line bg-paper p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted">
                      <EventIcon type={event.type} />
                      <span>{event.type.replaceAll("_", " ")}</span>
                      <span className="ml-auto">{formatTime(event.createdAt)}</span>
                    </div>
                    <pre className="thin-scrollbar max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                ))}

                {events.length === 0 && toolCalls.length > 0
                  ? toolCalls.slice(0, 12).map((tool) => (
                      <div key={tool.id} className="rounded-lg border border-line bg-paper p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted">
                          <Terminal className="h-4 w-4 text-amber" />
                          <span>{tool.name}</span>
                          <span className="ml-auto">{tool.status}</span>
                        </div>
                        <pre className="thin-scrollbar max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5">
                          {tool.output || tool.error || JSON.stringify(tool.args, null, 2)}
                        </pre>
                      </div>
                    ))
                  : null}

                {events.length === 0 && toolCalls.length === 0 ? (
                  <div className="rounded-lg border border-line bg-paper p-6 text-center text-sm text-muted">
                    No run events
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePanel === "diff" ? (
              <div className="space-y-3">
                {diffs.length ? (
                  diffs.map((diff) => (
                    <div key={diff.id} className="rounded-lg border border-line bg-paper">
                      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm font-semibold">
                        <span className="min-w-0 truncate" title={diff.path}>
                          {diff.path}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted">
                          {formatTime(diff.createdAt)}
                        </span>
                      </div>
                      <pre className="thin-scrollbar max-h-64 overflow-auto whitespace-pre-wrap p-3 text-xs leading-5">
                        {diff.diff || "No file changes in this file."}
                      </pre>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-line bg-paper p-6 text-center text-sm text-muted">
                    No file changes in this run.
                  </div>
                )}
              </div>
            ) : null}

            {activePanel === "auth" ? (
              <AuthPanel status={authStatus} onStatusChange={setAuthStatus} />
            ) : null}

            {activePanel === "options" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-line bg-paper p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Settings className="h-4 w-4 text-teal" />
                    Options
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
                      <span className="text-muted">Provider</span>
                      <span className="truncate font-medium">{authStatus?.provider ?? "codex-chatgpt"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
                      <span className="text-muted">Model</span>
                      <span className="truncate font-medium">{authStatus?.model ?? "gpt-5.4-mini"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
                      <span className="text-muted">Messages</span>
                      <span className="font-medium">{visibleMessages.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md bg-panel px-3 py-2">
                      <span className="text-muted">Runs</span>
                      <span className="font-medium">{runs.length}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel text-sm font-semibold hover:bg-paper"
                    onClick={() => activeThreadId && void loadThread(activeThreadId)}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Chat
                  </button>
                  <button
                    className="flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel text-sm font-semibold hover:bg-paper"
                    onClick={() => activeProjectId && void loadTree(activeProjectId)}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Files
                  </button>
                </div>

                <div className="rounded-lg border border-line bg-paper p-3 text-xs text-muted">
                  <div className="truncate" title={activeProject?.workspacePath}>
                    {activeProject?.workspacePath ?? "-"}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
