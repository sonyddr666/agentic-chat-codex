import { getAgentRuntime } from "@/lib/agent/runtime";
import {
  ATTACHMENT_LIMITS,
  isPdfAttachment,
  isTextLikeAttachment
} from "@/lib/attachments";
import {
  createMessage,
  createRun,
  getProject,
  getThread,
  updateThreadTitle
} from "@/lib/db/repositories";
import { apiError, json } from "@/lib/http";
import { decideAgentMode } from "@/lib/mode/mode-router";
import {
  capabilitiesForProvider,
  type AgentMode,
  type AgentReasoningEffort
} from "@/lib/mode/mode-types";
import { extractPdfTextFromBuffer } from "@/lib/pdf-text";
import { checkCodexCliAvailability } from "@/lib/providers/codex-cli-mcp-provider";
import type { ChatAttachment } from "@/lib/types";
import { titleFromPrompt } from "@/lib/utils";
import { persistAttachmentToWorkspace } from "@/lib/workspace-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dataUrlToText(dataUrl: string) {
  return dataUrlToBuffer(dataUrl).toString("utf8");
}

function dataUrlToBuffer(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return Buffer.alloc(0);
  }

  const header = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);

  if (header.includes(";base64")) {
    return Buffer.from(body, "base64");
  }

  return Buffer.from(decodeURIComponent(body), "utf8");
}

function pdfAttachmentText(name: string, dataUrl: string) {
  const extracted = extractPdfTextFromBuffer(dataUrlToBuffer(dataUrl)).slice(
    0,
    ATTACHMENT_LIMITS.maxTextChars
  );

  if (extracted.trim()) {
    return [`Texto extraido do PDF: ${name}`, "", extracted].join("\n");
  }

  return [
    `PDF anexado: ${name}`,
    "",
    "Nao consegui extrair texto selecionavel desse PDF no backend local.",
    "Se ele for scan, imagem ou depender do layout visual, envie a pagina como imagem/print para analise visual."
  ].join("\n");
}

function normalizeAttachments(value: unknown): ChatAttachment[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("attachments must be an array.");
  }

  if (value.length > ATTACHMENT_LIMITS.maxCount) {
    throw new Error(`Use at most ${ATTACHMENT_LIMITS.maxCount} attachments.`);
  }

  let totalBytes = 0;
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Attachment ${index + 1} is invalid.`);
    }

    const id = String(item.id ?? `att_${index + 1}`);
    const name = String(item.name ?? "").slice(0, 240).trim();
    const mimeType = String(item.mimeType ?? "application/octet-stream").slice(0, 120);
    const size = Number(item.size ?? 0);
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : undefined;
    const text = typeof item.text === "string" ? item.text : undefined;

    if (!name) {
      throw new Error(`Attachment ${index + 1} needs a name.`);
    }

    if (!Number.isFinite(size) || size < 0 || size > ATTACHMENT_LIMITS.maxSingleBytes) {
      throw new Error(`${name} is too large.`);
    }

    totalBytes += size;
    if (totalBytes > ATTACHMENT_LIMITS.maxTotalBytes) {
      throw new Error("Attachments are too large together.");
    }

    if (mimeType.startsWith("image/")) {
      if (!dataUrl?.startsWith("data:")) {
        throw new Error(`${name} needs image data.`);
      }

      return { id, name, mimeType, size, kind: "image", dataUrl };
    }

    if (isPdfAttachment(name, mimeType)) {
      if (!dataUrl?.startsWith("data:")) {
        throw new Error(`${name} needs PDF data.`);
      }

      return {
        id,
        name,
        mimeType,
        size,
        kind: "pdf",
        dataUrl,
        text: pdfAttachmentText(name, dataUrl)
      };
    }

    if (text !== undefined || isTextLikeAttachment(name, mimeType) || dataUrl?.startsWith("data:")) {
      const rawText = text !== undefined ? text : dataUrl ? dataUrlToText(dataUrl) : "";
      const clipped = String(rawText).slice(0, ATTACHMENT_LIMITS.maxTextChars);
      return { id, name, mimeType, size, kind: "text", text: clipped };
    }

    throw new Error(`${name} precisa ser texto, imagem ou PDF.`);
  });
}

function normalizeReasoningEffort(value: unknown): AgentReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh"
    ? value
    : "xhigh";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await context.params;
    const body = (await request.json()) as {
      content?: string;
      attachments?: unknown[];
      mode?: AgentMode;
      reasoningEffort?: AgentReasoningEffort;
    };
    const attachments = normalizeAttachments(body.attachments);
    const content = body.content?.trim() || (attachments.length ? "Analise os anexos." : "");
    if (!content && attachments.length === 0) {
      return json({ error: "content is required." }, { status: 400 });
    }

    const thread = getThread(threadId);
    if (!thread) {
      return json({ error: "Thread not found." }, { status: 404 });
    }

    const project = getProject(thread.projectId);
    if (!project) {
      return json({ error: "Project not found." }, { status: 404 });
    }
    const persistedAttachments = attachments.map((attachment) =>
      persistAttachmentToWorkspace(project, attachment)
    );

    createMessage({
      threadId: thread.id,
      role: "user",
      content,
      metadata: persistedAttachments.length
        ? {
            attachments: persistedAttachments.map((attachment) => attachment.metadata)
          }
        : null
    });

    if (thread.title === "New thread") {
      updateThreadTitle(thread.id, titleFromPrompt(content));
    }

    const cliAvailability = await checkCodexCliAvailability(1_500);
    const modeDecision = decideAgentMode({
      prompt: content,
      projectSelected: Boolean(project),
      explicitMode: body.mode ?? "auto",
      cliAvailability
    });
    const capabilitiesSnapshot = capabilitiesForProvider(modeDecision.providerId);
    const run = createRun({
      threadId: thread.id,
      projectId: project.id,
      prompt: content,
      reasoningEffort: normalizeReasoningEffort(body.reasoningEffort),
      modeDecision,
      capabilitiesSnapshot
    });

    const runtime = getAgentRuntime();
    setTimeout(() => {
      void runtime.run({ run, project, prompt: content, attachments: persistedAttachments });
    }, 0);

    return json({ run, modeDecision }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
