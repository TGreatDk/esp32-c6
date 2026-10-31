import { readFeed } from "../../../lib/feed-store";
export const dynamic = "force-dynamic";
export async function GET() {
  const { headlines, speed, color } = await readFeed();
  const body = `HEXADOME/1 ${speed} ${color.slice(1).toUpperCase()}\n` + headlines.join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Length": String(body.length), "Cache-Control": "no-store" } });
}
