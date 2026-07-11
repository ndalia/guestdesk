"use client";

/**
 * Shared console shell for the owner-facing GuestDesk screens.
 * Provides the Convex provider, the warm palette + fonts, the sidebar nav, and
 * a couple of small primitives (Badge, statusMeta, fmt*) so each page file stays
 * short. Styling is inline — no global CSS / CSS modules to wire up.
 */

import { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Marcellus, Public_Sans, IBM_Plex_Mono } from "next/font/google";

export const serif = Marcellus({ weight: "400", subsets: ["latin"] });
export const sans = Public_Sans({ subsets: ["latin"] });
export const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"] });

export const C = {
  bg: "#f6f1e7", panel: "#fffdf8", line: "#e8e1d1", lineSoft: "#f0eadc", tint: "#f7f2e7",
  ink: "#2c2822", ink2: "#4a463d", ink3: "#6f6a5c", faint: "#9a9384", tag: "#a49c8a",
  olive: "#545b34", oliveSoft: "#8b9556", accent: "#adb37d",
};

export const cardStyle: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
};
export const labelStyle: React.CSSProperties = {
  font: `500 10px ${mono.style.fontFamily}`, letterSpacing: ".11em",
  color: C.tag, textTransform: "uppercase",
};

type Meta = { label: string; bg: string; c: string };
const STATUS: Record<string, Meta> = {
  confirmed: { label: "Confirmed", bg: "#e8eddb", c: "#59702f" },
  completed: { label: "Completed", bg: "#e8eddb", c: "#59702f" },
  pending_payment: { label: "Pending deposit", bg: "#f6ecd6", c: "#a17224" },
  pending: { label: "Pending", bg: "#f6ecd6", c: "#a17224" },
  pending_confirmation: { label: "Awaiting OK", bg: "#f6ecd6", c: "#a17224" },
  holding: { label: "Holding", bg: "#f6ecd6", c: "#a17224" },
  new: { label: "New", bg: "#eef0e1", c: "#545b34" },
  quoted: { label: "Quoted", bg: "#f6ecd6", c: "#a17224" },
  cancelled: { label: "Cancelled", bg: "#f6e2da", c: "#a1402c" },
  declined: { label: "Declined", bg: "#f6e2da", c: "#a1402c" },
  // agent-run statuses (lib/types.ts RunStatus)
  waiting_for_confirmation: { label: "Awaiting your OK", bg: "#f6ecd6", c: "#a17224" },
  waiting_for_customer: { label: "Needs guest info", bg: "#f6ecd6", c: "#a17224" },
  agents_working: { label: "Agents working", bg: "#eef0e1", c: "#545b34" },
  planning: { label: "Planning", bg: "#eef0e1", c: "#545b34" },
  collecting_information: { label: "Collecting info", bg: "#eef0e1", c: "#545b34" },
  executing: { label: "Executing", bg: "#eef0e1", c: "#545b34" },
  partially_completed: { label: "Partly done", bg: "#eef0e1", c: "#545b34" },
  declined_safely: { label: "Declined safely", bg: "#f6e2da", c: "#a1402c" },
  failed: { label: "Failed", bg: "#f6e2da", c: "#a1402c" },
};
export function statusMeta(s: string): Meta {
  return STATUS[s] ?? { label: s.replace(/_/g, " "), bg: "#f0ece0", c: "#7a7566" };
}

export function Badge({ status, meta }: { status?: string; meta?: Meta }) {
  const m = meta ?? statusMeta(status ?? "");
  return (
    <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: 100, background: m.bg, color: m.c, font: `600 11px ${sans.style.fontFamily}`, whiteSpace: "nowrap", textTransform: "capitalize" }}>
      {m.label}
    </span>
  );
}

export const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
export const fmtDay = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

const NAV: [string, string][] = [
  ["Agent activity", "/agent-activity"],
  ["Reservations", "/reservations"],
  ["Catering leads", "/catering"],
  ["Interactions", "/interactions"],
  ["Call scripts", "/call-scripts"],
];

export function Console({
  active, title, subtitle, children,
}: { active: string; title: string; subtitle: string; children: React.ReactNode }) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  }, []);
  if (!convex) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: C.ink3, background: C.bg }}>
        Set NEXT_PUBLIC_CONVEX_URL to view live data.
      </main>
    );
  }
  return (
    <ConvexProvider client={convex}>
      <div className={sans.className} style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.ink }}>
        <aside style={{ width: 240, flex: "none", background: C.panel, borderRight: `1px solid ${C.line}`, padding: "20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 8px 18px", borderBottom: `1px solid #eee6d6`, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: C.olive, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.accent }} />
            </div>
            <div>
              <div style={{ font: `400 18px ${serif.style.fontFamily}`, color: C.ink, lineHeight: 1 }}>GuestDesk</div>
              <div style={{ font: `500 9px ${mono.style.fontFamily}`, letterSpacing: ".14em", color: C.accent, textTransform: "uppercase", marginTop: 4 }}>Console</div>
            </div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV.map(([lbl, href]) => {
              const on = href === active;
              return (
                <a key={href} href={href} style={{
                  display: "block", padding: "9px 12px", borderRadius: 9, textDecoration: "none",
                  font: `${on ? 600 : 500} 13.5px ${sans.style.fontFamily}`,
                  color: on ? C.olive : C.ink3, background: on ? "#eef0e1" : "transparent",
                }}>{lbl}</a>
              );
            })}
          </nav>
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: "26px 30px 60px", overflowY: "auto" }}>
          <h1 style={{ margin: 0, font: `400 23px ${serif.style.fontFamily}`, color: C.ink }}>{title}</h1>
          <div style={{ fontSize: 12.5, color: C.ink3, margin: "3px 0 22px" }}>{subtitle}</div>
          {children}
        </main>
      </div>
    </ConvexProvider>
  );
}
