"use client";

import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useMemo, useState } from "react";

function Dashboard() {
  const [conversationId, setConversationId] = useState("demo-freekeh-voice");
  const latestRun = useQuery(api.orchestration.getLatestRun, { conversationExternalId: conversationId });
  const trace = useQuery(api.orchestration.listRunTrace, latestRun?._id ? { runId: latestRun._id } : "skip");

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Freekeh GuestOps Agency</p>
          <h1>Live agent trace</h1>
        </div>
        <input value={conversationId} onChange={(event) => setConversationId(event.target.value)} aria-label="Conversation ID" />
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Manager Plan</h2>
          <pre>{JSON.stringify(trace?.run?.plan ?? latestRun ?? "No run yet", null, 2)}</pre>
        </div>
        <div className="panel">
          <h2>Specialists</h2>
          <ul>
            {trace?.tasks?.map((task: any) => (
              <li key={task._id}>
                <strong>{task.runtimeRoleName}</strong>
                <span>{task.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel wide">
          <h2>Run Events</h2>
          <ol>
            {trace?.events?.map((event: any) => (
              <li key={event._id}>
                <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
                <strong>{event.type}</strong>
                <span>{event.summary}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="panel wide">
          <h2>Specialist Results</h2>
          <pre>{JSON.stringify(trace?.results ?? [], null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  }, []);
  if (!convex) return <main className="missing">Set NEXT_PUBLIC_CONVEX_URL to view live Convex traces.</main>;
  return (
    <ConvexProvider client={convex}>
      <Dashboard />
    </ConvexProvider>
  );
}
