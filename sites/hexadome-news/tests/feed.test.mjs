import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, validateHeadlines, validateSettings } from "../lib/feed.mjs";
test("defaults fit the device and valid input is trimmed", () => {
  assert.deepEqual(validateHeadlines(defaults), defaults);
  assert.deepEqual(validateHeadlines(["  Maximus wins!  "]), ["Maximus wins!"]);
});
test("speed and colour stay within the firmware protocol", () => {
  assert.deepEqual(validateSettings({ headlines: ["News"], speed: 90, color: "#FF0000" }), { headlines: ["News"], speed: 90, color: "#ff0000" });
  for (const speed of [0, 29, 181, 90.5, "90"]) assert.throws(() => validateSettings({ headlines: ["News"], speed, color: "#ffffff" }));
  for (const color of ["red", "#fff", "#gggggg", null]) assert.throws(() => validateSettings({ headlines: ["News"], speed: 90, color }));
});
test("rejects empty, oversized, multiline, and non-ASCII feeds", () => {
  for (const invalid of [[], Array(17).fill("News"), [" "], ["a".repeat(121)], ["News\nNews"], ["News 🏆"], [42], null]) assert.throws(() => validateHeadlines(invalid));
});
