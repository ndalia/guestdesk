import type { ManagerPlan, SpecialistKind } from "./types";
import { isAllergyGuaranteeRequest, isUnsupportedRequest } from "./policy";

const reservationTools = [
  "find_reservation",
  "check_availability",
  "create_reservation",
  "modify_reservation",
  "cancel_reservation",
  "get_reservation_policy",
  "create_deposit_checkout"
];
const knowledgeTools = ["get_restaurant_profile", "get_restaurant_policy", "search_restaurant_knowledge", "search_current_local_info"];
const cateringTools = ["get_event_intake_requirements", "create_catering_lead"];

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};

function parseSmallNumber(value: string | undefined) {
  if (!value) return undefined;
  return /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()];
}

export function extractFields(message: string, knownFields: Record<string, unknown>) {
  const fields = { ...knownFields };
  const party =
    message.match(/\b(?:party of|table for|reservation for)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i) ??
    message.match(/\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:people|guests?)\b(?![^.]*\b(?:catering|event|private)\b)/i);
  const partySize = parseSmallNumber(party?.[1]);
  if (partySize && !fields.partySize) fields.partySize = partySize;
  if (/\btomorrow\b/i.test(message) && !fields.date) fields.date = "tomorrow";
  const time = message.match(/\b(?:at|around)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (time && !fields.preferredTime) {
    const hour = parseSmallNumber(time[1]) ?? time[1];
    fields.preferredTime = `${hour}${time[2] ? `:${time[2]}` : ""}${time[3] ? ` ${time[3]}` : ""}`;
  }
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email && !fields.email) fields.email = email[0];
  const phone = message.match(/\b\+?\d[\d .()-]{8,}\d\b/);
  if (phone && !fields.phone) fields.phone = phone[0];
  const name = message.match(/\b(?:my name is|this is|i am|i'm)\s+([^,.]+)/i);
  if (name && !fields.customerName) fields.customerName = name[1].trim();
  const guestCount = message.match(/\b(?:catering|event|private).{0,30}?(\d{1,4})\s+(?:people|guests?)\b/i) ?? message.match(/\b(\d{1,4})\s+(?:people|guests?).{0,30}?(?:catering|event|private)\b/i);
  if (guestCount && !fields.eventGuestCount) fields.eventGuestCount = Number(guestCount[1]);
  if (/\bnext month\b/i.test(message) && !fields.eventDateRange) fields.eventDateRange = "next month";
  if (/\b(catering|private event|party|reception|corporate)\b/i.test(message) && !fields.eventType) fields.eventType = "catering";
  return fields;
}

export function planGuestRequest(runId: string, message: string, knownFields: Record<string, unknown>): ManagerPlan {
  const fields = extractFields(message, knownFields);
  const tasks: ManagerPlan["tasks"] = [];
  const lower = message.toLowerCase();

  const wantsReservation =
    /\b(book|booking|reserve|reservation|resy|table|seat|dinner|cancel|change|modify)\b/i.test(message) &&
    !/\b(catering|private event|corporate event)\b/i.test(message);
  const wantsKnowledge =
    /\b(close|open|hours?|cake|allerg|alerg|alaerg|gluten|sesame|dairy|nut|parking|transit|address|menu|food|dish|options|vegan|vegetarian|halal|dress|accessib|policy|bring|serve|serves)\b/i.test(
      message
    );
  const wantsCatering =
    /\b(catering|private event|event|corporate|reception|buyout|large group|group dinner)\b/i.test(message) ||
    /\b(party|group)\s+(?:of|for)\s+\d{2,4}\b/i.test(message) ||
    /\b\d{2,4}\s+(?:people|guests)\b.*\b(next month|event|party|catering|private|corporate)\b/i.test(message) ||
    /\b(next month|event|party|catering|private|corporate)\b.*\b\d{2,4}\s+(?:people|guests)\b/i.test(message);
  const unsupported = isUnsupportedRequest(message) || isAllergyGuaranteeRequest(message);

  const addTask = (
    specialist: SpecialistKind,
    runtimeRoleName: string,
    objective: string,
    allowedTools: string[],
    successCriteria: string[]
  ) => {
    tasks.push({
      taskId: `${specialist}-${tasks.length + 1}`,
      specialist,
      runtimeRoleName,
      objective,
      dependencies: [],
      allowedTools,
      successCriteria
    });
  };

  if (wantsReservation) {
    const role = Number(fields.partySize ?? 0) >= 6 ? "Large Party Reservation Specialist" : "Reservation Specialist";
    addTask("reservation", role, "Check availability and propose the safest reservation action.", reservationTools, [
      "Only write after customer confirmation",
      "Return available slot or alternatives",
      "Attach structured reservation evidence"
    ]);
  }
  if (wantsKnowledge) {
    const role =
      lower.includes("parking") && !/\b(menu|food|dish|options|vegan|vegetarian|halal|allerg|alerg|alaerg|gluten|sesame|dairy|nut|cake)\b/i.test(message)
        ? "Current Parking Search Specialist"
        : "Restaurant Knowledge Specialist";
    addTask("restaurant_knowledge", role, "Answer restaurant-owned facts from Convex and use Linkup only for current external local information.", knowledgeTools, [
      "Use verified restaurant facts for policies",
      "Include source IDs",
      "Distinguish current external search results"
    ]);
  }
  if (wantsCatering) {
    addTask("catering_events", "Catering and Events Intake Specialist", "Collect and persist a simple catering/private-event inquiry when required fields are complete.", cateringTools, [
      "Do not quote prices",
      "Save complete lead",
      "Ask only for missing intake fields"
    ]);
  }
  if (tasks.length === 0 && unsupported) {
    addTask("restaurant_knowledge", "Safe Decline Specialist", "Decline unsupported work while completing no prohibited action.", knowledgeTools, ["No refund or compensation action"]);
  }

  const missingFields: string[] = [];
  if (wantsReservation) {
    if (!fields.customerName) missingFields.push("customer name");
    if (!fields.phone && !fields.email) missingFields.push("phone or email");
    if (!fields.date) missingFields.push("date");
    if (!fields.preferredTime) missingFields.push("preferred time");
    if (!fields.partySize) missingFields.push("party size");
  }
  if (wantsCatering) {
    if (!fields.customerName) missingFields.push("customer name");
    if (!fields.phone && !fields.email) missingFields.push("phone or email");
    if (!fields.eventType) missingFields.push("event type");
    if (!fields.eventDateRange) missingFields.push("preferred date or date range");
    if (!fields.eventGuestCount) missingFields.push("estimated guest count");
  }

  return {
    runId,
    interpretedGoal: unsupported ? "Unsupported request with any supported parts handled safely" : message,
    tasks: tasks.slice(0, Number(process.env.MAX_SPECIALISTS_PER_RUN ?? 3)),
    needsCustomerInput: missingFields.length > 0,
    missingFields: [...new Set(missingFields)],
    needsCustomerConfirmation: wantsReservation || wantsCatering
  };
}
