# Catch a Fade — Complete Project Handoff (A→Z)

Everything needed to rebuild / continue this app on another machine. Pulled directly from the source on 2026‑06‑28.

---

## 1. What the app is

**Catch a Fade** ("CAF") — an Uber‑style, on‑demand barber marketplace. Verified barbers travel to the customer. The platform takes a fee (Uber‑identical economics). Customer requests a cut → a nearby verified barber accepts → live tracking as they travel → arrival PIN → pay through the app → rate/tip.

- **Brand:** Catch a Fade · short mark **CAF**
- **App ID / bundle:** `com.catchafade.app`
- **Version:** marketing 1.0 (web app shows "v2.4.0 · interactive prototype" in‑app)
- **Platforms:** native **iOS** (Capacitor) + a web build (same codebase)

---

## 2. Architecture & stack

| Layer | Tech |
|---|---|
| **App UI** | A single self‑contained file: **`index.html`** (~5,600 lines — all HTML + CSS + JS inline). No framework. Vanilla JS, screen‑stack navigation. |
| **Native shell** | **Capacitor 8.4.0** wraps `index.html` into a native iOS app (WKWebView). SPM‑based plugins (not CocoaPods). |
| **Native bridge** | `src/native.js` → bundled with **esbuild** → `native-bridge.js`. Inert on web, activates inside iOS via an `html.native` class. Handles status bar, splash, keyboard, haptics, geolocation, push, social login. |
| **Backend API** | **`server.js`** — tiny Node HTTP server (port 3789). Endpoints for Stripe, Supabase config, AI support chat, push registration, email. |
| **Database / Auth** | **Supabase** (Postgres + Auth + Realtime + Storage + RLS). |
| **Payments** | **Stripe** + Stripe Connect (destination charges, platform fee on top). |
| **Maps** | **Google Maps JS API** (loaded dynamically, `places` lib) + **Leaflet** (tile map). |
| **Email** | **Resend** (SMTP + API) — sign‑in codes. EmailJS also loaded client‑side (legacy). |
| **AI chat** | **Anthropic** API — in‑app "CAF Support" assistant. |
| **Deploy (API)** | **Render** (`render.yaml`) → `https://catch-a-fade.onrender.com`. |

---

## 3. Repository / file structure

```
Catch a Fade/
├─ index.html               ← THE APP (UI + logic, inline). Edit this.
├─ server.js                ← Node backend (Stripe, Supabase, AI, push, email)
├─ native-bridge.js         ← built artifact (do not edit; comes from src/native.js)
├─ apple-touch-icon.png
├─ package.json             ← scripts + deps
├─ package-lock.json
├─ capacitor.config.json    ← Capacitor config (appId, splash, keyboard…)
├─ render.yaml              ← Render deploy + env var declarations
├─ keys.local.json          ← *** SECRETS — git-ignored. NOT in the repo. ***
├─ src/
│   └─ native.js            ← Capacitor bridge source (esbuild → native-bridge.js)
├─ scripts/
│   ├─ make-source-assets.mjs  ← generates app icon + splash source PNGs
│   ├─ build-www.mjs           ← assembles the www/ bundle for Capacitor
│   └─ seed-barbers.mjs        ← seeds 4 test barbers into Supabase
├─ supabase/
│   └─ schema.sql           ← full DB schema + RLS + triggers (run once in SQL editor)
├─ ios/                     ← generated Xcode project (Capacitor)
│   └─ App/
│      ├─ App.xcodeproj
│      ├─ App/Assets.xcassets/AppIcon.appiconset   ← home-screen icon
│      ├─ App/Assets.xcassets/Splash.imageset      ← launch splash
│      ├─ App/public/index.html  ← the COPY the native app actually loads
│      └─ App/Base.lproj/LaunchScreen.storyboard
├─ www/                     ← Capacitor web bundle (generated; gitignored-ish)
├─ assets/                  ← generated icon/splash source PNGs
├─ IOS_APP_STORE.md         ← App Store submission handoff guide
├─ WHAT_WE_NEED.md          ← checklist of what's missing to ship
└─ PROJECT_HANDOFF.md       ← this file
```

> **Important duplicate:** the native app does **not** read the root `index.html` — it loads `ios/App/App/public/index.html`. The build pipeline copies root → `www/` → `public/`. Always run the sync pipeline (§7) after editing.

---

## 4. Setup on a NEW machine (do this first)

```bash
# 1. Prereqs: Node ≥20, Xcode (with Command Line Tools), CocoaPods not required.
# 2. Clone the repo (git carries everything EXCEPT secrets + node_modules + build output)
git clone <your-repo-url> && cd "Catch a Fade"

# 3. Install dependencies
npm install

# 4. Recreate the secrets file (see §5 — copy it securely from the old machine)
#    Create keys.local.json in the repo root.

# 5. Build the web bundle + native bridge, sync into iOS
npm run build
npx cap sync ios

# 6. Open in Xcode (or build from CLI)
npx cap open ios
```

To run the API backend locally: `npm start` (port 3789).
To preview the web app: serve the repo root statically (e.g. `python3 -m http.server 3790`) and open `index.html`.

---

## 5. API keys & services  ⚠️ SECURITY

All secrets live in **`keys.local.json`** (git‑ignored — never committed) and, in production, as **Render env vars** (`render.yaml`, all `sync:false`).

> **Transfer the secret values by copying `keys.local.json` directly + securely** (AirDrop, password manager, encrypted note) — **do not** paste secret keys into shared docs/chats. Below, public/client‑safe values are shown in full; secret values are referenced, not printed.

| Key | Type | Purpose | Value |
|---|---|---|---|
| `SUPABASE_URL` | public | Supabase project URL | `https://jjiiaxqnqnbmuqdbsbdl.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | **public** (client‑safe; RLS‑guarded) | App reads/writes via this | `sb_publishable_jJ6e6ElTmFMv5IPs64GZpQ_Xy7q4G60` |
| `SUPABASE_SECRET_KEY` | **SECRET** (server/admin only) | Seeding, admin ops, bypasses RLS | *in keys.local.json (`sb_secret_…`)* |
| `SUPABASE_JWKS_URL` | public | JWT verification | `…/auth/v1/.well-known/jwks.json` |
| `STRIPE_PUBLISHABLE_KEY` | **public** (TEST) | Stripe client | `pk_test_51PKODFDupUIAgVbjHnRbFVkerVVKsHjXk4Ej3EJGeBLw489DVs7Vwytl2KQDE8F5mnD0QwYJltVVBpfO2XIlWRPz00wIfOOB1K` |
| `STRIPE_SECRET_KEY` | **SECRET** (TEST) | Stripe server (PaymentIntents) | *in keys.local.json (`sk_test_…`)* |
| `PLATFORM_FEE_PERCENT` | config | Platform take rate | `25` |
| `RESEND_API_KEY` | **SECRET** | Email (sign‑in codes, SMTP) | *in keys.local.json (`re_…`)* |
| `ANTHROPIC_API_KEY` | **SECRET** | AI support chat | *in keys.local.json (`sk-ant-…`)* |
| **Google Maps API key** | client (restrict!) | Maps + Places. Hard‑coded in `index.html` (~line 2856) | `AIzaSyCP45rZDYMA6Y11_AL9nuy7Jqv7huoVIJg` |

**`keys.local.json` shape:**
```json
{
  "RESEND_API_KEY": "re_…",
  "ANTHROPIC_API_KEY": "sk-ant-…",
  "STRIPE_SECRET_KEY": "sk_test_…",
  "STRIPE_PUBLISHABLE_KEY": "pk_test_…",
  "PLATFORM_FEE_PERCENT": 25,
  "SUPABASE_URL": "https://jjiiaxqnqnbmuqdbsbdl.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_…",
  "SUPABASE_SECRET_KEY": "sb_secret_…",
  "SUPABASE_JWKS_URL": "https://….supabase.co/auth/v1/.well-known/jwks.json"
}
```

**Security to‑dos before going public:**
- Restrict the **Google Maps key** by iOS bundle ID (`com.catchafade.app`) + HTTP referrer in Google Cloud Console.
- Rotate any key that was ever pasted into a chat.
- Swap all Stripe **test** keys (`pk_test_`/`sk_test_`) for **live** keys only at launch.

**Still needed (not yet provisioned):** Apple Developer account + APNs key (push), Apple Pay merchant ID + cert, a Google iOS OAuth client ID (`native.js → CFG.googleIOSClientId` is empty), Checkr/Twilio if doing real background checks/SMS.

---

## 6. Design system

### 6.1 Fonts
| Use | Font stack |
|---|---|
| **Logo / brand mark (the "CAF"), serif accents** | `Georgia, 'Times New Roman', Times, 'Apple Garamond', serif` (bold 700) |
| **All UI text, buttons, body, headings** | `-apple-system, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif` |
| Everything inside components | `font-family:inherit` (inherits the body stack) |

Onboarding headlines use the SF stack at weight **900** (`.ob-h`).

### 6.2 Color palette — core UI (dark theme, `:root` in index.html)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0C0C0F` | app background (near‑black) |
| `--bg2` | `#101014` | secondary background |
| `--card` | `#1A1A20` | cards |
| `--card2` | `#22222A` | raised cards |
| `--card3` | `#2B2B34` | switches / inputs |
| `--text` | `#ECEEF2` | primary text |
| `--dim` | `#9B9BA6` | secondary text |
| `--faint` | `#62626C` | tertiary text |
| `--line` | `rgba(255,255,255,.07)` | hairline borders |
| `--line2` | `rgba(255,255,255,.12)` | stronger borders |
| `--blue` | `#2E84C4` | primary accent / links / tabs |
| `--blueDeep` | `#16315F` | deep navy |
| `--green` | `#46C98B` | success / online / "$0" |
| `--orange` | `#FF9F4A` | warnings |
| `--pink` | `#8C1F2C` | accent |
| `--red` | `#C82222` | alerts / primary red |
| `--bordeaux` | `#7A1515` | deep red |
| `--map` | `#14141A` | map base |
| `html` bg | `#07070A` | root behind everything |
| radius | `--r: 22px` | global corner radius |

**Gradients:**
- `--grad` = `linear-gradient(135deg, #16315F, #8C1F2C)` (navy→pink)
- `--gradWarm` = `linear-gradient(135deg, #C82222, #7A1515)` (red→bordeaux)
- `--gradGreen` = `linear-gradient(135deg, #46C98B, #3FA9D8)` (green→blue)

### 6.3 Color palette — onboarding (`--ob-*`)
| Token | Hex | Use |
|---|---|---|
| `--ob-gold` | `#C7414E` | onboarding accent (the red "CatchAFade." / highlights) |
| `--ob-cream` | `#ECEEF2` | onboarding light text (note: a near‑white, *not* the icon cream) |
| `--ob-dimm` | `#9AA0AD` | onboarding secondary text |
| `--ob-faant` | `#5B606B` | onboarding faint text |
| `--ob-grn` | `#4ADE80` | onboarding green checks |

There is also a **light onboarding theme** (`body.light` / `.ob-light` overrides) used to follow the device appearance.

### 6.4 Color palette — brand mark & barber‑pole (`scripts/make-source-assets.mjs` + `.caf-icon`)
| Name | Hex | Use |
|---|---|---|
| **CREAM** | `#F2ECDD` | the icon tile background (warm off‑white) |
| **BLACK** | `#15110D` | the "CAF" letters in the icon (current design) |
| **WHITE** | `#FFFFFF` | app‑icon background field |
| **NAVY** | `#1E3A66` | barber‑pole stripe (and the *old* CAF letter color) |
| **RED** | `#B23A45` | barber‑pole stripe |
| **DARK** | `#0C0C0F` | splash background |

### 6.5 App icon (current)
- **White** full‑bleed background → **cream `#F2ECDD`** rounded tile (≈91% of canvas, corner radius 22% of tile) → **black `#15110D`** serif **CAF**, font ~392/1024, letter‑spacing 4. **No barber‑pole stripes.**
- Generated by `scripts/make-source-assets.mjs` → `assets/icon-only.png` → `npx capacitor-assets generate --ios` fans it to all sizes in `AppIcon.appiconset`.
- iOS masks the outer corners, so the white shows as a thin margin around the cream tile.

### 6.6 Splash screen
- **Dark `#0C0C0F`** canvas + centered **cream tile (400px on a 2732 canvas)** + **black CAF**, no stripes.
- The square is shown `scaleAspectFill` in `LaunchScreen.storyboard`, so tile size is deliberately small (400, not 760) to avoid magnification on tall phones → renders ~140pt.
- Generated alongside the icon; files in `Splash.imageset` (`Default@1x/2x/3x~universal~anyany(-dark).png`).

### 6.7 In‑app brand mark (`.caf-icon`)
- A reusable component: cream `#F2ECDD` rounded tile, black `#15110D` serif **CAF** centered, soft shadow, **no stripes**.
- Size set per‑instance via `--sz` (e.g. welcome page **84px**, others 76–90px). CAF text = `calc(--sz × .42)`.

### 6.8 Barber‑pole (the red/blue brand element — kept everywhere EXCEPT the icon)
- Diagonal repeating stripes **RED `#B23A45` / CREAM `#F2ECDD` / NAVY `#1E3A66`**, rotated ~25°.
- Used on primary CTA buttons (`.ob-cta` "Let's go →", "That's a no‑brainer →"), live‑trip progress bars, etc.

---

## 7. Build & run commands (`package.json`)
| Command | What it does |
|---|---|
| `npm start` | Run the Node backend (`server.js`, port 3789) |
| `npm run build:native` | esbuild `src/native.js` → `native-bridge.js` |
| `npm run build` | build:native **+** assemble `www/` (root index.html, native-bridge.js, apple-touch-icon) |
| `npm run ios:sync` | `npm run build` **+** `npx cap sync ios` |
| `npm run ios:open` | `npx cap open ios` |
| `npm run assets` | regenerate icon + splash sources, then `capacitor-assets generate --ios` |

**Full "edit → see it on the iPhone" pipeline (memorize this):**
```bash
npm run build && npx cap sync ios
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<SIMULATOR_UDID>' -derivedDataPath build build
xcrun simctl install <SIMULATOR_UDID> build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch  <SIMULATOR_UDID> com.catchafade.app
```
(Test simulator used here: iPhone 17 Pro Max, UDID `1939178F-2074-4270-AC7C-E7A5D1009645`.)
Cold first launch after install can take ~30–50s to paint (WKWebView + CDN). Relaunch if black.

---

## 8. Native iOS specifics
- **Capacitor 8.4.0**, SPM plugins: `@capacitor/{app,geolocation,haptics,keyboard,preferences,push-notifications,splash-screen,status-bar}` + `@capgo/capacitor-social-login` (real Apple + Google sign‑in, Cap‑8 compatible).
- **Deployment target:** iOS **15.0**. **Marketing version:** 1.0.
- `capacitor.config.json`: `webDir: www`, `ios.contentInset: never`, `backgroundColor #0C0C0F`, SplashScreen `launchAutoHide:false` (hidden by JS), Keyboard `resize:native`.
- **Fullscreen layout:** the web app draws a fake phone bezel on web; inside iOS the `html.native` CSS class kills the bezel/notch/statusbar, fills `100vw×100dvh`, applies safe‑area insets, and forces `.screen{transform:none}` (fixes a left‑shift bug from the screen‑transition transforms).
- `src/native.js → CFG`: `apiBase: https://catch-a-fade.onrender.com`, `googleIOSClientId: ''` (TODO).

---

## 9. Backend — Supabase
- **Schema:** `supabase/schema.sql` — run once in the Supabase SQL editor. Tables: **profiles, barbers, services, bookings, barber_locations, reviews, favorites**. Includes RLS policies, an `owns_barber()` helper, a `handle_new_user()` trigger (auto‑creates a profile on signup), and realtime publication for `bookings` + `barber_locations`.
- **New API key format:** `sb_publishable_…` = client‑safe (RLS‑guarded); `sb_secret_…` = admin/server only.
- **Seed:** `node scripts/seed-barbers.mjs` (idempotent) — creates 4 test barbers (Marcus Brown, Devon Reid, Jaylen Mills, Andre Cole) with services + live locations in NYC. Uses the secret key.
- **App integration:** `index.html` loads `@supabase/supabase-js` via CDN, inits a client with the publishable key, and `loadBarbersFromSupabase()` (on boot) replaces the demo list with real DB rows. PostgREST embed needs the FK hint `profiles!barbers_profile_id_fkey`.
- **Auth:** email **OTP** (6‑digit code) via `signInWithOtp`/`verifyOtp`. Requires `{{ .Token }}` in the Supabase "Magic Link" **and** "Confirm signup" email templates. Email delivery via **Resend custom SMTP** (host `smtp.resend.com`, port 465, user `resend`, password = Resend API key; test sender `onboarding@resend.dev` only delivers to your own Resend‑account email until a domain is verified).
- ⚠️ **Free‑tier projects auto‑pause** after ~1 week idle → the API hostname stops resolving (NXDOMAIN). Restore from the dashboard if barbers fail to load.

---

## 10. Payments — Stripe
- **Model = Uber‑identical.** Platform collects the full charge, keeps the fee, pays the barber via Stripe Connect.
- **Fee:** `PLATFORM_FEE_PERCENT = 25` (Uber's standard take rate). Fee is added **on top** of the barber's price (customer pays service + fee).
- **Cancellation fee:** free within a 2‑minute grace window, then a flat **$5** (no fee if the barber is 5+ min late). Implemented in `computeFee()` and described in 4 copy locations (booking screen, FAQ, Terms, support answer).
- **Server endpoints** (`server.js`): `/api/stripe-config`, `/api/create-payment-intent` (destination charge: `application_fee_amount` + `transfer_data.destination` when a barber Stripe account exists), `/api/supabase-config`, `/api/register-push`, AI support chat.
- **TODO:** Stripe Connect onboarding for barbers (payouts); real Apple Pay (currently a simulated Face‑ID sheet — kept "for later").

---

## 11. Deploy (Render — `render.yaml`)
- Node web service running `server.js`. URL: `https://catch-a-fade.onrender.com`.
- Env vars declared with `sync:false` (set them in the Render dashboard): `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`; plus `PLATFORM_FEE_PERCENT="25"`.

---

## 12. External libraries / CDNs loaded by the app
- **Leaflet 1.9.4** — `unpkg.com/leaflet@1.9.4` (JS + CSS) — tile map.
- **Google Maps JS API** — loaded dynamically with `libraries=places` (`index.html` ~line 2880).
- **Supabase JS v2** — `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`.
- **EmailJS browser v4** — `cdn.jsdelivr.net/npm/@emailjs/browser@4` (legacy email path).
- **native-bridge.js** — local (Capacitor bridge).

npm deps (see `package.json`): `@capacitor/*@^8`, `@capgo/capacitor-social-login@^8.3.22`, `@supabase/supabase-js@^2`, `stripe@^22`; dev: `@capacitor/assets`, `esbuild`, `sharp`.

---

## 13. Status — done vs TODO
**Done:** native iOS conversion (builds + runs on simulator); fullscreen native layout; smooth real‑time tracking glide; app icon + splash + screenshots at required sizes; Stripe test payments (fee‑on‑top verified); Uber fee model; Supabase backend (schema + RLS + seed, 4 real barbers loaded); real email OTP sign‑in (templates + Resend SMTP); new minimal cream/black CAF icon.

**TODO:** un‑pause/keep Supabase alive; barber **registration** flow → write to Supabase (currently localStorage); Apple/Google OAuth via Supabase (needs Apple Dev acct + Google iOS client ID); real Apple Pay; APNs push key; bookings/reviews persistence to DB; Stripe Connect payouts; Checkr/Twilio for real verification; verify a sending domain in Resend; submit to App Store (see `IOS_APP_STORE.md`).

---

## 14. Gotchas / lessons learned
- The native app loads `ios/App/App/public/index.html`, **not** root — always `npm run build && npx cap sync ios` after edits, then rebuild in Xcode. (The web preview and the native app read different copies.)
- Browser caches `index.html` aggressively in preview — hard‑reload with a `?v=timestamp` to see edits.
- Splash is a square `scaleAspectFill` image → big logos magnify on tall phones; keep the tile small (~400/2732).
- WebKit "no commit for 49s" / black screen on first cold launch = slow CDN load, not a crash — relaunch.
- Onboarding sizing changes are scoped to `html.native` (iOS‑only) by design; they won't show in the plain web preview.
- "Cream" is overloaded: icon tile cream = `#F2ECDD`; onboarding text "cream" = `#ECEEF2`.
