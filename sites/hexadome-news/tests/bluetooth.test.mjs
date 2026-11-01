import { test } from "node:test";
import assert from "node:assert/strict";
import { createBluetoothRemote, parseRemoteState, REMOTE_SERVICE, REMOTE_CHARACTERISTIC, REMOTE_ORDER } from "../lib/bluetooth-remote.mjs";

test("Bluetooth states validate screen, orientation, revision, and error bounds", () => {
  assert.deepEqual(parseRemoteState("65535 4 1 4294967295 0"), { id: 65535, mode: 4, flipped: true, revision: 4294967295, error: 0 });
  for (const invalid of ["1 SCREEN 4", "1 5 0 0 0", "65536 0 0 0 0", "1 0 2 0 0", "1 0 0 4294967296 0", "1 0 0 0 4"]) assert.equal(parseRemoteState(invalid), null);
});

test("Bluetooth commands wait for board acknowledgements and reconnect after disconnect", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let listener, value, mode = 2, flipped = 0, revision = 8, error = 0, reads = 0, notifications = 0;
  let names = ["Aria", "Goblin"], current = 0, upload = "", expected = 0;
  const orderCharacteristic = { async readValue() { return new DataView(new TextEncoder().encode(`INITIATIVE/2 ${current} ${revision}\n${names.join("\n")}\n`).buffer); } };
  const written = [];
  const characteristic = {
    async writeValueWithResponse(bytes) {
      value = new TextDecoder().decode(bytes); written.push(value);
      assert.ok(bytes.length <= 20);
      const [id, action, screen] = value.split(" ");
      if (action === "BEGIN") { expected = Number(screen); upload = ""; }
      if (action === "DATA") upload += value.slice(`${id} DATA `.length);
      if (action === "SAVE" && !error) {
        assert.equal(upload.length, expected);
        const lines = upload.split("\n");
        current = Number(lines[0].split(" ")[1]); names = lines.slice(1, -1); revision++;
      }
      if (action === "SCREEN") mode = Number(screen);
      if (action === "FLIP") flipped = 1 - flipped;
      if (action === "NEXT" && !error) { revision++; current = (current + 1) % names.length; }
      reads = 0;
      characteristic.reply = `${id} ${mode} ${flipped} ${revision} ${error}`;
    },
    async readValue() { return new DataView(new TextEncoder().encode(reads++ ? characteristic.reply : value).buffer); },
  };
  const device = {
    addEventListener(event, callback) { assert.equal(event, "gattserverdisconnected"); listener = callback; },
    removeEventListener() { listener = null; },
    gatt: { disconnect() {}, async connect() { return { async getPrimaryService(uuid) { assert.equal(uuid, REMOTE_SERVICE); return { async getCharacteristic(id) { if (id === REMOTE_ORDER) return orderCharacteristic; assert.equal(id, REMOTE_CHARACTERISTIC); return characteristic; } }; } }; } },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { bluetooth: { async requestDevice(options) { assert.deepEqual(options.filters, [{ services: [REMOTE_SERVICE] }]); return device; } } } });
  const remote = createBluetoothRemote(() => notifications++);
  try {
    assert.equal((await remote.connect()).mode, 2);
    assert.equal((await remote.request("SCREEN 4")).mode, 4);
    assert.equal((await remote.request("FLIP")).flipped, true);
    assert.equal((await remote.request("NEXT")).revision, 9);
    error = 2; await assert.rejects(remote.request("NEXT"), /previous turn was kept/); error = 0;
    await assert.rejects(remote.request("SCREEN 5"), /Invalid/);
    assert.deepEqual(written.slice(0, 3), ["1 GET", "2 SCREEN 4", "3 FLIP"]);
    const longest = Array.from({ length: 16 }, (_, i) => String(i).padStart(2, "0") + "x".repeat(22));
    const uploading = remote.set(longest, 7);
    await assert.rejects(remote.request("NEXT"), /Wait/);
    const saved = await uploading;
    assert.deepEqual(saved.names, longest); assert.equal(saved.current, 7);
    assert.deepEqual((await remote.request("GET")).names, longest);
    error = 3; await assert.rejects(remote.set(["New player"]), /saved order was kept/); error = 0;
    assert.deepEqual((await remote.request("GET")).names, longest);
    assert.throws(() => remote.set(["x".repeat(25)]), /24/);
    listener(); assert.equal(notifications, 1);
    assert.equal((await remote.connect()).mode, 4);
    remote.disconnect(); assert.equal(listener, null);
    await assert.rejects(remote.request("GET"), /Connect/);
  } finally {
    remote.disconnect();
    if (original) Object.defineProperty(globalThis, "navigator", original); else delete globalThis.navigator;
  }
});
