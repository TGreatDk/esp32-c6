import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { initiative } from "../../../../db/schema";
import { readInitiative } from "../../../../lib/initiative-store";
import { nextTurn, initiativeFeed } from "../../../../lib/initiative.mjs";
import { validDeviceKey } from "../../../../lib/device-key.mjs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!validDeviceKey(request.headers.get("X-Device-Key"), env.DEVICE_CONTROL_KEY)) return new Response("Unauthorized", { status: 401 });
  const body = await request.text();
  if (body.length > 128) return new Response("Request too large", { status: 413 });
  let revision: number;
  try { revision = JSON.parse(body).revision; if (!Number.isSafeInteger(revision) || revision < 0) throw new Error(); }
  catch { return new Response("Invalid revision", { status: 400 }); }
  const saved = await readInitiative();
  if (!saved.names.length) return new Response("Set turn order first", { status: 400 });
  if (revision !== saved.revision) return new Response("Turn changed; refresh first", { status: 409 });
  const current = nextTurn(saved.current, saved.names.length);
  const rows = await getDb().update(initiative).set({ current, revision: revision + 1 })
    .where(and(eq(initiative.id, 1), eq(initiative.revision, revision))).returning();
  if (!rows.length) return new Response("Turn changed; refresh first", { status: 409 });
  return new Response(initiativeFeed({ ...saved, current, revision: revision + 1 }, 2), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
