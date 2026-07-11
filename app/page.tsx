"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type ChatMessage = {
  id: string;
  role: "guest" | "manager";
  text: string;
  emailDraft?: EmailDraft;
};

type EmailDraft = {
  to: string;
  subject: string;
  body: string;
};

type CompletedAction = Record<string, unknown> & { emailDraft?: EmailDraft };

type PendingConfirmation = {
  runId: string;
  confirmationToken: string;
  confirmationAction?: string;
};

const demoMessage =
  "My name is Neha, neha@example.com. I would like a table for two tomorrow at 8. What vegan options do you have, and is there allergen info?";

function newConversationId() {
  return `demo-freekeh-chat-${Date.now().toString(36)}`;
}

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "manager",
    text: "Freekeh GuestOps chat is ready. Send a guest request and I will show the manager plan, selected specialists, handoffs, results, and trace."
  };
}

function statusLabel(status?: string) {
  if (!status) return "Waiting";
  return status.replaceAll("_", " ");
}

function previewSpecialists(message: string) {
  const specialists: string[] = [];
  if (
    /\b(book|booking|reserve|reservation|resy|table|seat|dinner|cancel|change|modify)\b/i.test(message) &&
    !/\b(catering|private event|corporate event)\b/i.test(message)
  ) {
    specialists.push("Reservation Specialist");
  }
  if (
    /\b(close|open|hours?|cake|allerg|alerg|alaerg|gluten|sesame|dairy|nut|parking|transit|address|menu|food|dish|options|dress|accessib|policy|bring|serve|serves|vegan|vegetarian|halal)\b/i.test(
      message
    )
  ) {
    specialists.push(
      /\bparking\b/i.test(message) &&
        !/\b(menu|food|dish|options|vegan|vegetarian|halal|allerg|alerg|alaerg|gluten|sesame|dairy|nut|cake)\b/i.test(message)
        ? "Current Parking Search Specialist"
        : "Restaurant Knowledge Specialist"
    );
  }
  if (
    /\b(catering|private event|event|corporate|reception|buyout|large group|group dinner)\b/i.test(message) ||
    /\b(party|group)\s+(?:of|for)\s+\d{2,4}\b/i.test(message) ||
    /\b\d{2,4}\s+(?:people|guests)\b.*\b(next month|event|party|catering|private|corporate)\b/i.test(message) ||
    /\b(next month|event|party|catering|private|corporate)\b.*\b\d{2,4}\s+(?:people|guests)\b/i.test(message)
  ) {
    specialists.push("Catering and Events Intake Specialist");
  }
  return specialists.length ? specialists : ["Safe Decline Specialist"];
}

function expertiseForRole(roleName: string) {
  if (roleName.includes("Reservation")) return "Expertise: reservation slots, availability, booking writes, changes, and cancellations.";
  if (roleName.includes("Catering") || roleName.includes("Events")) return "Expertise: catering/private-event intake and lead capture.";
  if (roleName.includes("Parking")) return "Expertise: live local parking or transit search with restaurant context.";
  if (roleName.includes("Safe Decline")) return "Expertise: unsupported request handling and policy-safe decline.";
  return "Expertise: verified menu, allergen, hours, cake, and restaurant policy knowledge.";
}

function confirmationButtonLabel(action?: string) {
  return action === "create_catering_lead" ? "Save inquiry" : action === "create_reservation" ? "Confirm reservation" : "Confirm action";
}

function emailDraftFromResponse(body: { completedActions?: CompletedAction[] }) {
  return body.completedActions?.find((action) => action.emailDraft)?.emailDraft;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return await response.json();
  const text = await response.text();
  throw new Error(
    `Server returned ${response.status} ${response.statusText}: ${text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 260)}`
  );
}

function DemoConsole() {
  const [conversationId, setConversationId] = useState(newConversationId);
  const [input, setInput] = useState(demoMessage);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage()]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [automationSteps, setAutomationSteps] = useState<string[]>([]);

  const latestRun = useQuery(api.orchestration.getLatestRun, { conversationExternalId: conversationId });
  const trace = useQuery(api.orchestration.listRunTrace, latestRun?._id ? { runId: latestRun._id } : "skip");
  const planTasks = trace?.run?.plan?.tasks ?? [];
  const specialistResults = trace?.results ?? [];
  const isWaitingForConfirmation = (trace?.run?.status ?? latestRun?.status) === "waiting_for_confirmation";

  useEffect(() => {
    if (!isSending) return;
    const specialists = previewSpecialists(input);
    const steps = [
      "Manager received the chat request.",
      "Manager loaded Freekeh policy, knowledge, and conversation memory.",
      `Manager selected ${specialists.length} specialist workstream${specialists.length === 1 ? "" : "s"}.`,
      ...specialists.map((specialist) => `Preparing ${specialist} context and tool limits.`),
      "Manager is waiting for specialist outputs. Hermes spawn events appear only if Hermes succeeds."
    ];
    setAutomationSteps([]);
    let index = 0;
    const interval = window.setInterval(() => {
      setAutomationSteps((current) => (index < steps.length ? [...current, steps[index]] : current));
      index += 1;
      if (index > steps.length) window.clearInterval(interval);
    }, 450);
    return () => window.clearInterval(interval);
  }, [input, isSending]);

  function clearRun() {
    setConversationId(newConversationId());
    setMessages([welcomeMessage()]);
    setPending(null);
    setIsSending(false);
    setAutomationSteps([]);
    setInput(demoMessage);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setPending(null);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "guest", text }]);

    try {
      const response = await fetch("/api/chat/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          restaurantId: "freekeh",
          customerId: null,
          message: text,
          knownFields: {}
        })
      });
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error ?? "Chat manager request failed.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "manager",
          text: body.spokenResponse ?? "The manager finished, but did not return a response."
        }
      ]);
      setAutomationSteps((current) => [...current, "Manager reviewed outputs and returned the customer-facing response."]);
      if (body.status === "needs_confirmation" && body.confirmationToken) {
        setPending({ runId: body.runId, confirmationToken: body.confirmationToken, confirmationAction: body.confirmationAction });
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "manager",
          text: error instanceof Error ? error.message : "Request failed."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function confirmAction(confirmed: boolean) {
    if (!pending || isSending) return;
    setIsSending(true);
    setAutomationSteps(["Customer confirmation received in chat.", "Manager is executing the authorized reservation action."]);
    try {
      const response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          runId: pending.runId,
          confirmationToken: pending.confirmationToken,
          confirmed
        })
      });
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error ?? "Confirmation failed.");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "guest", text: confirmed ? "Yes, please confirm it." : "No, do not book it." },
        {
          id: crypto.randomUUID(),
          role: "manager",
          text: body.spokenResponse ?? "Confirmation complete.",
          emailDraft: emailDraftFromResponse(body)
        }
      ]);
      setAutomationSteps((current) => [...current, "Manager completed the confirmed action and persisted the result."]);
      setPending(null);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "manager", text: error instanceof Error ? error.message : "Confirmation failed." }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Freekeh GuestOps Agency</p>
          <h1>Chat-run manager specialist console</h1>
        </div>
        <label className="conversation-control">
          <span>Conversation</span>
          <input value={conversationId} onChange={(event) => setConversationId(event.target.value)} />
        </label>
      </header>

      <section className="workspace">
        <section className="chat-panel" aria-label="Guest chat simulator">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Primary Demo Channel</p>
              <h2>Chat directly with the manager</h2>
            </div>
            <div className="button-row">
              <button type="button" className="secondary" onClick={clearRun} disabled={isSending}>
                Clear run
              </button>
              <button type="button" onClick={() => setInput(demoMessage)} disabled={isSending}>
                Load demo
              </button>
            </div>
          </div>

          <div className="chat-log">
            {messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <strong>{message.role === "guest" ? "Guest" : "GuestOps Manager"}</strong>
                <p>{message.text}</p>
                {message.emailDraft ? (
                  <div className="email-draft">
                    <span>Draft email</span>
                    <dl>
                      <div>
                        <dt>To</dt>
                        <dd>{message.emailDraft.to}</dd>
                      </div>
                      <div>
                        <dt>Subject</dt>
                        <dd>{message.emailDraft.subject}</dd>
                      </div>
                    </dl>
                    <pre>{message.emailDraft.body}</pre>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {pending ? (
            <div className="confirmation">
              <strong>Customer confirmation required</strong>
              <p>The manager already ran specialists and reviewed outputs. It paused because this write action requires customer confirmation.</p>
              <div>
                <button type="button" onClick={() => confirmAction(true)} disabled={isSending}>
                  {confirmationButtonLabel(pending.confirmationAction)}
                </button>
                <button type="button" className="secondary" onClick={() => confirmAction(false)} disabled={isSending}>
                  Decline
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={sendMessage} className="composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={5} />
            <button type="submit" disabled={isSending}>
              {isSending ? "Manager running..." : "Run manager"}
            </button>
          </form>
        </section>

        <aside className="trace-panel" aria-label="Agent trace">
          <div className="status-strip">
            <div>
              <span>Run status</span>
              <strong>{statusLabel(trace?.run?.status ?? latestRun?.status)}</strong>
            </div>
            <div>
              <span>Model calls</span>
              <strong>{trace?.run?.modelCallCount ?? latestRun?.modelCallCount ?? 0}</strong>
            </div>
            <div>
              <span>Specialists</span>
              <strong>{trace?.tasks?.length ?? planTasks.length}</strong>
            </div>
          </div>

          <section className="panel rubric-panel">
            <h2>Rubric checklist</h2>
            <ul>
              <li>Manager plan changes by request type.</li>
              <li>Specialists are selected only when needed.</li>
              <li>Trace shows handoffs, results, events, cost/model calls.</li>
              <li>PM can run, clear, and inspect a run from the UI.</li>
            </ul>
          </section>

          <section className="panel automation-panel">
            <h2>What is happening now</h2>
            {isWaitingForConfirmation ? (
              <ol className="automation-list">
                <li><span>1</span><p>Manager finished planning and selected the needed specialist workstreams.</p></li>
                <li><span>2</span><p>Specialists returned outputs and proposed actions.</p></li>
                <li><span>3</span><p>The system is waiting for customer confirmation in the chat panel.</p></li>
              </ol>
            ) : automationSteps.length ? (
              <ol className="automation-list">
                {automationSteps.map((step, index) => (
                  <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>
                ))}
              </ol>
            ) : (
              <p className="muted">Press “Run manager” to watch this run. Use “Clear run” to reset the plan and trace view.</p>
            )}
          </section>

          <section className="panel">
            <h2>Manager plan</h2>
            {planTasks.length ? (
              <ol className="plan-list">
                {planTasks.map((task: any) => (
                  <li key={task.taskId}><span>{task.runtimeRoleName}</span><p>{task.objective}</p></li>
                ))}
              </ol>
            ) : (
              <p className="muted">The persisted Convex plan will appear here after the manager starts.</p>
            )}
          </section>

          <section className="panel">
            <h2>Specialist work</h2>
            <div className="agent-grid">
              {trace?.tasks?.length ? (
                trace.tasks.map((task: any) => {
                  const result = specialistResults.find((item: any) => item.taskId === task.taskId)?.result;
                  return (
                    <article className="agent-card" key={task._id}>
                      <span>{statusLabel(task.status)}</span>
                      <strong>{task.runtimeRoleName}</strong>
                      <em>{expertiseForRole(task.runtimeRoleName)}</em>
                      <p>{result?.summary ?? task.objective}</p>
                    </article>
                  );
                })
              ) : (
                <p className="muted">No specialist work selected yet.</p>
              )}
            </div>
          </section>

          <section className="panel agent-output-panel">
            <h2>Agent outputs</h2>
            {specialistResults.length ? (
              <div className="result-list">
                {specialistResults.map((item: any) => {
                  const result = item.result ?? {};
                  return (
                    <article className="result-card" key={item._id}>
                      <div><strong>{item.roleName}</strong><span>{statusLabel(result.status)}</span></div>
                      <p>{result.summary}</p>
                      {result.facts?.length ? (
                        <ul>
                          {result.facts.slice(0, 3).map((fact: any, index: number) => (
                            <li key={`${item._id}-fact-${index}`}>{fact.claim}</li>
                          ))}
                        </ul>
                      ) : null}
                      {result.proposedActions?.length ? (
                        <p className="action-line">Proposed: {result.proposedActions.map((action: any) => action.toolName).join(", ")}</p>
                      ) : null}
                      {result.missingFields?.length ? <p className="action-line">Missing: {result.missingFields.join(", ")}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Agent result summaries will appear here after the manager receives specialist outputs.</p>
            )}
          </section>

          <section className="panel events-panel">
            <h2>Persisted live trace</h2>
            <ol className="events">
              {trace?.events?.length ? (
                trace.events.map((event: any) => (
                  <li key={event._id}>
                    <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
                    <strong>{event.type.replaceAll("_", " ")}</strong>
                    <span>{event.summary}</span>
                  </li>
                ))
              ) : (
                <li className="empty-event"><span>No persisted events yet.</span></li>
              )}
            </ol>
          </section>
        </aside>
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
      <DemoConsole />
    </ConvexProvider>
  );
}
