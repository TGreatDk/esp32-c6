"use client";
import { useEffect, useState } from "react";
type FeedResponse = { headlines: string[]; updatedAt: string | null; speed: number; color: string; error?: string };
export default function Home() {
  const [text, setText] = useState("");
  const [published, setPublished] = useState<string[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading your broadcast...");
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState(90);
  const [color, setColor] = useState("#ffffff");
  const [savedStyle, setSavedStyle] = useState({ speed: 90, color: "#ffffff" });
  const [previewIndex, setPreviewIndex] = useState(0);
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const previewHeadline = lines[previewIndex % Math.max(lines.length, 1)] || "Your next headline goes here...";
  const dirty = JSON.stringify(lines) !== JSON.stringify(published) || speed !== savedStyle.speed || color !== savedStyle.color;
  useEffect(() => {
    fetch("/api/headlines", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load headlines. Please reload.");
      const data = await response.json() as FeedResponse;
      setText(data.headlines.join("\n")); setPublished(data.headlines); setUpdated(data.updatedAt); setMessage("");
      setSpeed(data.speed); setColor(data.color); setSavedStyle({ speed: data.speed, color: data.color });
    }).catch((e) => { setMessage(e.message); setError(true); }).finally(() => setBusy(false));
  }, []);
  async function publish() {
    setBusy(true); setError(false); setMessage("");
    try {
      const response = await fetch("/api/headlines", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headlines: lines, speed, color }) });
      if (response.status === 401) throw new Error("Sign in with ChatGPT to publish. Reload the page to sign in.");
      const data = await response.json() as FeedResponse;
      if (!response.ok) throw new Error(data.error || "Could not publish. Try again.");
      setPublished(data.headlines); setUpdated(data.updatedAt); setText(data.headlines.join("\n"));
      setSavedStyle({ speed: data.speed, color: data.color });
      setMessage("Sent to the feed. Your ESP32 picks up the changes within 60 seconds.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Could not publish."); }
    finally { setBusy(false); }
  }
  return <main>
    <header><a className="brand" href="/"><span className="hex">H</span> HEXADOME <span className="brand-light">/ NEWS</span></a><nav className="mode-nav"><a href="/" aria-current="page">News</a><a href="/paint">Paint</a><a href="/initiative">Initiative</a></nav></header>
    <section className="intro"><div className="eyebrow"><span className="dot" /> ARISTEIA! // SPORTS NETWORK</div><h1>The arena never<br /><em>stops talking.</em></h1><p>Write the headlines. Set the scene.<br />Bring the HexaDome to your gaming table.</p></section>
    <div className="workspace"><section className="editor panel" aria-labelledby="editor-title">
      <div className="panel-top"><h2 id="editor-title">Broadcast queue</h2><span className={dirty ? "status draft" : "status"}>{dirty ? "UNPUBLISHED CHANGES" : "SAVED FEED"}</span></div>
      <label htmlFor="headlines">Add or edit headlines below, one per line. Then send them to your display.</label>
      <textarea id="headlines" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} spellCheck={false} placeholder="Maximus wins yet another match at the HexaDome!" aria-describedby="limits" />
      <div className="editor-meta" id="limits"><span>{lines.length} / 16 headlines</span><span>120 characters per headline · plain text</span></div>
      <div className="controls"><div><label htmlFor="speed">Scroll speed <strong>{speed} px/s</strong></label><input id="speed" type="range" min="30" max="180" step="5" value={speed} disabled={busy} onChange={(e) => setSpeed(Number(e.target.value))} /><small>Slower <span>Faster</span></small></div><div><label htmlFor="color">Text colour</label><input id="color" type="color" value={color} disabled={busy} onChange={(e) => setColor(e.target.value)} /></div></div>
      <div className="publish-row"><p>Send text, speed, and colour together.<br />Your display updates within 60 seconds.</p><button onClick={publish} disabled={busy || !lines.length}>{busy ? "Sending..." : "Send to ESP32"} ↗</button></div>
      {message && <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{message}</p>}
    </section><aside>
      <section className="panel preview"><div className="panel-top"><h2>On your tabletop</h2><span className="mini-label">PREVIEW</span></div>
        <div className="device" aria-label="320 by 172 pixel landscape display preview"><div className="device-head"><strong>ARISTEIA! NEWS</strong></div><div className="ticker-window"><div className="marquee" style={{ color, animationDuration: `${(previewHeadline.length * 18 + 320) / speed}s` }} key={`${previewIndex}-${previewHeadline}-${speed}`} onAnimationEnd={() => setPreviewIndex((index) => index + 1)}>{previewHeadline}</div></div><div className="device-footer">HEXADOME // SIMULATED SPORTS FEED</div></div>
        <p className="caption">320 × 172 px · landscape · actual screen pixels.<br />Draft preview, one headline at a time. Send to ESP32 to apply.</p></section>
      <section className="connection"><span className="step">01</span><div><h3>Press BOOT to change screens</h3><p>When unlocked at startup, short presses cycle clock, news, pixel art, and initiative. Double-click to toggle your image directly.</p></div></section>
      <section className="connection"><span className="step">02</span><div><h3>Your feed stays on air</h3><p>If Wi-Fi drops, the device keeps its last downloaded headlines. Built-in news is ready after a restart.</p></div></section>
      <p className="saved">{updated ? `LAST PUBLISHED ${new Date(updated).toLocaleString()}` : "STARTER HEADLINES READY"}</p>
    </aside></div><footer>FAN-MADE BROADCAST TOOL <span>FICTIONAL NEWS. REAL TABLETOP ATMOSPHERE.</span></footer>
  </main>;
}


