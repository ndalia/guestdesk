# guestops-agency

Autonomous voice-based restaurant guest operations agency for a two-hour hackathon demo.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run convex:dev
npm run seed
npm run dev
```

## ElevenLabs webhook tools

Register these HTTPS endpoints with ElevenLabs and pass `x-elevenlabs-signature` or `authorization: Bearer $ELEVENLABS_WEBHOOK_SECRET`.

- `POST /api/voice/process` as `process_guest_request`
- `POST /api/voice/confirm` as `confirm_guest_action`

## Cloudflare deploy

```bash
npm run build
npx @cloudflare/next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name guestops-agency
```

Convex remains the primary backend store. Set all variables from `.env.example` in Cloudflare Pages and Convex.
