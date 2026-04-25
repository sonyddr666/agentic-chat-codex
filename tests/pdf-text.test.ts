import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { extractPdfTextFromBuffer } from "@/lib/pdf-text";

describe("pdf text extraction", () => {
  it("extracts text from plain PDF content streams", () => {
    const pdf = Buffer.from(
      [
        "%PDF-1.4",
        "1 0 obj",
        "<< /Length 44 >>",
        "stream",
        "BT /F1 12 Tf 72 720 Td (Hello PDF) Tj ET",
        "endstream",
        "endobj",
        "%%EOF"
      ].join("\n"),
      "latin1"
    );

    expect(extractPdfTextFromBuffer(pdf)).toContain("Hello PDF");
  });

  it("extracts text from flate-compressed streams", () => {
    const compressed = deflateSync(Buffer.from("BT [(Ola) 20 ( PDF)] TJ ET", "latin1"));
    const header = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1");
    const footer = Buffer.from("\nendstream\nendobj\n%%EOF", "latin1");

    expect(extractPdfTextFromBuffer(Buffer.concat([header, compressed, footer]))).toContain(
      "Ola PDF"
    );
  });
});
