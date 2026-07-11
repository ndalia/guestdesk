import { mutation } from "./_generated/server";

export const seedDemoRestaurant = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("restaurants").first();
    if (existing) return existing._id;
    const restaurantId = await ctx.db.insert("restaurants", {
      name: "Freekeh",
      address: "Mission District, San Francisco, CA",
      hours: {
        note: "Hours were not visible in the accessible site scrape. Keep this operator-updated before live use."
      },
      createdAt: now
    });
    await ctx.db.insert("restaurantPolicies", {
      restaurantId,
      reservationWindowDays: 45,
      maxAutomaticPartySize: 10,
      depositRequiredPartySize: 6,
      depositAmountCents: 2500,
      cancellationCutoffHours: 24,
      outsideCakeAllowed: null,
      outsideCakeFeeCents: null,
      allergyStatement:
        "Freekeh can record allergy notes for staff review, but the agent must not guarantee an allergen-free environment."
    });
    await ctx.db.insert("restaurantKnowledge", {
      restaurantId,
      category: "about",
      title: "Palestinian family owned",
      body: "Freekeh describes itself as a Palestinian family-owned restaurant.",
      source: "https://www.freekehsf.com/about",
      updatedAt: now
    });
    await ctx.db.insert("restaurantKnowledge", {
      restaurantId,
      category: "menu",
      title: "Middle Eastern tapas",
      body: "Freekeh describes the restaurant as authentic Middle Eastern tapas serving traditional Levantine foods.",
      source: "https://www.freekehsf.com/about",
      updatedAt: now
    });
    await ctx.db.insert("restaurantKnowledge", {
      restaurantId,
      category: "dietary",
      title: "Halal, vegan, and vegetarian friendly",
      body: "Freekeh states that it serves halal food and is vegan and vegetarian friendly.",
      source: "https://www.freekehsf.com/about",
      updatedAt: now
    });
    await ctx.db.insert("restaurantKnowledge", {
      restaurantId,
      category: "catering",
      title: "Catering packages",
      body: "Freekeh has a catering page and states that packages are priced per person.",
      source: "https://www.freekehsf.com/catering",
      updatedAt: now
    });
    await ctx.db.insert("restaurantKnowledge", {
      restaurantId,
      category: "private_events",
      title: "Private events inquiry",
      body: "Freekeh accepts private events inquiries with name, email, phone, message, and date fields.",
      source: "https://www.freekehsf.com/private-events",
      updatedAt: now
    });
    return restaurantId;
  }
});
