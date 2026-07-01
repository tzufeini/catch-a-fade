# Catch a Fade — Ship-Today Checklist (App Store submission)

Source: 6-dimension code audit vs Apple review guidelines, 2026-07-01. 50 findings, 25 blockers.
Full machine-readable findings: see audit output (session). This file is the working checklist.

Legend: 🔴 = rejection-likely blocker · 🟡 = important · ⚪ = polish · [C] = Claude fixes in code · [U] = only user can do · [D] = decision needed

## A. Strip demo/prototype content (Apple 2.3.10, 2.1) — [C]
- [ ] 🔴 Remove "interactive prototype"/"v2.4.0 prototype" labels — index.html:2341, 2803; delete caption div :2847
- [ ] 🔴 Remove "placeholder draft for the prototype" sentence from Terms (:1848) and Privacy (:1928); replace legal@/privacy@catchafade.example (:1846, :1926) with a real inbox
- [ ] 🔴 Fresh install must not show fake identity: hardcoded "Tzuf Eini", 14 cuts, $612 spent (:4151-4160, :2311-2312, :2326-2328, :4188) → empty profile, 0/$0 or hidden stats
- [ ] 🔴 Delete fake saved cards Visa••4471/Mastercard (:2539-2544, :2152)
- [ ] 🔴 Sign-in fallback: remove "Demo mode · email not set up yet" + on-screen code + autofill (:1949-1955, :5377-5394) → on failure show "Couldn't send code — try again"
- [ ] 🔴 Barber signup: remove "Any 4 digits work in this prototype", fake Checkr check, instant "verified", bank details form (:4414-4600) → or hide barber signup for v1 (see D3)
- [ ] 🟡 Fake reviews/portfolios on real barbers → return [] when none stored (:5070-5097); OB15 testimonials → reword w/o fake names (:1676-1687)
- [ ] 🟡 Barber dashboard fake earnings/fake job request → zero out / hide until real (:2365-2409)
- [ ] 🟡 Fake saved addresses + prefilled fake chat + fake tel: numbers (:2121, :2216, :2276-2283, :2443-2462)
- [ ] 🟡 Safety copy promising nonexistent systems (background checks, payment escrow) → soften to truth (:2163, :2790-2797)
- [ ] 🟡 Fake "Verified" rows + hardcoded emergency contact "Rachel Eini" in Safety screen (:2608-2629); shareTrip fake toast → navigator.share (:4687)
- [ ] ⚪ Fake promo code row, hardcoded spend stats, MOCK comments (:2550-2559, :2326-2329)

## B. Auth & account compliance — [C]
- [ ] 🔴 Add **Sign out** (supabase signOut + clear local + back to onboarding) — Account screen ~:2336
- [ ] 🔴 Add **Delete account** (Apple 5.1.1(v) hard requirement) — confirm modal → server.js endpoint w/ supabase.auth.admin.deleteUser
- [ ] 🔴 Hide **Continue with Google** in native build (dead button, empty client ID — native.js:35) until a Google iOS OAuth client ID exists
- [ ] 🟡 Hide/fix fake Apple Face-ID theater fallback (native.js boot must not fall back to fake sheet; try/catch init) (:1271-1297, native.js:115-117)
- [ ] 🟡 Persist login across cold launches (finishAuth → localStorage flag; boot → skip onboarding) (:5477, :2947)

## C. Payments compliance — [C] after [D1]
- [ ] 🔴 Remove fake Apple Pay sheet + fake Face ID + "Payment authorised" (:1240-1268, :4105-4147)
- [ ] 🔴 Remove all fabricated charge strings: "$5.00 charged to Apple Pay" (:3883), "Paid with Apple Pay · sent to your email" (:2773)
- [ ] 🔴 Remove FADEGO+ $9.99/mo upsell entirely for v1 (fake + IAP conflict) (:2319-2324, :2646-2679, :4992-5009)
- [ ] 🔴 Remove raw card-number+CVC form (collects PAN, does nothing, claims "stored securely") (:2563-2590, :4739-4803)
- [ ] 🟡 Fee display: drive from server /api/stripe-config (25%) not hardcoded $5/$2.50 (:2157-2158, :3776-3783)

## D. Decisions needed — [D]
- [ ] D1 🔴 **Payment path for v1**: (a) real Stripe card charge in-app via /api/create-payment-intent (needs Render live; ~half-day) — or — (b) "book now, pay your barber in person" (fast, honest, review-safe; recommended for today)
- [ ] D2 🔴 **Booking flow honesty**: barber auto-accepts in 1.9s and "arrives" in 16s (:3788-3793, :4056, 15s grace :3808-3814) → reframe as real-time request w/ realistic timing + "barber will confirm", real 2-min grace. Requires at least one real barber account live during review (App Review notes + demo account).
- [ ] D3 🔴 **Barber side for v1**: hide "Sign up as a barber" (fast) — or — wire finishBarberSignup to Supabase (real, slower) (:4562-4600)

## E. Fresh-install resilience — [C]
- [ ] 🔴 Bundled fallback barber list so home is NEVER empty (Supabase currently paused = empty marketplace = 2.1 rejection) (:3124-3172, :3516-3525)
- [ ] 🟡 Re-fetch barbers on visibilitychange/tab-home when list empty (:5682)
- [ ] 🟡 Location-denied modal: add "Continue without location" + fix "your browser" copy in native (:1357-1368, :3303-3337)
- [ ] ⚪ 8s AbortController timeouts on API_BASE fetches (support chat, send-code) (:4290-4297, :5379-5392)
- [ ] ⚪ Favorites: persist by stable id not index; persist heart toggle (:3127, :3502-3513)

## F. Legal / support / UGC — [C]
- [ ] 🔴 Fix fake Emergency SOS ("911 called" toast, nothing happens) → real tel:911 confirm or delete card (:2599-2605)
- [ ] 🔴 Host Privacy Policy + Terms as public URLs (add GET /privacy + /terms to server.js) — required fields in App Store Connect
- [ ] 🔴 Report/block mechanism for UGC (reviews/chat): "Report a problem" → real mailto/api endpoint; block control (Apple 1.2) (:2628, :2802)
- [ ] 🟡 Make Terms + Privacy reachable after login (add Account rows) (:2334-2341)
- [ ] 🟡 Support chat "human escalation" claim → truthful copy + real email (:4311); remove dead search stub (:2789-2791)
- [ ] 🟡 Remove dead "Call barber" tel:+15550142 anchors (:2216, :2276)

## G. iOS project config — [C] except team
- [ ] 🔴 [U] **DEVELOPMENT_TEAM** — set your Apple Team ID in Xcode Signing & Capabilities (needs your Apple Developer account, $99 enrolled)
- [ ] 🔴 TARGETED_DEVICE_FAMILY = 1 (iPhone-only) — else iPad+portrait-only fails upload ITMS-90474
- [ ] 🔴 Add NSCameraUsageDescription + NSPhotoLibraryUsageDescription (photo picker can invoke camera = crash) — Info.plist
- [ ] 🟡 Delete placeholder CFBundleURLTypes google scheme from Info.plist (or set real reversed client ID)
- [ ] 🟡 Add ITSAppUsesNonExemptEncryption=false
- [ ] ⚪ Remove UIBackgroundModes remote-notification until silent push is real

## H. Backend — [U] with [C] prep
- [ ] 🔴 [U] **Un-pause Supabase** (dashboard → Restore) — sign-in AND barbers depend on it. Page: https://supabase.com/dashboard/project/jjiiaxqnqnbmuqdbsbdl (Claude auto-seeds barbers once it's back)
- [ ] 🔴 [U] **Deploy server.js to Render**: dashboard.render.com → New + → Blueprint → connect GitHub repo `tzufeini/catch-a-fade` → it reads render.yaml → paste the 6 `sync:false` env values from keys.local.json (RESEND_API_KEY, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY) → Apply. Done when https://catch-a-fade.onrender.com/api/health answers `{"ok":true}` — the app switches to it automatically (no rebuild).
- [x] ✅ **App Review demo login** (server-side): email `review@catchafade.app`, code `010101` — fixed code, no email sent, works even with Resend in test mode. Suggested App Review notes text:
  > Demo account: sign in with email **review@catchafade.app** — the 6-digit code is **010101** (no email delivery needed). Payments run on Stripe test mode; use card 4242 4242 4242 4242, any future expiry, any CVC/ZIP.
- [ ] 🟡 [U] Resend: test sender only delivers to your own email — verify a domain for real users (reviewer is covered by the demo login above)

## I. After code: rebuild + verify + submit
- [ ] npm run build && npx cap sync ios && xcodebuild (Release archive) — verify grep of ios/App/App/public/index.html
- [ ] Full pass on simulator: fresh install → onboarding → sign in → browse → book → cancel → help/legal links
- [ ] [U] App Store Connect (Cowork drives): listing, screenshots (done ✓), privacy labels, support URL, privacy URL, demo account + review notes, submit

## Reality check
- Apple Developer enrollment must be APPROVED before upload (can take ~24-48h if new)
- App Review itself typically 24-48h after submission
- Realistic today: ALL code items done + archive built + App Store Connect application filled
