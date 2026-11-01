import { validateNames, initiativeFeed } from "./initiative.mjs";

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

export function createFrameDecoder(onState, onError) {
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
        if (state && Number(state[2]) > 0 && Number(state[2]) <= 512) frame = { id: Number(state[1]), length: Number(state[2]) };
        else if (error) onError(Number(error[1]), error[2]);
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
    });
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
    const frame = new TextEncoder().encode(`DND ${id} ${command}\n${body}`);
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
    set(names, current = 0) {
      const checked = validateNames(names);
      if (!Number.isInteger(current) || current < 0 || current >= checked.length) return Promise.reject(new Error("Select a valid player."));
      const body = initiativeFeed({ names: checked, current, revision: 0 }, 2);
      return request(`SET ${body.length}`, body);
    },
  };
}
