import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Dashboard-facing read models for the owner console screens.
 * All queries read existing tables only (no schema changes) and are reactive.
 */

// ---- Agent activity ---------------------------------------------------------
export const listRecentRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("agentRuns").order("desc").take(args.limit ?? 25);
    return Promise.all(
      runs.map(async (run) => {
        const conversation = await ctx.db.get(run.conversationId);
        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", run.conversationId))
          .order("desc")
          .take(1);
        const pending = await ctx.db
          .query("pendingConfirmations")
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .collect();
        const waiting = pending.find((p) => p.status === "waiting_for_confirmation") ?? null;
        return {
          _id: run._id,
          status: run.status,
          customerRequest: run.customerRequest,
          interpretedGoal: run.plan?.interpretedGoal ?? run.customerRequest,
          taskCount: run.plan?.tasks?.length ?? 0,
          modelCallCount: run.modelCallCount,
          startedAt: run.startedAt,
          completedAt: run.completedAt ?? null,
          channel: lastMessage[0]?.channel ?? "voice",
          conversationExternalId: conversation?.externalId ?? "",
          pendingConfirmation: waiting
            ? { token: waiting.token, action: waiting.action, payload: waiting.payload }
            : null,
        };
      })
    );
  },
});

// ---- Reservations -----------------------------------------------------------
export const listReservations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("reservations").order("desc").take(args.limit ?? 100);
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      contact: r.contact,
      date: r.date,
      time: r.time,
      partySize: r.partySize,
      specialRequests: r.specialRequests ?? "",
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
});

// ---- Catering leads ---------------------------------------------------------
export const listCateringLeads = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("cateringLeads").order("desc").take(args.limit ?? 100);
    return rows.map((r) => ({
      _id: r._id,
      customerName: r.customerName,
      contact: r.contact,
      eventType: r.eventType,
      dateRange: r.dateRange,
      guestCount: r.guestCount,
      notes: r.notes,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
});

// ---- Interactions (message log) --------------------------------------------
export const listInteractions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("messages").order("desc").take(args.limit ?? 60);
    return Promise.all(
      rows.map(async (m) => {
        const conversation = await ctx.db.get(m.conversationId);
        return {
          _id: m._id,
          role: m.role,
          text: m.text,
          channel: m.channel,
          createdAt: m.createdAt,
          conversation: conversation?.externalId ?? "",
        };
      })
    );
  },
});

// ---- Knowledge (used by Settings / Scripts context) ------------------------
export const listKnowledge = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("restaurantKnowledge").order("desc").take(100);
    return rows.map((r) => ({
      _id: r._id,
      category: r.category,
      title: r.title,
      body: r.body,
      source: r.source,
    }));
  },
});
