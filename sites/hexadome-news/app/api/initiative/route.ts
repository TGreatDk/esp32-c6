import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { initiative } from "../../../db/schema";
import { readInitiative } from "../../../lib/initiative-store";
import { validateNames, nextTurn } from "../../../lib/initiative.mjs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() { return respond(await readInitiative()); }
async function write(request: Request) {
  if (!(await getChatGPTUser())) return respond({ error: "Sign in to manage initiative." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return respond({ error: "Invalid request origin." }, 403);
  const body = await request.text();
  if (body.length > 2048) return respond({ error: "Turn order is too large." }, 413);
  let input: { names?: unknown; revision: number; action?: string; index?: number };
  try { input = JSON.parse(body); if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error(); }
  catch { return respond({ error: "Invalid turn order request." }, 400); }
  const saved = await readInitiative();
  if (input.revision !== saved.revision) return respond({ error: "The turn order changed elsewhere. Review the latest turn and try again." }, 409);
  let names: string[], current: number;
  try {
    if (request.method === "PUT") { names = validateNames(input.names); current = 0; }
    else {
      names = saved.names;
      if (input.action === "next") current = nextTurn(saved.current, names.length);
      else if (input.action === "select" && Number.isInteger(input.index) && input.index! >= 0 && input.index! < names.length) current = input.index!;
      else throw new Error("Choose a valid turn.");
    }
  } catch (error) { return respond({ error: error instanceof Error ? error.message : "Invalid names." }, 400); }
  const values = { names: JSON.stringify(names), current, revision: saved.revision + 1 };
  const db = getDb();
  const rows = request.method === "PUT"
    ? await db.insert(initiative).values({ id: 1, ...values }).onConflictDoUpdate({ target: initiative.id, set: values, setWhere: eq(initiative.revision, saved.revision) }).returning()
    : await db.update(initiative).set(values).where(and(eq(initiative.id, 1), eq(initiative.revision, saved.revision))).returning();
  if (!rows.length) return respond({ error: "The turn changed elsewhere. Try again." }, 409);
  return respond({ names, current, revision: values.revision });
}
export const PUT = write;
export const POST = write;
