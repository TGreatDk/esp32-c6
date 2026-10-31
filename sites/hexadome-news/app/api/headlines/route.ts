import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { feed } from "../../../db/schema";
import { readFeed } from "../../../lib/feed-store";
import { validateSettings } from "../../../lib/feed.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await readFeed(), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  if (!(await getChatGPTUser())) return new Response("Sign in to edit headlines.", { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid request origin.", { status: 403 });
  const body = await request.text();
  if (body.length > 4096) return new Response("Feed is too large.", { status: 413 });
  let settings: { headlines: string[]; speed: number; color: string };
  try { settings = validateSettings(JSON.parse(body)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid headlines." }, { status: 400 }); }
  const updatedAt = new Date().toISOString();
  const values = { headlines: JSON.stringify(settings.headlines), updatedAt, speed: settings.speed, color: settings.color };
  await getDb().insert(feed).values({ id: 1, ...values }).onConflictDoUpdate({ target: feed.id, set: values });
  return Response.json({ ...settings, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}
