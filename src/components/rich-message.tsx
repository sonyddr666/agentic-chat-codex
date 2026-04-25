"use client";

import { Check, Clipboard, Code2, Copy, Eye } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

type RichMessageProps = {
  content: string;
  variant?: "assistant" | "user";
};

export type MarkdownPart =
  | { type: "text"; content: string }
  | { type: "code"; language: string; code: string };

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

export function normalizeLanguage(value: string) {
  const lang = value.trim().toLowerCase().replace(/^language-/, "");
  const aliases: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    shell: "sh",
    bash: "sh",
    markdown: "md",
    plaintext: "text",
    plain: "text"
  };

  return aliases[lang] ?? lang;
}

export function isHtmlLanguage(language: string) {
  return ["html", "htm"].includes(normalizeLanguage(language));
}

export function isMarkdownLanguage(language: string) {
  return ["md", "markdown"].includes(normalizeLanguage(language));
}

export function parseMarkdownParts(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const fence = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: "text", content: content.slice(cursor, match.index) });
    }

    parts.push({
      type: "code",
      language: normalizeLanguage(match[1] ?? ""),
      code: match[2] ?? ""
    });
    cursor = fence.lastIndex;
  }

  if (cursor < content.length) {
    const rest = content.slice(cursor);
    const openFence = rest.match(/```([^\r\n`]*)\r?\n?([\s\S]*)$/);
    if (openFence && openFence.index !== undefined) {
      if (openFence.index > 0) {
        parts.push({ type: "text", content: rest.slice(0, openFence.index) });
      }

      parts.push({
        type: "code",
        language: normalizeLanguage(openFence[1] ?? ""),
        code: openFence[2] ?? ""
      });
    } else {
      parts.push({ type: "text", content: rest });
    }
  }

  return parts.length ? parts : [{ type: "text", content }];
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text: string, variant: "assistant" | "user") {
  const nodes: ReactNode[] = [];
  const tokenPattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${match.index}-code`}
          className={classNames(
            "rounded px-1 py-0.5 font-mono text-[0.92em]",
            variant === "user" ? "bg-white/15 text-white" : "bg-ink/10 text-ink"
          )}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={`${match.index}-bold`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[") && token.includes("](")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={`${match.index}-link`}
            className={classNames(
              "underline underline-offset-2",
              variant === "user" ? "text-white" : "text-teal"
            )}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<em key={`${match.index}-em`}>{token.slice(1, -1)}</em>);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function MarkdownText({ text, variant }: { text: string; variant: "assistant" | "user" }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingClass = classNames(
        "font-semibold leading-tight",
        level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base"
      );
      const headingContent = renderInline(heading[2], variant);
      nodes.push(
        level === 1 ? (
          <h1 key={`h-${index}`} className={headingClass}>
            {headingContent}
          </h1>
        ) : level === 2 ? (
          <h2 key={`h-${index}`} className={headingClass}>
            {headingContent}
          </h2>
        ) : (
          <h3 key={`h-${index}`} className={headingClass}>
            {headingContent}
          </h3>
        )
      );
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      nodes.push(
        <div key={`table-${index}`} className="thin-scrollbar overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead className={variant === "user" ? "bg-white/10" : "bg-ink/5"}>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={`${header}-${cellIndex}`} className="border-b border-line px-3 py-2 font-semibold">
                    {renderInline(header, variant)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className={variant === "user" ? "border-white/15" : "border-line"}>
                  {headers.map((_, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="border-t border-line px-3 py-2">
                      {renderInline(row[cellIndex] ?? "", variant)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (
        index < lines.length &&
        (ordered ? /^\s*\d+[.)]\s+/.test(lines[index]) : /^\s*[-*+]\s+/.test(lines[index]))
      ) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ""));
        index += 1;
      }

      const ListTag = ordered ? "ol" : "ul";
      nodes.push(
        <ListTag
          key={`list-${index}`}
          className={classNames("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}
        >
          {items.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item}`}>{renderInline(item, variant)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }

      nodes.push(
        <blockquote
          key={`quote-${index}`}
          className={classNames(
            "border-l-2 pl-3 italic",
            variant === "user" ? "border-white/40 text-white/85" : "border-teal/50 text-muted"
          )}
        >
          {quote.map((item, itemIndex) => (
            <span key={`${itemIndex}-${item}`}>
              {renderInline(item, variant)}
              {itemIndex < quote.length - 1 ? <br /> : null}
            </span>
          ))}
        </blockquote>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !(lines[index].includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]))
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    nodes.push(
      <p key={`p-${index}`} className="leading-6">
        {paragraph.map((item, itemIndex) => (
          <span key={`${itemIndex}-${item}`}>
            {renderInline(item, variant)}
            {itemIndex < paragraph.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  }

  return <div className="space-y-3">{nodes}</div>;
}

function CopyButton({
  value,
  label = "Copy",
  iconOnly = false
}: {
  value: string;
  label?: string;
  iconOnly?: boolean;
}) {
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
      className={classNames(
        "group/copy relative flex h-8 items-center justify-center gap-1 rounded-md text-xs text-muted hover:bg-ink/5 hover:text-ink",
        iconOnly ? "w-8 px-0" : "px-2"
      )}
      onClick={() => void handleCopy()}
      title={label}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <Copy className="h-3.5 w-3.5" />}
      {iconOnly ? null : <span>{copied ? "Copied" : label}</span>}
      {iconOnly ? (
        <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-soft transition-opacity group-hover/copy:opacity-100">
          {copied ? "Copied" : label}
        </span>
      ) : null}
    </button>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [mode, setMode] = useState<"code" | "preview">(isMarkdownLanguage(language) ? "preview" : "code");
  const label = language || "text";
  const htmlPreview = isHtmlLanguage(language);
  const markdownPreview = isMarkdownLanguage(language);
  const canPreview = htmlPreview || markdownPreview;

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-md border border-line bg-panel sm:rounded-lg">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-line bg-paper px-2">
        <div className="flex min-w-0 items-center gap-2 px-1 text-xs font-semibold uppercase text-muted">
          <Code2 className="h-4 w-4" />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canPreview ? (
            <>
              <button
                type="button"
                className={classNames(
                  "flex h-8 items-center gap-1 rounded-md px-2 text-xs",
                  mode === "code" ? "bg-teal text-white" : "text-muted hover:bg-ink/5"
                )}
                onClick={() => setMode("code")}
                title="Code"
                aria-label="Code"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="max-[420px]:hidden">Code</span>
              </button>
              <button
                type="button"
                className={classNames(
                  "flex h-8 items-center gap-1 rounded-md px-2 text-xs",
                  mode === "preview" ? "bg-teal text-white" : "text-muted hover:bg-ink/5"
                )}
                onClick={() => setMode("preview")}
                title="Preview"
                aria-label="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="max-[420px]:hidden">Preview</span>
              </button>
            </>
          ) : null}
          <CopyButton value={code} label="Copy code" iconOnly />
        </div>
      </div>

      {mode === "preview" && htmlPreview ? (
        <iframe
          className="h-72 w-full bg-white sm:h-80"
          sandbox=""
          srcDoc={code}
          title="HTML preview"
        />
      ) : mode === "preview" && markdownPreview ? (
        <div className="thin-scrollbar h-72 overflow-auto bg-panel p-3 text-sm sm:h-80 sm:p-4">
          <MarkdownText text={code} variant="assistant" />
        </div>
      ) : (
        <pre
          className={classNames(
            "thin-scrollbar overflow-auto bg-[#111418] p-3 text-xs leading-5 text-[#e8ecef] sm:p-4",
            canPreview ? "h-72 sm:h-80" : "max-h-[420px] sm:max-h-[520px]"
          )}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

export function RichMessage({ content, variant = "assistant" }: RichMessageProps) {
  const parts = useMemo(() => parseMarkdownParts(content), [content]);

  return (
    <div className={classNames("min-w-0 space-y-3", variant === "user" ? "text-white" : "text-ink")}>
      {parts.map((part, index) =>
        part.type === "code" ? (
          <CodeBlock key={`${index}-code`} language={part.language} code={part.code} />
        ) : (
          <MarkdownText key={`${index}-text`} text={part.content} variant={variant} />
        )
      )}
      {parts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Clipboard className="h-4 w-4" />
          Empty message
        </div>
      ) : null}
    </div>
  );
}
