import { getCodexAuthManager } from "@/lib/codex/auth-manager";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getCodexAuthManager().status());
  } catch (error) {
    return apiError(error);
  }
}

