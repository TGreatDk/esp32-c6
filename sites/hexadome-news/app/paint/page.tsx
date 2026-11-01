"use client";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { createDndSerial } from "../../lib/dnd-serial.mjs";
import { ART_PIXELS, rgb565, rgbFrom565, hexFrom565, fitImage, rgbaToPixels } from "../../lib/pixel-art.mjs";

const PALETTE = ["#ffffff", "#000000", "#edc27b", "#ff5555", "#55dd88", "#5599ff", "#55eedd", "#cc88ff"];
export default function Paint() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const pixels = useRef<Uint16Array | null>(null);
  if (!pixels.current) pixels.current = new Uint16Array(ART_PIXELS);
  const client = useRef<ReturnType<typeof createDndSerial> | null>(null);
  const dragging = useRef(false);
  const [color, setColor] = useState("#edc27b"), [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0), [y, setY] = useState(0);
  const [connected, setConnected] = useState(false), [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false), [message, setMessage] = useState("Paint a local draft, then connect your ESP32 by USB to save it.");
  function redraw() {
    const context = canvas.current?.getContext("2d"); if (!context) return;
    const image = context.createImageData(320, 172);
    for (let i = 0; i < ART_PIXELS; ++i) {
      const [r, g, b] = rgbFrom565(pixels.current![i]);
      image.data.set([r, g, b, 255], i * 4);
    }
    context.putImageData(image, 0, 0);
  }
  useEffect(() => {
    let live = true; redraw(); setSupported("serial" in navigator);
    const serial = createDndSerial({ onState: () => {}, onError: (reason: string) => { if (live) { setError(true); setMessage(reason); } }, onDisconnect: (reason: string) => { if (live) { setConnected(false); setMessage(reason); } } });
    client.current = serial;
    return () => { live = false; void serial.disconnect(); };
  }, []);
  function paint(px: number, py: number) {
    px = Math.floor(px); py = Math.floor(py);
    if (busy || px < 0 || px >= 320 || py < 0 || py >= 172) return;
    const value = rgb565(color); pixels.current![py * 320 + px] = value;
    const context = canvas.current!.getContext("2d")!;
    context.fillStyle = hexFrom565(value); context.fillRect(px, py, 1, 1);
    setX(px); setY(py); setDirty(true);
  }
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    paint(Math.floor((event.clientX - rect.left) * 320 / rect.width), Math.floor((event.clientY - rect.top) * 172 / rect.height));
  }
  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); paint(x, y); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); setX(Math.max(0, Math.min(319, x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))));
      setY(Math.max(0, Math.min(171, y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))));
    }
  }
  async function connect() {
    setBusy(true); setError(false);
    try {
      if (connected) { await client.current!.disconnect(); setConnected(false); setMessage("Disconnected. Saved artwork stays on the board."); }
      else {
        await client.current!.connect(); const info = await client.current!.artInfo(); setConnected(true);
        setMessage(info.saved ? "Connected. A saved image is on the board. This canvas is your separate local draft." : "Connected. Paint and save your first image.");
      }
    } catch (e) { await client.current!.disconnect().catch(() => {}); setConnected(false); setError(true); setMessage(e instanceof Error ? e.message : "USB connection failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(false); setProgress(0);
    try {
      await client.current!.sendArt(pixels.current!, (value: number) => setProgress(value)); setDirty(false);
      setMessage("Image saved on the ESP32 and displayed. Double-click BOOT to choose another screen.");
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Upload failed. Your previous saved image is kept."); }
    finally { setBusy(false); setProgress(null); }
  }
  function fill(value: number) { if (busy) return; pixels.current!.fill(value); redraw(); setDirty(true); }
  async function loadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); setError(false);
    let image: ImageBitmap | null = null;
    try {
      if (!/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, WebP, GIF, or BMP image up to 10 MB.");
      image = await createImageBitmap(file);
      const fit = fitImage(image.width, image.height);
      const imported = document.createElement("canvas"); imported.width = 320; imported.height = 172;
      const context = imported.getContext("2d")!;
      context.fillStyle = "#000000"; context.fillRect(0, 0, 320, 172);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
      pixels.current = rgbaToPixels(context.getImageData(0, 0, 320, 172).data);
      redraw(); setDirty(true);
      setMessage(`Loaded ${file.name}. Fitted to 320 × 172 with its proportions preserved. Edit pixels or save it to the ESP32.`);
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Could not read this image."); }
    finally { image?.close(); setBusy(false); }
  }
  return <main className="painter">
    <header><a className="brand" href="/paint"><span className="hex">P</span> PIXEL <span className="brand-light">/ PAINTER</span></a><nav className="mode-nav"><a href="/">News</a><a href="/paint" aria-current="page">Paint</a><a href="/initiative">Initiative</a></nav></header>
    <section className="intro"><div className="eyebrow"><span className="dot" /> EVERY PIXEL IS YOURS</div><h1>Your image.<br /><em>A little screen.</em></h1><p>Load an image or paint from scratch.<br />Convert to 320 × 172. Save over USB.</p></section>
    <div className="workspace"><section className="panel">
      <div className="panel-top"><h2>320 × 172 pixels</h2><span className="status">{dirty ? "LOCAL DRAFT" : "CANVAS"}</span></div>
      <div className="paint-viewport"><div className="paint-surface" style={{ width: 320 * zoom, height: 172 * zoom }}>
        <canvas ref={canvas} width={320} height={172} style={{ width: 320 * zoom, height: 172 * zoom }} tabIndex={0} role="img" aria-label="Pixel painting canvas. Click or drag to paint. Arrow keys select a pixel; Space paints it." onKeyDown={keyboard} onPointerDown={(e) => { if (busy) return; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); point(e); }} onPointerMove={(e) => { if (dragging.current) point(e); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} />
        {zoom >= 4 && <div className="pixel-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} />}
      </div></div>
      <p className="caption">Click or drag to paint. Zoom to 4× or 8× to see individual grid cells.<br />Your canvas is a local draft; saving replaces the board's image.</p>
    </section><aside><section className="panel paint-tools">
      <div className="panel-top"><h2>Your brush</h2><span className="status">{connected ? "USB CONNECTED" : "USB DISCONNECTED"}</span></div>
      <div className="paint-controls"><label htmlFor="image-file">Load image</label><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" disabled={busy} onChange={loadImage} /><p className="image-help">Resized to fit without stretching, with black borders where needed. Converted locally to the display's colours.</p><label htmlFor="paint-color">Pixel colour</label><input id="paint-color" type="color" value={color} disabled={busy} onChange={(e) => setColor(e.target.value)} />
        <div className="swatches">{PALETTE.map((value) => <button key={value} aria-label={`Use colour ${value}`} aria-pressed={color === value} style={{ background: value }} disabled={busy} onClick={() => setColor(value)} />)}</div>
        <label htmlFor="paint-zoom">Zoom</label><select id="paint-zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value}×</option>)}</select>
        <div className="pixel-position"><label>X<input aria-label="Pixel X" type="number" min={0} max={319} value={x} onChange={(e) => setX(Math.max(0, Math.min(319, Number(e.target.value))))} /></label><label>Y<input aria-label="Pixel Y" type="number" min={0} max={171} value={y} onChange={(e) => setY(Math.max(0, Math.min(171, Number(e.target.value))))} /></label></div>
        <button disabled={busy} onClick={() => paint(x, y)}>Paint selected pixel</button>
        <div className="paint-actions"><button disabled={busy} onClick={() => fill(rgb565(color))}>Fill colour</button><button disabled={busy} onClick={() => fill(0)}>Clear canvas</button></div>
        <button disabled={busy || !supported} onClick={connect}>{connected ? "Disconnect USB" : "Connect ESP32 by USB"}</button>
        <button className="save-art" disabled={busy || !connected} onClick={save}>{progress !== null ? `Saving ${progress}%` : "Save image to ESP32 ↗"}</button>
        {!supported && <p className="error">USB configuration needs desktop Chrome or Edge.</p>}
        <p className={error ? "feedback error" : "feedback"} role={error ? "alert" : "status"}>{message}</p>
      </div></section><p className="caption">Double-click BOOT for screens; click to browse and wait 5 seconds to open.<br />Hold BOOT to flip the whole display. Initiative stays saved.</p></aside></div>
    <footer>TABLETOP COMPANION <span>55,040 PIXELS. ONE LITTLE DISPLAY.</span></footer>
  </main>;
}
