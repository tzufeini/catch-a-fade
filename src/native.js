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
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { SocialLogin } from '@capgo/capacitor-social-login';

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
  safe(() => App.addListener('backButton', () => {
    if (typeof window.back === 'function') window.back();
  }));

  // ---- haptics: upgrade the page's haptic() to real Taptic Engine ----
  window.haptic = function () { safe(() => Haptics.impact({ style: ImpactStyle.Light })); };

  // ---- geolocation: route navigator.geolocation through CoreLocation ----
  installGeolocation();

  // ---- real social sign-in ----
  await initSocialLogin();
  window.openAppleAuth = appleSignIn;
  window.openGoogleAuth = googleSignIn;

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
          const p = await Geolocation.getCurrentPosition({
            enableHighAccuracy: opts.enableHighAccuracy !== false,
            timeout: opts.timeout || 12000,
            maximumAge: opts.maximumAge || 0,
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
    const p = (result && result.profile) || {};
    const name = [p.givenName, p.familyName].filter(Boolean).join(' ').trim();
    setProfile(name, p.email);          // Apple only sends name/email on the FIRST sign-in
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
      // Best-effort: hand the device token to the backend so it can send
      // booking updates. The endpoint is optional; failure is harmless.
      if (window.API_BASE) {
        safe(() => fetch(window.API_BASE + '/api/register-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value, platform: 'ios' }),
        }).catch(() => {}));
      }
    });
    PushNotifications.addListener('pushNotificationReceived', (n) => {
      toast(n.title || 'Catch a Fade', n.body || '');
    });
    PushNotifications.addListener('pushNotificationActionPerformed', () => {});
  });
}

async function registerPush() {
  if (_pushHooked) return; _pushHooked = true;
  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm && perm.receive === 'granted') await PushNotifications.register();
  } catch (e) { /* user declined — fine */ }
}
