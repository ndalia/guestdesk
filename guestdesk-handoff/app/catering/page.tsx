"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Console, C, serif, mono, Badge, cardStyle } from "../_console";

const COLUMNS: [string, string][] = [
  ["new", "New"],
  ["quoted", "Quoted"],
  ["confirmed", "Confirmed"],
];

export default function Page() {
  return (
    <Console active="/catering" title="Catering & events" subtitle="Leads the agent captured from inbound.">
      <Body />
    </Console>
  );
}

function Body() {
  const rows = useQuery(api.dashboard.listCateringLeads, {});
  if (rows === undefined) return <div style={{ color: C.faint, padding: 40 }}>Loading leads…</div>;

  const byStatus = (key: string) => rows.filter((r) => (r.status || "new") === key);
  const others = rows.filter((r) => !COLUMNS.some(([k]) => k === (r.status || "new")));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
      {COLUMNS.map(([key, label]) => {
        const cards = key === "new" ? [...byStatus("new"), ...others] : byStatus(key);
        return (
          <div key={key} style={{ background: "#f3eee1", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", marginBottom: 12 }}>
              <h3 style={{ margin: 0, font: `400 15px ${serif.style.fontFamily}`, color: C.ink }}>{label}</h3>
              <span style={{ font: `500 11px ${mono.style.fontFamily}`, color: C.tag }}>{cards.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {cards.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: "6px 4px" }}>None</div>}
              {cards.map((c) => (
                <div key={c._id} style={{ ...cardStyle, borderRadius: 11, padding: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.3, marginBottom: 8, textTransform: "capitalize" }}>
                    {c.eventType} — {c.customerName}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, font: `500 11px ${mono.style.fontFamily}`, color: C.ink3, marginBottom: 10 }}>
                    <span>{c.dateRange}</span><span style={{ color: "#d8cfba" }}>·</span><span>{c.guestCount} guests</span>
                  </div>
                  {c.notes && <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.45, marginBottom: 10 }}>{c.notes}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 9, borderTop: `1px solid ${C.lineSoft}` }}>
                    <span style={{ fontSize: 12, color: C.faint }}>{c.contact}</span>
                    <Badge status={c.status || "new"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
