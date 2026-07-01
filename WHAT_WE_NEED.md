# Catch a Fade — What we actually need to ship a REAL app

The current app is a polished **prototype**: the native iOS shell is done, but the
marketplace itself (barbers, bookings, tracking, payments, reviews) is **simulated
demo data**. This is the checklist to turn it into a real, operating business.

Legend: 🔴 mandatory to function · 🟡 important for success · 🟢 later

---

## 1. The #1 gap: a real backend + database  🔴
Today there is no server-side brain. Everything lives in the phone. A real
marketplace needs a backend that stores and syncs:
- Users, barbers, profiles, verification status
- Bookings (request → match → accept → en route → arrived → done)
- Real-time barber GPS location
- Payments, payouts, fees
- Reviews, ratings, favorites, messages

**Fastest path:** Supabase (Postgres + Auth + Realtime + Storage in one) or Firebase.
Replaces the `localStorage` fakery and powers everything below.

---

## 2. API keys / accounts you'll need (the concrete list)

| Service | What it's for | Mandatory? |
|---|---|---|
| **Supabase** *(or Firebase)* | Database, auth, realtime, file storage | 🔴 |
| **Stripe + Stripe Connect** | Take payment from customers, pay out barbers, platform fee split, refunds | 🔴 |
| **Google Maps Platform** | Live map, address autocomplete, ETA/Directions, distance | 🔴 (key exists — enable billing + restrict it) |
| **APNs key (.p8)** *(or OneSignal / FCM)* | Send booking + arrival push notifications | 🔴 |
| **Checkr or Persona** | Barber ID verification + background checks (you advertise "Verified Pro") | 🔴 if you make that claim (~$25–50/check) |
| **Resend** | Email (sign-in codes, receipts) | 🔴 (have key — must verify a sending domain) |
| **Twilio** | Phone/SMS verification + customer↔barber texting | 🟡 |
| **Anthropic** | AI support chat | 🟢 (have key, already working) |
| **Google OAuth iOS client ID** | "Sign in with Google" button | 🟢 (Apple + email already cover it) |
| **Sentry** | Crash/error reporting in production | 🟡 |
| **PostHog or Mixpanel** | Product analytics (funnels, retention) | 🟡 |
| **Cloudinary / S3** | Image hosting (portfolios, avatars) — or use Supabase Storage | 🟡 |

---

## 3. The thing everyone forgets: it's TWO apps  🔴
You built the **customer** side. A barber marketplace is two-sided — you also need a
**barber app / barber mode**:
- See & accept incoming jobs, navigate to the customer
- Mark "on the way / arrived / started / done", enter the arrival PIN
- Set availability, services, prices, get paid, see earnings
- Onboarding + verification flow

Plus the **dispatch logic** on the backend: match a booking to nearby available
barbers, handle accept/decline, reassign on no-show. **Without barbers (supply),
the app is an empty map.** This is the hardest and most important part.

---

## 4. Design / UI-UX still needed  🟡
The customer UI is genuinely strong. What production needs:
- **Real-data states**: empty (no barbers nearby), loading, error, offline,
  "no barbers in your city yet." Right now it's always magically full.
- **Barber-side screens** (whole new flows — needs design work).
- **Account deletion in-app** — Apple *requires* this to approve the app.
- **Accessibility**: Dynamic Type (respect text-size settings), VoiceOver labels,
  color contrast. Apple checks it; it also widens your audience.
- **App Store assets**: screenshots set, a 15–30s preview video, polished listing.
- **A landing page / marketing site** for credibility + waitlist.

---

## 5. Legal / business — to "be a thing" at all  🔴
- **Business entity** (LLC) + EIN (needed for Stripe payouts).
- **Insurance** — barbers entering customers' homes = real liability. Get a policy.
- **Independent-contractor agreements** for barbers (1099 model, like Uber).
- **Background-check consent** flow (FCRA compliance if using Checkr).
- **Reviewed Terms + Privacy Policy** (you have drafts — a marketplace handling
  payments, location, and background checks should have these reviewed by a lawyer).
- **Sales/service tax** handling per state.

---

## 6. To be SUCCESSFUL (not just exist)  🟡
- **Solve the cold-start problem**: launch in ONE neighborhood/city. Recruit
  10–30 real barbers *before* any customers. Marketplaces die from empty supply.
- **Lock the economics**: platform fee %, barber payout schedule, surge rules.
- **Customer acquisition**: referrals, social proof, local partnerships.
- **Trust & safety**: dispute/refund process, rating moderation, SOS/safety (the
  UI exists — needs a real process behind it).
- **Support ops**: a real human escalation path behind the AI chat.

---

## Suggested order
1. Backend + DB (Supabase) → real accounts, real barbers, real bookings.
2. Stripe Connect → real payments + payouts.
3. Barber app/mode + dispatch logic.
4. Verification (Checkr) + legal/insurance/entity.
5. Real-data UI states + account deletion + accessibility.
6. Recruit barbers in one city → soft launch → iterate.

**Bottom line:** the app *looks* finished, but the *product and business* are the
remaining ~90%. The good news: the hardest design/UX and the native packaging are
already done — the work now is backend, payments, the barber side, and getting real
barbers on board.
