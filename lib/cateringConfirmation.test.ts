import { describe, expect, it } from "vitest";
import { buildCateringLeadEmailDraft, confirmationPromptForAction, requiresCustomerConfirmation } from "./orchestrator";
import { extractFields, planGuestRequest } from "./planner";
import { buildHandoff, runLocalSpecialist } from "./specialists";
import type { ManagerPlan, RestaurantPolicy } from "./types";

const message = "My name is Sam, sam@example.com. We need catering for 80 guests next month for a corporate reception.";

function cateringTask(plan: ManagerPlan) {
  const task = plan.tasks.find((candidate) => candidate.specialist === "catering_events");
  if (!task) throw new Error("Expected catering task");
  return task;
}

describe("catering lead confirmation", () => {
  it("marks a complete catering plan as requiring customer confirmation", () => {
    const fields = extractFields(message, {});
    const plan = planGuestRequest("run-1", message, fields);

    expect(plan.needsCustomerInput).toBe(false);
    expect(plan.missingFields).toEqual([]);
    expect(plan.needsCustomerConfirmation).toBe(true);
    expect(cateringTask(plan).allowedTools).toContain("create_catering_lead");
  });

  it("proposes catering lead creation as a confirmation-gated action", async () => {
    const fields = extractFields(message, {});
    const plan = planGuestRequest("run-1", message, fields);
    const task = cateringTask(plan);
    const policy: RestaurantPolicy = {
      reservationWindowDays: 45,
      maxAutomaticPartySize: 10,
      depositRequiredPartySize: 6,
      depositAmountCents: 2500,
      cancellationCutoffHours: 24,
      outsideCakeAllowed: null,
      outsideCakeFeeCents: null,
      allergyStatement: "No allergy guarantees."
    };
    const handoff = buildHandoff({
      runId: "run-1",
      task,
      customerRequest: message,
      knownFields: fields,
      restaurant: { name: "Freekeh" },
      policy,
      knowledge: []
    });

    const result = await runLocalSpecialist(handoff, []);

    expect(result.status).toBe("completed");
    expect(result.missingFields).toEqual([]);
    expect(result.proposedActions).toEqual([
      expect.objectContaining({
        toolName: "create_catering_lead",
        needsCustomerConfirmation: true,
        arguments: expect.objectContaining({
          customerName: "Sam",
          contact: "sam@example.com",
          eventType: "catering",
          dateRange: "next month",
          guestCount: 80
        })
      })
    ]);
  });

  it("routes catering lead writes through the pending confirmation prompt", () => {
    expect(requiresCustomerConfirmation("create_catering_lead")).toBe(true);
    expect(requiresCustomerConfirmation("search_current_local_info")).toBe(false);
    expect(confirmationPromptForAction("create_catering_lead", ["Catering lead is ready to save."])).toBe(
      "Catering lead is ready to save. Please confirm that you want me to save this catering/private-event inquiry for staff follow-up."
    );
  });

  it("drafts a restaurant follow-up email from the confirmed catering lead", () => {
    const draft = buildCateringLeadEmailDraft({
      customerName: "Sam",
      contact: "sam@example.com",
      eventType: "catering",
      dateRange: "next month",
      guestCount: 80,
      notes: message
    });

    expect(draft.to).toBe("Freekeh catering/private events team");
    expect(draft.subject).toBe("New catering inquiry: 80 guests, next month");
    expect(draft.body).toContain("Guest: Sam");
    expect(draft.body).toContain("Contact: sam@example.com");
    expect(draft.body).toContain("The assistant has not promised pricing or availability.");
  });
});