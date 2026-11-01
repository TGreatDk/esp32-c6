import { validateNames, initiativeFeed } from "./initiative.mjs";
import { parseBoardState } from "./dnd-serial.mjs";
export const REMOTE_SERVICE = "0c4a0001-8c10-4a73-9fa3-43b1a5d2c600";
export const REMOTE_CHARACTERISTIC = "0c4a0002-8c10-4a73-9fa3-43b1a5d2c600";
export const REMOTE_ORDER = "0c4a0003-8c10-4a73-9fa3-43b1a5d2c600";
export const SCREENS = ["Clock", "Aristeia! News", "Initiative", "Pixel Art", "Eyes"];

export function parseRemoteState(text) {
  const match = /^(\d+) ([0-4]) ([01]) (\d+) ([0-3])$/.exec(text);
  if (!match || Number(match[1]) > 65535 || Number(match[4]) > 0xffffffff) return null;
  return { id: Number(match[1]), mode: Number(match[2]), flipped: match[3] === "1", revision: Number(match[4]), error: Number(match[5]) };
}

export function createBluetoothRemote(onDisconnect) {
  let device = null, characteristic = null, orderCharacteristic = null, sequence = 0, busy = false;
  const disconnected = () => {
    characteristic = null; orderCharacteristic = null; device?.removeEventListener("gattserverdisconnected", disconnected); device = null; onDisconnect();
  };
  function disconnect() {
    characteristic = null; orderCharacteristic = null;
    device?.removeEventListener("gattserverdisconnected", disconnected);
    device?.gatt?.disconnect(); device = null;
  }
  async function exchange(action) {
    if (!characteristic) throw new Error("Connect your board by Bluetooth first.");
    const active = characteristic, id = sequence = sequence % 65535 + 1;
    await active.writeValueWithResponse(new TextEncoder().encode(`${id} ${action}`));
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (active !== characteristic) throw new Error("Bluetooth disconnected.");
      const state = parseRemoteState(new TextDecoder().decode(await active.readValue()));
      if (state?.id === id) {
        if (state.error) throw new Error(state.error === 1 ? "Configure players first." : state.error === 3 ? "Invalid or interrupted player list. The saved order was kept." : "Could not save the turn. The previous turn was kept.");
        if (action === "GET" || action === "NEXT" || action === "SAVE") {
          const order = parseBoardState(new TextDecoder().decode(await orderCharacteristic.readValue()));
          return { ...state, ...order };
        }
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error("The board did not respond. Check the display before repeating an action.");
  }

  async function exclusive(operation) {
    if (busy) throw new Error("Wait for the current action to finish.");
    busy = true;
    try { return await operation(); } finally { busy = false; }
  }
  function request(action) {
    if (!/^(GET|NEXT|FLIP|SCREEN [0-4])$/.test(action)) return Promise.reject(new Error("Invalid remote action."));
    return exclusive(() => exchange(action));
  }
  return {
    async connect() {
      if (!globalThis.navigator?.bluetooth) throw new Error("Use Chrome on Android or a Bluetooth-equipped computer. iPhone/iPad browsers need a Web Bluetooth bridge.");
      if (device) throw new Error("Already connected.");
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [REMOTE_SERVICE] }] });
      device.addEventListener("gattserverdisconnected", disconnected);
      try {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(REMOTE_SERVICE);
        characteristic = await service.getCharacteristic(REMOTE_CHARACTERISTIC);
        orderCharacteristic = await service.getCharacteristic(REMOTE_ORDER);
        return await request("GET");
      } catch (error) { disconnect(); throw error; }
    },
    disconnect,
    request,
    set(names, current = 0) {
      const checked = validateNames(names);
      if (!Number.isInteger(current) || current < 0 || current >= checked.length) return Promise.reject(new Error("Select a valid player."));
      const body = initiativeFeed({ names: checked, current, revision: 0 }, 2);
      return exclusive(async () => {
        await exchange(`BEGIN ${body.length}`);
        let offset = 0;
        while (offset < body.length) {
          const nextId = sequence % 65535 + 1;
          const length = 20 - `${nextId} DATA `.length;
          await exchange(`DATA ${body.slice(offset, offset + length)}`);
          offset += length;
        }
        return exchange("SAVE");
      });
    },
  };
}
