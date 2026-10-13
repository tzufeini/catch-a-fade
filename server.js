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
  + '<li><b>Anthropic</b> — powers the in-app support assistant. What you type into support chat is sent to Anthropic to generate a reply.</li>'
  + '<li><b>Google Maps, OpenStreetMap/Nominatim and Photon (Komoot)</b> — maps, and address search. When you type an address to search, that text is sent to a maps provider to return suggestions.</li>'
  + '</ul>'
  + '<p>We do not sell your personal data, and we do not share it for advertising.</p>'
  + '<h2>How we use and share it</h2><p>We use your information only to run the service: creating your account, arranging bookings, processing payments, and providing support. We share with your barber only what a booking needs — your name and the booking location. We do not sell your personal information.</p>'
  + '<h2>Deleting your account</h2><p>You can delete your account at any time in the app under <b>Account</b>. This removes your profile and the data associated with it.</p>'
  + '<h2>Contact</h2><p>Questions about this policy? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const TERMS_HTML = pageHTML('Terms of Service — Catch a Fade',
  '<h1>Terms of Service</h1><p class="muted">Catch a Fade &middot; Effective July 1, 2026</p>'
  + '<p>By using Catch a Fade you agree to these terms.</p>'
  + '<h2>The service</h2><p>Catch a Fade is a marketplace that connects customers with independent barbers. We provide the platform; the barbers provide the services.</p>'
  + '<h2>Independent barbers</h2><p>Barbers on Catch a Fade are independent contractors, not our employees. They set their own prices and are responsible for the services they deliver. Barbers also agree to the <a href="/barber-agreement">Independent Barber Agreement</a>.</p>'
  + '<h2>Fees and payments</h2><p>A 25% platform service fee is added to the barber\'s listed price at checkout and shown before you confirm. Payments are processed by Stripe.</p>'
  + '<h2>Cancellations</h2><p>You may cancel free of charge before a barber accepts your request and for 2 minutes after they accept. After that, or once the barber has arrived, a flat $5 cancellation fee applies to compensate the barber for their time.</p>'
  + '<h2>Your account</h2><p>Keep your account information accurate and your login to yourself. You can delete your account at any time in the app under <b>Account</b>.</p>'
  + '<h2>Governing law</h2><p>These terms are governed by the laws of the State of Florida, United States.</p>'
  + '<h2>Contact</h2><p>Questions about these terms? Email <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a>.</p>');
const BARBER_AGREEMENT_HTML = pageHTML('Independent Barber Agreement — Catch a Fade',
  '<style>.caps{font-size:13.5px;letter-spacing:.01em;color:#1a1a1a}p b{font-weight:600}</style>'
  + '<p class="muted" style="margin:0 0 4px;letter-spacing:.12em;font-size:11px">CATCH A FADE</p><h1>Independent Barber Agreement</h1><p class="muted">Effective October 13, 2026</p>'
  + "<p class=\"caps\">PLEASE READ THIS AGREEMENT CAREFULLY BEFORE USING THE CATCH A FADE PLATFORM TO OFFER SERVICES. BY SELECTING THE ACCEPTANCE CHECKBOX IN THE PLATFORM, OR BY GOING ONLINE OR PERFORMING ANY SERVICE THROUGH THE PLATFORM, YOU AGREE TO BE BOUND BY THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT ACCEPT THIS AGREEMENT AND DO NOT USE THE PLATFORM AS A BARBER.</p>\n<p>This Independent Barber Agreement (the \"Agreement\") is entered into by and between Zuf Eini, doing business as Catch a Fade (\"Catch a Fade,\" \"we,\" \"us\" or \"our\"), and the individual barber who accepts it (\"Barber\" or \"you\"). It governs your access to and use of the Catch a Fade Platform to offer Services to Customers. This Agreement is in addition to, and should be read together with, the Catch a Fade Terms of Service and Privacy Policy.</p>\n<h2>1. Definitions</h2>\n<p>In this Agreement, the following capitalized terms have the meanings set out below:</p>\n<p><b>\"Account\"</b> means the account you create on the Platform to offer Services.</p>\n<p><b>\"Booking\"</b> means a request for Services submitted by a Customer through the Platform that you have accepted.</p>\n<p><b>\"Cancellation Fee\"</b> means the fee charged to a Customer who cancels a Booking outside the free-cancellation period described in the Platform's cancellation policy.</p>\n<p><b>\"Customer\"</b> means a user of the Platform who requests or receives Services.</p>\n<p><b>\"Customer Information\"</b> means any information about a Customer that you receive through the Platform, including name, address, location, telephone number, photographs and messages.</p>\n<p><b>\"Listed Price\"</b> means the price you set on the Platform for a Service.</p>\n<p><b>\"Platform\"</b> means the Catch a Fade mobile application, website, software, and related services operated by Catch a Fade.</p>\n<p><b>\"Services\"</b> means the barbering and grooming services you offer and perform for Customers through the Platform.</p>\n<p><b>\"Service Fee\"</b> means the fee Catch a Fade charges Customers for use of the Platform, in addition to the Listed Price.</p>\n<p><b>\"Stripe\"</b> means Stripe, Inc. and its affiliates, the third-party payment processor used by the Platform.</p>\n<h2>2. Acceptance and Eligibility</h2>\n<p><b>2.1 Acceptance.</b> You accept this Agreement by selecting the acceptance checkbox in the Platform. Catch a Fade records the date, time and version of the Agreement you accept.</p>\n<p><b>2.2 Eligibility.</b> To offer Services through the Platform, you must (a) be at least eighteen (18) years of age; (b) have the legal capacity to enter into a binding contract; (c) hold every license required to perform the Services in the jurisdiction where you perform them, as described in Section 4; and (d) complete the Platform's application and verification process.</p>\n<p><b>2.3 Accurate Information.</b> You agree to provide accurate, current and complete information during the application process and to keep that information up to date.</p>\n<p><b>2.4 One Account.</b> You may maintain only one Barber Account, and you may not allow any other person to use it or to perform Services under it.</p>\n<h2>3. Relationship of the Parties</h2>\n<p><b>3.1 Independent Contractor.</b> You are an independent contractor. Nothing in this Agreement creates an employment, agency, partnership, franchise or joint-venture relationship between you and Catch a Fade.</p>\n<p><b>3.2 Control of Your Work.</b> You retain sole discretion over whether, when and where you make yourself available through the Platform, which requests you accept or decline, and the manner and means by which you perform the Services, subject to the standards described in this Agreement.</p>\n<p><b>3.3 No Benefits.</b> You are not entitled to wages, salary, overtime, employee benefits or reimbursement of expenses from Catch a Fade.</p>\n<p><b>3.4 Non-Exclusivity.</b> This Agreement is non-exclusive. You may provide services through other platforms, through your own business or directly to your own clients at any time.</p>\n<p><b>3.5 No Authority to Bind.</b> Neither party has authority to enter into any contract or incur any obligation on behalf of the other.</p>\n<h2>4. Licensing, Verification and Legal Compliance</h2>\n<p><b>4.1 Licensure.</b> You represent and warrant that you hold, and will maintain in good standing for as long as you use the Platform, every license required by applicable law to perform the Services for compensation, including, in Florida, a barber license issued by the Florida Department of Business and Professional Regulation.</p>\n<p><b>4.2 Verification.</b> You will provide your license number, a photograph of a valid government-issued identification document and a photograph of yourself. You authorize Catch a Fade to use this information to verify your identity and licensure, including through publicly available licensing records.</p>\n<p><b>4.3 Notice of Changes.</b> You will notify Catch a Fade promptly if your license lapses, is suspended, restricted or revoked, or if any information you provided becomes inaccurate.</p>\n<p><b>4.4 Compliance with Law.</b> You will comply with all laws, regulations and professional standards that apply to the Services, including applicable health, sanitation, infection-control and safety requirements.</p>\n<p><b>4.5 Approval.</b> Catch a Fade reviews each application and may approve or decline it. You may not accept Bookings until your Account has been approved.</p>\n<h2>5. Your Account</h2>\n<p><b>5.1 Security.</b> You are responsible for maintaining the confidentiality of your Account credentials and for all activity that occurs under your Account.</p>\n<p><b>5.2 Unauthorized Use.</b> You will notify Catch a Fade immediately of any unauthorized access to or use of your Account.</p>\n<p><b>5.3 Profile Content.</b> You are responsible for the accuracy of your profile, including your name, photographs, description, services and prices.</p>\n<h2>6. Use of the Platform</h2>\n<p><b>6.1 Going Online.</b> When you choose to go online, the Platform may send you requests from Customers. Each request shows the requested Service, its Listed Price and the Customer's approximate location before you decide whether to accept it.</p>\n<p><b>6.2 Location Sharing.</b> While you are online or completing a Booking, the Platform uses your device's location to match you with nearby requests and to show the Customer your progress toward their location. You may go offline at any time to stop sharing your location.</p>\n<p><b>6.3 Performing a Booking.</b> After accepting a Booking, you will travel to the Customer's location, confirm the Customer's arrival PIN in the Platform before beginning the Service, perform the Service, and mark the Booking complete in the Platform.</p>\n<p><b>6.4 Communications.</b> You will communicate with Customers about a Booking through the Platform's messaging features.</p>\n<h2>7. Pricing, Payments and Payouts</h2>\n<p><b>7.1 Pricing.</b> You determine the Listed Price of each Service you offer. You may change your prices at any time; changes apply to Bookings requested after the change.</p>\n<p><b>7.2 Payment Processing.</b> Customers pay through the Platform. Payments are processed by Stripe. To receive payouts, you must create a connected account with Stripe and agree to the Stripe Connected Account Agreement, which includes the Stripe Services Agreement. Catch a Fade is not a bank and does not hold your funds.</p>\n<p><b>7.3 Your Earnings.</b> For each completed Booking, you receive one hundred percent (100%) of the Listed Price of the Service performed.</p>\n<p><b>7.4 Service Fee.</b> Catch a Fade charges Customers a Service Fee in addition to the Listed Price. The Service Fee is retained by Catch a Fade and is not part of your earnings.</p>\n<p><b>7.5 Cancellation Fees.</b> Cancellation Fees paid by Customers in accordance with the Platform's cancellation policy are paid to you.</p>\n<p><b>7.6 Payout Timing.</b> Payouts are made to the bank account you designate in your Stripe account according to Stripe's payout schedule. Catch a Fade is not responsible for delays caused by Stripe or by your bank.</p>\n<p><b>7.7 Refunds and Disputes.</b> If a Customer payment is refunded or reversed because a Booking was not performed as agreed, the related earnings may be adjusted. Catch a Fade will notify you of any adjustment and give you an opportunity to respond.</p>\n<h2>8. Taxes</h2>\n<p>You are solely responsible for determining, reporting and paying all taxes that apply to your earnings. Stripe may issue you an IRS Form 1099 or other tax documents where required by law. Catch a Fade does not withhold taxes from your earnings.</p>\n<h2>9. Equipment and Expenses</h2>\n<p>You are responsible for providing, at your own expense, all tools, equipment, products, supplies and transportation necessary to perform the Services, and for all expenses you incur in connection with the Services, including travel to Customer locations.</p>\n<h2>10. Standards of Conduct and Safety</h2>\n<p><b>10.1 Professional Standards.</b> You will perform the Services in a professional, courteous and competent manner, arrive at the time you commit to, and treat every Customer with respect.</p>\n<p><b>10.2 Non-Discrimination.</b> You will not refuse, cancel or alter Services, or treat any Customer differently, on the basis of race, color, religion, national origin, sex, sexual orientation, gender identity, disability, age or any other characteristic protected by law.</p>\n<p><b>10.3 Prohibited Conduct.</b> You will not engage in harassment, threats, violence, fraud, theft or any unsafe or unlawful conduct, and you will not perform Services while impaired by alcohol or drugs.</p>\n<p><b>10.4 Sanitation.</b> You will clean and disinfect your tools and equipment in accordance with applicable sanitation standards before each Service.</p>\n<p><b>10.5 Safety Features.</b> You will use the Platform's safety features as intended, including arrival-PIN verification, and you will report any safety incident to Catch a Fade promptly.</p>\n<h2>11. Ratings and Feedback</h2>\n<p>Customers may rate and review the Services you perform, and those ratings may be displayed on your profile. Ratings help maintain the quality and safety of the Platform. Catch a Fade may remove reviews that are abusive, unlawful or unrelated to the Services.</p>\n<h2>12. Customer Information and Privacy</h2>\n<p><b>12.1 Use of Customer Information.</b> You will use Customer Information solely to complete the applicable Booking. You will not disclose, sell, retain or use Customer Information for any other purpose, including marketing, and you will delete any Customer Information you have stored outside the Platform when the Booking is complete.</p>\n<p><b>12.2 Your Information.</b> Catch a Fade collects and uses your information, including your location while you are online, as described in the Catch a Fade Privacy Policy.</p>\n<p><b>12.3 Verification Documents.</b> Photographs of your identification document and of yourself are stored securely and are accessible only to Catch a Fade personnel responsible for reviewing applications.</p>\n<h2>13. Intellectual Property</h2>\n<p><b>13.1 License to Use the Platform.</b> Subject to your compliance with this Agreement, Catch a Fade grants you a limited, revocable, non-exclusive, non-transferable license to use the Platform solely to offer and perform Services.</p>\n<p><b>13.2 Restrictions.</b> You will not copy, modify, reverse engineer, resell or interfere with the Platform, or access it by any automated means.</p>\n<p><b>13.3 Marks.</b> \"Catch a Fade\" and its logos are the property of Catch a Fade. You may not use them without prior written permission, except as displayed within the Platform.</p>\n<p><b>13.4 Your Content.</b> You retain ownership of the photographs and other content you upload to your profile. You grant Catch a Fade a non-exclusive, royalty-free license to display that content on the Platform for as long as it remains on your profile.</p>\n<h2>14. Insurance</h2>\n<p>You are encouraged to maintain professional and general liability insurance appropriate to the Services you perform. Catch a Fade does not provide insurance coverage for you or for the Services.</p>\n<h2>15. Indemnification</h2>\n<p>To the fullest extent permitted by law, you agree to indemnify, defend and hold harmless Catch a Fade from and against any claims, liabilities, damages, losses and expenses, including reasonable attorneys' fees, arising out of or related to (a) the Services you perform; (b) your breach of this Agreement; or (c) your violation of any law or of the rights of any third party.</p>\n<h2>16. Disclaimers</h2>\n<p class=\"caps\">THE PLATFORM IS PROVIDED \"AS IS\" AND \"AS AVAILABLE.\" TO THE FULLEST EXTENT PERMITTED BY LAW, CATCH A FADE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. CATCH A FADE DOES NOT GUARANTEE ANY MINIMUM NUMBER OF REQUESTS, BOOKINGS OR EARNINGS, OR THAT THE PLATFORM WILL BE UNINTERRUPTED OR ERROR-FREE.</p>\n<h2>17. Limitation of Liability</h2>\n<p class=\"caps\">TO THE FULLEST EXTENT PERMITTED BY LAW, CATCH A FADE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS OR REVENUE, ARISING OUT OF OR RELATED TO THIS AGREEMENT OR THE PLATFORM. CATCH A FADE'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THIS AGREEMENT WILL NOT EXCEED THE GREATER OF ONE HUNDRED U.S. DOLLARS (US$100) OR THE AMOUNTS OWED TO YOU UNDER SECTION 7 THAT REMAIN UNPAID. NOTHING IN THIS AGREEMENT LIMITS LIABILITY THAT CANNOT BE LIMITED UNDER APPLICABLE LAW.</p>\n<h2>18. Suspension, Deactivation and Termination</h2>\n<p><b>18.1 Termination by You.</b> You may terminate this Agreement at any time by going offline permanently or by deleting your Account in the Platform.</p>\n<p><b>18.2 Suspension or Deactivation by Catch a Fade.</b> Catch a Fade may suspend or deactivate your Account if (a) your license or identity cannot be verified or is no longer valid; (b) you materially breach this Agreement or Platform policies; (c) you receive sustained low Customer ratings; or (d) suspension is reasonably necessary to protect the safety of Customers, Barbers or the public. Catch a Fade may also terminate this Agreement at any time.</p>\n<p><b>18.3 Notice and Review.</b> Where practicable, Catch a Fade will notify you of the reason for a suspension or deactivation. You may contact Catch a Fade to request a review of the decision.</p>\n<p><b>18.4 Effect of Termination.</b> Earnings for Bookings completed before termination will be paid out in accordance with Section 7. Sections 7.7, 8, 12, 13, 15, 16, 17, 21 and 22 survive termination of this Agreement.</p>\n<h2>19. Changes to This Agreement</h2>\n<p>Catch a Fade may amend this Agreement from time to time. When we make material changes, we will show the updated Agreement in the Platform and update the \"Effective\" date above. Your continued use of the Platform as a Barber after the updated Agreement takes effect constitutes your acceptance of it. If you do not agree to the changes, you must stop using the Platform as a Barber.</p>\n<h2>20. Electronic Communications and Notices</h2>\n<p>You consent to receive communications from Catch a Fade electronically, including through the Platform, by push notification and by email. Notices to you will be sent to the email address associated with your Account. Notices to Catch a Fade must be sent to the email address listed in the Contact section below.</p>\n<h2>21. Governing Law and Venue</h2>\n<p>This Agreement is governed by the laws of the State of Florida, without regard to its conflict-of-laws principles. Any dispute arising out of or related to this Agreement will be brought exclusively in the state or federal courts located in Alachua County, Florida, and each party consents to the personal jurisdiction of those courts.</p>\n<h2>22. General Provisions</h2>\n<p><b>22.1 Entire Agreement.</b> This Agreement, together with the Catch a Fade Terms of Service and Privacy Policy, constitutes the entire agreement between the parties regarding its subject matter and supersedes any prior agreements on that subject.</p>\n<p><b>22.2 Severability.</b> If any provision of this Agreement is held invalid or unenforceable, that provision will be enforced to the maximum extent permissible and the remaining provisions will remain in full force and effect.</p>\n<p><b>22.3 No Waiver.</b> A failure or delay by either party to enforce any provision of this Agreement is not a waiver of that provision or of any other provision.</p>\n<p><b>22.4 Assignment.</b> You may not assign or transfer this Agreement without Catch a Fade's prior written consent. Catch a Fade may assign this Agreement to an affiliate or to a successor in connection with a merger, acquisition or sale of its business or assets.</p>\n<p><b>22.5 Force Majeure.</b> Neither party is liable for any failure or delay in performance caused by events beyond its reasonable control.</p>\n<p><b>22.6 Headings.</b> Section headings are for convenience only and do not affect the interpretation of this Agreement.</p>\n<h2>23. Contact</h2>\n<p>Questions or notices regarding this Agreement may be directed to Catch a Fade at <a href=\"mailto:TZUFEINI@gmail.com\">TZUFEINI@gmail.com</a>.</p>");
const SUPPORT_HTML = pageHTML('Catch a Fade Support',
  '<h1>Catch a Fade Support</h1>'
  + '<p>Need a hand? Email us at <a href="mailto:TZUFEINI@gmail.com">TZUFEINI@gmail.com</a> and we\'ll get back to you.</p>'
  + '<p>For the fastest answers, use the in-app <b>Help &amp; Support</b> chat, available right inside the app.</p>');

const MARKETPLACE_PATHS = new Set([
  '/api/me', '/api/review-setup', '/api/register-push', '/api/create-payment-intent', '/api/bookings/request', '/api/bookings/action',
  '/api/connect/onboard', '/api/connect/status', '/api/connect/dashboard', '/connect/done', '/connect/refresh',
  '/api/admin/barbers', '/api/admin/verify', '/api/barber/docs', '/api/barber/compliance'
]);
marketplace = require('./marketplace')({
  stripe, supabase, sendJSON, sendHTML, pageHTML, rateLimited, FEE_PERCENT, CANCEL_FEE_CENTS,
  REVIEW_EMAIL, REVIEW_CODE, ADMIN_EMAILS, MIN_SERVICE_CENTS, MAX_SERVICE_CENTS,
  push: require('./push')(Object.assign({}, LOCAL, process.env)),
  stripeTest, STRIPE_PUBLISHABLE, STRIPE_TEST_PUBLISHABLE
});

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) marketplace.ensureReviewAccounts().catch(() => {});
  if (MARKETPLACE_PATHS.has(url.pathname)) {
    marketplace.handle(req, res, url).then((handled) => {
      if (!handled) sendJSON(res, 404, { ok: false, error: 'not found' });
    }).catch((err) => {
      console.error('[marketplace]', url.pathname, err && err.message);
      if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'server error' });
    });
    return;
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
