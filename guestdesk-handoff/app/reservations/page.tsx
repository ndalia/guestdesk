"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Console, C, mono, Badge, cardStyle } from "../_console";

export default function Page() {
  return (
    <Console active="/reservations" title="Reservations" subtitle="Booked by the agent — live from Convex.">
      <Body />
    </Console>
  );
}

function Body() {
  const rows = useQuery(api.dashboard.listReservations, {});
  if (rows === undefined) return <div style={{ color: C.faint, padding: 40 }}>Loading reservations…</div>;
  const covers = rows.reduce((s, r) => s + (r.partySize || 0), 0);

  return (
    <>
      <div style={{ fontSize: 12.5, color: C.ink3, marginBottom: 14 }}>
        {rows.length} reservations · {covers} covers
      </div>
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {rows.length === 0 && (
          <div style={{ padding: 28, color: C.faint, fontSize: 13 }}>
            No reservations yet. They appear here the moment the agent books one.
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={r._id}
            style={{ display: "flex", alignItems: "center", gap: 15, padding: "14px 20px", borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}` }}
          >
            <div style={{ width: 140, flex: "none", font: `500 13px ${mono.style.fontFamily}`, color: C.olive }}>
              {[r.date, r.time].filter(Boolean).join(" · ") || "—"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                {r.name} <span style={{ fontWeight: 400, color: C.faint }}>· party of {r.partySize}</span>
              </div>
              <div style={{ fontSize: 12, color: C.ink3 }}>
                {[r.contact, r.specialRequests].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <Badge status={r.status} />
          </div>
        ))}
      </div>
    </>
  );
}
