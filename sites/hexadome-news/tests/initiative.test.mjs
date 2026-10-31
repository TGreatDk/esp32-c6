import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNames, nextTurn, initiativeFeed } from "../lib/initiative.mjs";
import { validDeviceKey } from "../lib/device-key.mjs";
import { layoutName } from "../lib/name-layout.mjs";
test("turn order preserves names and cycles including a single participant", () => {
  assert.deepEqual(validateNames([" Aria ", "Goblin", "Aria"]), ["Aria", "Goblin", "Aria"]);
  assert.equal(nextTurn(0, 3), 1); assert.equal(nextTurn(2, 3), 0); assert.equal(nextTurn(0, 1), 0);
});
test("device control requires its own complete secret", () => {
  const secret = "a".repeat(64);
  assert.equal(validDeviceKey(secret, secret), true);
  for (const provided of [null, "", "a".repeat(63), "a".repeat(63) + "b"]) assert.equal(validDeviceKey(provided, secret), false);
  assert.equal(validDeviceKey("", ""), false);
  assert.equal(validDeviceKey(secret, undefined), false);
});
test("revision-aware feed preserves compatibility with old devices", () => {
  const state = { names: ["Aria", "Goblin"], current: 1, revision: 7 };
  assert.equal(initiativeFeed(state), "INITIATIVE/1 1\nAria\nGoblin\n");
  assert.equal(initiativeFeed(state, 2), "INITIATIVE/2 1 7\nAria\nGoblin\n");
  assert.equal(initiativeFeed({ names: [], current: 0, revision: 0 }, 2), "INITIATIVE/2 0 0\n");
});
test("names fit both display regions without truncation", () => {
  for (const name of ["Aria", "Goblin Captain", "ABCDEFGHIJKLMNOPQRSTUVWX", "Christopher Longsurname"]) {
    for (const [height, maximum] of [[103, 6], [68, 3]]) {
      const layout = layoutName(name, height, maximum);
      assert.ok(layout.lines.length >= 1 && layout.lines.length <= 2);
      assert.ok(layout.lines.length * 8 * layout.size <= height - 12);
      for (const line of layout.lines) assert.ok(line.length * 6 * layout.size <= 288);
      assert.equal(layout.lines.join("").replaceAll(" ", ""), name.replaceAll(" ", ""));
    }
  }
});
test("rejects empty, unsupported, or oversized names and invalid turn indices", () => {
  for (const names of [[], [" "], ["x".repeat(25)], ["Aria\nGoblin"], ["Orc 🗡"], Array(17).fill("Orc"), null]) assert.throws(() => validateNames(names));
  for (const [current, count] of [[0, 0], [-1, 3], [3, 3], [0.5, 3]]) assert.throws(() => nextTurn(current, count));
});
