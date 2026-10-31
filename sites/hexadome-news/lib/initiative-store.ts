import { getDb } from "../db";
import { initiative } from "../db/schema";
export async function readInitiative() {
  const [saved] = await getDb().select().from(initiative).limit(1);
  return saved ? { names: JSON.parse(saved.names) as string[], current: saved.current, revision: saved.revision }
    : { names: [] as string[], current: 0, revision: 0 };
}
