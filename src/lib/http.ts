import { NextResponse } from "next/server";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

