import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrameDecoder, parseBoardState, createDndSerial } from "../lib/dnd-serial.mjs";
test("serial frames survive arbitrary USB chunks, log lines, and physical-button events", () => {
  const received = [], errors = [];
  const decode = createFrameDecoder((id, state) => received.push({ id, state }), (id, error) => errors.push({ id, error }));
  const body = "INITIATIVE/2 1 7\nAria\nGoblin\n";
  const data = `Local initiative loaded\r\nDND 3 STATE ${body.length}\n${body}DND 0 STATE ${body.length}\n${body}DND 4 ERROR Invalid list\n`;
  for (const byte of data) decode(byte);
  assert.deepEqual(received.map((value) => value.id), [3, 0]);
  assert.deepEqual(received[0].state, { names: ["Aria", "Goblin"], current: 1, revision: 7 });
  assert.deepEqual(errors, [{ id: 4, error: "Invalid list" }]);
});
test("browser sends commands to the board and closes both stream locks", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const written = [], observed = [];
  let controller, closed = false;
  let state = { names: ["Aria", "Goblin"], current: 0, revision: 1 };
  const port = {
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(bytes) {
      const command = new TextDecoder().decode(bytes); written.push(command);
      const [, id, verb] = /^DND (\d+) (GET|NEXT|SET)/.exec(command);
      if (verb === "NEXT") state = { ...state, current: 1, revision: 2 };
      if (verb === "SET") state = { ...parseBoardState(command.slice(command.indexOf("\n") + 1)), revision: 3 };
      const body = `INITIATIVE/2 ${state.current} ${state.revision}\n${state.names.join("\n")}\n`;
      controller.enqueue(new TextEncoder().encode(`DND ${id} STATE ${body.length}\n${body}`));
    } }),
    async open(options) { assert.equal(options.baudRate, 115200); },
    async setSignals(signals) { assert.equal(signals.requestToSend, false); },
    async close() { closed = true; },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serial: { async requestPort() { return port; } } } });
  const client = createDndSerial({ onState: (value) => observed.push(value), onError: assert.fail, onDisconnect: assert.fail });
  try {
    assert.equal((await client.connect()).current, 0);
    assert.equal((await client.next()).current, 1);
    assert.deepEqual((await client.set(["Cleric", "Orc"])).names, ["Cleric", "Orc"]);
    assert.match(written[1], /^DND 2 NEXT\n$/);
    assert.equal(observed.length, 3);
    await client.disconnect();
    assert.equal(port.readable.locked, false); assert.equal(port.writable.locked, false); assert.equal(closed, true);
  } finally {
    await client.disconnect();
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator;
  }
});
test("invalid frames cannot replace the current order", () => {
  for (const body of ["INITIATIVE/2 2 0\nAria\n", "INITIATIVE/2 0 4294967296\nAria\n", "INITIATIVE/2 0 0\n\n", "<html>Login</html>"]) assert.throws(() => parseBoardState(body));
  assert.deepEqual(parseBoardState("INITIATIVE/2 0 0\n"), { names: [], current: 0, revision: 0 });
  const decode = createFrameDecoder(() => {}, () => {});
  assert.throws(() => decode("DND 1 STATE 513\n"));
});
