"use client";

/**
 * Agent Activity — owner view of what the GuestDesk agent planned, did, and
 * needs approval for. Reads live Convex:
 *   dashboard.listRecentRuns   (run list, added for the console)
 *   orchestration.listRunTrace (plan / tasks / events / results)
 * Approve/Decline → POST /api/chat/confirm → confirmGuestAction() in
 * lib/orchestrator.ts (books the reservation + creates the Dodo deposit).
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Console, C, serif, sans, mono, Badge, cardStyle, labelStyle, fmtTime } from "../_console";

// runEvents.type -> compact tag + colors
const EVENT_TAG: Record<string, [string, string, string]> = {
  request_received: ["IN", "#e8eddb", "#59702f"],
  plan_created: ["PLAN", "#efe9dc", "#8b8577"],
  handoff_created: ["PLAN", "#efe9dc", "#8b8577"],
  specialist_completed: ["HERMES", "#eef0e1", "#545b34"],
  customer_confirmation_requested: ["CONFIRM", "#f6ecd6", "#a17224"],
  action_proposed: ["CONFIRM", "#f6ecd6", "#a17224"],
  reservation_created: ["BOOK", "#e8eddb", "#59702f"],
  reservation_slot_full: ["FULL", "#f6e2da", "#a1402c"],
  catering_lead_created: ["LEAD", "#e8eddb", "#59702f"],
  linkup_search_started: ["LINKUP", "#f6e2da", "#a1402c"],
  linkup_search_completed: ["LINKUP", "#f6e2da", "#a1402c"],
  checkout_created: ["DODO", "#f6ecd6", "#a17224"],
  run_completed: ["DONE", "#efe9dc", "#8b8577"],
  run_failed: ["FAIL", "#f6e2da", "#a1402c"],
};
const eventTag = (t: string): [string, string, string] =>
  EVENT_TAG[t] ?? [t.replace(/_/g, " ").slice(0, 8).toUpperCase(), "#efe9dc", "#8b8577"];

function payloadLine(action: string, payload: any): string {
  if (!payload) return action.replace(/_/g, " ");
  if (action === "create_reservation") {
    return (
      [
        payload.partySize ? `Party of ${payload.partySize}` : null,
        [payload.date, payload.time].filter(Boolean).join(" ") || null,
        payload.specialRequests || null,
      ]
        .filter(Boolean)
        .join(" · ") || "Reservation"
    );
  }
  return action.replace(/_/g, " ");
}

export default function Page() {
  return (
    <Console active="/agent-activity" title="Agent activity" subtitle="What your AI agent planned, did, and needs you for.">
      <Body />
    </Console>
  );
}

function Body() {
  const runs = useQuery(api.dashboard.listRecentRuns, { limit: 25 });
  const [picked, setPicked] = useState<string | null>(null);

  const list = runs ?? [];
  const selId = (picked ?? list[0]?._id ?? null) as Id<"agentRuns"> | null;
  const run = list.find((r) => r._id === selId) ?? null;
  const trace = useQuery(api.orchestration.listRunTrace, selId ? { runId: selId } : "skip");

  const events = useMemo(
    () => [...(trace?.events ?? [])].sort((a: any, b: any) => a.createdAt - b.createdAt),
    [trace]
  );
  const outcome =
    (trace?.results ?? [])
      .map((r: any) => r.result?.summary)
      .filter(Boolean)
      .join(" ") || "No specialist summary recorded for this run yet.";

  async function confirm(confirmed: boolean) {
    if (!run?.pendingConfirmation) return;
    await fetch("/api/chat/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: run.conversationExternalId,
        runId: run._id,
        confirmationToken: run.pendingConfirmation.token,
        confirmed,
      }),
    });
  }

  if (runs === undefined) return <div style={{ color: C.faint, padding: 40 }}>Loading runs…</div>;
  if (list.length === 0)
    return (
      <div style={{ color: C.faint, padding: 40, fontSize: 14 }}>
        No agent runs yet. Trigger one via <code>/api/chat/process</code> or the voice webhook.
      </div>
    );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
      {/* run list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {list.map((r) => {
          const active = r._id === selId;
          return (
            <button
              key={r._id}
              onClick={() => setPicked(r._id)}
              style={{
                textAlign: "left", padding: "14px 15px", borderRadius: 12, cursor: "pointer",
                border: `1px solid ${active ? "#d8cfba" : "transparent"}`,
                background: active ? C.panel : "transparent",
                boxShadow: active ? "0 1px 3px rgba(44,40,34,.06)" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Badge status={r.status} />
                <span style={{ font: `500 10.5px ${mono.style.fontFamily}`, color: C.tag }}>{fmtTime(r.startedAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4, marginBottom: 7 }}>{r.customerRequest}</div>
              <div style={{ fontSize: 11, color: C.faint, textTransform: "capitalize" }}>{r.channel} · {r.modelCallCount} model calls</div>
            </button>
          );
        })}
      </div>

      {/* inspector */}
      <div style={{ ...cardStyle, padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
          <div style={labelStyle}>Interpreted goal</div>
          {run && <Badge status={run.status} />}
        </div>
        <h3 style={{ margin: "0 0 22px", font: `400 19px ${serif.style.fontFamily}`, color: C.ink, lineHeight: 1.3 }}>
          {run?.interpretedGoal ?? "—"}
        </h3>

        <div style={{ ...labelStyle, marginBottom: 11 }}>Manager plan</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
          {(trace?.tasks ?? []).length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No specialists were dispatched.</div>}
          {(trace?.tasks ?? []).map((t: any) => (
            <div key={t._id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", background: C.tint, borderRadius: 11 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t.runtimeRoleName}</div>
                <div style={{ font: `500 10.5px ${mono.style.fontFamily}`, color: C.faint }}>{t.specialist}</div>
              </div>
              <Badge status={t.status} />
            </div>
          ))}
        </div>

        <div style={{ ...labelStyle, marginBottom: 12 }}>Run timeline</div>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
          {events.map((e: any) => {
            const [tag, bg, c] = eventTag(e.type);
            return (
              <div key={e._id} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ display: "inline-flex", padding: "3px 7px", borderRadius: 5, background: bg, color: c, font: `600 9px ${mono.style.fontFamily}`, letterSpacing: ".06em", flex: "none" }}>{tag}</span>
                <div style={{ flex: 1, fontSize: 12.5, color: C.ink2, lineHeight: 1.45 }}>{e.summary}</div>
                <span style={{ font: `500 10px ${mono.style.fontFamily}`, color: C.faint, flex: "none" }}>{fmtTime(e.createdAt)}</span>
              </div>
            );
          })}
        </div>

        <div style={{ ...labelStyle, marginBottom: 9 }}>Outcome</div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.ink2, margin: 0 }}>{outcome}</p>

        {run?.pendingConfirmation && (
          <div style={{ marginTop: 20, padding: "15px 17px", background: "#fbf4e6", border: "1px solid #ecdcc7", borderRadius: 12 }}>
            <div style={{ font: `600 10px ${mono.style.fontFamily}`, letterSpacing: ".1em", color: "#a17224", textTransform: "uppercase", marginBottom: 7 }}>Needs your approval</div>
            <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 500, marginBottom: 13 }}>
              {payloadLine(run.pendingConfirmation.action, run.pendingConfirmation.payload)}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => confirm(true)} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: C.olive, color: "#f3f1e2", font: `600 12.5px ${sans.style.fontFamily}`, cursor: "pointer" }}>Approve</button>
              <button onClick={() => confirm(false)} style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid #d8cfba", background: "#fff", color: C.ink3, font: `600 12.5px ${sans.style.fontFamily}`, cursor: "pointer" }}>Decline</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
