"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Console, C, serif, mono, sans, cardStyle } from "../_console";

export default function Page() {
  return (
    <Console active="/call-scripts" title="Call scripts" subtitle="What your agent says, in your voice. Edits save to Convex.">
      <Body />
    </Console>
  );
}

function Body() {
  const scripts = useQuery(api.scripts.listScripts, {});
  const save = useMutation(api.scripts.saveScript);
  if (scripts === undefined) return <div style={{ color: C.faint, padding: 40 }}>Loading scripts…</div>;

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      {scripts.map((s) => (
        <ScriptCard key={s.key} script={s} onSave={save} />
      ))}
    </div>
  );
}

function ScriptCard({
  script, onSave,
}: {
  script: { key: string; title: string; when: string; body: string };
  onSave: (args: { key: string; title: string; body: string }) => Promise<any>;
}) {
  const [body, setBody] = useState(script.body);
  const [saved, setSaved] = useState(true);

  async function commit() {
    if (body === script.body) return;
    await onSave({ key: script.key, title: script.title, body });
    setSaved(true);
  }

  return (
    <div style={{ ...cardStyle, padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <h3 style={{ margin: 0, font: `400 17px ${serif.style.fontFamily}`, color: C.ink }}>{script.title}</h3>
        <span style={{ font: `500 9.5px ${mono.style.fontFamily}`, letterSpacing: ".08em", color: saved ? C.accent : "#a17224", textTransform: "uppercase" }}>
          {saved ? "Saved" : "Unsaved"}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: C.tag, marginBottom: 13 }}>{script.when}</div>
      <textarea
        value={body}
        spellCheck={false}
        onChange={(e) => { setBody(e.target.value); setSaved(false); }}
        onBlur={commit}
        style={{
          width: "100%", minHeight: 120, resize: "vertical", boxSizing: "border-box",
          border: `1px solid #e6dcc7`, borderRadius: 10, background: "#faf6ec",
          padding: "13px 15px", color: "#3a372f", font: `400 14px/1.6 ${sans.style.fontFamily}`, outline: "none",
        }}
      />
    </div>
  );
}
