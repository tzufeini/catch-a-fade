/* CatchAFade — static file server + tiny Resend email backend.
 * The Resend API key lives HERE (server-side) and is never sent to the browser.
 * Routes:
 *   POST /api/send-code     { email, code }  → emails the code via Resend
 *   POST /api/support-chat  { messages }     → AI support reply via Claude (needs ANTHROPIC_API_KEY)
 *   GET  /privacy | /terms | /support        → standalone policy/support pages (App Store links)
 *   POST /api/delete-account { accessToken } → verifies the session token, deletes the Supabase user
 *   POST /api/report        { category, message, email? } → logs + emails a user report
 *   everything else          → serves static files from this folder
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3789;
const ROOT = __dirname;

// Secrets come from env vars (production: set on the host) or keys.local.json (local dev, git-ignored).
let LOCAL = {};
try { LOCAL = require('./keys.local.json'); } catch (e) {}
const RESEND_KEY = process.env.RESEND_API_KEY || LOCAL.RESEND_API_KEY || '';
const FROM = 'CatchAFade <onboarding@resend.dev>'; // swap to your verified domain to email anyone

// App Review demo login: auth is email-OTP only, and Apple's reviewer can't
// receive our emails, so this one address signs in with a fixed code and no
// email is ever sent. Put both values in the App Store Connect review notes.
const REVIEW_EMAIL = String(process.env.REVIEW_EMAIL || LOCAL.REVIEW_EMAIL || 'review@catchafade.app').toLowerCase();
const REVIEW_CODE = String(process.env.REVIEW_CODE || LOCAL.REVIEW_CODE || '010101');

// Claude-powered support chat ("CAF Support" in the app). Without a key the app
// falls back to its built-in canned answers — nothing breaks.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || LOCAL.ANTHROPIC_API_KEY || '';
const SUPPORT_MODEL = 'claude-opus-4-8';
const PUSH_TOKENS = new Set(); // iOS device tokens registered for push (in-memory)

// ---- Stripe (payments) -----------------------------------------------------
// Customers pay US (the platform). We keep PLATFORM_FEE_PERCENT and the barber
// receives the rest via Stripe Connect (added once barbers have connected accounts).
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || LOCAL.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY || LOCAL.STRIPE_PUBLISHABLE_KEY || '';
const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || LOCAL.PLATFORM_FEE_PERCENT || 25); // 25% = Uber's standard take rate
let stripe = null;
try {
  if (STRIPE_SECRET) {
    const Stripe = require('stripe');
    // Force Stripe's fetch-based HTTP client — native fetch works on this host
    // (same path the Anthropic call uses), while the default Node https client
    // was throwing StripeConnectionError on the free-tier instance. Longer
    // timeout + retries ride out cold starts.
    const stripeOpts = { timeout: 30000, maxNetworkRetries: 2 };
    if (typeof Stripe.createFetchHttpClient === 'function') stripeOpts.httpClient = Stripe.createFetchHttpClient();
    stripe = Stripe(STRIPE_SECRET, stripeOpts);
  }
} catch (e) { console.warn('stripe lib not loaded:', e.message); }

// ---- Supabase (database / auth) --------------------------------------------
// Admin client (secret key) for privileged server-side work. The app talks to
// Supabase directly with the PUBLISHABLE key (safe, restricted by row-level security).
const SUPABASE_URL = process.env.SUPABASE_URL || LOCAL.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || LOCAL.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY || LOCAL.SUPABASE_SECRET_KEY || '';
let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_SECRET) {
    supabase = require('@supabase/supabase-js').createClient(SUPABASE_URL, SUPABASE_SECRET, { auth: { persistSession: false } });
  }
} catch (e) { console.warn('supabase lib not loaded:', e.message); }
const SUPPORT_SYSTEM = [
  'You are CAF Support, the in-app support assistant for Catch a Fade (CatchAFade), an on-demand mobile barber marketplace — customers book a verified barber who travels to them. Introduce yourself as CAF Support if asked who you are.',
  'Policies you know:',
  '- Cancellation: free within the first 2 minutes after booking; after that a flat $5 cancellation fee applies (the same as a rideshare). No fee if the barber is running more than 5 minutes late. The fee compensates the barber for their time.',
  '- Arrival PIN: a 4-digit code shown to the customer when the barber arrives; the barber enters it in their app to confirm they are at the right address, then the cut starts.',
  '- Tipping: pre-tip at booking or tip after the cut on the rating screen; 100% of tips go to the barber.',
  '- Pricing: the barber\'s base rate per service; at peak demand a small multiplier may apply and is always shown before confirming.',
  '- No-shows: if the barber is more than 10 minutes past the promised ETA, the booking auto-cancels at no cost and the customer is rematched with another verified pro nearby.',
  '- Lost items: use "Report a lost item" on the Help screen; support connects the customer with their barber.',
  '- Safety: every pro passes ID verification, a criminal background check, and a portfolio review ("Verified Pro" badge).',
  '- Catch a Fade+: membership with priority scheduling for favorite barbers.',
  '- Refunds: request via the booking\'s "Get help"; typically 3-5 business days.',
  'Style: warm, concise (2-4 short sentences), plain language. Never mention, compare to, or give examples from any other company or app. If unsure, say so and offer to connect a human teammate.',
  'Typos and broken grammar are fine — answer the intended question. But if a message is pure gibberish (keyboard mashing, random characters) with no discernible intent, do not guess: reply exactly "Sorry, I didn\'t get that 😅 Here\'s what I can help you with:" and nothing else (the app shows a help menu under it).',
].join('\n');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.gif': 'image/gif'
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};
function sendJSON(res, status, obj) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, CORS));
  res.end(JSON.stringify(obj));
}
function codeEmailHTML(code) {
  return '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto">'
    + '<h2 style="margin:0 0 6px">Your CatchAFade code</h2>'
    + '<p style="font-size:13px;color:#666;margin:0 0 16px">Enter this code to finish signing in. It expires shortly.</p>'
    + '<div style="font-size:36px;font-weight:800;letter-spacing:10px;background:#111;color:#fff;padding:18px 0;text-align:center;border-radius:14px">' + code + '</div>'
    + '<p style="font-size:12px;color:#999;margin-top:18px">If you didn\'t request this, you can safely ignore it.</p></div>';
}

// ---- Sign-in codes ----------------------------------------------------------
// The server owns code generation + email delivery (Resend), so sign-in works
// even when Supabase's own mailer is rate-limited or the project is paused.
// When Supabase is reachable we mint a REAL Supabase OTP (admin generate_link)
// so verifying it in the app creates a real session; otherwise we fall back to
// a server-stored code checked via /api/verify-code.
const OTP_STORE = new Map(); // email -> { code, exp, tries }
const OTP_TTL_MS = 10 * 60 * 1000;
function genLoginCode() {
  return String(require('crypto').randomInt(100000, 1000000));
}
async function fetchTimeout(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 5000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ac.signal })); }
  finally { clearTimeout(t); }
}
// Ask Supabase's admin API for a real email OTP for this address (creating the
// user if needed). Returns the 6-digit otp string, or null if Supabase is down.
async function supabaseEmailOtp(email) {
  if (!SUPABASE_URL || !SUPABASE_SECRET) return null;
  const H = { 'Authorization': 'Bearer ' + SUPABASE_SECRET, 'apikey': SUPABASE_SECRET, 'Content-Type': 'application/json' };
  try {
    // ensure the user exists (magiclink links only mint for existing users)
    await fetchTimeout(SUPABASE_URL + '/auth/v1/admin/users', {
      method: 'POST', headers: H, body: JSON.stringify({ email, email_confirm: true })
    }, 5000).catch(() => {}); // 422 "already registered" is fine
    const r = await fetchTimeout(SUPABASE_URL + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email })
    }, 5000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const otp = j.email_otp || (j.properties && j.properties.email_otp) || null;
    return (otp && /^\d{6}$/.test(String(otp))) ? String(otp) : null;
  } catch (e) { return null; }
}

// ---- Standalone pages (/privacy, /terms, /support) --------------------------
// Self-contained HTML the App Store (and anyone else) can link to directly.
function pageHTML(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + '</title>'
    + '<style>body{font-family:-apple-system,Segoe UI,sans-serif;max-width:680px;margin:0 auto;padding:28px 20px 60px;background:#fff;color:#1a1a1a;line-height:1.6}'
    + 'h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p,li{font-size:15px;color:#333;margin:0 0 12px}'
    + 'ul{padding-left:22px}li{margin:0 0 8px}.muted{font-size:13px;color:#888;margin:0 0 24px}a{color:#0a58d0}</style>'
    + '</head><body>' + body + '</body></html>';
}
function sendHTML(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}
const PRIVACY_HTML = pageHTML('Privacy Policy — Catch a Fade',
  '<h1>Privacy Policy</h1><p class="muted">Catch a Fade &middot; Effective July 1, 2026</p>'
  + '<p>Catch a Fade is an on-demand barber marketplace: customers book a verified barber who travels to them. This policy explains what information we collect and how we use it.</p>'
  + '<h2>What we collect</h2><ul>'
  + '<li><b>Account details</b> — your name, email address, and phone number, used to create your account and keep you updated about your bookings.</li>'
  + '<li><b>Location</b> — the address or location you provide for a booking, shared with your barber so they can come to you.</li>'
  + '<li><b>Booking activity</b> — the services you book, along with ratings and tips, so the app can show your history and match you with barbers.</li></ul>'
  + '<h2>Payments</h2><p>Payments are processed by Stripe. Your card number goes directly to Stripe and is never stored on our servers.</p>'
  + '<h2>Where your data lives</h2><p>Your account and booking data are stored with Supabase, our database and authentication provider.</p>'
  + '<h2>How we use and share it</h2><p>We use your information only to run the service: creating your account, arranging bookings, processing payments, and providing support. We share with your barber only what a booking needs — your name and the booking location. We do not sell your personal information.</p>'
  + '<h2>Deleting your account</h2><p>You can delete your account at any time in the app under <b>Account</b>. This removes your profile and the data associated with it.</p>'
  + '<h2>Contact</h2><p>Questions about this policy? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const TERMS_HTML = pageHTML('Terms of Service — Catch a Fade',
  '<h1>Terms of Service</h1><p class="muted">Catch a Fade &middot; Effective July 1, 2026</p>'
  + '<p>By using Catch a Fade you agree to these terms.</p>'
  + '<h2>The service</h2><p>Catch a Fade is a marketplace that connects customers with independent barbers. We provide the platform; the barbers provide the services.</p>'
  + '<h2>Independent barbers</h2><p>Barbers on Catch a Fade are independent contractors, not our employees. They set their own prices and are responsible for the services they deliver.</p>'
  + '<h2>Fees and payments</h2><p>A 25% platform service fee is added to the barber\'s listed price at checkout and shown before you confirm. Payments are processed by Stripe.</p>'
  + '<h2>Cancellations</h2><p>You may cancel free of charge within 2 minutes of booking. After that, a flat $5 cancellation fee applies to compensate the barber for their time.</p>'
  + '<h2>Your account</h2><p>Keep your account information accurate and your login to yourself. You can delete your account at any time in the app under <b>Account</b>.</p>'
  + '<h2>Governing law</h2><p>These terms are governed by the laws of the United States.</p>'
  + '<h2>Contact</h2><p>Questions about these terms? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const SUPPORT_HTML = pageHTML('Catch a Fade Support',
  '<h1>Catch a Fade Support</h1>'
  + '<p>Need a hand? Email us at <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a> and we\'ll get back to you.</p>'
  + '<p>For the fastest answers, use the in-app <b>Help &amp; Support</b> chat, available right inside the app.</p>');

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    console.log('[health]', (req.headers['user-agent'] || '').slice(0, 60));
    return sendJSON(res, 200, { ok: true, resend: !!RESEND_KEY, stripe: !!stripe, supabase: !!(SUPABASE_URL && SUPABASE_SECRET) });
  }

  if (req.method === 'POST' && url.pathname === '/api/send-code') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const email = String(data.email || '').trim().toLowerCase();
      if (!email || email.indexOf('@') < 1 || email.indexOf('.') < 2) {
        return sendJSON(res, 400, { ok: false, error: 'missing email' });
      }
      // App Review demo account: fixed code, nothing emailed.
      if (REVIEW_EMAIL && email === REVIEW_EMAIL) {
        OTP_STORE.set(email, { code: REVIEW_CODE, exp: Date.now() + OTP_TTL_MS, tries: 0 });
        console.log('[send-code]', email, 'mode=review (fixed code, no email sent)');
        return sendJSON(res, 200, { ok: true, mode: 'local' });
      }
      // Prefer a real Supabase OTP (verifying it creates a real session in the app);
      // fall back to a server-stored code when Supabase is paused/unreachable.
      let mode = 'supabase';
      let code = await supabaseEmailOtp(email);
      if (!code) {
        mode = 'local';
        // legacy clients still send their own code — honor it so old builds verify
        code = /^\d{6}$/.test(String(data.code || '')) ? String(data.code) : genLoginCode();
        OTP_STORE.set(email, { code, exp: Date.now() + OTP_TTL_MS, tries: 0 });
      }
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: email, subject: 'Your CatchAFade code is ' + code, html: codeEmailHTML(code) })
        });
        const j = await r.json().catch(() => ({}));
        console.log('[send-code]', email, 'mode=' + mode, r.ok ? ('sent id=' + j.id) : ('FAILED ' + r.status + ' ' + (j && j.message)));
        if (r.ok) return sendJSON(res, 200, { ok: true, id: j.id, mode });
        if (mode === 'local') OTP_STORE.delete(email);
        // Resend refused (e.g. test-mode recipient restriction) — tell the client so it can explain honestly.
        return sendJSON(res, 200, { ok: false, error: (j && j.message) || ('resend ' + r.status), restricted: r.status === 403 });
      } catch (err) {
        if (mode === 'local') OTP_STORE.delete(email);
        console.error('[create-payment-intent] stripe error:', err && err.message || err);
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/verify-code') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const email = String(data.email || '').trim().toLowerCase();
      const code = String(data.code || '').trim();
      const rec = OTP_STORE.get(email);
      if (!rec || Date.now() > rec.exp) { OTP_STORE.delete(email); return sendJSON(res, 200, { ok: false, error: 'expired' }); }
      rec.tries += 1;
      if (rec.tries > 6) { OTP_STORE.delete(email); return sendJSON(res, 200, { ok: false, error: 'too many attempts' }); }
      if (code !== rec.code) return sendJSON(res, 200, { ok: false, error: 'wrong code' });
      OTP_STORE.delete(email);
      return sendJSON(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/support-chat') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 200000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      // no key yet → tell the client to use its built-in answers
      if (!ANTHROPIC_KEY) return sendJSON(res, 200, { ok: false, configured: false });
      // sanitize: only role+content strings, alternating handled by the API; keep the last 20 turns
      const messages = (Array.isArray(data.messages) ? data.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        return sendJSON(res, 400, { ok: false, error: 'no user message' });
      }
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: SUPPORT_MODEL,
            max_tokens: 600,
            system: SUPPORT_SYSTEM,
            messages: messages
          })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const reply = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          if (reply) return sendJSON(res, 200, { ok: true, reply });
          return sendJSON(res, 200, { ok: false, error: 'empty reply' });
        }
        return sendJSON(res, 200, { ok: false, error: (j && j.error && j.error.message) || ('anthropic ' + r.status) });
      } catch (err) {
        console.error('[create-payment-intent] stripe error:', err && err.message || err);
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Device push tokens from the iOS app. Stored in memory for now; a real
  // deployment would persist these and use them to send APNs booking updates.
  if (req.method === 'POST' && url.pathname === '/api/register-push') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4000) req.destroy(); });
    req.on('end', () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false }); }
      const token = String(data.token || '').trim();
      if (token) { PUSH_TOKENS.add(token); console.log('registered push token (' + PUSH_TOKENS.size + ' total)'); }
      return sendJSON(res, 200, { ok: !!token });
    });
    return;
  }

  // Supabase: the app fetches the URL + PUBLISHABLE key (both safe to be public).
  if (req.method === 'GET' && url.pathname === '/api/supabase-config') {
    return sendJSON(res, 200, {
      ok: !!(SUPABASE_URL && SUPABASE_PUBLISHABLE),
      url: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE
    });
  }

  // Stripe: the app asks for the publishable key + fee to set up the payment sheet.
  if (req.method === 'GET' && url.pathname === '/api/stripe-config') {
    return sendJSON(res, 200, {
      ok: !!STRIPE_PUBLISHABLE,
      publishableKey: STRIPE_PUBLISHABLE,
      feePercent: FEE_PERCENT,
      mode: STRIPE_SECRET.startsWith('sk_live') ? 'live' : 'test'
    });
  }

  // Stripe: create a PaymentIntent for a booking.
  //   body: { servicePrice: <cents>, barberStripeAccount?: 'acct_...', currency? }
  // Fee-on-top model: customer pays servicePrice + our fee; the barber keeps their
  // full listed price; we keep the fee. When a barber connected account is passed,
  // Stripe auto-routes the split (application_fee_amount + transfer_data.destination).
  if (req.method === 'POST' && url.pathname === '/api/create-payment-intent') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      if (!stripe) return sendJSON(res, 200, { ok: false, configured: false });
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const servicePrice = Math.round(Number(data.servicePrice) || 0); // barber's price, in cents
      if (servicePrice < 50) return sendJSON(res, 400, { ok: false, error: 'invalid servicePrice (cents)' });
      const fee = Math.round(servicePrice * FEE_PERCENT / 100);
      const total = servicePrice + fee;                                // what the customer pays
      const currency = (data.currency || 'usd').toLowerCase();
      try {
        const params = {
          amount: total,
          currency,
          automatic_payment_methods: { enabled: true },
          metadata: { servicePrice: String(servicePrice), platformFee: String(fee), feePercent: String(FEE_PERCENT) }
        };
        // If we already have the barber's Stripe Connect account, split automatically.
        if (data.barberStripeAccount) {
          params.application_fee_amount = fee;
          params.transfer_data = { destination: String(data.barberStripeAccount) };
        }
        const pi = await stripe.paymentIntents.create(params);
        return sendJSON(res, 200, {
          ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id,
          breakdown: { servicePrice, platformFee: fee, total, feePercent: FEE_PERCENT }
        });
      } catch (err) {
        console.error('[create-payment-intent] stripe error:', err && err.message || err);
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Standalone pages: privacy policy, terms of service, support.
  if (req.method === 'GET' && url.pathname === '/privacy') return sendHTML(res, PRIVACY_HTML);
  if (req.method === 'GET' && url.pathname === '/terms') return sendHTML(res, TERMS_HTML);
  if (req.method === 'GET' && url.pathname === '/support') return sendHTML(res, SUPPORT_HTML);

  // Delete account: the app sends the signed-in user's access token; we verify it
  // against Supabase auth, then delete the user (the profiles row cascade cleans
  // up related rows).
  if (req.method === 'POST' && url.pathname === '/api/delete-account') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const accessToken = String(data.accessToken || '').trim();
      if (!accessToken) return sendJSON(res, 400, { ok: false, error: 'missing accessToken' });
      if (!supabase || !SUPABASE_URL || !SUPABASE_PUBLISHABLE) return sendJSON(res, 400, { ok: false, error: 'supabase not configured' });
      try {
        const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
          headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + accessToken }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.id) return sendJSON(res, 400, { ok: false, error: 'invalid token' });
        const del = await supabase.auth.admin.deleteUser(j.id);
        if (del.error) return sendJSON(res, 400, { ok: false, error: del.error.message });
        console.log('deleted account ' + j.id);
        return sendJSON(res, 200, { ok: true });
      } catch (err) {
        return sendJSON(res, 400, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // User reports (bugs, complaints, safety). Always logged server-side; also
  // emailed to us via Resend when a key is configured. Best-effort — never fails.
  if (req.method === 'POST' && url.pathname === '/api/report') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { data = {}; }
      const category = String(data.category || 'general').slice(0, 200);
      const message = String(data.message || '').slice(0, 5000);
      const email = String(data.email || '').trim().slice(0, 200);
      console.error('REPORT [' + category + ']' + (email ? ' from ' + email : '') + ': ' + message);
      if (RESEND_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: FROM, to: 'TZUFEINI@gmail.com', subject: 'CAF report: ' + category,
              text: message + (email ? '\n\nReply to: ' + email : '')
            })
          });
        } catch (e) { console.warn('report email failed:', e && e.message); }
      }
      return sendJSON(res, 200, { ok: true });
    });
    return;
  }

  // Static files
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  });
});
server.listen(PORT, () => console.log('CatchAFade server (static + Resend) on http://localhost:' + PORT));
