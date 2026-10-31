"use client";
import { useEffect, useState } from "react";
import InitiativePreview from "./preview";
type TurnOrder = { names: string[]; current: number; revision: number; error?: string };
export default function Initiative() {
  const [order, setOrder] = useState<TurnOrder>({ names: [], current: 0, revision: 0 });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("Loading initiative...");
  const [error, setError] = useState(false);
  const names = text.split("\n").map((name) => name.trim()).filter(Boolean);
  const dirty = JSON.stringify(names) !== JSON.stringify(order.names);
  const current = order.names[order.current];
  const next = order.names[(order.current + 1) % order.names.length];
  useEffect(() => {
    let live = true, first = true;
    async function refresh() {
      try {
        const response = await fetch("/api/initiative", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load initiative. Reload to try again.");
        const data = await response.json() as TurnOrder;
        if (!live) return;
        setOrder((old) => old.revision > data.revision ? old : data);
        if (first) { setText(data.names.join("\n")); setMessage(""); setLoaded(true); first = false; }
      } catch (e) { if (live) { setError(true); setMessage(e instanceof Error ? e.message : "Connection lost."); } }
    }
    refresh(); const timer = setInterval(refresh, 2000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function send(action: "save" | "next" | "select", index?: number) {
    setBusy(true); setError(false); setMessage("");
    try {
      const response = await fetch("/api/initiative", { method: action === "save" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, names, index, revision: order.revision }) });
      const data = await response.json() as TurnOrder;
      if (!response.ok) throw new Error(data.error || "Could not update initiative.");
      setOrder((old) => old.revision > data.revision ? old : data);
      if (action === "save") setText(data.names.join("\n"));
      setMessage("Turn sent. The ESP32 updates within a few seconds.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Could not update."); }
    finally { setBusy(false); }
  }
  return <main className="initiative">
    <header><a className="brand" href="/initiative"><span className="hex">D</span> D&D <span className="brand-light">/ INITIATIVE</span></a><nav className="mode-nav"><a href="/">News ticker</a><a href="/initiative" aria-current="page">Initiative</a></nav></header>
    <section className="intro"><div className="eyebrow"><span className="dot" /> THE GAME MASTER'S DESK</div><h1>Every hero gets<br /><em>their moment.</em></h1><p>Set the order. Advance the turn.<br />Keep the whole table in the encounter.</p></section>
    <div className="workspace"><section className="panel editor">
      <div className="panel-top"><h2>Turn order</h2><span className="status">{order.names.length} COMBATANTS</span></div>
      <label htmlFor="names">One character or monster per line, highest initiative first.</label>
      <textarea id="names" value={text} onChange={(e) => setText(e.target.value)} disabled={!loaded || busy} placeholder={"Aria the Ranger\nGoblin Captain\nThorne the Paladin"} aria-describedby="name-limits" />
      <div className="editor-meta" id="name-limits"><span>{names.length} / 16 names</span><span>24 plain-text characters each</span></div>
      <div className="publish-row"><p>Saving starts at the first name.<br />Edit line order to change initiative.</p><button disabled={!loaded || busy || !names.length || !dirty} onClick={() => send("save")}>Set turn order ↗</button></div>
      {message && <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{message}</p>}
    </section><aside>
      <section className="panel preview"><div className="panel-top"><h2>On your tabletop</h2><span className="mini-label">320 × 172 PX</span></div>
      <InitiativePreview current={current} next={next} />
      <div className="turn-control"><button className="next-button" disabled={busy || !current || dirty} onClick={() => send("next")}>Next turn →</button><p>{dirty ? "Save your edited order before advancing." : "Loops back to the first name after the last turn."}</p></div></section>
      {order.names.length > 0 && <ol className="turn-list">{order.names.map((name, index) => <li key={index}><button disabled={busy || dirty} onClick={() => send("select", index)} aria-current={index === order.current ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{name}{index === order.current && <strong>NOW</strong>}</button></li>)}</ol>}
      <p className="caption">D&D-only mode: tap BOOT for the next turn; hold to flip.<br />Hold BOOT as the screen lights up to unlock the other screens.<br />Click a saved name to make it the current turn.</p>
    </aside></div><footer>TABLETOP COMPANION <span>YOUR PARTY. YOUR TURN ORDER.</span></footer>
  </main>;
}
