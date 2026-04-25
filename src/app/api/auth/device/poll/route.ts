import { getCodexAuthManager } from "@/lib/codex/auth-manager";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { flowId?: string };
    if (!body.flowId) {
      return json({ error: "flowId is required." }, { status: 400 });
    }

    return json(await getCodexAuthManager().pollDeviceFlow(body.flowId));
  } catch (error) {
    return apiError(error, 400);
  }
}

