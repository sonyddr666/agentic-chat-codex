import { getCodexAuthManager } from "@/lib/codex/auth-manager";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      path?: string;
      json?: string;
    };
    const manager = getCodexAuthManager();

    if (body.path?.trim()) {
      return json(await manager.importFromPath(body.path.trim()));
    }

    if (body.json?.trim()) {
      return json(await manager.importFromJson(body.json.trim()));
    }

    return json({ error: "path or json is required." }, { status: 400 });
  } catch (error) {
    return apiError(error, 400);
  }
}

