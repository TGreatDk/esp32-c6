import { getDb } from "../db";
import { feed } from "../db/schema";
import { defaults } from "./feed.mjs";
export async function readFeed() {
  const [saved] = await getDb().select().from(feed).limit(1);
  return saved ? { headlines: JSON.parse(saved.headlines) as string[], updatedAt: saved.updatedAt, speed: saved.speed, color: saved.color }
    : { headlines: defaults, updatedAt: null, speed: 90, color: "#ffffff" };
}
