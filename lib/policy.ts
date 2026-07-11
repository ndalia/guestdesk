import type { RestaurantPolicy } from "./types";

export const PROHIBITED_ACTIONS = [
  "refunds",
  "compensation",
  "custom catering quotes",
  "allergy guarantees",
  "policy exceptions",
  "payment disputes",
  "negotiated discounts"
];

export function reservationRequiresDeposit(policy: RestaurantPolicy, partySize: number) {
  return Boolean(
    policy.depositRequiredPartySize &&
      policy.depositAmountCents &&
      partySize >= policy.depositRequiredPartySize
  );
}

export function canAutomaticallyReserve(policy: RestaurantPolicy, partySize: number) {
  return partySize <= policy.maxAutomaticPartySize;
}

export function isUnsupportedRequest(message: string) {
  return /\b(refund|compensation|free meal|discount|payment dispute|chargeback)\b/i.test(message);
}

export function isAllergyGuaranteeRequest(message: string) {
  return /\b(guarantee|promise|ensure)\b.*\b(allergen|allergy|peanut|gluten|dairy)\b/i.test(message);
}
