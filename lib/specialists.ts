import type { HermesHandoff, RestaurantPolicy, SpecialistResult } from "./types";

export function expertiseForRole(roleName: string) {
  if (roleName.includes("Reservation")) {
    return "Reservation operations expert: checks simple slot capacity, proposes alternatives, and creates/modifies/cancels reservation records only when policy allows.";
  }
  if (roleName.includes("Catering") || roleName.includes("Events")) {
    return "Catering intake expert: collects event lead fields and saves structured leads without quoting prices or promising availability.";
  }
  if (roleName.includes("Parking")) {
    return "Current local-arrival expert: uses verified restaurant context and Linkup only for live external parking or transit information.";
  }
  if (roleName.includes("Safe Decline")) {
    return "Safety and policy expert: declines unsupported actions while preserving any supported guest-service work.";
  }
  return "Restaurant knowledge expert: answers menu, allergen, hours, cake, and policy questions from verified Convex knowledge only.";
}

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
      expertise: expertiseForRole(args.task.runtimeRoleName),
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
      summary: `Reservation specialist prepared a slot check for ${partySize || "the requested party"} at ${fields.preferredTime ?? "the requested time"}.`,
      facts: [
        { claim: "Reservation policy loaded from Convex.", sourceType: "convex_policy", sourceId: "restaurantPolicies" },
        { claim: "Final availability is enforced by the simple reservationSlots table before writing.", sourceType: "convex_slot_db", sourceId: "reservationSlots" }
      ],
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
          evidenceSourceIds: ["restaurantPolicies", "reservationSlots"],
          needsCustomerConfirmation: false
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

  const terms = message.toLowerCase();
  const asksAllergens = /\b(allerg|alerg|alaerg|allergy|allergen|gluten|nut|sesame|dairy)\b/.test(terms);
  const asksMenu = /\b(menu|food|dish|options|eat|vegan|vegetarian|halal)\b/.test(terms);
  const asksCake = terms.includes("cake");
  const wantedFacts = knowledge.filter((item) => {
    const text = `${item.title ?? ""} ${item.body ?? ""} ${item.category ?? ""}`.toLowerCase();
    if (asksCake && text.includes("cake")) return true;
    if (asksAllergens && /\ballerg|alerg|alaerg|gluten|sesame|dairy|vegan|vegetarian|halal|dietary/.test(text)) return true;
    if (asksMenu && /\bmenu|tapas|hummus|falafel|vegetarian|vegan|halal|food|dish|option/.test(text)) return true;
    if (/\bhours?|open|close/.test(terms) && /\bhours?|open|close/.test(text)) return true;
    return /\babout|parking|address|policy/.test(terms) && text.length > 0;
  });
  const fallbackFacts = [
    {
      claim:
        "Mock menu highlights: freekeh grain bowls, mezze plates, hummus, baba ghanoush, falafel, roasted cauliflower, chicken skewers, lamb kofta, fattoush salad, baklava, mint lemonade, and Arabic coffee.",
      sourceType: "operator_mock",
      sourceId: "mock_menu_fallback"
    },
    {
      claim:
        "Mock allergen guidance: common kitchen allergens may include sesame, wheat/gluten, dairy, tree nuts, eggs, and legumes. I can record allergy notes, but I cannot guarantee allergen-free preparation.",
      sourceType: "operator_mock",
      sourceId: "mock_allergen_fallback"
    },
    {
      claim:
        "Cake policy is not verified in the current Freekeh records, so I can note a birthday cake request on the reservation but should not promise it is allowed.",
      sourceType: "operator_mock",
      sourceId: "mock_cake_policy_fallback"
    }
  ].filter((fact) => {
    if (asksCake && fact.sourceId.includes("cake")) return true;
    if (asksAllergens && fact.sourceId.includes("allergen")) return true;
    if (asksMenu && fact.sourceId.includes("menu")) return true;
    return false;
  });
  const facts = [...wantedFacts, ...fallbackFacts]
    .filter((item: any, index, items) => {
      const id = String(item.sourceId ?? item._id ?? item.source ?? item.title ?? index);
      return items.findIndex((candidate: any) => String(candidate.sourceId ?? candidate._id ?? candidate.source ?? candidate.title) === id) === index;
    })
    .slice(0, 6)
    .map((item: any) => ({
    claim: item.claim ?? `${item.title}: ${item.body}`,
    sourceType: item.sourceType ?? "convex_knowledge",
    sourceId: String(item.sourceId ?? item._id ?? item.source ?? "restaurantKnowledge")
  }));
  const needsLiveParking = /\bparking|garage|transit|road closure|hotel\b/i.test(message);
  return {
    taskId: handoff.taskId,
    roleName: handoff.roleName,
    status: "completed",
    summary: facts.length
      ? facts.map((fact) => fact.claim).join(" ")
      : "I do not have a verified restaurant record for that question yet.",
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
