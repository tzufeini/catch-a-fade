/* =====================================================================
 *  Catch a Fade — NATIVE BRIDGE
 *  Bundled by esbuild → ../native-bridge.js (loaded from index.html).
 *  On the web it is an inert no-op. Inside the iOS app (Capacitor) it
 *  upgrades the simulated flows to real native ones:
 *    • Sign in with Apple / Google  (real system sheets)
 *    • Geolocation                  (real CoreLocation permission)
 *    • Push notifications           (real APNs registration)
 *    • Status bar / splash / keyboard / haptics
 *    • Routes /api/* to the deployed backend
 *  Rebuild after editing:  npm run build:native   (or npm run build)
 * ===================================================================== */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { Stripe as StripeNative } from '@capacitor-community/stripe';

/* =====================================================================
 *  CONFIG — fill these in before your App Store build.
 *  (See IOS_APP_STORE.md for exactly where each value comes from.)
 * ===================================================================== */
const CFG = {
  // Your deployed backend (the Render blueprint creates this URL from the
  // service name "catch-a-fade"). Used for /api/send-code + /api/support-chat
  // on the device. If left wrong/unreachable the app falls back gracefully.
  apiBase: 'https://catch-a-fade.onrender.com',

  // Google Cloud → Credentials → OAuth client ID of type "iOS".
  // e.g. '1234-abcd.apps.googleusercontent.com'.  Leave '' to disable Google.
  googleIOSClientId: '',
  // Optional: your "Web application" client ID, only needed if you verify
  // the Google token on your backend (offline mode). Leave '' otherwise.
  googleServerClientId: '',
};

const isNative = Capacitor.isNativePlatform();
// Expose the API base to the page (index.html reads window.API_BASE for /api/*).
window.API_BASE = isNative ? (CFG.apiBase || '') : '';
window.CAF_NATIVE = isNative;

// Failover: probe the configured base, then the Mac's local dev server (the
// simulator shares the host's loopback). First one that answers /api/health wins,
// so the app works in dev before the Render deploy exists — no rebuild needed later.
if (isNative) {
  const bases = [CFG.apiBase, 'http://localhost:3789'].filter(Boolean);
  (function probe(i) {
    if (i >= bases.length) return; // none alive → keep the default; fetches fail gracefully
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    fetch(bases[i] + '/api/health', { signal: ac.signal })
      .then((r) => { clearTimeout(t); if (r.ok) { window.API_BASE = bases[i]; } else { probe(i + 1); } })
      .catch(() => { clearTimeout(t); probe(i + 1); });
  })(0);
}

if (!isNative) {
  // Plain web / Preview — nothing to do. The page keeps its simulated flows.
} else {
  // Swap in CoreLocation before ANY page code runs. Waiting for boot() let early
  // calls (home map, permissions check) hit WKWebView's own geolocation, which
  // shows a second "localhost would like to use your location" prompt.
  installGeolocation();
  document.documentElement.classList.add('native', 'native-ios');
  const markBody = () => document.body && document.body.classList.add('native');
  markBody();
  document.addEventListener('DOMContentLoaded', markBody);
  // Start once the page's own script has defined its globals.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

/* ------------------------------------------------------------------ */
function safe(fn) { try { return fn(); } catch (e) { /* ignore */ } }
function themeIsLight() {
  try { if (typeof isLight === 'function') return !!isLight(); } catch (e) {}
  return false;
}
function setProfile(name, email) {
  // userProfile is a top-level `let` in index.html → reachable by name.
  safe(() => {
    if (typeof userProfile !== 'undefined' && userProfile) {
      if (name) userProfile.name = name;
      if (email) userProfile.email = email;
    }
  });
}
function toast(t, s) {
  if (typeof window.notify === 'function') window.notify(t, s);
}
function toastErr(t, s) {
  if (typeof window.notifyErr === 'function') return window.notifyErr(t, s);
  toast(t, s);
}

async function boot() {
  // ---- chrome: status bar, splash, keyboard ----
  safe(async () => {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: themeIsLight() ? Style.Light : Style.Dark });
  });
  // Hide the native splash once the page is up; the app plays its own intro.
  window.addEventListener('load', () => setTimeout(() => safe(() => SplashScreen.hide()), 350));
  setTimeout(() => safe(() => SplashScreen.hide()), 1500); // safety net
  safe(() => Keyboard.setAccessoryBarVisible({ isVisible: false }));

  // Keep the status-bar text colour in sync if the app toggles light/dark.
  safe(() => {
    const root = document.getElementById('phone') || document.body;
    new MutationObserver(() => {
      safe(() => StatusBar.setStyle({ style: themeIsLight() ? Style.Light : Style.Dark }));
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  });

  // ---- hardware back (no-op safety on iOS) ----
  // ---- links into the app: catchafade://b/<barberId> (from a barber's booking page) ----
  safe(() => App.addListener('appUrlOpen', (e) => {
    const m = /^catchafade:\/\/b\/([0-9a-f-]{36})/i.exec((e && e.url) || '');
    if (m && typeof window.openBarberById === 'function') window.openBarberById(m[1]);
    // development builds only (npm run build:dev): preview the lock-screen card
    if (__CAF_DEV__ && /^catchafade:\/\/live-test/.test((e && e.url) || '')) liveActivityDemo();
  }));
  safe(() => App.addListener('backButton', () => {
    if (typeof window.back === 'function') window.back();
  }));

  // ---- haptics: upgrade the page's haptic() to real Taptic Engine ----
  window.haptic = function () { safe(() => Haptics.impact({ style: ImpactStyle.Light })); };

  // ---- real social sign-in ----
  await initSocialLogin();
  window.openAppleAuth = appleSignIn;
  window.openGoogleAuth = googleSignIn;

  // ---- Apple Pay (Stripe) ----
  window.CAF_APPLE_PAY = applePayBridge;

  // ---- lock-screen Live Activity ("Andre is 6 min away") ----
  safe(() => setupLiveActivity());

  // ---- push: register after the user signs in (best practice) ----
  hookPushAfterAuth();
}

/* ------------------------------------------------------------------ *
 *  Geolocation — make every existing navigator.geolocation call use
 *  the native plugin (WKWebView's built-in geolocation is disabled).
 * ------------------------------------------------------------------ */
function installGeolocation() {
  const impl = {
    getCurrentPosition(success, error, options) {
      const opts = options || {};
      (async () => {
        try {
          const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (perm && perm.location === 'denied') throw { code: 1, message: 'denied' };
          // A one-off fix uses the fast (Wi-Fi/cell, recently cached) location unless the
          // caller explicitly asks for GPS; the watch below sharpens it to GPS accuracy.
          const p = await Geolocation.getCurrentPosition({
            enableHighAccuracy: opts.enableHighAccuracy === true,
            timeout: opts.timeout || 8000,
            maximumAge: opts.maximumAge != null ? opts.maximumAge : 60000,
          });
          success && success({
            coords: {
              latitude: p.coords.latitude, longitude: p.coords.longitude,
              accuracy: p.coords.accuracy, altitude: p.coords.altitude,
              altitudeAccuracy: p.coords.altitudeAccuracy,
              heading: p.coords.heading, speed: p.coords.speed,
            },
            timestamp: p.timestamp,
          });
        } catch (e) {
          const denied = e && (e.code === 1 || /denied|permission/i.test(String(e.message || e)));
          error && error({ code: denied ? 1 : 2, message: String(e && e.message || e) });
        }
      })();
    },
    watchPosition(success, error, options) {
      const opts = options || {};
      const handle = { id: null };
      Geolocation.watchPosition(
        { enableHighAccuracy: opts.enableHighAccuracy !== false, timeout: opts.timeout || 15000 },
        (p, err) => {
          if (err) { error && error({ code: 2, message: String(err.message || err) }); return; }
          if (!p) return;
          success && success({
            coords: {
              latitude: p.coords.latitude, longitude: p.coords.longitude,
              accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed,
            },
            timestamp: p.timestamp,
          });
        }
      ).then((wid) => { handle.id = wid; });
      return handle; // returned to callers as the watch id; passed back to clearWatch
    },
    clearWatch(id) {
      const wid = id && id.id ? id.id : id;
      if (wid) safe(() => Geolocation.clearWatch({ id: wid }));
    },
  };
  // Lets the page skip its "Enable location" ask when iOS has already granted it.
  window.CAF_GEO_CHECK = async () => {
    try { const r = await Geolocation.checkPermissions(); return (r && (r.location || r.coarseLocation)) || ''; }
    catch (e) { return ''; }
  };
  try {
    Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true });
  } catch (e) {
    try { navigator.geolocation = impl; } catch (_) {}
  }
}

/* ------------------------------------------------------------------ *
 *  Social sign-in (Apple + Google) via @capgo/capacitor-social-login
 * ------------------------------------------------------------------ */
async function initSocialLogin() {
  const init = { apple: { redirectUrl: '' } }; // iOS uses the native sheet; no redirect URL
  if (CFG.googleIOSClientId) {
    init.google = {
      iOSClientId: CFG.googleIOSClientId,
      iOSServerClientId: CFG.googleServerClientId || undefined,
      mode: 'online',
    };
  }
  await safe(() => SocialLogin.initialize(init));
}

async function appleSignIn() {
  if (typeof window.haptic === 'function') window.haptic();
  try {
    const { result } = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } });
    const idToken = result && (result.idToken || (result.accessToken && result.accessToken.token));
    // A real account: Apple's identity token becomes a Supabase session, exactly
    // like an email login, so bookings and payments work afterwards.
    const c = typeof window.sbReady === 'function' ? window.sbReady() : null;
    if (!c || !idToken) throw new Error('no-token');
    const { data, error } = await c.auth.signInWithIdToken({ provider: 'apple', token: idToken });
    if (error) throw error;
    const p = (result && result.profile) || {};
    const name = [p.givenName, p.familyName].filter(Boolean).join(' ').trim();
    const email = (data && data.user && data.user.email) || p.email || '';
    setProfile(name, email);          // Apple only sends the name on the FIRST sign-in
    if (name && data && data.user) safe(() => c.from('profiles').upsert({ id: data.user.id, full_name: name }, { onConflict: 'id' }));
    try { localStorage.setItem('fadex_logged_in', '1'); } catch (e) {}
    if (typeof window.finishAuth === 'function') window.finishAuth('apple');
  } catch (e) {
    if (!isCancel(e)) toastErr('Sign in failed', 'Could not sign in with Apple. Please try again.');
  }
}

async function googleSignIn() {
  if (typeof window.haptic === 'function') window.haptic();
  if (!CFG.googleIOSClientId) {
    toastErr('Google sign-in unavailable', 'Add your Google iOS client ID to finish setup.');
    return;
  }
  try {
    const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['profile', 'email'], forcePrompt: true } });
    const p = (result && result.profile) || {};
    setProfile(p.name || [p.givenName, p.familyName].filter(Boolean).join(' ').trim(), p.email);
    if (typeof window.finishAuth === 'function') window.finishAuth('google');
  } catch (e) {
    if (!isCancel(e)) toastErr('Sign in failed', 'Could not sign in with Google. Please try again.');
  }
}

function isCancel(e) {
  const m = String((e && (e.message || e.code)) || e || '').toLowerCase();
  return m.includes('cancel') || m.includes('1001') || m.includes('closed') || m.includes('dismiss');
}

/* ------------------------------------------------------------------ *
 *  Push notifications — register after the first successful sign-in.
 * ------------------------------------------------------------------ */
let _pushHooked = false;
function hookPushAfterAuth() {
  const orig = window.finishAuth;
  if (typeof orig !== 'function') { registerPush(); return; }
  window.finishAuth = function () {
    const r = orig.apply(this, arguments);
    registerPush();
    return r;
  };

  safe(() => {
    PushNotifications.addListener('registration', (token) => {
      window.CAF_PUSH_TOKEN = token.value;
      sendPushToken(token.value);
    });
    // Foreground: the in-app realtime feed already updates the screen; a push
    // for a new job also pulls the barber's queue right away.
    PushNotifications.addListener('pushNotificationReceived', (n) => {
      toast(n.title || 'Catch a Fade', n.body || '');
      safe(() => { if (typeof window.mkBarberRefresh === 'function') window.mkBarberRefresh(); });
    });
    // Tapped from the lock screen: open whichever side the push is about.
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const title = String((a && a.notification && a.notification.title) || '');
      safe(() => {
        if (/^New request/.test(title) && typeof window.goBarberSide === 'function') window.goBarberSide();
        else if (typeof window.mkOnAppStart === 'function') window.mkOnAppStart();
      });
    });
  });
  // Already signed in from a previous launch → permission was asked before,
  // so this just refreshes the token silently.
  safe(() => { if (localStorage.getItem('fadex_logged_in') === '1') registerPush(); });
}

// Tie the device token to the signed-in account so the server can reach this
// phone (a barber gets new requests, a customer gets trip updates).
async function sendPushToken(tok) {
  if (!window.API_BASE || !tok) return;
  let accessToken = '';
  try {
    const c = typeof window.sbReady === 'function' ? window.sbReady() : null;
    const r = c ? await c.auth.getSession() : null;
    accessToken = (r && r.data && r.data.session && r.data.session.access_token) || '';
  } catch (e) {}
  safe(() => fetch(window.API_BASE + '/api/register-push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tok, platform: 'ios', accessToken }),
  }).catch(() => {}));
}
window.CAF_SEND_PUSH_TOKEN = () => { if (window.CAF_PUSH_TOKEN) sendPushToken(window.CAF_PUSH_TOKEN); };

async function registerPush() {
  if (_pushHooked) return; _pushHooked = true;
  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm && perm.receive === 'granted') await PushNotifications.register();
  } catch (e) { /* user declined — fine */ }
}

/* ------------------------------------------------------------------ *
 *  Apple Pay — confirms the booking's Stripe PaymentIntent with the
 *  card in the user's Wallet. Merchant: merchant.com.catchafade.app
 *  (its Payment Processing certificate lives in the Stripe dashboard).
 * ------------------------------------------------------------------ */
const APPLE_MERCHANT_ID = 'merchant.com.catchafade.app';
let _apPk = null;
async function apInit(pk) {
  if (pk && pk !== _apPk) { await StripeNative.initialize({ publishableKey: pk }); _apPk = pk; }
}
const applePayBridge = {
  // true when this iPhone has Apple Pay set up with a supported card
  async available(pk) {
    try { await apInit(pk); await StripeNative.isApplePayAvailable(); return true; }
    catch (_) { return false; }
  },
  // items: [{label, amount}] in dollars; the last item is the total.
  // Resolves 'completed' | 'canceled' | 'failed'.
  async pay({ pk, clientSecret, items }) {
    await apInit(pk);
    await StripeNative.createApplePay({
      paymentIntentClientSecret: clientSecret,
      paymentSummaryItems: items,
      merchantIdentifier: APPLE_MERCHANT_ID,
      countryCode: 'US',
      currency: 'USD',
    });
    const { paymentResult } = await StripeNative.presentApplePay();
    if (paymentResult === 'applePayCompleted') return 'completed';
    if (paymentResult === 'applePayCanceled') return 'canceled';
    return 'failed';
  },
};

/* ------------------------------------------------------------------ *
 *  Live Activity — native plugin CAFLivePlugin (ios/App/App). The page
 *  calls window.CAF_LIVE.start/update/end; the activity's push token goes
 *  to the server so it can update the lock screen while the app is closed.
 * ------------------------------------------------------------------ */
const CAFLive = registerPlugin('CAFLive');
function setupLiveActivity() {
  const call = (fn, opts) => CAFLive[fn](opts || {}).catch(() => ({ ok: false }));
  window.CAF_LIVE = {
    start: (o) => call('start', o),
    update: (o) => call('update', o),
    end: (o) => call('end', o),
  };
  CAFLive.addListener('pushToken', ({ token, bookingId }) => {
    if (token && bookingId && typeof window.mkApi === 'function') {
      window.mkApi('/api/bookings/activity', { bookingId, token }).catch(() => {});
    }
  });
}

// Development builds only: walks the Live Activity through a booking in ~40s.
async function liveActivityDemo() {
  if (!__CAF_DEV__ || !window.CAF_LIVE) return;
  const L = window.CAF_LIVE, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await L.start({ bookingId: 'demo', barberName: 'Andre Cole', initials: 'AC', service: 'Skin Fade',
    status: 'accepted', headline: 'Andre accepted', detail: 'Getting ready to come to you', eta: 0, step: 1 });
  await wait(8000);
  for (const m of [6, 5, 4]) { await L.update({ status: 'en_route', headline: 'Andre is on the way', detail: 'Coming to your place', eta: m, step: 2 }); await wait(6000); }
  await L.update({ status: 'arrived', headline: 'Andre has arrived', detail: 'Share your PIN: 4821', eta: 0, step: 3 });
  await wait(8000);
  await L.end({ status: 'completed', headline: 'Cut complete', detail: 'Thanks for booking with Catch a Fade', eta: 0, step: 5 });
}
