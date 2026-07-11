import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Call scripts — the words the agent/team uses on each call type.
 *
 * Requires a new table in convex/schema.ts (see README, "Schema patch"):
 *
 *   callScripts: defineTable({
 *     restaurantId: v.id("restaurants"),
 *     key: v.string(),
 *     title: v.string(),
 *     body: v.string(),
 *     updatedAt: v.number(),
 *   }).index("by_restaurant", ["restaurantId"]),
 *
 * `listScripts` returns saved scripts merged over sensible defaults, so the UI
 * renders immediately even before anything is saved.
 */

const DEFAULTS: { key: string; title: string; when: string; body: string }[] = [
  {
    key: "greeting",
    title: "Standard greeting",
    when: "Opens every inbound call",
    body: "Hi, thanks for calling Freekeh! This is the team — how can we help?",
  },
  {
    key: "reservations",
    title: "Taking a reservation",
    when: "Booking requests",
    body:
      "Happy to get you a table! Just a few things:\n\nDate & time —\n\nHow many guests? —\n\nAny special occasion? —\n\nPerfect, you\u2019re all set. A confirmation text is on its way!",
  },
  {
    key: "catering",
    title: "Catering & events",
    when: "Group orders and private events",
    body:
      "Oh, we\u2019d love to cater for you! A couple quick questions:\n\nWhat\u2019s the date? —\n\nHow many people? —\n\nBest number to reach you? —\n\nGreat — the team will text over a quote today.",
  },
  {
    key: "complaint",
    title: "Complaints & refunds",
    when: "Upset guest or order issue",
    body:
      "Oh no — I\u2019m so sorry. Let\u2019s make it right, right now.\n\nWould a refund, a remake, or a credit work best? —\n\nAnd I\u2019ll have a manager follow up with you personally.",
  },
  {
    key: "afterhours",
    title: "After hours",
    when: "Outside coverage hours",
    body:
      "Hi, thanks for calling Freekeh! We\u2019re closed right now, but I\u2019ll pass your message along.\n\nYour name —\n\nBest number —\n\nWhat\u2019s it about? —\n\nSomeone will call you back first thing!",
  },
];

export const listScripts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("callScripts").collect();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return DEFAULTS.map((d) => {
      const saved = byKey.get(d.key);
      return {
        key: d.key,
        title: d.title,
        when: d.when,
        body: saved?.body ?? d.body,
        updatedAt: saved?.updatedAt ?? null,
      };
    });
  },
});

export const saveScript = mutation({
  args: { key: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const restaurant = await ctx.db.query("restaurants").first();
    if (!restaurant) throw new Error("Run the seed mutation first — no restaurant found.");
    const existing = await ctx.db
      .query("callScripts")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();
    const row = existing.find((r) => r.key === args.key);
    const now = Date.now();
    if (row) {
      await ctx.db.patch(row._id, { title: args.title, body: args.body, updatedAt: now });
      return row._id;
    }
    return await ctx.db.insert("callScripts", {
      restaurantId: restaurant._id,
      key: args.key,
      title: args.title,
      body: args.body,
      updatedAt: now,
    });
  },
});
