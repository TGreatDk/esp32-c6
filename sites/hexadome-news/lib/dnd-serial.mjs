import { validateNames, initiativeFeed } from "./initiative.mjs";
import { crc32, encodePixels } from "./pixel-art.mjs";

export function parseBoardState(body) {
  const match = /^INITIATIVE\/2 (\d+) (\d+)\n/.exec(body);
  if (!match || body.length > 512 || !body.endsWith("\n")) throw new Error("Invalid device state.");
  const rest = body.slice(match[0].length);
  const names = rest ? validateNames(rest.slice(0, -1).split("\n")) : [];
  const current = Number(match[1]), revision = Number(match[2]);
  if (!Number.isInteger(current) || current < 0 || (names.length ? current >= names.length : current !== 0) ||
      !Number.isInteger(revision) || revision > 0xffffffff) throw new Error("Invalid device turn.");
  return { names, current, revision };
}

export function createFrameDecoder(onState, onError, onArt = () => {}) {
  let buffer = "", frame = null;
  return (chunk) => {
    buffer += chunk;
    if (buffer.length > 8192) throw new Error("Device response is too large.");
    for (;;) {
      if (frame) {
        if (buffer.length < frame.length) return;
        const body = buffer.slice(0, frame.length);
        buffer = buffer.slice(frame.length);
        const id = frame.id; frame = null;
        onState(id, parseBoardState(body));
      } else {
        const end = buffer.indexOf("\n");
        if (end < 0) return;
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (!line.startsWith("DND ")) continue;
        const state = /^DND (\d+) STATE (\d+)$/.exec(line);
        const error = /^DND (\d+) ERROR (.+)$/.exec(line);
        const art = /^DND (\d+) ART (\d+) ([01]) ([0-9A-F]{8})$/.exec(line);
        if (state && Number(state[2]) > 0 && Number(state[2]) <= 512) frame = { id: Number(state[1]), length: Number(state[2]) };
        else if (error) onError(Number(error[1]), error[2]);
        else if (art && Number(art[2]) <= 110080) onArt(Number(art[1]), { received: Number(art[2]), saved: art[3] === "1", crc: art[4] });
        else throw new Error("Invalid device response.");
      }
    }
  };
}

export function createDndSerial({ onState, onError, onDisconnect }) {
  let port = null, reader = null, readTask = null, closing = false, sequence = 0;
  let writes = Promise.resolve();
  const pending = new Map();
  function finish(id, state, error) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id); clearTimeout(request.timer);
    if (error) request.reject(error); else request.resolve(state);
  }
  function failAll(error) { for (const id of pending.keys()) finish(id, null, error); }
  async function readLoop(active) {
    let failure = new Error("USB disconnected. The board keeps playing offline.");
    const text = new TextDecoder();
    const decode = createFrameDecoder((id, state) => { onState(state); finish(id, state); }, (id, error) => {
      if (id) finish(id, null, new Error(error)); else onError(error);
    }, (id, state) => finish(id, state));
    try {
      reader = active.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) decode(text.decode(value, { stream: true }));
      }
    } catch (error) { failure = error; }
    finally {
      reader?.releaseLock(); reader = null;
      if (!closing) {
        failAll(failure); await writes.catch(() => {});
        try { await active.close(); } catch {}
        if (port === active) port = null;
        onDisconnect(failure.message);
      }
    }
  }
  function request(command, body = "") {
    const active = port;
    if (!active?.writable || closing) return Promise.reject(new Error("Connect your ESP32 by USB first."));
    const id = ++sequence;
    const header = new TextEncoder().encode(`DND ${id} ${command}\n`);
    const payload = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const frame = new Uint8Array(header.length + payload.length);
    frame.set(header); frame.set(payload, header.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(id, null, new Error("The device did not respond. Check its firmware and USB connection.")), 12000);
      pending.set(id, { resolve, reject, timer });
      writes = writes.catch(() => {}).then(async () => {
        const writer = active.writable.getWriter();
        try { await writer.write(frame); } finally { writer.releaseLock(); }
      });
      writes.catch((error) => finish(id, null, error));
    });
  }
  async function disconnect() {
    closing = true; failAll(new Error("USB connection closed."));
    const active = port;
    try { await reader?.cancel(); await readTask; await writes.catch(() => {}); if (active) await active.close(); }
    finally { port = null; reader = null; readTask = null; closing = false; }
  }
  return {
    async connect() {
      if (!globalThis.navigator?.serial) throw new Error("Use desktop Chrome or Edge for USB configuration.");
      if (port) throw new Error("Already connected.");
      const selected = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
      try {
        await selected.open({ baudRate: 115200 }); port = selected;
        await selected.setSignals({ dataTerminalReady: true, requestToSend: false });
        readTask = readLoop(selected);
        return await request("GET");
      } catch (error) { await disconnect().catch(() => {}); throw error; }
    },
    disconnect,
    get: () => request("GET"),
    next: () => request("NEXT"),
    artInfo: () => request("ARTINFO"),
    async sendArt(pixels, onProgress = (progress) => {}) {
      const bytes = encodePixels(pixels), checksum = crc32(bytes);
      await request(`ARTBEGIN ${bytes.length} ${checksum}`);
      for (let offset = 0; offset < bytes.length; offset += 512) {
        const chunk = bytes.subarray(offset, Math.min(offset + 512, bytes.length));
        const reply = await request(`ARTPART ${offset} ${chunk.length}`, chunk);
        if (reply.received !== offset + chunk.length || reply.crc !== checksum) throw new Error("Image upload lost synchronization. Retry the upload.");
        if (offset + chunk.length === bytes.length && !reply.saved) throw new Error("The board did not save the image.");
        onProgress(Math.round((offset + chunk.length) * 100 / bytes.length));
      }
    },
    set(names, current = 0) {
      const checked = validateNames(names);
      if (!Number.isInteger(current) || current < 0 || current >= checked.length) return Promise.reject(new Error("Select a valid player."));
      const body = initiativeFeed({ names: checked, current, revision: 0 }, 2);
      return request(`SET ${body.length}`, body);
    },
  };
}
