import { getCodexAuthManager } from "@/lib/codex/auth-manager";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return json(await getCodexAuthManager().startDeviceFlow(), { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}

