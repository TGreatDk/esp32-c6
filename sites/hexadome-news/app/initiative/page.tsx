"use client";
import { useEffect, useRef, useState } from "react";
import InitiativePreview from "./preview";
import { createDndSerial } from "../../lib/dnd-serial.mjs";

type TurnOrder = { names: string[]; current: number; revision: number };
export default function Initiative() {
  const [order, setOrder] = useState<TurnOrder>({ names: [], current: 0, revision: 0 });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [supported, setSupported] = useState(true);
  const [message, setMessage] = useState("Connect the ESP32 by USB to load or save its turn order.");
  const [error, setError] = useState(false);
  const client = useRef<ReturnType<typeof createDndSerial> | null>(null);
  const names = text.split("\n").map((name) => name.trim()).filter(Boolean);
  const dirty = JSON.stringify(names) !== JSON.stringify(order.names);
  const current = order.names[order.current];
  const next = order.names[(order.current + 1) % order.names.length];
  useEffect(() => {
    let live = true;
    setSupported("serial" in navigator);
    const serial = createDndSerial({
      onState: (state: TurnOrder) => { if (live) setOrder(state); },
      onError: (reason: string) => { if (live) { setError(true); setMessage(reason); } },
      onDisconnect: (reason: string) => { if (live) { setConnected(false); setError(false); setMessage(reason); } },
    });
    client.current = serial;
    return () => { live = false; void serial.disconnect(); };
  }, []);
  async function connect() {
    setBusy(true); setError(false);
    try {
      if (connected) {
        await client.current!.disconnect(); setConnected(false);
        setMessage("Disconnected. Your board keeps playing offline.");
      } else {
        const state = await client.current!.connect() as TurnOrder;
        setOrder(state); if (!text.trim()) setText(state.names.join("\n"));
        setConnected(true); setMessage("Connected directly to the ESP32. Configuration stays on the board.");
      }
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "USB connection failed."); }
    finally { setBusy(false); }
  }
  async function send(action: "save" | "next" | "select", index?: number) {
    setBusy(true); setError(false);
    try {
      const state = await (action === "next" ? client.current!.next() : client.current!.set(action === "save" ? names : order.names, action === "select" ? index : 0)) as TurnOrder;
      setOrder(state); if (action === "save") setText(state.names.join("\n"));
      setMessage(action === "save" ? "Saved on your ESP32. You can unplug USB and play with BOOT." : "The ESP32 updated and saved the turn.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Device update failed."); }
    finally { setBusy(false); }
  }
  return <main className="initiative">
    <header><a className="brand" href="/initiative"><span className="hex">D</span> D&D <span className="brand-light">/ INITIATIVE</span></a><nav className="mode-nav"><a href="/">News ticker</a><a href="/initiative" aria-current="page">Initiative</a></nav></header>
    <section className="intro"><div className="eyebrow"><span className="dot" /> THE GAME MASTER'S DESK</div><h1>Every hero gets<br /><em>their moment.</em></h1><p>Connect by USB. Set the order.<br />Unplug and play entirely on the board.</p></section>
    <div className="workspace"><section className="panel editor">
      <div className="panel-top"><h2>Turn order</h2><span className="status">{connected ? "USB CONNECTED" : "USB DISCONNECTED"}</span></div>
      <div className="usb-controls"><button onClick={connect} disabled={busy || !supported}>{busy ? "Working..." : connected ? "Disconnect USB" : "Connect ESP32 by USB"}</button><p>{supported ? "Choose the Espressif USB serial port. The board owns all turn logic and storage." : "USB configuration needs desktop Chrome or Edge."}</p></div><label htmlFor="names">One character or monster per line, highest initiative first.</label>
      <textarea id="names" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder={"Aria the Ranger\nGoblin Captain\nThorne the Paladin"} aria-describedby="name-limits" />
      <div className="editor-meta" id="name-limits"><span>{names.length} / 16 names</span><span>24 plain-text characters each</span></div>
      <div className="publish-row"><p>Stored in the device, including after power-off.<br />Saving a new list starts at the first name.</p><button disabled={!connected || busy || !names.length} onClick={() => send("save")}>Save to ESP32 ↗</button></div>
      {message && <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{message}</p>}
    </section><aside>
      <section className="panel preview"><div className="panel-top"><h2>On your tabletop</h2><span className="mini-label">320 × 172 PX</span></div>
      <InitiativePreview current={current} next={next} />
      <div className="turn-control"><button className="next-button" disabled={!connected || busy || !current || dirty} onClick={() => send("next")}>Next turn →</button><p>{dirty ? "Save your edited order before advancing." : "The ESP32 advances the turn and loops the order. Works with BOOT when unplugged."}</p></div></section>
      {order.names.length > 0 && <ol className="turn-list">{order.names.map((name, index) => <li key={index}><button disabled={!connected || busy || dirty} onClick={() => send("select", index)} aria-current={index === order.current ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{name}{index === order.current && <strong>NOW</strong>}</button></li>)}</ol>}
      <p className="caption">D&D-only mode: tap BOOT for the next turn; hold to flip.<br />Hold BOOT as the screen lights up to unlock the other screens.<br />While connected, click a saved name to select it on the board.</p>
    </aside></div><footer>TABLETOP COMPANION <span>YOUR PARTY. YOUR TURN ORDER.</span></footer>
  </main>;
}

