import { readInitiative } from "../../../../lib/initiative-store";
import { initiativeFeed } from "../../../../lib/initiative.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const state = await readInitiative();
  const body = initiativeFeed(state, new URL(request.url).searchParams.get("v") === "2" ? 2 : 1);
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
