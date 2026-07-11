export type SpecialistKind = "reservation" | "restaurant_knowledge" | "catering_events";

export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
};

export type RunStatus =
  | "collecting_information"
  | "planning"
  | "agents_working"
  | "waiting_for_customer"
  | "waiting_for_confirmation"
  | "pending_payment"
  | "executing"
  | "completed"
  | "partially_completed"
  | "declined_safely"
  | "failed";

export type RestaurantPolicy = {
  reservationWindowDays: number;
  maxAutomaticPartySize: number;
  depositRequiredPartySize: number | null;
  depositAmountCents: number | null;
  cancellationCutoffHours: number;
  outsideCakeAllowed: boolean | null;
  outsideCakeFeeCents: number | null;
  allergyStatement: string;
};

export type ManagerPlan = {
  runId: string;
  interpretedGoal: string;
  tasks: Array<{
    taskId: string;
    specialist: SpecialistKind;
    runtimeRoleName: string;
    objective: string;
    dependencies: string[];
    allowedTools: string[];
    successCriteria: string[];
  }>;
  needsCustomerInput: boolean;
  missingFields: string[];
  needsCustomerConfirmation: boolean;
};

export type HermesHandoff = {
  runId: string;
  taskId: string;
  roleName: string;
  goal: string;
  context: {
    customerRequest: string;
    knownCustomerFields: Record<string, unknown>;
    relevantConversationMemory: Record<string, unknown>;
    restaurantProfile: Record<string, unknown>;
    relevantPolicies: Record<string, unknown>;
    dependencyResults: Record<string, unknown>[];
    expertise: string;
    allowedTools: string[];
    prohibitedActions: string[];
    successCriteria: string[];
    requiredOutput: Record<string, unknown>;
  };
};

export type SpecialistResult = {
  taskId: string;
  roleName: string;
  status: "completed" | "needs_customer_input" | "needs_revision" | "declined_safely" | "failed";
  summary: string;
  facts: Array<{ claim: string; sourceType: string; sourceId: string }>;
  proposedActions: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    evidenceSourceIds: string[];
    needsCustomerConfirmation: boolean;
  }>;
  missingFields: string[];
  unsupportedRequests: string[];
  confidence: number;
};

export type VoiceResponse = {
  runId: string;
  status: "needs_customer_input" | "needs_confirmation" | "completed" | "partially_completed" | "declined_safely" | "failed";
  spokenResponse: string;
  missingFields: string[];
  confirmationToken?: string;
  confirmationAction?: string;
  checkoutUrl?: string;
  completedActions: Array<Record<string, unknown> & { emailDraft?: EmailDraft }>;
};

export type ProcessGuestRequestInput = {
  conversationId: string;
  restaurantId: string;
  customerId?: string | null;
  message: string;
  knownFields?: Record<string, unknown>;
  channel?: "voice" | "web";
};

export type ConfirmGuestActionInput = {
  conversationId: string;
  runId: string;
  confirmationToken: string;
  confirmed: boolean;
};
