import { mutation } from "./_generated/server";

export const seedDemoRestaurant = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("restaurants").first();
    const restaurantId =
      existing?._id ??
      (await ctx.db.insert("restaurants", {
        name: "Freekeh",
        address: "Mission District, San Francisco, CA",
        hours: {
          note: "Hours were not visible in the accessible site scrape. Keep this operator-updated before live use."
        },
        createdAt: now
      }));

    const existingPolicy = await ctx.db
      .query("restaurantPolicies")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .first();
    if (!existingPolicy) {
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
    }

    const existingKnowledge = await ctx.db
      .query("restaurantKnowledge")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const existingTitles = new Set(existingKnowledge.map((item) => item.title));
    const knowledge = [
      {
        category: "about",
        title: "Palestinian family owned",
        body: "Freekeh describes itself as a Palestinian family-owned restaurant.",
        source: "https://www.freekehsf.com/about"
      },
      {
        category: "menu",
        title: "Middle Eastern tapas",
        body: "Freekeh describes the restaurant as authentic Middle Eastern tapas serving traditional Levantine foods.",
        source: "https://www.freekehsf.com/about"
      },
      {
        category: "menu",
        title: "Mock menu highlights",
        body:
          "Demo menu highlights: freekeh grain bowls, mezze plates, hummus, baba ghanoush, falafel, roasted cauliflower, chicken skewers, lamb kofta, fattoush salad, baklava, mint lemonade, and Arabic coffee.",
        source: "operator_mock_menu_seed"
      },
      {
        category: "menu",
        title: "Mock vegan and vegetarian options",
        body:
          "Demo vegetarian and vegan-friendly options include hummus, baba ghanoush, falafel, roasted cauliflower, fattoush salad, lentil soup, and freekeh vegetable bowls. Guests should confirm preparation details with staff for strict dietary needs.",
        source: "operator_mock_menu_seed"
      },
      {
        category: "dietary",
        title: "Halal, vegan, and vegetarian friendly",
        body: "Freekeh states that it serves halal food and is vegan and vegetarian friendly.",
        source: "https://www.freekehsf.com/about"
      },
      {
        category: "allergens",
        title: "Mock allergen guidance",
        body:
          "Demo allergen guidance: common allergens that may appear in the kitchen include sesame, wheat/gluten, dairy, tree nuts, eggs, and legumes. The agent may record allergy notes and suggest asking staff, but must never guarantee allergen-free preparation.",
        source: "operator_mock_allergen_seed"
      },
      {
        category: "allergens",
        title: "Mock gluten-aware guidance",
        body:
          "Demo gluten-aware guidance: rice, salads without pita, and some grilled proteins may be suitable starting points, but cross-contact is possible and staff confirmation is required.",
        source: "operator_mock_allergen_seed"
      },
      {
        category: "catering",
        title: "Catering packages",
        body: "Freekeh has a catering page and states that packages are priced per person.",
        source: "https://www.freekehsf.com/catering"
      },
      {
        category: "private_events",
        title: "Private events inquiry",
        body: "Freekeh accepts private events inquiries with name, email, phone, message, and date fields.",
        source: "https://www.freekehsf.com/private-events"
      }
    ];

    for (const item of knowledge) {
      if (!existingTitles.has(item.title)) {
        await ctx.db.insert("restaurantKnowledge", {
          restaurantId,
          ...item,
          updatedAt: now
        });
      }
    }

    const slotSeeds = [
      { date: "tomorrow", time: "7", capacity: 3, note: "Hackathon demo dinner slot" },
      { date: "tomorrow", time: "7 pm", capacity: 3, note: "Hackathon demo dinner slot" },
      { date: "tomorrow", time: "7:30 pm", capacity: 2, note: "Nearby alternate" },
      { date: "tomorrow", time: "8", capacity: 2, note: "Nearby alternate" }
    ];
    for (const slot of slotSeeds) {
      const existingSlot = await ctx.db
        .query("reservationSlots")
        .withIndex("by_restaurant_date_time", (q) =>
          q.eq("restaurantId", restaurantId).eq("date", slot.date).eq("time", slot.time)
        )
        .first();
      if (!existingSlot) {
        await ctx.db.insert("reservationSlots", {
          restaurantId,
          ...slot,
          updatedAt: now
        });
      }
    }
    return restaurantId;
  }
});
