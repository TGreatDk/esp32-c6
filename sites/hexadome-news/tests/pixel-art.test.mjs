import { test } from "node:test";
import assert from "node:assert/strict";
import { ART_PIXELS, rgb565, hexFrom565, encodePixels, crc32, fitImage, rgbaToPixels } from "../lib/pixel-art.mjs";
import { createFrameDecoder, createDndSerial } from "../lib/dnd-serial.mjs";
test("painting colours use the device's RGB565 format", () => {
  assert.equal(rgb565("#ff0000"), 0xf800); assert.equal(rgb565("#00ff00"), 0x07e0); assert.equal(rgb565("#0000ff"), 0x001f);
  assert.equal(hexFrom565(0xffff), "#ffffff"); assert.equal(hexFrom565(0), "#000000");
  assert.throws(() => rgb565("red"));
});
test("image imports preserve proportions and convert pixels into display colours", () => {
  assert.deepEqual(fitImage(640, 344), { x: 0, y: 0, width: 320, height: 172 });
  assert.deepEqual(fitImage(100, 100), { x: 74, y: 0, width: 172, height: 172 });
  assert.deepEqual(fitImage(1000, 100), { x: 0, y: 70, width: 320, height: 32 });
  assert.throws(() => fitImage(0, 100)); assert.throws(() => fitImage(10000, 10000));
  const rgba = new Uint8ClampedArray(ART_PIXELS * 4); rgba.set([255, 0, 0, 255, 0, 255, 0, 255]);
  const pixels = rgbaToPixels(rgba); assert.equal(pixels[0], 0xf800); assert.equal(pixels[1], 0x07e0);
  assert.throws(() => rgbaToPixels(new Uint8Array(4)));
});
test("the browser paces image chunks and verifies the saved checksum", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let controller, received = 0, checksum, image, saved = false;
  const port = {
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(bytes) {
      const end = bytes.indexOf(10), line = new TextDecoder().decode(bytes.subarray(0, end));
      const fields = line.split(" "), id = fields[1];
      let reply;
      if (fields[2] === "GET") {
        const body = "INITIATIVE/2 0 0\n"; reply = `DND ${id} STATE ${body.length}\n${body}`;
      } else if (fields[2] === "ARTBEGIN") {
        assert.equal(Number(fields[3]), 110080); checksum = fields[4]; image = new Uint8Array(110080); received = 0;
        reply = `DND ${id} ART 0 0 ${checksum}\n`;
      } else {
        assert.equal(fields[2], "ARTPART"); assert.equal(Number(fields[3]), received);
        const chunk = bytes.subarray(end + 1); assert.ok(chunk.length <= 512); assert.equal(chunk.length, Number(fields[4]));
        image.set(chunk, received); received += chunk.length;
        if (received === image.length) { assert.equal(crc32(image), checksum); saved = true; }
        reply = `DND ${id} ART ${received} ${saved ? 1 : 0} ${checksum}\n`;
      }
      controller.enqueue(new TextEncoder().encode(reply));
    } }),
    async open() {}, async setSignals() {}, async close() {},
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serial: { async requestPort() { return port; } } } });
  const client = createDndSerial({ onState: () => {}, onError: assert.fail, onDisconnect: assert.fail });
  try {
    await client.connect(); const pixels = new Uint16Array(ART_PIXELS); pixels[12] = 0xf800;
    const progress = []; await client.sendArt(pixels, (value) => progress.push(value));
    assert.equal(saved, true); assert.equal(received, 110080); assert.equal(progress.at(-1), 100);
    assert.deepEqual(image, encodePixels(pixels));
  } finally {
    await client.disconnect();
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator;
  }
});
test("a full-size image uses little endian pixels and a standard checksum", () => {
  const pixels = new Uint16Array(ART_PIXELS); pixels[0] = 0xf800; pixels[pixels.length - 1] = 0x001f;
  const bytes = encodePixels(pixels); assert.equal(bytes.length, 110080);
  assert.deepEqual([...bytes.slice(0, 2)], [0, 248]); assert.deepEqual([...bytes.slice(-2)], [31, 0]);
  assert.equal(crc32(new TextEncoder().encode("123456789")), "CBF43926");
  assert.throws(() => encodePixels(new Uint16Array(3)));
});
test("art acknowledgements remain separate from initiative state", () => {
  const replies = []; const decode = createFrameDecoder(assert.fail, assert.fail, (id, reply) => replies.push({ id, ...reply }));
  decode("DND 1 ART 512 0 ABCD1234\nDND 2 ART 110080 1 ABCD1234\n");
  assert.deepEqual(replies, [{ id: 1, received: 512, saved: false, crc: "ABCD1234" }, { id: 2, received: 110080, saved: true, crc: "ABCD1234" }]);
});
