# GuestDesk console — real implementation

Production Next.js + Convex code for the owner-facing console from the design prototype, built
against your `ndalia/guestdesk` repo. Five reactive, drop-in screens plus the queries that back
them. Replaces the raw JSON trace in `app/page.tsx`.

## Files

```
convex/dashboard.ts            # queries: listRecentRuns, listReservations,
                               #          listCateringLeads, listInteractions, listKnowledge
convex/scripts.ts              # query listScripts + mutation saveScript (needs callScripts table)
app/_console.tsx               # shared shell: Convex provider, palette, fonts, sidebar nav, Badge
app/agent-activity/page.tsx    # /agent-activity  — plan → timeline → outcome → approve/decline
app/reservations/page.tsx      # /reservations    — today's book + covers
app/catering/page.tsx          # /catering        — New / Quoted / Confirmed pipeline
app/interactions/page.tsx      # /interactions    — message log
app/call-scripts/page.tsx      # /call-scripts    — editable, auto-saving scripts
```

Copy each to the same path in your repo.

## Install

1. Copy the files in.
2. **Add the `callScripts` table** (see Schema patch below) — only new screen that needs storage.
3. Regenerate Convex types so `api.dashboard` / `api.scripts` exist:
   ```bash
   npm run convex:dev      # or npx convex dev
   ```
4. Ensure `NEXT_PUBLIC_CONVEX_URL` is set, then:
   ```bash
   npm run dev
   ```
5. Open `/agent-activity`, `/reservations`, `/catering`, `/interactions`, `/call-scripts`.

Fonts load via `next/font/google`; styling is inline — no global-CSS or CSS-module setup.

## Schema patch (`convex/schema.ts`)

Add one table for editable scripts (everything else reads existing tables):

```ts
callScripts: defineTable({
  restaurantId: v.id("restaurants"),
  key: v.string(),
  title: v.string(),
  body: v.string(),
  updatedAt: v.number(),
}).index("by_restaurant", ["restaurantId"]),
```

`listScripts` returns saved rows merged over sensible defaults, so the screen works before anything
is saved; `saveScript` upserts by `key` on blur.

## Backend mapping

| Screen | Reads | Writes |
|--------|-------|--------|
| Agent activity | `dashboard.listRecentRuns` + `orchestration.listRunTrace` | Approve/Decline → `POST /api/chat/confirm` → `confirmGuestAction()` (books reservation + Dodo deposit) |
| Reservations | `dashboard.listReservations` (`reservations`) | — |
| Catering | `dashboard.listCateringLeads` (`cateringLeads`, grouped by status) | — |
| Interactions | `dashboard.listInteractions` (`messages` + conversation) | — |
| Call scripts | `scripts.listScripts` (`callScripts`) | `scripts.saveScript` |

All screens use Convex `useQuery`, so they update live as the agent works — no polling.

## Notes

- Lists cap at 25–100 rows; add pagination when you outgrow that.
- `reservations` has only a `by_customer` index today; `listReservations` uses a bounded
  `.order("desc").take()` scan, which is fine at demo scale. Add a `by_restaurant` index + filter
  for production multi-tenant use.
- The sidebar in `_console.tsx` links all five screens. Point your app's home (`app/page.tsx`) at
  `/agent-activity` (redirect or move) when you're ready to retire the JSON trace.
- Status/label colors live in `_console.tsx` (`statusMeta`) and `app/agent-activity/page.tsx`
  (event tags) — extend the maps to theme any new statuses/event types.

## Design reference

Full interactive prototype: `Inbound Console.dc.html` in the design project (warm olive/cream,
Marcellus headings). These components match it.
