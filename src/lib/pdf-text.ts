import { inflateSync } from "node:zlib";

function trimStreamNewlines(value: Buffer) {
  let start = 0;
  let end = value.length;

  if (value[start] === 0x0d && value[start + 1] === 0x0a) {
    start += 2;
  } else if (value[start] === 0x0a || value[start] === 0x0d) {
    start += 1;
  }

  if (value[end - 2] === 0x0d && value[end - 1] === 0x0a) {
    end -= 2;
  } else if (value[end - 1] === 0x0a || value[end - 1] === 0x0d) {
    end -= 1;
  }

  return value.subarray(start, end);
}

function decodeLiteralString(value: string) {
  let output = "";

  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = value[index + 1];
    index += 1;
    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "(" || next === ")" || next === "\\") output += next;
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && /[0-7]/.test(value[index + 1] ?? ""); count += 1) {
        octal += value[index + 1];
        index += 1;
      }
      output += String.fromCharCode(parseInt(octal, 8));
    } else if (next === "\n") {
      // Escaped line continuation.
    } else if (next === "\r") {
      if (value[index + 1] === "\n") index += 1;
    } else {
      output += next ?? "";
    }
  }

  return output;
}

function decodeHexString(value: string) {
  const clean = value.replace(/[<>\s]/g, "");
  const even = clean.length % 2 === 0 ? clean : `${clean}0`;
  const bytes = Buffer.from(even, "hex");

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      output += String.fromCharCode(bytes.readUInt16BE(index));
    }
    return output;
  }

  return bytes.toString("latin1");
}

function decodePdfToken(token: string) {
  return token.startsWith("(") ? decodeLiteralString(token) : decodeHexString(token);
}

function extractTextOperators(stream: string) {
  const chunks: string[] = [];
  const token = String.raw`(?:\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>)`;
  const tjPattern = new RegExp(`(${token})\\s*Tj`, "g");
  const quotePattern = new RegExp(`(${token})\\s*(?:'|")`, "g");
  const arrayPattern = /\[([\s\S]*?)\]\s*TJ/g;
  let match: RegExpExecArray | null;

  while ((match = tjPattern.exec(stream)) !== null) {
    chunks.push(decodePdfToken(match[1]));
  }

  while ((match = quotePattern.exec(stream)) !== null) {
    chunks.push(decodePdfToken(match[1]));
  }

  while ((match = arrayPattern.exec(stream)) !== null) {
    const text = Array.from(match[1].matchAll(new RegExp(token, "g")))
      .map((item) => decodePdfToken(item[0]))
      .join("");
    if (text) {
      chunks.push(text);
    }
  }

  return chunks.join("\n");
}

function decodePdfStream(dictionary: string, body: Buffer) {
  const stream = trimStreamNewlines(body);
  if (/\/Filter\s*\/FlateDecode/.test(dictionary)) {
    try {
      return inflateSync(stream).toString("latin1");
    } catch {
      return "";
    }
  }

  return stream.toString("latin1");
}

export function extractPdfTextFromBuffer(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const streamPattern = /(<<[\s\S]*?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  const chunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(source)) !== null) {
    const dictionary = match[1];
    const body = Buffer.from(match[2], "latin1");
    const decoded = decodePdfStream(dictionary, body);
    const text = extractTextOperators(decoded);
    if (text.trim()) {
      chunks.push(text);
    }
  }

  if (!chunks.length) {
    const fallback = extractTextOperators(source);
    if (fallback.trim()) {
      chunks.push(fallback);
    }
  }

  return chunks
    .join("\n\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
