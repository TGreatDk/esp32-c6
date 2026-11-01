"use client";
import { useEffect, useRef, useState } from "react";
import InitiativePreview from "../initiative/preview";
import { createBluetoothRemote, SCREENS } from "../../lib/bluetooth-remote.mjs";

type RemoteState = { mode: number; flipped: boolean; revision: number; names?: string[]; current?: number };
type TurnOrder = { names: string[]; current: number; revision: number };
export default function Remote() {
  const client = useRef<ReturnType<typeof createBluetoothRemote> | null>(null);
  const [supported, setSupported] = useState(true), [connected, setConnected] = useState(false), [busy, setBusy] = useState(false);
  const [state, setState] = useState<RemoteState | null>(null);
  const [order, setOrder] = useState<TurnOrder>({ names: [], current: 0, revision: 0 });
  const [text, setText] = useState("");
  const names = text.split("\n").map((name) => name.trim()).filter(Boolean);
  const dirty = JSON.stringify(names) !== JSON.stringify(order.names);
  function update(next: RemoteState) {
    setState(next);
    if (next.names && next.current !== undefined) setOrder({ names: next.names, current: next.current, revision: next.revision });
  }
  const [error, setError] = useState(false), [message, setMessage] = useState("Double-click BOOT, then connect within 60 seconds.");
  useEffect(() => {
    let live = true;
    setSupported("bluetooth" in navigator);
    const remote = createBluetoothRemote(() => { if (live) { setConnected(false); setMessage("Disconnected. Double-click BOOT to connect again."); } });
    client.current = remote;
    return () => { live = false; remote.disconnect(); };
  }, []);
  async function connect() {
    if (connected) { client.current!.disconnect(); setConnected(false); setMessage("Disconnected. The board keeps running."); return; }
    setBusy(true); setError(false);
    try { const next = await client.current!.connect(); update(next); setText(next.names?.join("\n") ?? ""); setConnected(true); setMessage("Connected. Your internet connection stays available."); }
    catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Bluetooth connection failed."); }
    finally { setBusy(false); }
  }
  async function send(action: string) {
    setBusy(true); setError(false);
    try { const next = await client.current!.request(action); update(next); setMessage(`Showing ${SCREENS[next.mode]}. ${next.flipped ? "Flipped" : "Normal"} orientation.`); }
    catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Device update failed."); }
    finally { setBusy(false); }
  }
  async function savePlayers(index?: number) {
    setBusy(true); setError(false);
    try {
      const next = await client.current!.set(index === undefined ? names : order.names, index ?? 0);
      update(next); setText(next.names?.join("\n") ?? "");
      setMessage("Player order and current turn saved on the ESP32 over Bluetooth.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Could not save players."); }
    finally { setBusy(false); }
  }
  return <main className="remote">
    <header><a className="brand" href="/remote"><span className="hex">B</span> TABLETOP <span className="brand-light">/ REMOTE</span></a><nav className="mode-nav"><a href="/initiative">Initiative</a><a href="/paint">Paint</a><a href="/remote" aria-current="page">Remote</a></nav></header>
    <section className="intro"><div className="eyebrow"><span className="dot" /> BLUETOOTH CONTROL</div><h1>Your screen.<br /><em>Within reach.</em></h1><p>Choose a screen without a cable.<br />Keep your Wi-Fi or mobile data connected.</p></section>
    <section className="panel remote-panel"><div className="panel-top"><h2>Tabletop ESP32</h2><span className="status">{connected ? "CONNECTED" : "DISCONNECTED"}</span></div>
      <div className="remote-controls"><p>Double-click BOOT to allow a connection for 60 seconds. Select <strong>Tabletop ESP32</strong> below. Once connected, you can keep controlling it after the screen selector closes.</p>
        <button onClick={connect} disabled={busy || !supported}>{busy ? "Working..." : connected ? "Disconnect Bluetooth" : "Connect by Bluetooth"}</button>
        {!supported && <p className="error">This browser does not provide Web Bluetooth. Use Chrome on Android or a Bluetooth-equipped computer. iPhone/iPad need a compatible Web Bluetooth bridge browser.</p>}
        <div className="remote-screens" aria-label="Display screen">{SCREENS.map((name, mode) => <button key={mode} disabled={!connected || busy} aria-pressed={state?.mode === mode} onClick={() => send(`SCREEN ${mode}`)}>{name}</button>)}</div>
        <button disabled={!connected || busy || dirty || !order.names.length} onClick={() => send("NEXT")}>Next initiative turn →</button>
        <div className="remote-screens"><button disabled={!connected || busy} onClick={() => send("FLIP")}>Flip display 180°</button><button disabled={!connected || busy} onClick={() => send("GET")}>Refresh status</button></div>
        <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{message}</p>
        <p className="caption">Edit players below over Bluetooth. Artwork uses the USB painter. Bluetooth controls the board directly; the board still owns gameplay and storage. Nearby devices can connect during the BOOT connection window.</p>
      </div>
    </section>
    <section className="panel editor remote-panel remote-order"><div className="panel-top"><h2>Players &amp; initiative order</h2><span className="status">SAVED ON THE BOARD</span></div>
      <label htmlFor="remote-names">One player or monster per line, in initiative order.</label>
      <textarea id="remote-names" value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !connected} placeholder={"Aria the Ranger\nGoblin Captain\nThorne the Paladin"} aria-describedby="remote-limits" />
      <div className="editor-meta" id="remote-limits"><span>{names.length} / 16 players</span><span>24 plain-text characters each</span></div>
      <div className="publish-row"><p>Saving the list starts at the first player.<br />The board keeps it after power-off.</p><button disabled={!connected || busy || !names.length} onClick={() => savePlayers()}>Save players by Bluetooth</button></div>
      {dirty && <p className="caption">Save your edited order before selecting or advancing a player.</p>}
      <InitiativePreview current={order.names[order.current]} next={order.names[(order.current + 1) % order.names.length]} />
      <ol className="turn-list">{order.names.map((name, index) => <li key={index}><button disabled={!connected || busy || dirty} onClick={() => savePlayers(index)} aria-current={index === order.current ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{name}{index === order.current && <strong>NOW</strong>}</button></li>)}</ol>
    </section><footer>TABLETOP COMPANION <span>NO CABLE. YOUR INTERNET STAYS ON.</span></footer>
  </main>;
}
