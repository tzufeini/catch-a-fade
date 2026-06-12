# Pitchcraft — AI marketing-copy generator

A standalone, monetizable micro-SaaS that turns a one-line product description into
ship-ready **cold emails, landing headlines, product descriptions, ads, LinkedIn and X posts**.

- **Frontend:** `pitchcraft/index.html` — self-contained (HTML + CSS + JS, no build step).
- **Backend:** one route added to the repo's `server.js` → `POST /api/pitch`, which calls Claude.
- **Live at:** `/pitchcraft/` once the Node server is running (`npm start`).

## Business model (how it makes money)

| Tier | Price | Limit |
|------|-------|-------|
| Free | $0 | 3 generations / day (tracked in the browser) |
| Pro | $19 / mo | Unlimited + 3 variations + saved campaigns |
| Team | $49 / mo | 5 seats + brand voices + API |

After 3 free generations the paywall modal appears. **One thousand Pro subscribers ≈ $228k/yr;
~370 Team customers gets you to seven figures of ARR** — the app is the engine, distribution is the work.

## Go live in 3 steps

1. **Add the AI key.** Set `ANTHROPIC_API_KEY` (env var on the host, or `keys.local.json` for local dev).
   Without it the app still works — it falls back to a built-in *sample* generator labelled "SAMPLE".
2. **Take real payments.** Create two Stripe Payment Links (dashboard.stripe.com → Payment Links),
   then paste them into `CHECKOUT_URLS` near the top of the `<script>` in `index.html`:
   ```js
   var CHECKOUT_URLS = { pro:"https://buy.stripe.com/...", team:"https://buy.stripe.com/..." };
   ```
   Until then, checkout runs in **demo mode** (unlocks Pro locally so the product is fully explorable).
3. **Deploy.** The repo's `render.yaml` already deploys `server.js`; the app is served at `/pitchcraft/`.

## Local dev

```bash
npm start                 # serves the whole repo, incl. /pitchcraft/
# open http://localhost:3789/pitchcraft/
```

## Notes / next steps to harden for production

- Free quota is client-side (good enough to demo; move to server + accounts before it's load-bearing).
- Gate `/api/pitch` behind real auth + per-user usage once you have sign-in.
- Use Stripe webhooks to flip an account to Pro instead of the demo's localStorage flag.
