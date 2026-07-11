import type { HermesHandoff, SpecialistResult } from "./types";

export async function delegateWithHermes(
  handoff: HermesHandoff,
  localFallback: () => Promise<SpecialistResult>
): Promise<{ result: SpecialistResult; modelCalls: number; usedHermes: boolean }> {
  const baseUrl = process.env.HERMES_BASE_URL;
  const apiKey = process.env.HERMES_API_KEY;
  if (!baseUrl || !apiKey) {
    return { result: await localFallback(), modelCalls: 0, usedHermes: false };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/delegations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.HERMES_MODEL || process.env.AGENT_MODEL || "gpt-4o-mini",
      handoff,
      responseFormat: "specialist_result_v1"
    })
  });

  if (!response.ok) {
    return { result: await localFallback(), modelCalls: 0, usedHermes: false };
  }
  const payload = (await response.json()) as { result?: SpecialistResult } & SpecialistResult;
  return { result: payload.result ?? payload, modelCalls: 1, usedHermes: true };
}
