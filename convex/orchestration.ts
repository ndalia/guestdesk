import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getRestaurantBundle = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    const restaurant = await ctx.db.get(args.restaurantId);
    const policy = await ctx.db
      .query("restaurantPolicies")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .first();
    const knowledge = await ctx.db
      .query("restaurantKnowledge")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
    return { restaurant, policy, knowledge };
  }
});

export const getDefaultRestaurant = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("restaurants").first();
  }
});

export const getLatestRun = query({
  args: { conversationExternalId: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.conversationExternalId))
      .first();
    if (!conversation) return null;
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(1);
    return runs[0] ?? null;
  }
});

export const listRunTrace = query({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const tasks = await ctx.db.query("agentTasks").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect();
    const handoffs = await ctx.db.query("handoffs").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect();
    const results = await ctx.db.query("specialistResults").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect();
    const events = await ctx.db.query("runEvents").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect();
    return { run, tasks, handoffs, results, events };
  }
});

export const startRun = mutation({
  args: {
    conversationExternalId: v.string(),
    restaurantId: v.id("restaurants"),
    customerId: v.optional(v.id("customers")),
    message: v.string(),
    channel: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.conversationExternalId))
      .first();
    const conversationId =
      conversation?._id ??
      (await ctx.db.insert("conversations", {
        externalId: args.conversationExternalId,
        restaurantId: args.restaurantId,
        customerId: args.customerId,
        status: "collecting_information",
        memory: {},
        updatedAt: now
      }));
    await ctx.db.insert("messages", {
      conversationId,
      role: "customer",
      text: args.message,
      channel: args.channel,
      createdAt: now
    });
    const runId = await ctx.db.insert("agentRuns", {
      conversationId,
      restaurantId: args.restaurantId,
      status: "planning",
      customerRequest: args.message,
      modelCallCount: 0,
      estimatedCostCents: 0,
      startedAt: now
    });
    await ctx.db.insert("runEvents", {
      runId,
      type: "request_received",
      summary: "Voice request received and stored.",
      data: { conversationExternalId: args.conversationExternalId },
      createdAt: now
    });
    return { runId, conversationId };
  }
});

export const updateRunPlan = mutation({
  args: { runId: v.id("agentRuns"), plan: v.any(), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { plan: args.plan, status: args.status });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "plan_created",
      summary: `Manager selected ${args.plan.tasks.length} specialist task(s).`,
      data: args.plan,
      createdAt: Date.now()
    });
  }
});

export const recordTaskAndHandoff = mutation({
  args: {
    runId: v.id("agentRuns"),
    task: v.any(),
    handoff: v.any()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("agentTasks", {
      runId: args.runId,
      taskId: args.task.taskId,
      specialist: args.task.specialist,
      runtimeRoleName: args.task.runtimeRoleName,
      status: "started",
      objective: args.task.objective,
      startedAt: now
    });
    await ctx.db.insert("handoffs", {
      runId: args.runId,
      taskId: args.task.taskId,
      roleName: args.task.runtimeRoleName,
      payload: args.handoff,
      createdAt: now
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "handoff_created",
      summary: `${args.task.runtimeRoleName} received isolated context.`,
      data: { taskId: args.task.taskId, allowedTools: args.task.allowedTools },
      createdAt: now
    });
  }
});

export const recordSpecialistResult = mutation({
  args: { runId: v.id("agentRuns"), taskId: v.string(), roleName: v.string(), result: v.any(), attempt: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("specialistResults", {
      runId: args.runId,
      taskId: args.taskId,
      roleName: args.roleName,
      result: args.result,
      attempt: args.attempt,
      createdAt: now
    });
    const tasks = await ctx.db.query("agentTasks").withIndex("by_run", (q) => q.eq("runId", args.runId)).collect();
    const task = tasks.find((candidate) => candidate.taskId === args.taskId);
    if (task) await ctx.db.patch(task._id, { status: args.result.status, completedAt: now });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "specialist_completed",
      summary: `${args.roleName}: ${args.result.summary}`,
      data: args.result,
      createdAt: now
    });
  }
});

export const createPendingConfirmation = mutation({
  args: {
    runId: v.id("agentRuns"),
    conversationId: v.id("conversations"),
    restaurantId: v.id("restaurants"),
    customerId: v.optional(v.id("customers")),
    token: v.string(),
    action: v.string(),
    payload: v.any()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pendingId = await ctx.db.insert("pendingConfirmations", {
      ...args,
      status: "waiting_for_confirmation",
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000
    });
    await ctx.db.patch(args.runId, { status: "waiting_for_confirmation" });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "customer_confirmation_requested",
      summary: `Customer confirmation requested for ${args.action}.`,
      data: { pendingId, token: args.token },
      createdAt: now
    });
    return pendingId;
  }
});

export const consumePendingConfirmation = mutation({
  args: { runId: v.id("agentRuns"), token: v.string(), confirmed: v.boolean() },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingConfirmations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!pending || String(pending.runId) !== String(args.runId) || pending.status !== "waiting_for_confirmation") {
      throw new Error("Invalid or expired confirmation token");
    }
    if (pending.expiresAt < Date.now()) {
      await ctx.db.patch(pending._id, { status: "expired" });
      throw new Error("Confirmation token expired");
    }
    await ctx.db.patch(pending._id, { status: args.confirmed ? "confirmed" : "declined" });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: args.confirmed ? "action_proposed" : "run_completed",
      summary: args.confirmed ? "Customer confirmed proposed action." : "Customer declined proposed action.",
      data: { action: pending.action },
      createdAt: Date.now()
    });
    return pending;
  }
});

export const recordEvent = mutation({
  args: { runId: v.id("agentRuns"), type: v.string(), summary: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("runEvents", { ...args, createdAt: Date.now() });
  }
});

export const createReservation = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    customerId: v.optional(v.id("customers")),
    runId: v.id("agentRuns"),
    name: v.string(),
    contact: v.string(),
    date: v.string(),
    time: v.string(),
    partySize: v.number(),
    specialRequests: v.optional(v.string()),
    status: v.string(),
    confirmationToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const reservationId = await ctx.db.insert("reservations", { ...args, createdAt: now, updatedAt: now });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "reservation_created",
      summary: `Reservation saved as ${args.status}.`,
      data: { reservationId, partySize: args.partySize, date: args.date, time: args.time },
      createdAt: now
    });
    return reservationId;
  }
});

export const createReservationIfAvailable = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    customerId: v.optional(v.id("customers")),
    runId: v.id("agentRuns"),
    name: v.string(),
    contact: v.string(),
    date: v.string(),
    time: v.string(),
    partySize: v.number(),
    specialRequests: v.optional(v.string()),
    status: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slot = await ctx.db
      .query("reservationSlots")
      .withIndex("by_restaurant_date_time", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("date", args.date).eq("time", args.time)
      )
      .first();
    const capacity = slot?.capacity ?? 3;
    const existing = await ctx.db
      .query("reservations")
      .withIndex("by_restaurant_slot", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("date", args.date).eq("time", args.time)
      )
      .collect();
    const activeReservations = existing.filter((reservation) =>
      ["confirmed", "pending_payment", "pending_confirmation"].includes(reservation.status)
    );

    if (activeReservations.length >= capacity) {
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        type: "reservation_slot_full",
        summary: `Reservation slot ${args.date} at ${args.time} is full.`,
        data: { capacity, booked: activeReservations.length, date: args.date, time: args.time },
        createdAt: now
      });
      return {
        ok: false,
        reason: "slot_full",
        capacity,
        booked: activeReservations.length
      };
    }

    const reservationId = await ctx.db.insert("reservations", {
      ...args,
      createdAt: now,
      updatedAt: now
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "reservation_created",
      summary: `Reservation auto-created after slot check: ${activeReservations.length + 1}/${capacity} used.`,
      data: { reservationId, capacity, booked: activeReservations.length + 1, date: args.date, time: args.time },
      createdAt: now
    });
    return {
      ok: true,
      reservationId,
      capacity,
      booked: activeReservations.length + 1
    };
  }
});

export const createCateringLead = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    runId: v.id("agentRuns"),
    customerName: v.string(),
    contact: v.string(),
    eventType: v.string(),
    dateRange: v.string(),
    guestCount: v.number(),
    notes: v.string()
  },
  handler: async (ctx, args) => {
    const leadId = await ctx.db.insert("cateringLeads", { ...args, status: "new", createdAt: Date.now() });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "catering_lead_created",
      summary: `Catering lead saved for ${args.guestCount} guests.`,
      data: { leadId },
      createdAt: Date.now()
    });
    return leadId;
  }
});

export const saveSearchResult = mutation({
  args: { restaurantId: v.id("restaurants"), runId: v.id("agentRuns"), query: v.string(), response: v.string(), sources: v.array(v.any()) },
  handler: async (ctx, args) => {
    const resultId = await ctx.db.insert("searchResults", { ...args, createdAt: Date.now() });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "linkup_search_completed",
      summary: "Current local information search completed.",
      data: { resultId, query: args.query, sources: args.sources },
      createdAt: Date.now()
    });
    return resultId;
  }
});

export const createCheckoutSession = mutation({
  args: {
    reservationId: v.id("reservations"),
    runId: v.id("agentRuns"),
    providerSessionId: v.string(),
    checkoutUrl: v.string(),
    amountCents: v.number(),
    metadata: v.any()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const checkoutId = await ctx.db.insert("checkoutSessions", {
      reservationId: args.reservationId,
      runId: args.runId,
      provider: "dodo",
      providerSessionId: args.providerSessionId,
      checkoutUrl: args.checkoutUrl,
      amountCents: args.amountCents,
      status: "open",
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now
    });
    await ctx.db.patch(args.reservationId, { status: "pending_payment", updatedAt: now });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: "checkout_created",
      summary: "Dodo reservation deposit checkout created.",
      data: { checkoutId, checkoutUrl: args.checkoutUrl, amountCents: args.amountCents },
      createdAt: now
    });
    return checkoutId;
  }
});

export const completeRun = mutation({
  args: { runId: v.id("agentRuns"), status: v.string(), modelCallCount: v.number(), estimatedCostCents: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      modelCallCount: args.modelCallCount,
      estimatedCostCents: args.estimatedCostCents,
      completedAt: Date.now()
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      type: args.status === "failed" ? "run_failed" : "run_completed",
      summary: `Run finished with status ${args.status}.`,
      data: { modelCallCount: args.modelCallCount, estimatedCostCents: args.estimatedCostCents },
      createdAt: Date.now()
    });
  }
});
