"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Console, C, mono, cardStyle, fmtTime } from "../_console";

export default function Page() {
  return (
    <Console active="/interactions" title="Interactions" subtitle="Every message the agent exchanged, newest first.">
      <Body />
    </Console>
  );
}

function Body() {
  const rows = useQuery(api.dashboard.listInteractions, {});
  if (rows === undefined) return <div style={{ color: C.faint, padding: 40 }}>Loading messages…</div>;

  return (
    <div style={{ ...cardStyle, overflow: "hidden" }}>
      {rows.length === 0 && (
        <div style={{ padding: 28, color: C.faint, fontSize: 13 }}>No messages yet.</div>
      )}
      {rows.map((m, i) => {
        const guest = m.role === "customer" || m.role === "guest";
        return (
          <div key={m._id} style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 20px", borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flex: "none", background: guest ? C.accent : C.oliveSoft }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{m.text}</div>
              <div style={{ font: `500 11px ${mono.style.fontFamily}`, color: C.faint, marginTop: 4, textTransform: "capitalize" }}>
                {guest ? "Guest" : "Agent"} · {m.channel}{m.conversation ? ` · ${m.conversation}` : ""}
              </div>
            </div>
            <span style={{ font: `500 11px ${mono.style.fontFamily}`, color: C.faint, flex: "none" }}>{fmtTime(m.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
