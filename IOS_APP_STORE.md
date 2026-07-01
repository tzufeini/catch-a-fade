# Catch a Fade — iOS App Store guide

Your web app is now a **real native iOS app** wrapped with [Capacitor](https://capacitorjs.com).
Everything that can be done in code is done. This file is the checklist for the
parts that need *your* Apple / Google accounts.

- **Bundle ID:** `com.catchafade.app`
- **App name:** Catch a Fade
- **iOS project:** `ios/App/App.xcodeproj`  (open with `npm run ios:open`)
- **Min iOS:** 15.0

---

## 0. What was converted (already done)

| Web prototype (before) | Native app (now) |
|---|---|
| Scaled 390×844 "phone mockup" with a fake status bar + notch | Fills the **real** device screen, safe-area aware (`html.native` CSS) |
| Simulated "Sign in with Apple" Face-ID sheet | **Real Sign in with Apple** (system sheet) |
| Simulated Google account picker | **Real Google Sign-In** (native) |
| `navigator.geolocation` (browser) | **Real CoreLocation** permission + tracking |
| Web notifications | **Real APNs push** registration |
| `navigator.vibrate` | **Taptic Engine** haptics |
| `/api/*` relative calls | Routed to your **deployed backend** |
| Single scissors favicon | Full **CAF app icon** at every required size + splash |

The native logic lives in [`src/native.js`](src/native.js) → bundled to
`native-bridge.js`. It is **inert on the web** (so the Preview still works) and
only activates inside the iOS app.

---

## 1. One-time toolchain (already installed on this Mac)

Node 22 ✓ · CocoaPods ✓ · Xcode 26 ✓ · Capacitor 8 ✓. Nothing to do.

The dev loop after you change the web app (`index.html`) or `src/native.js`:

```bash
npm run ios:sync     # rebuilds the bundle + www and copies into the iOS app
npm run ios:open     # opens Xcode
```

---

## 2. Fill in your 3 config values

Open [`src/native.js`](src/native.js) → the `CFG` block at the top:

```js
const CFG = {
  apiBase: 'https://catch-a-fade.onrender.com',  // ← your deployed backend
  googleIOSClientId: '',                          // ← from Google Cloud (step 5)
  googleServerClientId: '',                        // ← optional, backend verify
};
```

After editing, **rebuild**: `npm run ios:sync`.

> If you leave `googleIOSClientId` empty, Apple + email sign-in still work; only the
> Google button is disabled (with a friendly message). Apple sign-in needs **no**
> client ID here — it uses the entitlement.

---

## 3. Apple Developer Program ($99/yr)  ·  YOU

1. Enroll at <https://developer.apple.com/programs/> (needs an Apple ID + payment).
2. In Xcode → **Settings → Accounts**, add that Apple ID.

---

## 4. Open the project & set signing  ·  YOU

```bash
npm run ios:open
```

In Xcode, select the **App** target → **Signing & Capabilities**:

1. **Team:** pick your Apple Developer team. Leave "Automatically manage signing" ON.
2. Click **➕ Capability** and add these two (the entitlements file is already in place,
   so Xcode just registers them on your account):
   - **Sign in with Apple**  ← required by App Store rule 4.8 because you also offer Google
   - **Push Notifications**
3. The `aps-environment` + `applesignin` entitlements are pre-written in
   `ios/App/App/App.entitlements` — Xcode will recognize them.

Now **Product → Run** (▶) with an iPhone simulator selected to see it boot.

---

## 5. Real Google Sign-In  ·  YOU

1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Application type: **iOS**. Bundle ID: `com.catchafade.app`.
4. Copy the **Client ID** → paste into `CFG.googleIOSClientId` in `src/native.js`.
5. Google also gives you a **reversed client ID** (`com.googleusercontent.apps.XXXX`).
   Open `ios/App/App/Info.plist` and replace `REPLACE_WITH_REVERSED_GOOGLE_CLIENT_ID`
   with it.
6. `npm run ios:sync`.

---

## 6. Real Sign in with Apple  ·  mostly automatic

Adding the **Sign in with Apple** capability (step 4) + an active Team is all that's
needed — automatic signing registers the App ID capability for you. No code changes.
(If you later add a website login, you'd also create a *Services ID*; not needed for the app.)

---

## 7. Push notifications (APNs)  ·  YOU, when you want to *send* pushes

The app already **registers** for push and hands the device token to your backend
(`POST /api/register-push`). To actually *send* booking/arrival pushes:

1. <https://developer.apple.com/account> → **Keys → ➕** → enable **Apple Push
   Notifications service (APNs)** → download the `.p8` key (save the Key ID + Team ID).
2. Use it server-side (e.g. the `node-apn` / `@parse/node-apn` library) to push to the
   stored tokens. The token plumbing in `server.js` (`PUSH_TOKENS`) is the starting point.

Until then, push permission is requested and tokens are collected — nothing breaks.

---

## 8. Deploy the backend (Render)  ·  YOU

The app's email codes + CAF Support AI chat call your Node backend. On device that's
`CFG.apiBase`. Deploy it once:

1. <https://render.com> → **Sign in with GitHub**.
2. **New + → Blueprint** → pick the `catch-a-fade` repo (it reads `render.yaml`).
3. Paste the two secrets when prompted: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`.
4. Render gives you `https://catch-a-fade.onrender.com` — confirm it matches `CFG.apiBase`
   (the service name in `render.yaml` is `catch-a-fade`, so this URL is the default).

> If the URL is unreachable, the app degrades gracefully (codes show on-screen, the
> chatbot uses built-in answers) — it won't crash. But for the store build, deploy it.

⚠️ **Rotate the two API keys** you pasted in chat earlier, and **restrict the Google
Maps key** (`index.html`) by bundle ID / HTTP referrer before going public.

---

## 9. App Store Connect — create the app  ·  YOU

1. <https://appstoreconnect.apple.com> → **Apps → ➕ → New App**.
2. Platform iOS · Name **Catch a Fade** · Bundle ID `com.catchafade.app` · SKU anything.
3. **App Privacy** (required): declare what you collect —
   - **Location** (find barbers / tracking) · **Email** (sign-in) ·
     **Name** (profile) · **Payment info** (booking) · **Identifiers** (device token).
   - Mark whether each is "linked to identity" / used for tracking (you don't track for ads → No).
4. **Age rating:** answer the questionnaire (this app → likely **4+**).
5. **Export compliance:** already handled — `ITSAppUsesNonExemptEncryption` is set to
   `false` in Info.plist, so you won't be asked each upload.

---

## 10. Screenshots (exact sizes)  ·  easy from the simulator

App Store Connect requires, at minimum, the **6.9-inch** iPhone size. Provide:

| Display | Pixels (portrait) | Example device |
|---|---|---|
| **6.9″** (required) | **1320 × 2868** | iPhone 16 Pro Max |
| 6.5″ (optional) | 1242 × 2688 | iPhone 11 Pro Max |

Capture them **exactly sized**, with zero effort, from the simulator:

1. Run the app on **iPhone 16 Pro Max** simulator (`▶` in Xcode).
2. Navigate to a screen you like.
3. **File → Save Screen** (or `⌘S`) → saves a perfectly-sized PNG to your Desktop.
4. Good screens to shoot: onboarding welcome, the live map of barbers, a barber profile,
   the "barber on the way" tracking screen, the price breakdown.
5. Drag those PNGs into App Store Connect.

(The native layout already renders full-bleed at the correct aspect ratio — verified.)

---

## 11. Reviewer access  ·  IMPORTANT

Your app gates behind sign-in, so Apple's reviewer must be able to get in. In App Store
Connect → **App Review Information**, either:
- provide a **demo account** (email + the 6-digit code flow won't work for them unless your
  backend is live — so prefer the next option), **or**
- add a note: *"Tap Sign in with Apple to enter,"* since Apple review can always use Apple
  sign-in. Make sure Sign in with Apple works on a real build before submitting.

---

## 12. Submit

1. Xcode → select **Any iOS Device (arm64)** → **Product → Archive**.
2. In the Organizer → **Distribute App → App Store Connect → Upload**.
3. Back in App Store Connect, attach the build to your version, fill description/keywords,
   add screenshots, and **Submit for Review**. Typical review: 1–3 days.

---

## 13. App Review notes specific to this app

- **4.2 Minimum Functionality** (the "is it more than a website?" rule): you pass because
  the app uses **native location + push notifications**, not just web content. Keep those
  working.
- **4.8 Sign in with Apple**: mandatory since you offer Google — it's wired (step 4).
- **3.1.1 Payments**: a barber traveling to you is a **real-world service**, so you use
  external payment (your card flow / Stripe) and must **not** use Apple In-App Purchase.
  This is allowed — same category as ride-share and food delivery.
- **5.1.1 Permission strings**: already written in `Info.plist` (location). If you later add
  photo upload (e.g. a lost-item photo or avatar), add `NSCameraUsageDescription` /
  `NSPhotoLibraryUsageDescription` too, or the app will crash when that API is called.

---

## File map of what changed

```
capacitor.config.json         native app config (id, name, plugins)
src/native.js                 native bridge SOURCE  (edit CFG here)
native-bridge.js              built bundle (generated; git-ignored)
scripts/build-www.mjs         assembles www/ from app files
scripts/make-source-assets.mjs renders the 1024 icon + splash
assets/                       generated icon/splash sources (git-ignored)
ios/                          the Xcode project (committed)
  App/App/Info.plist          permissions, push, Google URL scheme
  App/App/App.entitlements    Apple sign-in + push entitlements
  App/App/AppDelegate.swift   APNs token forwarding
  App/App/Assets.xcassets     CAF icon + splash, all sizes
server.js                     + /api/register-push endpoint
```
