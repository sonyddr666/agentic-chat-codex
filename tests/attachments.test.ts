import { describe, expect, it } from "vitest";
import { isPdfAttachment, isTextLikeAttachment } from "@/lib/attachments";

describe("attachments", () => {
  it("treats code-like files as text and keeps PDFs separate", () => {
    expect(isTextLikeAttachment("semdor-esp32-c3.ino", "application/octet-stream")).toBe(true);
    expect(isTextLikeAttachment("component.tsx", "application/octet-stream")).toBe(true);
    expect(isTextLikeAttachment("photo.png", "image/png")).toBe(false);
    expect(isTextLikeAttachment("manual.pdf", "application/pdf")).toBe(false);
    expect(isPdfAttachment("manual.pdf", "application/octet-stream")).toBe(true);
  });
});
