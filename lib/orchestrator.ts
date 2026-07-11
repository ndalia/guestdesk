import type { ConfirmGuestActionInput, ProcessGuestRequestInput, RestaurantPolicy, SpecialistResult, VoiceResponse } from "./types";
import { api, getConvexClient } from "./convexHttp";
import { extractFields, planGuestRequest } from "./planner";
import { reservationRequiresDeposit } from "./policy";
import { buildHandoff, runLocalSpecialist } from "./specialists";
import { delegateWithHermes } from "./hermes";
import { searchCurrentLocalInfo } from "./linkup";
import { createReservationDepositCheckout } from "./dodo";

type ConvexId = any;

function makeToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

function asPolicy(value: unknown): RestaurantPolicy {
  if (!value) throw new Error("Restaurant policy is missing. Run the seed mutation first.");
  return value as RestaurantPolicy;
}

export async function processGuestRequest(input: ProcessGuestRequestInput): Promise<VoiceResponse> {
  const convex = getConvexClient();
  const customerId = input.customerId ? (input.customerId as ConvexId) : undefined;
  let restaurantId = input.restaurantId as ConvexId;
  if (!restaurantId || restaurantId === "default" || restaurantId === "freekeh") {
    const restaurant = await convex.query(api.orchestration.getDefaultRestaurant, {});
    if (!restaurant?._id) throw new Error("No restaurant found. Run npm run seed first.");
    restaurantId = restaurant._id;
  }

  const started = await convex.mutation(api.orchestration.startRun, {
    conversationExternalId: input.conversationId,
    restaurantId,
    customerId,
    message: input.message,
    channel: input.channel ?? "voice"
  });
  const runId = started.runId as ConvexId;
  const bundle = await convex.query(api.orchestration.getRestaurantBundle, { restaurantId });
  const policy = asPolicy(bundle.policy);
  const restaurant = bundle.restaurant ?? {};
  const knowledge = bundle.knowledge ?? [];
  const fields = extractFields(input.message, input.knownFields ?? {});
  const plan = planGuestRequest(String(runId), input.message, fields);

  if (plan.tasks.length === 0) {
    await convex.mutation(api.orchestration.completeRun, {
      runId,
      status: "declined_safely",
      modelCallCount: 0,
      estimatedCostCents: 0
    });
    return {
      runId: String(runId),
      status: "declined_safely",
      spokenResponse: "I cannot complete that request, but I can help with reservations, restaurant questions, catering, or private event intake.",
      missingFields: [],
      completedActions: []
    };
  }

  if (plan.needsCustomerInput) {
    await convex.mutation(api.orchestration.updateRunPlan, { runId, plan, status: "waiting_for_customer" });
    await convex.mutation(api.orchestration.completeRun, {
      runId,
      status: "waiting_for_customer",
      modelCallCount: 0,
      estimatedCostCents: 0
    });
    return {
      runId: String(runId),
      status: "needs_customer_input",
      spokenResponse: `I can help with that. Please provide ${plan.missingFields.join(", ")}.`,
      missingFields: plan.missingFields,
      completedActions: []
    };
  }

  await convex.mutation(api.orchestration.updateRunPlan, { runId, plan, status: "agents_working" });
  let modelCallCount = 0;

  const delegated = await Promise.all(
    plan.tasks.map(async (task) => {
      const handoff = buildHandoff({
        runId: String(runId),
        task,
        customerRequest: input.message,
        knownFields: fields,
        restaurant: restaurant as Record<string, unknown>,
        policy,
        knowledge
      });
      await convex.mutation(api.orchestration.recordTaskAndHandoff, { runId, task, handoff });
      await convex.mutation(api.orchestration.recordEvent, {
        runId,
        type: "specialist_planned",
        summary: `Manager selected ${task.runtimeRoleName} for this request.`,
        data: {
          taskId: task.taskId,
          specialist: task.specialist,
          objective: task.objective,
          expertise: handoff.context.expertise,
          allowedTools: task.allowedTools
        }
      });
      const result = await delegateWithHermes(handoff, () => runLocalSpecialist(handoff, knowledge));
      modelCallCount += result.modelCalls;
      if (result.usedHermes) {
        await convex.mutation(api.orchestration.recordEvent, {
          runId,
          type: "specialist_spawned",
          summary: `Hermes spawned ${task.runtimeRoleName} with isolated handoff context.`,
          data: { taskId: task.taskId, usedHermes: true, expertise: handoff.context.expertise }
        });
      }
      await convex.mutation(api.orchestration.recordEvent, {
        runId,
        type: "specialist_started",
        summary: result.usedHermes
          ? `${task.runtimeRoleName} ran through Hermes delegation.`
          : `${task.runtimeRoleName} ran through local deterministic fallback: ${result.fallbackReason ?? "Hermes did not return a usable delegation."}`,
        data: {
          taskId: task.taskId,
          usedHermes: result.usedHermes,
          modelCalls: result.modelCalls,
          fallbackReason: result.fallbackReason
        }
      });
      await convex.mutation(api.orchestration.recordSpecialistResult, {
        runId,
        taskId: task.taskId,
        roleName: task.runtimeRoleName,
        result: result.result,
        attempt: 1
      });
      return result.result;
    })
  );

  const completedActions: Record<string, unknown>[] = [];
  const spokenParts: string[] = [];
  let confirmationToken: string | undefined;
  let checkoutUrl: string | undefined;

  for (const result of delegated) {
    spokenParts.push(result.summary);
    for (const action of result.proposedActions) {
      if (action.toolName === "search_current_local_info") {
        await convex.mutation(api.orchestration.recordEvent, {
          runId,
          type: "linkup_search_started",
          summary: "Starting current parking search through Linkup.",
          data: action.arguments
        });
        const live = await searchCurrentLocalInfo({
          query: String(action.arguments.query),
          location: String((restaurant as any).address ?? "Mission District, San Francisco")
        });
        await convex.mutation(api.orchestration.saveSearchResult, {
          restaurantId,
          runId,
          query: String(action.arguments.query),
          response: live.answer,
          sources: live.sources
        });
        completedActions.push({ toolName: "search_current_local_info", answer: live.answer, sources: live.sources });
        spokenParts.push(live.answer);
      }
      if (action.toolName === "create_catering_lead") {
        const args = action.arguments as any;
        const leadId = await convex.mutation(api.orchestration.createCateringLead, {
          restaurantId,
          runId,
          customerName: String(args.customerName),
          contact: String(args.contact),
          eventType: String(args.eventType),
          dateRange: String(args.dateRange),
          guestCount: Number(args.guestCount),
          notes: String(args.notes ?? input.message)
        });
        completedActions.push({ toolName: "create_catering_lead", leadId });
      }
      if (action.toolName === "create_reservation") {
        const args = action.arguments as any;
        if ((input.channel ?? "voice") === "web") {
          const reservation = await convex.mutation(api.orchestration.createReservationIfAvailable, {
            restaurantId,
            customerId,
            runId,
            name: String(args.name),
            contact: String(args.contact),
            date: String(args.date),
            time: String(args.time),
            partySize: Number(args.partySize),
            specialRequests: args.specialRequests ? String(args.specialRequests) : undefined,
            status: "confirmed"
          });
          if (reservation.ok) {
            completedActions.push({
              toolName: "create_reservation",
              reservationId: reservation.reservationId,
              slotUsage: `${reservation.booked}/${reservation.capacity}`
            });
            spokenParts.push(
              `I booked the reservation in the demo database. That slot is now ${reservation.booked} of ${reservation.capacity} booked.`
            );
          } else {
            completedActions.push({
              toolName: "check_availability",
              status: "slot_full",
              date: args.date,
              time: args.time
            });
            spokenParts.push(
              `I checked the simple reservation database and ${args.date} at ${args.time} is full, so I did not create the reservation.`
            );
          }
        } else {
          confirmationToken = makeToken();
          await convex.mutation(api.orchestration.createPendingConfirmation, {
            runId,
            conversationId: started.conversationId,
            restaurantId,
            customerId,
            token: confirmationToken,
            action: "create_reservation",
            payload: action.arguments
          });
        }
      }
    }
  }

  if (confirmationToken) {
    return {
      runId: String(runId),
      status: "needs_confirmation",
      spokenResponse: `${spokenParts.join(" ")} Please confirm that you want me to book this reservation.`,
      missingFields: [],
      confirmationToken,
      checkoutUrl,
      completedActions
    };
  }

  await convex.mutation(api.orchestration.completeRun, {
    runId,
    status: completedActions.length ? "completed" : "declined_safely",
    modelCallCount,
    estimatedCostCents: modelCallCount
  });
  return {
    runId: String(runId),
    status: completedActions.length || delegated.some((result) => result.status === "completed") ? "completed" : "declined_safely",
    spokenResponse: spokenParts.join(" ") || "I completed the supported parts of that request.",
    missingFields: [],
    completedActions
  };
}

export async function confirmGuestAction(input: ConfirmGuestActionInput): Promise<VoiceResponse> {
  const convex = getConvexClient();
  const pending = await convex.mutation(api.orchestration.consumePendingConfirmation, {
    runId: input.runId as ConvexId,
    token: input.confirmationToken,
    confirmed: input.confirmed
  });
  if (!input.confirmed) {
    await convex.mutation(api.orchestration.completeRun, {
      runId: input.runId as ConvexId,
      status: "completed",
      modelCallCount: 0,
      estimatedCostCents: 0
    });
    return {
      runId: input.runId,
      status: "completed",
      spokenResponse: "No problem. I did not make the reservation.",
      missingFields: [],
      completedActions: []
    };
  }

  const policyBundle = await convex.query(api.orchestration.getRestaurantBundle, { restaurantId: pending.restaurantId });
  const policy = asPolicy(policyBundle.policy);
  const args = pending.payload as any;
  const partySize = Number(args.partySize);
  const needsDeposit = reservationRequiresDeposit(policy, partySize);
  const reservationId = await convex.mutation(api.orchestration.createReservation, {
    restaurantId: pending.restaurantId,
    customerId: pending.customerId,
    runId: input.runId as ConvexId,
    name: String(args.name),
    contact: String(args.contact),
    date: String(args.date),
    time: String(args.time),
    partySize,
    specialRequests: args.specialRequests ? String(args.specialRequests) : undefined,
    status: needsDeposit ? "pending_payment" : "confirmed",
    confirmationToken: input.confirmationToken
  });

  let checkoutUrl = "";
  if (needsDeposit) {
    const checkout = await createReservationDepositCheckout({
      reservationId: String(reservationId),
      customerEmail: String(args.contact).includes("@") ? String(args.contact) : undefined,
      amountCents: Number(policy.depositAmountCents),
      metadata: { reservationId: String(reservationId), runId: input.runId }
    });
    if (checkout.checkoutUrl) {
      checkoutUrl = checkout.checkoutUrl;
      await convex.mutation(api.orchestration.createCheckoutSession, {
        reservationId,
        runId: input.runId as ConvexId,
        providerSessionId: checkout.providerSessionId,
        checkoutUrl: checkout.checkoutUrl,
        amountCents: Number(policy.depositAmountCents),
        metadata: { configured: checkout.configured }
      });
    } else {
      await convex.mutation(api.orchestration.recordEvent, {
        runId: input.runId as ConvexId,
        type: "checkout_created",
        summary: "Deposit is required, but Dodo credentials are not configured yet.",
        data: { reservationId, amountCents: policy.depositAmountCents }
      });
    }
  }

  await convex.mutation(api.orchestration.completeRun, {
    runId: input.runId as ConvexId,
    status: needsDeposit ? "pending_payment" : "completed",
    modelCallCount: 0,
    estimatedCostCents: 0
  });
  return {
    runId: input.runId,
    status: "completed",
    spokenResponse: needsDeposit
      ? checkoutUrl
        ? `Your reservation is held pending a $${Number(policy.depositAmountCents) / 100} deposit. Here is the checkout link.`
        : `Your reservation is held pending a $${Number(policy.depositAmountCents) / 100} deposit. The Dodo checkout credentials still need to be configured.`
      : "Your reservation is confirmed.",
    missingFields: [],
    checkoutUrl: checkoutUrl || undefined,
    completedActions: [{ toolName: "create_reservation", reservationId }]
  };
}
