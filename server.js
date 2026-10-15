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
// Flat cancellation fee kept outside the free window (matches the in-app copy and the Terms).
const CANCEL_FEE_CENTS = Math.round(Number(process.env.CANCEL_FEE_CENTS || LOCAL.CANCEL_FEE_CENTS || 500));
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
// Optional second Stripe account in TEST mode, used only for Apple's review
// account once the main keys are live (the reviewer pays with a test card).
const STRIPE_TEST_SECRET = process.env.STRIPE_TEST_SECRET_KEY || LOCAL.STRIPE_TEST_SECRET_KEY || '';
const STRIPE_TEST_PUBLISHABLE = process.env.STRIPE_TEST_PUBLISHABLE_KEY || LOCAL.STRIPE_TEST_PUBLISHABLE_KEY || '';
let stripeTest = null;
try {
  if (STRIPE_TEST_SECRET && STRIPE_TEST_PUBLISHABLE) {
    const Stripe = require('stripe');
    const o = { timeout: 30000, maxNetworkRetries: 2 };
    if (typeof Stripe.createFetchHttpClient === 'function') o.httpClient = Stripe.createFetchHttpClient();
    stripeTest = Stripe(STRIPE_TEST_SECRET, o);
  }
} catch (e) { console.warn('stripe test client not loaded:', e.message); }

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
// Real marketplace: bookings lifecycle, payment holds, Stripe Connect payouts,
// barber approval. See marketplace.js.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || LOCAL.ADMIN_EMAILS || 'tzufeini@gmail.com')
  .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
let marketplace = null;   // built below, once the helpers it needs exist
const SUPPORT_SYSTEM = [
  'You are CAF Support, the in-app support assistant for Catch a Fade (CatchAFade), an on-demand mobile barber marketplace — customers book a verified barber who travels to them. Introduce yourself as CAF Support if asked who you are.',
  'Policies you know:',
  '- Cancellation: free within the first 2 minutes after booking; after that a flat $5 cancellation fee applies (the same as a rideshare). No fee if the barber is running more than 5 minutes late. The fee compensates the barber for their time.',
  '- Arrival PIN: a 4-digit code shown to the customer when the barber arrives; the barber enters it in their app to confirm they are at the right address, then the cut starts.',
  '- Tipping: pre-tip at booking or tip after the cut on the rating screen; 100% of tips go to the barber.',
  '- Pricing: the barber\'s base rate per service; at peak demand a small multiplier may apply and is always shown before confirming.',
  '- No-shows: if the barber is more than 10 minutes past the promised ETA, the booking auto-cancels at no cost and the customer is rematched with another verified pro nearby.',
  '- Lost items: use "Report a lost item" on the Help screen; support connects the customer with their barber.',
  '- Safety: barbers submit a government ID and a portfolio, which our team reviews before they can take bookings ("Verified Pro" badge). Do not claim we run criminal background checks.',
  '- There is no paid membership or subscription. If asked, say the app is free to download and customers only pay per booking.',
  '- Refunds: cancelling a booking automatically refunds the card (in full inside the free window, otherwise minus the $5 fee); banks usually show it in 3-5 business days. For anything else use "Get help" on the booking.',
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

// ---- abuse control ---------------------------------------------------------
// The payment endpoint mints real Stripe PaymentIntents, so it must not be an
// open faucet: an unauthenticated, unlimited endpoint is the classic
// card-testing target. Simple in-memory sliding window, per IP.
const RATE_BUCKETS = new Map();
function rateLimited(req, key, limit, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'unknown';
  const id = key + '|' + ip;
  const now = Date.now();
  const hits = (RATE_BUCKETS.get(id) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) { RATE_BUCKETS.set(id, hits); return true; }
  hits.push(now); RATE_BUCKETS.set(id, hits);
  if (RATE_BUCKETS.size > 5000) {                       // keep the map bounded
    for (const [k, v] of RATE_BUCKETS) if (!v.some(t => now - t < windowMs)) RATE_BUCKETS.delete(k);
  }
  return false;
}
// A booking is a real haircut, so the amount has sane bounds. This blocks both
// the "pay 63 cents for a $40 cut" tamper and absurd/accidental charges.
const MIN_SERVICE_CENTS = 500;      // $5
const MAX_SERVICE_CENTS = 50000;    // $500
function sendJSON(res, status, obj) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, CORS));
  res.end(JSON.stringify(obj));
}
// Never write a full email address (or other PII) into the logs — mask it so
// operational logs stay useful without becoming a personal-data store.
function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return '***';
  const name = s.slice(0, at), dom = s.slice(at);
  return (name.length <= 2 ? name[0] + '*' : name[0] + '***' + name[name.length - 1]) + dom;
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
  + '<h2>Who else processes your data</h2>'
  + '<p>We share the minimum necessary data with these service providers, and only so the app can work:</p>'
  + '<ul>'
  + '<li><b>Stripe</b> — payment processing. Card details go straight to Stripe; we never receive or store them.</li>'
  + '<li><b>Supabase</b> — account, authentication and booking records.</li>'
  + '<li><b>Resend</b> — delivers your sign-in code by email.</li>'
  + '<li><b>Anthropic</b> — powers the in-app support assistant and our automated barber identity check. What you type into support chat is sent to Anthropic to generate a reply. If you apply as a barber, your ID photo, selfie and profile photo are sent to Anthropic to confirm they show the same person.</li>'
  + '<li><b>Florida Department of Business and Professional Regulation</b> — if you apply as a barber, we check the license number you enter against the state\'s public license records.</li>'
  + '<li><b>Google Maps, OpenStreetMap/Nominatim and Photon (Komoot)</b> — maps, and address search. When you type an address to search, that text is sent to a maps provider to return suggestions.</li>'
  + '</ul>'
  + '<p>We do not sell your personal data, and we do not share it for advertising.</p>'
  + '<h2>How we use and share it</h2><p>We use your information only to run the service: creating your account, arranging bookings, processing payments, and providing support. We share with your barber only what a booking needs — your name and the booking location. We do not sell your personal information.</p>'
  + '<h2>Barber applications</h2><p>Barber applications are reviewed automatically: we confirm your license is active in Florida\'s public records and use an automated check to confirm your ID, selfie and profile photo match the name in your application. You\'re told the reason if we can\'t approve you, and you can correct it and apply again. ID photos and selfies are stored privately; your profile photo is shown to customers once you\'re approved.</p>'
  + '<h2>Deleting your account</h2><p>You can delete your account at any time in the app under <b>Account</b>. This removes your profile and the data associated with it.</p>'
  + '<h2>Contact</h2><p>Questions about this policy? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const TERMS_HTML = pageHTML('Terms of Service — Catch a Fade',
  '<h1>Terms of Service</h1><p class="muted">Catch a Fade &middot; Effective July 1, 2026</p>'
  + '<p>By using Catch a Fade you agree to these terms.</p>'
  + '<h2>The service</h2><p>Catch a Fade is a marketplace that connects customers with independent barbers. We provide the platform; the barbers provide the services.</p>'
  + '<h2>Independent barbers</h2><p>Barbers on Catch a Fade are independent contractors, not our employees. They set their own prices and are responsible for the services they deliver. Barbers also agree to the <a href="/barber-agreement">Independent Barber Agreement</a>.</p>'
  + '<h2>Prices and payments</h2><p>Prices in the app are all-in: each price includes the barber\'s rate and Catch a Fade\'s service fee. When demand is high in your area, prices may be higher; the app tells you when that\'s the case, and you always see the total before you confirm. With Wait &amp; Save you pay less because you\'re flexible: your barber may arrive any time in the next 2 hours. Tips are optional and go entirely to your barber. Payments are processed by Stripe.</p>'
  + '<h2>Cancellations</h2><p>You may cancel free of charge before a barber accepts your request and for 2 minutes after they accept. After that, or once the barber has arrived, a flat $5 cancellation fee applies to compensate the barber for their time.</p>'
  + '<h2>Your account</h2><p>Keep your account information accurate and your login to yourself. You can delete your account at any time in the app under <b>Account</b>.</p>'
  + '<h2>Governing law</h2><p>These terms are governed by the laws of the State of Florida, United States.</p>'
  + '<h2>Contact</h2><p>Questions about these terms? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const BARBER_AGREEMENT_HTML = pageHTML('Independent Barber Agreement — Catch a Fade',
  '<h1 style="margin-bottom:20px">Independent Barber Agreement</h1>'
  + "<h2>A. Introduction</h2>\n<p>This Independent Barber Agreement (the \"Agreement\") constitutes a binding contract between you, the individual barber accepting it (\"you\" or \"Barber\"), and Zuf Eini, doing business as Catch a Fade (\"Catch a Fade,\" \"we,\" \"us\" or \"our\"). The Agreement governs the terms under which you may access and use the Catch a Fade mobile application, website and related technology (collectively, the \"Platform\") for the purpose of offering barbering and grooming services (the \"Services\") to individuals who request them through the Platform (\"Customers\").</p>\n<p>This Agreement is to be read in conjunction with the Catch a Fade Terms of Service and Privacy Policy, which are incorporated herein by reference. In the event of a conflict between those documents and this Agreement with respect to your activities as a Barber, this Agreement shall prevail. You indicate your acceptance of this Agreement by selecting \"Agree\" within the Platform.</p>\n<h2>B. Definitions</h2>\n<p>For the purposes of this Agreement: a \"Booking\" means a request for Services submitted by a Customer and accepted by you through the Platform; the \"Listed Price\" means the price you establish within the Platform for a particular Service; the \"Service Fee\" means the fee charged by Catch a Fade to Customers for use of the Platform, which is separate from and in addition to the Listed Price; a \"Cancellation Fee\" means the fee payable by a Customer who cancels a Booking outside the free-cancellation period described in the Platform; and \"Customer Information\" means any information relating to a Customer that you obtain through the Platform, including names, addresses, locations, telephone numbers, photographs and messages.</p>\n<h2>C. Eligibility</h2>\n<p>Access to the Platform as a Barber is conditional upon your satisfying, and continuing to satisfy, each of the following requirements: you are at least eighteen (18) years of age; you possess the legal capacity to enter into a binding contract; you hold every license required by law to perform the Services for compensation in the jurisdiction in which you perform them; and you have successfully completed the application and verification process established by Catch a Fade.</p>\n<p>You undertake to furnish information that is accurate, current and complete, and to update such information promptly whenever it changes. Each Barber may maintain only one account. Your account is personal to you and may not be shared with, transferred to or operated by any other person, nor may any other person perform Services under it.</p>\n<h2>D. Nature of the Relationship</h2>\n<p>The relationship between you and Catch a Fade is that of independent contracting parties. Nothing in this Agreement shall be construed to create an employment, agency, partnership, franchise or joint-venture relationship between the parties, and neither party possesses the authority to enter into contracts or assume obligations on behalf of the other.</p>\n<p>You retain sole and exclusive discretion over whether, when and where to make yourself available through the Platform, over which requests to accept or decline, and over the manner and means by which the Services are performed, subject only to the standards set forth in this Agreement. You shall not be entitled to wages, salary, overtime compensation, employee benefits or reimbursement of expenses from Catch a Fade.</p>\n<p>This Agreement is non-exclusive. You remain free at all times to provide services through other platforms, through your own establishment, or directly to clients of your own.</p>\n<h2>E. Licensure and Verification</h2>\n<p>You represent and warrant that you hold, and covenant that you shall maintain in good standing for the duration of your use of the Platform, every license required by applicable law to perform the Services for compensation. In the State of Florida, this requirement includes a valid barber license issued by the Florida Department of Business and Professional Regulation.</p>\n<p>In connection with your application, you shall provide your license number, a photograph of a valid government-issued identification document and a photograph of yourself. You hereby authorize Catch a Fade to use such information for the purpose of verifying your identity and licensure, including by reference to publicly available licensing records. Your account must be approved by Catch a Fade before you may accept Bookings.</p>\n<p>You shall notify Catch a Fade without undue delay should your license lapse or be suspended, restricted or revoked, or should any information previously provided become inaccurate. Catch a Fade may suspend your access to the Platform where your licensure or identity cannot be verified.</p>\n<p>You shall comply with all laws, regulations and professional standards applicable to the Services, including those governing health, sanitation, infection control and safety.</p>\n<h2>F. Account Security and Profile</h2>\n<p>You are responsible for maintaining the confidentiality of your account credentials and for all activity conducted through your account. You shall inform Catch a Fade immediately upon becoming aware of any unauthorized access to or use of your account. You are further responsible for ensuring that your profile, including your name, photographs, description, Services and Listed Prices, is accurate and not misleading.</p>\n<h2>G. Bookings and Performance of Services</h2>\n<p>When you elect to go online, the Platform may present you with requests from Customers in your vicinity. Each request discloses the Service requested, its Listed Price and the Customer's approximate location, so that you may make an informed decision before accepting it.</p>\n<p>While you are online or engaged in a Booking, the Platform processes your device's location in order to match you with nearby requests and to inform the Customer of your progress toward the agreed location. You may discontinue location sharing at any time by going offline.</p>\n<p>Upon accepting a Booking, you shall travel to the Customer's location, verify the Customer's arrival PIN within the Platform before commencing the Service, perform the Service with due care and skill, and record the Booking as complete within the Platform. Communications with Customers regarding a Booking shall be conducted through the Platform's messaging features.</p>\n<h2>H. Pricing, Payments and Payouts</h2>\n<p><b>Determination of prices.</b> Each Barber determines, in their sole discretion, the Listed Price of every Service they offer through the Platform. Listed Prices may be revised at any time, and any revision shall apply only to Bookings requested after it takes effect.</p>\n<p><b>Payment processing.</b> Customers remit payment through the Platform, and all payments are processed by Stripe, Inc. and its affiliates (\"Stripe\"). As a condition of receiving payouts, you shall establish a connected account with Stripe and accept the Stripe Connected Account Agreement, which incorporates the Stripe Services Agreement. Catch a Fade is not a bank, money transmitter or escrow agent and does not hold funds on your behalf.</p>\n<p><b>Compensation.</b> In respect of each completed Booking, you shall receive one hundred percent (100%) of the Listed Price of the Service performed. The Service Fee is charged to the Customer in addition to the Listed Price, is retained by Catch a Fade, and does not form part of your compensation. Customers are shown a single price that includes the Service Fee. During periods of high demand in an area, the price shown to Customers and your compensation for a Booking may both be increased by the same multiplier, and the amount you will earn is shown to you with each request before you accept it. Tips paid by Customers through the Platform are remitted to you in full. Some requests are flexible (\"Wait &amp; Save\") and may be accepted at any time within the window shown with the request; your compensation for a flexible Booking is your Listed Price. Catch a Fade may offer optional incentives, such as a bonus for completing a number of Bookings in a week, on the terms shown in the Platform at the time. Cancellation Fees paid by Customers in accordance with the Platform's cancellation policy shall be remitted to you.</p>\n<p><b>Payouts.</b> Payouts are disbursed to the bank account you designate through Stripe in accordance with Stripe's payout schedule. Catch a Fade shall bear no responsibility for delays attributable to Stripe or to your financial institution.</p>\n<p><b>Refunds and adjustments.</b> Where a Customer payment is refunded or reversed because a Booking was not performed as agreed, the corresponding compensation may be adjusted. Catch a Fade shall notify you of any such adjustment and afford you a reasonable opportunity to respond before it is finalized.</p>\n<h2>I. Taxes</h2>\n<p>You bear sole responsibility for determining, reporting and remitting all taxes arising from your compensation. Stripe may issue to you an IRS Form 1099 or other tax documentation where required by law. Catch a Fade does not withhold taxes from amounts payable to you.</p>\n<h2>J. Equipment and Expenses</h2>\n<p>You shall furnish, at your own expense, all tools, equipment, products, supplies and means of transportation necessary for the performance of the Services, and shall bear all costs incurred in connection with the Services, including the cost of travel to Customer locations.</p>\n<h2>K. Professional Conduct and Safety</h2>\n<p>You shall perform the Services in a professional, courteous and competent manner, shall arrive within the time you have indicated, and shall treat every Customer with dignity and respect. Before each Service, you shall clean and disinfect your tools and equipment in accordance with applicable sanitation standards.</p>\n<p>You shall not refuse, cancel or alter Services, or otherwise treat any Customer differently, on the basis of race, color, religion, national origin, sex, sexual orientation, gender identity, disability, age or any other characteristic protected by law. Harassment, threats, violence, fraud, theft and any unsafe or unlawful conduct are strictly prohibited, as is the performance of Services while impaired by alcohol or any controlled substance.</p>\n<p>You shall use the Platform's safety features as intended, including arrival-PIN verification, and shall report any safety incident to Catch a Fade promptly.</p>\n<h2>L. Ratings and Reviews</h2>\n<p>Customers may rate and review the Services you perform, and such ratings and reviews may be displayed on your profile. Ratings serve to maintain the quality and safety of the Platform. Catch a Fade reserves the right to remove reviews that are abusive, unlawful or unrelated to the Services.</p>\n<h2>M. Customer Information and Data Protection</h2>\n<p>You shall use Customer Information solely for the purpose of completing the Booking to which it relates. You shall not disclose, sell, retain or otherwise use Customer Information for any other purpose, including marketing, and you shall delete any Customer Information stored outside the Platform upon completion of the relevant Booking.</p>\n<p>Catch a Fade collects and processes your personal information, including your location while you are online, in accordance with its Privacy Policy. Photographs of your identification document and of yourself are stored securely and are accessible only to those personnel of Catch a Fade responsible for reviewing applications.</p>\n<h2>N. License and Intellectual Property</h2>\n<p>Subject to your continued compliance with this Agreement, Catch a Fade grants you a limited, revocable, non-exclusive and non-transferable license to use the Platform solely for the purpose of offering and performing the Services. You shall not copy, modify, adapt, reverse engineer, resell or interfere with the Platform, nor access it by automated means. The name \"Catch a Fade\" and its associated logos are the property of Catch a Fade and may not be used without prior written consent, except as displayed within the Platform.</p>\n<p>You retain all ownership rights in the photographs and other content you upload to your profile. You grant Catch a Fade a non-exclusive, royalty-free license to display such content within the Platform for so long as it remains on your profile.</p>\n<h2>O. Insurance</h2>\n<p>You are encouraged to obtain and maintain professional and general liability insurance appropriate to the Services you perform. Catch a Fade does not provide insurance coverage of any kind for you or for the Services.</p>\n<h2>P. Indemnification</h2>\n<p>To the fullest extent permitted by applicable law, you shall indemnify, defend and hold harmless Catch a Fade from and against any and all claims, liabilities, damages, losses and expenses, including reasonable attorneys' fees, arising out of or relating to the Services you perform, your breach of this Agreement, or your violation of any law or of the rights of any third party.</p>\n<h2>Q. Disclaimer of Warranties</h2>\n<p>The Platform is provided on an \"as is\" and \"as available\" basis. To the fullest extent permitted by applicable law, Catch a Fade disclaims all warranties, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose and non-infringement. Catch a Fade does not guarantee any minimum volume of requests, Bookings or compensation, nor that the Platform will operate without interruption or error.</p>\n<h2>R. Limitation of Liability</h2>\n<p>To the fullest extent permitted by applicable law, Catch a Fade shall not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits or revenue, arising out of or relating to this Agreement or the Platform. The aggregate liability of Catch a Fade for all claims arising out of or relating to this Agreement shall not exceed the greater of one hundred United States dollars (US$100) or the amount of any compensation owed to you under Section H that remains unpaid. Nothing in this Agreement excludes or limits any liability that cannot be excluded or limited under applicable law.</p>\n<h2>S. Suspension and Termination</h2>\n<p>You may terminate this Agreement at any time by ceasing to make yourself available through the Platform or by deleting your account. Catch a Fade may likewise terminate this Agreement at any time.</p>\n<p>Catch a Fade may suspend or deactivate your account where your licensure or identity cannot be verified or is no longer valid; where you commit a material or repeated breach of this Agreement or of Platform policies; where you receive consistently low Customer ratings; or where suspension is reasonably necessary to protect the safety of Customers, Barbers or the public. Where practicable, Catch a Fade shall inform you of the reason for such action, and you may request a review of the decision through the Platform.</p>\n<p>Compensation for Bookings completed prior to termination shall be paid in accordance with Section H. Sections H (with respect to refunds and adjustments), I, M, N, P, Q, R, V and W shall survive the termination of this Agreement.</p>\n<h2>T. Amendments</h2>\n<p>Catch a Fade may amend this Agreement from time to time. Where an amendment is material, the revised Agreement shall be presented within the Platform. Your continued use of the Platform as a Barber after a revised Agreement takes effect shall constitute your acceptance of it. Should you not accept a revised Agreement, you must discontinue your use of the Platform as a Barber.</p>\n<h2>U. Electronic Communications and Notices</h2>\n<p>You consent to receive communications from Catch a Fade in electronic form, including through the Platform, by push notification and by electronic mail sent to the address associated with your account, and you agree that such communications satisfy any legal requirement that they be in writing.</p>\n<h2>V. Governing Law and Jurisdiction</h2>\n<p>This Agreement shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict-of-laws principles. Any dispute arising out of or relating to this Agreement shall be brought exclusively in the state or federal courts located in Alachua County, Florida, and each party irrevocably submits to the personal jurisdiction of such courts.</p>\n<h2>W. General Provisions</h2>\n<p><b>Entire agreement.</b> This Agreement, together with the Terms of Service and Privacy Policy, constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior understandings relating thereto.</p>\n<p><b>Severability.</b> Should any provision of this Agreement be held invalid or unenforceable, that provision shall be enforced to the maximum extent permissible and the remaining provisions shall continue in full force and effect.</p>\n<p><b>Waiver.</b> No failure or delay by either party in exercising any right under this Agreement shall operate as a waiver of that right or of any other right.</p>\n<p><b>Assignment.</b> You may not assign or transfer this Agreement without the prior written consent of Catch a Fade. Catch a Fade may assign this Agreement to an affiliate or to a successor in connection with a merger, acquisition or sale of all or substantially all of its business or assets.</p>\n<p><b>Force majeure.</b> Neither party shall be liable for any failure or delay in performance resulting from causes beyond its reasonable control.</p>\n<p><b>Headings.</b> Section headings are included for convenience of reference only and shall not affect the interpretation of this Agreement.</p>\n<h2>X. Contact</h2>\n<p>Questions concerning this Agreement may be submitted through Help &amp; Support within the Catch a Fade application.</p>");
const SUPPORT_HTML = pageHTML('Catch a Fade Support',
  '<h1>Catch a Fade Support</h1>'
  + '<p>Need a hand? Email us at <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a> and we\'ll get back to you.</p>'
  + '<p>For the fastest answers, use the in-app <b>Help &amp; Support</b> chat, available right inside the app.</p>');

const MARKETPLACE_PATHS = new Set([
  '/api/me', '/api/review-setup', '/api/register-push', '/api/create-payment-intent', '/api/bookings/request', '/api/bookings/action',
  '/api/connect/onboard', '/api/connect/status', '/api/connect/dashboard', '/connect/done', '/connect/refresh',
  '/api/admin/barbers', '/api/admin/verify', '/api/admin/review', '/api/barber/docs', '/api/barber/compliance',
  '/api/barber/submitted', '/api/barber/review-status', '/api/barber/portfolio', '/api/portfolio', '/api/license-check', '/api/pricing',
  '/api/bookings/activity', '/api/tips', '/api/tips/confirm', '/api/barber/demand', '/api/barber/quests'
]);
// Transactional email via Resend. Until a domain is verified (MAIL_FROM), Resend's
// test sender only delivers to the account owner, so other addresses fail quietly.
async function sendEmail(to, subject, text) {
  if (!RESEND_KEY || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || FROM, to, subject, text })
    });
    return r.ok;
  } catch (e) { return false; }
}
const mapkit = require('./mapkit')(Object.assign({}, LOCAL, process.env));
marketplace = require('./marketplace')({
  stripe, supabase, sendJSON, sendHTML, pageHTML, rateLimited, FEE_PERCENT, CANCEL_FEE_CENTS,
  REVIEW_EMAIL, REVIEW_CODE, ADMIN_EMAILS, MIN_SERVICE_CENTS, MAX_SERVICE_CENTS,
  push: require('./push')(Object.assign({}, LOCAL, process.env)),
  stripeTest, STRIPE_PUBLISHABLE, STRIPE_TEST_PUBLISHABLE,
  anthropicKey: ANTHROPIC_KEY, sendEmail
});

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) marketplace.ensureReviewAccounts().catch(() => {});
  if (MARKETPLACE_PATHS.has(url.pathname) || /^\/b\/[0-9a-f-]{36}$/.test(url.pathname)) {
    marketplace.handle(req, res, url).then((handled) => {
      if (!handled) sendJSON(res, 404, { ok: false, error: 'not found' });
    }).catch((err) => {
      console.error('[marketplace]', url.pathname, err && err.message);
      if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }

  // Apple Maps (MapKit JS) token for the app's maps. Rate-limited per IP.
  if (req.method === 'GET' && url.pathname === '/api/mapkit-token') {
    if (rateLimited(req, 'mapkit', 120, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'rate limited' });
    if (!mapkit.enabled) return sendJSON(res, 200, { ok: false, error: 'maps not configured' });
    try { return sendJSON(res, 200, { ok: true, token: mapkit.token() }); }
    catch (e) { console.error('[mapkit]', e && e.message); return sendJSON(res, 500, { ok: false, error: 'token error' }); }
  }

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
      if (rateLimited(req, 'send-code', 8, 60 * 1000)) {
        return sendJSON(res, 429, { ok: false, error: 'Too many code requests — please wait a minute.' });
      }
      if (!email || email.indexOf('@') < 1 || email.indexOf('.') < 2) {
        return sendJSON(res, 400, { ok: false, error: 'missing email' });
      }
      // App Review demo account: fixed code, nothing emailed.
      if (REVIEW_EMAIL && email === REVIEW_EMAIL) {
        OTP_STORE.set(email, { code: REVIEW_CODE, exp: Date.now() + OTP_TTL_MS, tries: 0 });
        console.log('[send-code]', maskEmail(email), 'mode=review (fixed code, no email sent)');
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
        console.log('[send-code]', maskEmail(email), 'mode=' + mode, r.ok ? ('sent id=' + j.id) : ('FAILED ' + r.status + ' ' + (j && j.message)));
        if (r.ok) return sendJSON(res, 200, { ok: true, id: j.id, mode });
        if (mode === 'local') OTP_STORE.delete(email);
        // Resend refused (e.g. test-mode recipient restriction) — tell the client so it can explain honestly.
        return sendJSON(res, 200, { ok: false, error: (j && j.message) || ('resend ' + r.status), restricted: r.status === 403 });
      } catch (err) {
        if (mode === 'local') OTP_STORE.delete(email);
        console.error('[send-code] email delivery error:', err && err.message || err);
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
        // Bound the upstream call: without a timeout a hung Anthropic request
        // would hold this connection open past the client's own deadline.
        const scCtl = new AbortController();
        const scTimer = setTimeout(() => scCtl.abort(), 30000);
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          signal: scCtl.signal,
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
        clearTimeout(scTimer);
        if (r.ok) {
          const reply = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          if (reply) return sendJSON(res, 200, { ok: true, reply });
          return sendJSON(res, 200, { ok: false, error: 'empty reply' });
        }
        return sendJSON(res, 200, { ok: false, error: (j && j.error && j.error.message) || ('anthropic ' + r.status) });
      } catch (err) {
        console.error('[support-chat] anthropic error:', err && err.message || err);
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Device push tokens from the iOS app. Stored in memory for now; a real
  // deployment would persist these and use them to send APNs booking updates.
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

  // Refund a cancelled booking. The app charges up front, so a cancellation has
  // to put the money back: full refund inside the free-cancellation window,
  // otherwise everything except the flat cancellation fee.
  if (req.method === 'POST' && url.pathname === '/api/refund-booking') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      if (!stripe) return sendJSON(res, 200, { ok: false, configured: false });
      if (rateLimited(req, 'refund', 10, 60 * 1000)) {
        return sendJSON(res, 429, { ok: false, error: 'Too many requests — please wait a moment.' });
      }
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const piId = String(data.paymentIntentId || '').trim();
      if (!/^pi_[A-Za-z0-9_]+$/.test(piId)) return sendJSON(res, 400, { ok: false, error: 'invalid paymentIntentId' });
      const freeWindow = !!data.freeCancellation;
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        // Nothing captured yet → cancel outright, nothing to refund.
        if (pi.status !== 'succeeded') {
          try { await stripe.paymentIntents.cancel(piId); } catch (e) {}
          return sendJSON(res, 200, { ok: true, refunded: 0, cancelled: true });
        }
        const charged = Number(pi.amount_received || pi.amount || 0);
        const feeCents = freeWindow ? 0 : CANCEL_FEE_CENTS;
        const refundAmount = Math.max(0, charged - feeCents);
        if (refundAmount <= 0) return sendJSON(res, 200, { ok: true, refunded: 0, cancellationFee: charged });
        const r = await stripe.refunds.create(
          { payment_intent: piId, amount: refundAmount, reason: 'requested_by_customer' },
          { idempotencyKey: 'refund_' + piId }
        );
        return sendJSON(res, 200, {
          ok: true, refunded: refundAmount, cancellationFee: feeCents,
          refundId: r.id, status: r.status
        });
      } catch (err) {
        console.error('[refund-booking] stripe error:', err && err.message || err);
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Standalone pages: privacy policy, terms of service, support.
  if (req.method === 'GET' && url.pathname === '/privacy') return sendHTML(res, PRIVACY_HTML);
  if (req.method === 'GET' && url.pathname === '/terms') return sendHTML(res, TERMS_HTML);
  if (req.method === 'GET' && url.pathname === '/support') return sendHTML(res, SUPPORT_HTML);
  if (req.method === 'GET' && url.pathname === '/barber-agreement') return sendHTML(res, BARBER_AGREEMENT_HTML);

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
      // The full report (which can contain names/phones/addresses) goes to the
      // support inbox, not to the server log — logs only get a masked breadcrumb.
      console.error('REPORT [' + category + ']' + (email ? ' from ' + maskEmail(email) : '') + ' (' + message.length + ' chars)');
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
server.listen(PORT, () => {
  console.log('CatchAFade server on http://localhost:' + PORT);
  marketplace.ensureReviewAccounts();
});
