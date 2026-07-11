import type { HermesHandoff, RestaurantPolicy, SpecialistResult } from "./types";

export function buildHandoff(args: {
  runId: string;
  task: {
    taskId: string;
    runtimeRoleName: string;
    objective: string;
    allowedTools: string[];
    successCriteria: string[];
  };
  customerRequest: string;
  knownFields: Record<string, unknown>;
  restaurant: Record<string, unknown>;
  policy: RestaurantPolicy;
  knowledge: Array<Record<string, unknown>>;
  dependencyResults?: Record<string, unknown>[];
}): HermesHandoff {
  return {
    runId: args.runId,
    taskId: args.task.taskId,
    roleName: args.task.runtimeRoleName,
    goal: args.task.objective,
    context: {
      customerRequest: args.customerRequest,
      knownCustomerFields: args.knownFields,
      relevantConversationMemory: {},
      restaurantProfile: args.restaurant,
      relevantPolicies: args.policy,
      dependencyResults: args.dependencyResults ?? [],
      allowedTools: args.task.allowedTools,
      prohibitedActions: [
        "refunds",
        "compensation",
        "custom catering quotes",
        "allergy guarantees",
        "policy exceptions",
        "payment disputes"
      ],
      successCriteria: args.task.successCriteria,
      requiredOutput: { schema: "SpecialistResult" }
    }
  };
}

export async function runLocalSpecialist(handoff: HermesHandoff, knowledge: Array<Record<string, unknown>>): Promise<SpecialistResult> {
  const message = handoff.context.customerRequest;
  const fields = handoff.context.knownCustomerFields;
  if (handoff.roleName.includes("Reservation")) {
    const partySize = Number(fields.partySize ?? 0);
    return {
      taskId: handoff.taskId,
      roleName: handoff.roleName,
      status: "completed",
      summary: `Found an available reservation option for ${partySize || "the requested party"} at ${fields.preferredTime ?? "the requested time"}.`,
      facts: [{ claim: "Reservation policy loaded from Convex.", sourceType: "convex_policy", sourceId: "restaurantPolicies" }],
      proposedActions: [
        {
          toolName: "create_reservation",
          arguments: {
            name: fields.customerName,
            contact: fields.email ?? fields.phone,
            date: fields.date,
            time: fields.preferredTime,
            partySize,
            specialRequests: /cake/i.test(message) ? "Birthday cake noted" : undefined
          },
          evidenceSourceIds: ["restaurantPolicies"],
          needsCustomerConfirmation: true
        }
      ],
      missingFields: [],
      unsupportedRequests: [],
      confidence: 0.9
    };
  }
  if (handoff.roleName.includes("Catering") || handoff.roleName.includes("Events")) {
    const missing = ["customerName", "eventType", "eventDateRange", "eventGuestCount"].filter((key) => !fields[key]);
    if (!fields.email && !fields.phone) missing.push("phone or email");
    return {
      taskId: handoff.taskId,
      roleName: handoff.roleName,
      status: missing.length ? "needs_customer_input" : "completed",
      summary: missing.length ? "Catering intake is missing required fields." : "Catering lead is ready to save.",
      facts: [{ claim: "Private events inquiry intake accepts name, email, phone, message, and date.", sourceType: "freekeh_site", sourceId: "private-events" }],
      proposedActions: missing.length
        ? []
        : [
            {
              toolName: "create_catering_lead",
              arguments: {
                customerName: fields.customerName,
                contact: fields.email ?? fields.phone,
                eventType: fields.eventType,
                dateRange: fields.eventDateRange,
                guestCount: fields.eventGuestCount,
                notes: message
              },
              evidenceSourceIds: ["private-events"],
              needsCustomerConfirmation: false
            }
          ],
      missingFields: missing,
      unsupportedRequests: [],
      confidence: missing.length ? 0.75 : 0.92
    };
  }

  const facts = knowledge
    .filter((item) => {
      const text = `${item.title ?? ""} ${item.body ?? ""} ${item.category ?? ""}`.toLowerCase();
      return /cake|allerg|hours|menu|halal|vegan|vegetarian|about|parking/.test(message.toLowerCase()) && text.length > 0;
    })
    .slice(0, 5)
    .map((item) => ({
      claim: `${item.title}: ${item.body}`,
      sourceType: "convex_knowledge",
      sourceId: String(item._id ?? item.source ?? "restaurantKnowledge")
    }));
  const needsLiveParking = /\bparking|garage|transit|road closure|hotel\b/i.test(message);
  return {
    taskId: handoff.taskId,
    roleName: handoff.roleName,
    status: "completed",
    summary: needsLiveParking
      ? "Answered verified restaurant facts and requested current local parking search."
      : "Answered from verified restaurant facts.",
    facts,
    proposedActions: needsLiveParking
      ? [
          {
            toolName: "search_current_local_info",
            arguments: { query: "Find current public parking options open tonight near the restaurant." },
            evidenceSourceIds: [],
            needsCustomerConfirmation: false
          }
        ]
      : [],
    missingFields: [],
    unsupportedRequests: [],
    confidence: 0.88
  };
}
