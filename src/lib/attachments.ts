import type { ChatAttachment, ChatAttachmentMetadata } from "@/lib/types";

export const ATTACHMENT_LIMITS = {
  maxCount: 8,
  maxSingleBytes: 8 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxTextChars: 240_000
};

const TEXT_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "csv",
  "dart",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ino",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mdx",
  "mjs",
  "mts",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml"
]);

export function isPdfAttachment(name: string, mimeType: string) {
  return mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

export function isTextLikeAttachment(name: string, mimeType: string) {
  if (mimeType.startsWith("text/")) {
    return true;
  }

  if (isPdfAttachment(name, mimeType) || mimeType.startsWith("image/")) {
    return false;
  }

  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(extension);
}

export function attachmentMetadata(attachment: ChatAttachment): ChatAttachmentMetadata {
  return {
    id: attachment.id,
    originalName: attachment.originalName ?? attachment.name,
    name: attachment.name,
    storedPath: attachment.storedPath ?? "",
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    uploadedAt: attachment.uploadedAt ?? new Date().toISOString()
  };
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
