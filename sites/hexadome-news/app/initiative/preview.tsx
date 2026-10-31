"use client";
import { useState, type CSSProperties } from "react";
import { layoutName } from "../../lib/name-layout.mjs";

export default function InitiativePreview({ current, next }: { current?: string; next?: string }) {
  const [frame, setFrame] = useState({ current, next, outgoing: undefined as string | undefined, version: 0 });
  if (frame.current !== current || frame.next !== next) {
    setFrame({ current, next, outgoing: frame.current, version: frame.version + 1 });
  }
  const active = layoutName(current || "Set order on website", current ? 103 : 172, current ? 6 : 3);
  const upcoming = layoutName(next || "", 68, 3);
  const leaving = layoutName(frame.outgoing || "", 103, 6);
  const promoted = layoutName(current || "", 68, 3);
  const textStyle = (layout: { size: number }) => ({ fontSize: layout.size * 10, lineHeight: `${layout.size * 8}px` });
  return <div className={`device initiative-device${frame.outgoing && current ? " turn-rolling" : ""}`} aria-label="Current turn above, next turn below">
    <div className="turn-scene" key={frame.version} onAnimationEnd={() => setFrame((old) => ({ ...old, outgoing: undefined }))}>
      {frame.outgoing && current && <div className="turn-outgoing"><div className="turn-name" style={textStyle(leaving)}>{leaving.lines.join("\n")}</div></div>}
      <div className="turn-current" style={{ height: current ? 103 : 172 }}><div className="turn-name" style={{ ...textStyle(active), "--start-scale": promoted.size / active.size } as CSSProperties}>{active.lines.join("\n")}</div></div>
      {next && <div className="turn-next"><div className="next-name" style={textStyle(upcoming)}>{upcoming.lines.join("\n")}</div></div>}
    </div>
  </div>;
}
