export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function titleFromPrompt(prompt: string) {
  const compact = prompt.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "New thread";
  }

  return compact.length > 54 ? `${compact.slice(0, 51)}...` : compact;
}

export function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[output truncated at ${maxLength} chars]`;
}

