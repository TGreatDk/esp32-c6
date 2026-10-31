import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const feed = sqliteTable("feed", {
  id: integer("id").primaryKey(),
  headlines: text("headlines").notNull(),
  updatedAt: text("updated_at").notNull(),
  speed: integer("speed").notNull().default(90),
  color: text("color").notNull().default("#ffffff"),
});
export const initiative = sqliteTable("initiative", {
  id: integer("id").primaryKey(),
  names: text("names").notNull(),
  current: integer("current").notNull().default(0),
  revision: integer("revision").notNull().default(0),
});
