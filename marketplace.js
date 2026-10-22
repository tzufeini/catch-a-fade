/* Catch a Fade — real marketplace routes (Oct 2026).
 *
 * Replaces the simulated dispatch. Money and state transitions live here, on
 * the server, never in the app:
 *
 *   customer  POST /api/create-payment-intent  (with barberId)  → card HOLD (manual capture)
 *   customer  POST /api/bookings/request        → booking row, status "requested"
 *   barber    POST /api/bookings/action accept | decline | en_route | arrived | start(PIN) | complete
 *   customer  POST /api/bookings/action cancel | expire
 *
 * The hold is captured only when the barber completes the cut, cancelled if the
 * barber declines / never answers, and partially captured for a late cancel.
 * Barbers get paid through Stripe Connect Express (/api/connect/*); new barbers
 * stay hidden until an admin approves them (/api/admin/*).
 */
const crypto = require('crypto');

const REQUEST_TTL_MS = 3 * 60 * 1000;   // a request nobody accepts within 3 min expires
const FLEX_WINDOW_MS = 2 * 60 * 60 * 1000;  // Wait & Save: the barber has up to 2 hours
const FLEX_DISCOUNT = 0.15;                  // ...and the customer pays 15% less (from our fee, not the barber's pay)
const QUEST_TARGET = Number(process.env.QUEST_TARGET || 10);         // cuts per week
const QUEST_BONUS_CENTS = Number(process.env.QUEST_BONUS_CENTS || 1500); // bonus for hitting it
const FREE_CANCEL_MS = 2 * 60 * 1000;   // Uber-style: free cancel for 2 min after accept
const DEMO_BARBER_EMAIL = 'demo-barber@catchafade.app';
const AGREEMENT_VERSION = '2026-10-22';      // Independent Barber Agreement (/barber-agreement)

function readJSON(req, limit) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > (limit || 20000)) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function pin4() { return String(1000 + crypto.randomInt(9000)); }

module.exports = function createMarketplace(ctx) {
  const { stripe, supabase, sendJSON, sendHTML, pageHTML, rateLimited, FEE_PERCENT,
          CANCEL_FEE_CENTS, REVIEW_EMAIL, REVIEW_CODE, ADMIN_EMAILS, push,
          stripeTest, STRIPE_PUBLISHABLE, STRIPE_TEST_PUBLISHABLE, anthropicKey, sendEmail } = ctx;

  async function authUser(token) {
    if (!supabase || !token) return null;
    try {
      const { data, error } = await supabase.auth.getUser(String(token));
      return error ? null : data.user;
    } catch (e) { return null; }
  }
  const isAdmin = (u) => !!u && ADMIN_EMAILS.includes(String(u.email || '').toLowerCase());
  const isReviewer = (u) => !!u && String(u.email || '').toLowerCase() === REVIEW_EMAIL;

  const DOCS_BUCKET = 'barber-docs';
  let docsBucketReady = false;
  async function ensureDocsBucket() {
    if (docsBucketReady) return true;
    try {
      const { data } = await supabase.storage.getBucket(DOCS_BUCKET);
      if (!data) {
        const { error } = await supabase.storage.createBucket(DOCS_BUCKET, { public: false, fileSizeLimit: '5MB' });
        if (error && !/exist/i.test(error.message)) throw error;
      }
      docsBucketReady = true;
    } catch (e) { console.error('[docs bucket]', e && e.message); }
    return docsBucketReady;
  }
  // Profile photos are public: customers see them on approved barbers.
  const AVATAR_BUCKET = 'avatars';
  let avatarBucketReady = false;
  async function ensureAvatarBucket() {
    if (avatarBucketReady) return true;
    try {
      const { data } = await supabase.storage.getBucket(AVATAR_BUCKET);
      if (!data) {
        const { error } = await supabase.storage.createBucket(AVATAR_BUCKET, { public: true, fileSizeLimit: '5MB' });
        if (error && !/exist/i.test(error.message)) throw error;
      }
      avatarBucketReady = true;
    } catch (e) { console.error('[avatar bucket]', e && e.message); }
    return avatarBucketReady;
  }
  const PORTFOLIO_MAX = 12;
  // Claude checks a portfolio upload: a real photo of hair/barber work, nothing
  // explicit, violent, hateful, or carrying phone numbers/handles to take clients
  // off the app. Fails open only if the check itself can't run.
  async function screenPortfolioPhoto(type, b64, label) {
    if (!anthropicKey) return { ok: true };
    const bad = /\b(porn|nude|nudes|onlyfans|n[i1]gg|f[a@]gg)\w*/i;
    if (bad.test(String(label || ''))) return { ok: false, error: 'That caption isn\'t allowed.' };
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 120, messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/' + type, data: b64 } },
          { type: 'text', text: 'A barber wants to post this photo in their public portfolio on a haircut-booking app. '
            + 'Answer only with JSON: {"allowed":true|false,"reason":"short"}. Allow photos that show haircuts, hairstyles, beards, '
            + 'barber work or tools. Do not allow nudity or sexual content, violence, weapons, drugs, hate symbols, '
            + 'unrelated content, or visible phone numbers, emails or social handles.' }
        ] }] })
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || ('anthropic ' + r.status));
      const t = (j.content || []).map(c => c.text || '').join('');
      const v = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      return v.allowed ? { ok: true } : { ok: false, error: 'This photo can\'t be added to your portfolio. Use a clear photo of a haircut you did.' };
    } catch (e) {
      console.error('[portfolio screen]', e.message);
      return { ok: true };
    }
  }
  // [{ name, url, label }] newest first; file names are "<ms>-<label-slug>.jpg".
  async function portfolioOf(profileId) {
    try {
      const { data } = await supabase.storage.from(AVATAR_BUCKET).list('portfolio/' + profileId, { limit: 50, sortBy: { column: 'name', order: 'desc' } });
      return (data || []).filter(f => /\.(jpe?g|png|webp)$/i.test(f.name)).map(f => {
        const slug = f.name.replace(/^\d+-/, '').replace(/\.[a-z]+$/i, '');
        return { name: f.name, url: supabase.storage.from(AVATAR_BUCKET).getPublicUrl('portfolio/' + profileId + '/' + f.name).data.publicUrl,
                 label: slug === 'cut' ? '' : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
      });
    } catch (e) { return []; }
  }
  // { id, selfie, photo: url|null } — signed for 1 hour, admins only.
  async function docLinks(profileId) {
    const out = { id: null, selfie: null, photo: null };
    try {
      const { data } = await supabase.storage.from(DOCS_BUCKET).list(profileId);
      for (const f of data || []) {
        const kind = f.name.split('.')[0];
        if (kind !== 'id' && kind !== 'selfie' && kind !== 'photo') continue;
        const s = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(profileId + '/' + f.name, 3600);
        if (s.data) out[kind] = s.data.signedUrl;
      }
    } catch (e) {}
    return out;
  }

  async function barberForUser(uid) {
    const { data } = await supabase.from('barbers').select('*').eq('profile_id', uid).maybeSingle();
    return data || null;
  }
  async function loadBooking(id) {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
    return data || null;
  }
  async function setBooking(id, patch) {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('bookings').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  // ---- push notifications (no-ops until APNs keys are configured) ----
  async function pushUser(uid, title, body, data) {
    if (!push || !push.enabled || !uid) return;
    try {
      const { data: p } = await supabase.from('profiles').select('push_token').eq('id', uid).maybeSingle();
      if (p && p.push_token) await push.send(p.push_token, title, body, data);
    } catch (e) {}
  }
  async function pushBarber(barberId, title, body, data) {
    try {
      const { data: b } = await supabase.from('barbers').select('profile_id, is_demo').eq('id', barberId).maybeSingle();
      if (b && !b.is_demo) await pushUser(b.profile_id, title, body, data);
    } catch (e) {}
  }
  /* ---- Uber-style pricing ----
   * Customers see one all-in price; barbers see what they earn (their listed
   * price). Catch a Fade keeps TAKE_PERCENT of what the customer pays — disclosed
   * in the Terms and the Independent Barber Agreement, just not itemized at
   * checkout. When open requests nearby outnumber online barbers, prices and the
   * barber's earnings rise together (up to SURGE_MAX), like Uber's surge. */
  const TAKE_PERCENT = FEE_PERCENT;              // share of the customer's price
  const SURGE_MAX = 1.5, SURGE_BOX = 0.15;       // ~10 miles around the customer
  function quote(listedCents, mult, flex) {
    mult = flex ? 1 : (mult || 1);                                                     // Wait & Save never surges
    const servicePrice = Math.round(listedCents * mult);                               // what the barber earns
    const full = servicePrice / (1 - TAKE_PERCENT / 100);
    const total = Math.max(servicePrice + 100, Math.round(full * (flex ? 1 - FLEX_DISCOUNT : 1) / 100) * 100);  // whole dollars
    return { servicePrice, platformFee: total - servicePrice, total, multiplier: mult, flex: !!flex };
  }
  const surgeCache = new Map();
  async function demandMultiplier(lat, lng) {
    lat = Number(lat); lng = Number(lng);
    if (!supabase || !Number.isFinite(lat) || !Number.isFinite(lng)) return 1;
    const key = lat.toFixed(1) + ',' + lng.toFixed(1);
    const hit = surgeCache.get(key);
    if (hit && Date.now() - hit.at < 60 * 1000) return hit.mult;
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const [dem, sup] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', since)
        .in('status', ['requested', 'accepted', 'en_route', 'arrived', 'in_progress'])
        .gte('lat', lat - SURGE_BOX).lte('lat', lat + SURGE_BOX).gte('lng', lng - SURGE_BOX).lte('lng', lng + SURGE_BOX),
      supabase.from('barbers').select('id', { count: 'exact', head: true }).eq('is_verified', true).eq('is_available', true).eq('is_demo', false)
        .gte('home_lat', lat - SURGE_BOX).lte('home_lat', lat + SURGE_BOX).gte('home_lng', lng - SURGE_BOX).lte('home_lng', lng + SURGE_BOX)
    ]);
    const demand = dem.count || 0, supply = sup.count || 0;
    // surge only when demand outruns supply: +25% per extra request per barber, in 5% steps
    const ratio = demand / Math.max(1, supply);
    const mult = ratio <= 1 ? 1 : Math.round(Math.min(SURGE_MAX, 1 + (ratio - 1) * 0.25) * 20) / 20;
    surgeCache.set(key, { mult, at: Date.now() });
    return mult;
  }

  const BARBER_PAGE = /^\/b\/[0-9a-f-]{36}$/;
  const APP_STORE_URL = 'https://apps.apple.com/us/app/catch-a-fade/id6790179224';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function barberPage(b, photos, license) {
    const head = (title, desc, img) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '">'
      + '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '">'
      + (img ? '<meta property="og:image" content="' + esc(img) + '">' : '')
      + '<meta name="apple-itunes-app" content="app-id=6790179224">'
      + '<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#F4EDE1;color:#15110D}'
      + '.w{max-width:520px;margin:0 auto;padding:28px 20px 48px}.av{width:96px;height:96px;border-radius:28px;object-fit:cover;background:#15110D;color:#F4EDE1;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800}'
      + 'h1{font-size:28px;margin:16px 0 4px;letter-spacing:-.5px}.m{color:#5C616C;font-size:14px}.lic{margin:16px 0;padding:12px 14px;border-radius:14px;background:rgba(70,201,139,.12);border:1px solid rgba(70,201,139,.35);font-size:14px}'
      + '.lic b{display:block}.s{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid rgba(21,17,13,.1);font-size:15px}.s b{font-weight:750}'
      + 'h2{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:#5C616C;margin:26px 0 8px}.g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.g img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px}'
      + '.btn{display:block;text-align:center;padding:16px;border-radius:16px;font-weight:750;font-size:16px;text-decoration:none;margin-top:12px}.p{background:#15110D;color:#F4EDE1}.o{border:1.5px solid #15110D;color:#15110D}'
      + '.f{margin-top:28px;font-size:12px;color:#8C9099;text-align:center}</style></head><body><div class="w">';
    if (!b) return head('Catch a Fade', 'Barbers who come to you.', '') + '<h1>This barber isn\'t available</h1><p class="m">Find barbers who come to you in the Catch a Fade app.</p><a class="btn p" href="' + APP_STORE_URL + '">Get Catch a Fade</a></div></body></html>';
    const name = (b.profile && b.profile.full_name) || 'Barber', first = name.split(' ')[0];
    const img = b.profile && b.profile.avatar_url;
    const about = String(b.bio || '').split(' · ')[0];
    const svcs = (b.services || []).slice().sort((x, y) => x.price_cents - y.price_cents);
    const price = (c) => '$' + (quote(c, 1).total / 100).toFixed(0);
    const desc = first + ' is ' + (license ? 'a licensed barber' : 'a barber') + ' who comes to you. Book a cut in the Catch a Fade app' + (svcs.length ? ', from ' + price(svcs[0].price_cents) : '') + '.';
    return head(name + ' · Catch a Fade', desc, img)
      + (img ? '<img class="av" src="' + esc(img) + '" alt="">' : '<div class="av">' + esc(name.split(' ').map(w => w[0]).join('').slice(0, 2)) + '</div>')
      + '<h1>' + esc(name) + '</h1><div class="m">★ ' + Number(b.rating || 5).toFixed(1) + ' · ' + Number(b.cuts_completed || 0) + ' cuts · comes to your place</div>'
      + (license ? '<div class="lic"><b>✓ Florida barber license ' + esc(license.number) + '</b>Active · verified with the state' + (license.expires ? ' · valid until ' + esc(license.expires) : '') + '</div>' : '')
      + (about ? '<p style="font-size:15px;line-height:1.55">' + esc(about) + '</p>' : '')
      + (svcs.length ? '<h2>Services</h2>' + svcs.map(x => '<div class="s"><span>' + esc(x.name) + '</span><b>' + price(x.price_cents) + '</b></div>').join('') : '')
      + (photos && photos.length ? '<h2>Recent work</h2><div class="g">' + photos.slice(0, 6).map(ph => '<img src="' + esc(ph.url) + '" alt="' + esc(ph.label) + '">').join('') + '</div>' : '')
      + '<a class="btn p" href="catchafade://b/' + esc(b.id) + '">Book ' + esc(first) + ' in the app</a>'
      + '<a class="btn o" href="' + APP_STORE_URL + '">Get Catch a Fade on the App Store</a>'
      + '<div class="f">Prices include the Catch a Fade service fee and may be higher when it\'s busy.</div></div></body></html>';
  }

  // Automatic barber review (license + identity) — see barber-review.js.
  const review = require('./barber-review')({ supabase, anthropicKey, pushUser, sendEmail,
    adminEmail: ADMIN_EMAILS[0], DOCS_BUCKET });
  if (supabase) review.start();

  async function firstNameOf(uid) {
    try { const { data } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle(); return String((data && data.full_name) || '').split(' ')[0]; }
    catch (e) { return ''; }
  }
  async function barberFirstName(barberId) {
    try { const { data } = await supabase.from('barbers').select('profile_id').eq('id', barberId).maybeSingle(); return data ? await firstNameOf(data.profile_id) : ''; }
    catch (e) { return ''; }
  }
  const money = (c) => '$' + (Number(c || 0) / 100).toFixed(2);
  // Tell the other side of the booking what just happened.
  async function announce(bk, by) {
    const id = { bookingId: bk.id };
    const barber = (await barberFirstName(bk.barber_id)) || 'Your barber';
    const cust = (await firstNameOf(bk.customer_id)) || 'Your customer';
    const toCustomer = {
      accepted: bk.scheduled_at
        ? [barber + ' confirmed ' + whenText(bk.scheduled_at) + ' ✂', 'Free to cancel until 2 hours before.']
        : [barber + ' accepted your booking', 'Free cancellation for 2 minutes.'],
      en_route: [barber + ' is on the way', 'Track them live in the app.'],
      arrived: [barber + ' has arrived', 'Share your PIN: ' + bk.arrival_pin],
      completed: ['Cut complete ✂', 'You were charged ' + money(bk.total_cents) + '. Rate ' + barber + '?'],
      declined: [barber + ' can\'t take this one', 'Your card was not charged.'],
      expired: [barber + ' didn\'t respond', 'Your card was not charged.'],
      cancelled: [barber + ' cancelled', 'Your card was not charged.']
    };
    const toBarber = {
      cancelled: [cust + ' cancelled', 'The job was removed from your queue.'],
      no_show: [cust + ' cancelled at the door', 'You keep the cancellation fee.']
    };
    if (by === 'barber' && toCustomer[bk.status]) await pushUser(bk.customer_id, toCustomer[bk.status][0], toCustomer[bk.status][1], id);
    // lock-screen Live Activity follows every change, whoever made it
    if (bk.activity_token && push && push.liveActivity) {
      const ended = ['completed', 'cancelled', 'declined', 'expired', 'no_show'].includes(bk.status);
      const st = activityState(bk, barber);
      push.liveActivity(bk.activity_token, ended ? 'end' : 'update', st).catch(() => {});
    }
    if (by === 'customer' && toBarber[bk.status]) await pushBarber(bk.barber_id, toBarber[bk.status][0], toBarber[bk.status][1], id);
  }

  // What the lock-screen Live Activity shows (keys match the Swift ContentState).
  const ACTIVITY_COPY = {
    requested: [0, 'Waiting for {b} to accept', 'Request sent'],
    accepted: [1, '{b} accepted', 'Getting ready to come to you'],
    en_route: [2, '{b} is on the way', 'Coming to your place'],
    arrived: [3, '{b} has arrived', 'Share your PIN: {pin}'],
    in_progress: [4, 'Your cut is in progress', 'Enjoy your fade'],
    completed: [5, 'Cut complete', 'Thanks for booking with Catch a Fade'],
    cancelled: [5, 'Booking cancelled', 'Your card was not charged'],
    declined: [5, '{b} can\'t take this one', 'Your card was not charged'],
    expired: [5, 'Request expired', 'Your card was not charged'],
    no_show: [5, 'Booking cancelled', '']
  };
  function activityState(bk, barberFirst, etaMin) {
    const c = ACTIVITY_COPY[bk.status] || ACTIVITY_COPY.requested;
    const f = (t) => t.replace('{b}', barberFirst || 'Your barber').replace('{pin}', bk.arrival_pin || '');
    return { status: bk.status, headline: f(c[1]), detail: f(c[2]), eta: Number(etaMin) || 0, step: c[0] };
  }
  /* ---- "Schedule a cut": book a time up to 5 days ahead (a card hold lasts 7) ---- */
  const SCHEDULE_MIN_MS = 90 * 60 * 1000, SCHEDULE_MAX_MS = 5 * 24 * 3600 * 1000;
  const SCHEDULE_FREE_CANCEL_MS = 2 * 3600 * 1000, SCHEDULE_LATE_MS = 15 * 60 * 1000;
  const TZ = 'America/New_York';                     // Florida, where we launch
  const whenText = (iso) => {
    const d = new Date(iso), opts = { timeZone: TZ };
    const day = (x) => x.toLocaleDateString('en-US', Object.assign({ year: 'numeric', month: 'numeric', day: 'numeric' }, opts));
    const today = day(new Date()), tomorrow = day(new Date(Date.now() + 24 * 3600 * 1000));
    const label = day(d) === today ? 'today' : day(d) === tomorrow ? 'tomorrow' : d.toLocaleDateString('en-US', Object.assign({ weekday: 'short', month: 'short', day: 'numeric' }, opts));
    return label + ' at ' + d.toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, opts));
  };
  const requestTtl = (bk) => {
    if (bk.scheduled_at) {                           // until 12 h after asking, and at least an hour before the cut
      const created = Date.parse(bk.created_at), at = Date.parse(bk.scheduled_at);
      return Math.max(10 * 60 * 1000, Math.min(12 * 3600 * 1000, at - 60 * 60 * 1000 - created));
    }
    return (bk.flex && bk.flex_until) ? Math.max(REQUEST_TTL_MS, Date.parse(bk.flex_until) - Date.parse(bk.created_at)) : REQUEST_TTL_MS;
  };

  /* ---- waitlist: customers who asked to hear when a barber is near ----
   * Locations are kept at ~1 km. When a verified barber is online, everyone
   * waiting within WAITLIST_MILES gets one push, then nothing for 12 hours. */
  const WAITLIST_MILES = 10, WAITLIST_EVERY_MS = 12 * 3600 * 1000;
  const round2 = (v) => Math.round(v * 100) / 100;
  function milesBetween(a, b) {
    const R = 3958.8, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const milesBox = (lat) => ({ dLat: WAITLIST_MILES / 69, dLng: WAITLIST_MILES / (69 * Math.max(0.2, Math.cos(lat * Math.PI / 180))) });
  async function waitingNear(lat, lng) {
    const { dLat, dLng } = milesBox(lat);
    const { data } = await supabase.from('waitlist').select('lat, lng')
      .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lng', lng - dLng).lte('lng', lng + dLng).limit(5000);
    return (data || []).filter(w => milesBetween([lat, lng], [w.lat, w.lng]) <= WAITLIST_MILES).length;
  }
  async function notifyWaitlist() {
    const { data: online } = await supabase.from('barbers')
      .select('id, home_lat, home_lng, profile:profiles!barbers_profile_id_fkey(full_name), services(name)')
      .eq('is_verified', true).eq('is_available', true).eq('is_demo', false);
    const bookable = (online || []).filter(b => (b.services || []).length);
    if (!bookable.length) return;
    const { data: locs } = await supabase.from('barber_locations').select('barber_id, lat, lng').in('barber_id', bookable.map(b => b.id));
    const live = new Map((locs || []).map(l => [l.barber_id, [Number(l.lat), Number(l.lng)]]));
    const cutoff = new Date(Date.now() - WAITLIST_EVERY_MS).toISOString();
    const told = new Set();
    for (const b of bookable) {
      const at = live.get(b.id) || (b.home_lat != null ? [Number(b.home_lat), Number(b.home_lng)] : null);
      if (!at || !Number.isFinite(at[0])) continue;
      const { dLat, dLng } = milesBox(at[0]);
      const { data: waiting } = await supabase.from('waitlist').select('customer_id, lat, lng, notified_at')
        .gte('lat', at[0] - dLat).lte('lat', at[0] + dLat).gte('lng', at[1] - dLng).lte('lng', at[1] + dLng)
        .or('notified_at.is.null,notified_at.lt.' + cutoff).limit(500);
      const first = String((b.profile && b.profile.full_name) || 'A barber').split(' ')[0];
      for (const w of waiting || []) {
        if (told.has(w.customer_id) || milesBetween(at, [w.lat, w.lng]) > WAITLIST_MILES) continue;
        told.add(w.customer_id);
        await supabase.from('waitlist').update({ notified_at: new Date().toISOString() }).eq('customer_id', w.customer_id);
        await pushUser(w.customer_id, 'A barber is online near you ✂', first + ' can come to you now. Open Catch a Fade to book.', { type: 'waitlist' });
      }
    }
  }

  /* ---- an hour before a scheduled cut: remind both sides, once ---- */
  async function remindScheduled() {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString(), now = new Date().toISOString();
    const { data: due } = await supabase.from('bookings').select('*')
      .eq('status', 'accepted').is('reminded_at', null).not('scheduled_at', 'is', null)
      .gte('scheduled_at', now).lte('scheduled_at', soon).limit(200);
    for (const bk of due || []) {
      await supabase.from('bookings').update({ reminded_at: now }).eq('id', bk.id);
      const barber = (await barberFirstName(bk.barber_id)) || 'Your barber';
      const cust = (await firstNameOf(bk.customer_id)) || 'Your customer';
      await pushUser(bk.customer_id, 'Your cut is ' + whenText(bk.scheduled_at), barber + ' is coming to you. Have your PIN ready in the app.', { bookingId: bk.id });
      await pushBarber(bk.barber_id, 'Coming up: ' + cust + ' ' + whenText(bk.scheduled_at),
        (bk.service_name || 'Haircut') + (bk.address ? ' · ' + bk.address : '') + '. Tap Start driving when you head out.', { bookingId: bk.id });
    }
  }

  /* ---- "Time for a fresh cut?" three weeks after a completed cut ----
   * Once per cut, and only if the customer hasn't booked again since. */
  const REBOOK_AFTER_DAYS = 21;
  async function remindRebooks() {
    const day = 24 * 3600 * 1000;
    const from = new Date(Date.now() - (REBOOK_AFTER_DAYS + 3) * day).toISOString();
    const to = new Date(Date.now() - REBOOK_AFTER_DAYS * day).toISOString();
    const { data: done } = await supabase.from('bookings').select('id, customer_id, barber_id, service_name, updated_at')
      .eq('status', 'completed').is('rebook_reminded_at', null).gte('updated_at', from).lte('updated_at', to).limit(200);
    for (const b of done || []) {
      await supabase.from('bookings').update({ rebook_reminded_at: new Date().toISOString() }).eq('id', b.id);
      const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('customer_id', b.customer_id).gt('created_at', b.updated_at);
      if (count) continue;                                   // already booked again
      const barber = (await barberFirstName(b.barber_id)) || 'your barber';
      await pushUser(b.customer_id, 'Time for a fresh cut? ✂',
        'It\'s been 3 weeks since your ' + (b.service_name || 'cut') + ' with ' + barber + '. Tap to book again.', { type: 'rebook', barberId: b.barber_id });
    }
  }

  /* ---- quests: "complete 10 cuts this week, earn a $15 bonus" ----
   * Weeks run Monday 00:00 to Sunday 23:59 Eastern. The bonus is a Stripe transfer
   * to the barber's connected account, paid once per week (idempotent). */
  function questWeek(d) {
    const et = new Date((d || new Date()).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = (et.getDay() + 6) % 7;                       // Monday = 0
    const start = new Date(et); start.setHours(0, 0, 0, 0); start.setDate(et.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    const offset = (d || new Date()).getTime() - et.getTime();   // back to real UTC instants
    return { key: start.toISOString().slice(0, 10), start: new Date(start.getTime() + offset), end: new Date(end.getTime() + offset) };
  }
  async function questStatus(barber) {
    const w = questWeek();
    const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('barber_id', barber.id).eq('status', 'completed')
      .gte('completed_at', w.start.toISOString()).lt('completed_at', w.end.toISOString());
    let paid = false;
    try { const g = await supabase.auth.admin.getUserById(barber.profile_id); paid = !!(((g.data.user || {}).app_metadata || {}).quests_paid || {})[w.key]; } catch (e) {}
    return { week: w.key, endsAt: w.end.toISOString(), target: QUEST_TARGET, bonusCents: QUEST_BONUS_CENTS, done: count || 0, paid };
  }
  async function payQuestIfDue(barber) {
    if (!stripe || barber.is_demo || QUEST_BONUS_CENTS <= 0) return;
    const q = await questStatus(barber);
    if (q.paid || q.done < q.target) return;
    if (!barber.stripe_account_id) { await pushBarber(barber.id, 'You hit this week\'s goal 🎉', 'Set up payouts in the app to receive your ' + money(q.bonusCents) + ' bonus.', { type: 'quest' }); return; }
    await stripe.transfers.create({ amount: q.bonusCents, currency: 'usd', destination: barber.stripe_account_id,
      description: 'Catch a Fade weekly bonus ' + q.week, metadata: { barber_id: barber.id, quest_week: q.week } },
      { idempotencyKey: 'quest_' + barber.id + '_' + q.week });
    const g = await supabase.auth.admin.getUserById(barber.profile_id);
    const am = (g.data.user || {}).app_metadata || {};
    await supabase.auth.admin.updateUserById(barber.profile_id, { app_metadata: Object.assign({}, am, { quests_paid: Object.assign({}, am.quests_paid || {}, { [q.week]: true }) }) });
    await pushBarber(barber.id, 'Weekly goal complete 🎉', 'Your ' + money(q.bonusCents) + ' bonus is on its way to your bank.', { type: 'quest' });
  }

  // Earnings not yet sent to the barber (shown on their dashboard).
  async function heldCents(barber) {
    try {
      const { data } = await supabase.from('bookings').select('status, service_price_cents, cancel_fee_cents, tip_cents, payout_transfer_id, tip_transfer_id')
        .eq('barber_id', barber.id).in('status', ['completed', 'no_show', 'cancelled']).limit(500);
      return (data || []).reduce((sum, b) => sum
        + (!b.payout_transfer_id ? (b.status === 'completed' ? b.service_price_cents : (b.cancel_fee_cents || 0)) : 0)
        + (!b.tip_transfer_id && b.tip_cents > 0 ? b.tip_cents : 0), 0);
    } catch (e) { return 0; }
  }

  /* ---- held earnings ----
   * A barber can take cuts before connecting payouts; those charges land on the
   * platform. Once their Stripe account can receive transfers, send each
   * completed cut's earnings (and any tips / late-cancel fees) to them, tied to
   * the original charge. payout_transfer_id / tip_transfer_id make it one-time. */
  async function releaseHeldEarnings(barber) {
    if (!stripe || !barber || barber.is_demo || !barber.stripe_account_id) return 0;
    let acct;
    try { acct = await stripe.accounts.retrieve(barber.stripe_account_id); } catch (e) { return 0; }
    if (!acct.charges_enabled) return 0;
    const { data: rows } = await supabase.from('bookings')
      .select('id, status, payment_intent_id, service_price_cents, cancel_fee_cents, tip_cents, tip_payment_intent_id, payout_transfer_id, tip_transfer_id')
      .eq('barber_id', barber.id).in('status', ['completed', 'no_show', 'cancelled']).limit(200);
    let paid = 0;
    const send = async (piId, amount, key, bookingId) => {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.transfer_data) return 'destination';                 // already paid at charge time
      if (pi.status !== 'succeeded' || !pi.latest_charge || amount <= 0) return 'none';
      const t = await stripe.transfers.create({ amount: Math.min(amount, pi.amount_received), currency: 'usd',
        destination: barber.stripe_account_id, source_transaction: pi.latest_charge,
        description: 'Catch a Fade earnings', metadata: { booking_id: bookingId, kind: key } },
        { idempotencyKey: 'held_' + key + '_' + bookingId });
      paid += t.amount;
      return t.id;
    };
    for (const bk of rows || []) {
      try {
        if (!bk.payout_transfer_id && bk.payment_intent_id) {
          const amount = bk.status === 'completed' ? bk.service_price_cents : (bk.cancel_fee_cents || 0);
          const id = amount > 0 ? await send(bk.payment_intent_id, amount, 'cut', bk.id) : 'none';
          await supabase.from('bookings').update({ payout_transfer_id: id }).eq('id', bk.id);
        }
        if (!bk.tip_transfer_id && bk.tip_cents > 0 && bk.tip_payment_intent_id) {
          const id = await send(bk.tip_payment_intent_id, bk.tip_cents, 'tip', bk.id);
          await supabase.from('bookings').update({ tip_transfer_id: id }).eq('id', bk.id);
        }
      } catch (e) { console.error('[held earnings]', bk.id, e.message); }   // retried next run
    }
    if (paid > 0) await pushBarber(barber.id, 'You\'ve been paid ' + money(paid) + ' 💸', 'Your earnings are on their way to your bank.', { type: 'payout' });
    return paid;
  }

  // Housekeeping every 5 minutes: expire unanswered requests (releasing the
  // card hold) and pay any weekly bonus that was blocked earlier.
  async function housekeeping() {
    if (!supabase) return;
    try {
      const { data: open } = await supabase.from('bookings').select('*').eq('status', 'requested').limit(200);
      for (const bk of open || []) {
        if (Date.now() - Date.parse(bk.created_at) <= requestTtl(bk) + 30 * 1000) continue;
        await cancelHold(bk.payment_intent_id);
        const done = await setBooking(bk.id, { status: 'expired' });
        await announce(done, 'barber');
      }
    } catch (e) { console.error('[housekeeping] expire', e.message); }
    try {
      if (new Date().getMinutes() < 5) {            // about once an hour
        const { data: bs } = await supabase.from('barbers').select('*').eq('is_verified', true).eq('is_demo', false).not('stripe_account_id', 'is', null);
        for (const b of bs || []) {
          await releaseHeldEarnings(b).catch(() => {});
          await payQuestIfDue(b).catch(() => {});
        }
        await remindRebooks().catch(e => console.error('[housekeeping] rebook', e.message));
      }
    } catch (e) { console.error('[housekeeping] quests', e.message); }
    try { await notifyWaitlist(); } catch (e) { console.error('[housekeeping] waitlist', e.message); }
    try { await remindScheduled(); } catch (e) { console.error('[housekeeping] reminders', e.message); }
  }
  if (supabase) setInterval(housekeeping, 5 * 60 * 1000);

  // Customer-facing copy of a booking: the barber never needs the PIN from us,
  // and the customer always gets theirs.
  function publicBooking(b) { return b; }

  // Live keys for real customers; Apple's review account stays on TEST keys so
  // the reviewer can pay with 4242 4242 4242 4242 after we go live.
  const stripeFor = (u) => (stripeTest && isReviewer(u)) ? stripeTest : stripe;
  const pkFor = (u) => (stripeTest && isReviewer(u)) ? STRIPE_TEST_PUBLISHABLE : STRIPE_PUBLISHABLE;
  const piClients = new Map();
  // Which account (live/test) owns a PaymentIntent — try live, then test.
  async function piClient(piId) {
    if (piClients.has(piId)) return piClients.get(piId);
    for (const c of [stripe, stripeTest].filter(Boolean)) {
      try { await c.paymentIntents.retrieve(piId); piClients.set(piId, c); return c; } catch (e) {}
    }
    return stripe;
  }
  async function cancelHold(piId) {
    if (!stripe || !piId) return;
    try {
      const sc = await piClient(piId);
      const pi = await sc.paymentIntents.retrieve(piId);
      if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
        await sc.paymentIntents.cancel(piId);
      }
    } catch (e) { console.warn('[marketplace] cancel hold failed:', e.message); }
  }
  // Capture the whole hold (cut completed) or just a cancellation fee. With a
  // Connect destination, a cancellation fee goes entirely to the barber whose
  // time was wasted, so the platform's application fee drops to 0.
  async function captureHold(piId, amountCents) {
    if (!stripe || !piId) return null;
    const sc = await piClient(piId);
    const pi = await sc.paymentIntents.retrieve(piId);
    if (pi.status !== 'requires_capture') return pi;
    const params = {};
    if (amountCents != null) {
      params.amount_to_capture = Math.min(amountCents, pi.amount);
      if (pi.transfer_data) params.application_fee_amount = 0;
    }
    return sc.paymentIntents.capture(piId, params, { idempotencyKey: 'cap_' + piId });
  }

  // App 1.0.x (live before the marketplace) sends a client-side price and books
  // the fixed demo roster. Kept, bounded and rate-limited, until those builds age
  // out; new builds always send barberId and take the path above.
  async function legacyPaymentIntent(req, res, d) {
    if (!stripe) return sendJSON(res, 200, { ok: false, configured: false });
    if (rateLimited(req, 'pi', 12, 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many payment attempts. Please wait a moment and try again.' });
    const servicePrice = Math.round(Number(d.servicePrice) || 0);
    if (!Number.isFinite(servicePrice) || servicePrice < ctx.MIN_SERVICE_CENTS || servicePrice > ctx.MAX_SERVICE_CENTS) {
      return sendJSON(res, 400, { ok: false, error: 'invalid servicePrice (cents)' });
    }
    const fee = Math.round(servicePrice * FEE_PERCENT / 100);
    const total = servicePrice + fee;
    try {
      const params = { amount: total, currency: (d.currency || 'usd').toLowerCase(), automatic_payment_methods: { enabled: true },
        metadata: { servicePrice: String(servicePrice), platformFee: String(fee), feePercent: String(FEE_PERCENT), legacy: '1' } };
      const idem = String(d.idempotencyKey || '').slice(0, 200);
      const pi = idem ? await stripe.paymentIntents.create(params, { idempotencyKey: idem }) : await stripe.paymentIntents.create(params);
      return sendJSON(res, 200, { ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id,
        breakdown: { servicePrice, platformFee: fee, total, feePercent: FEE_PERCENT } });
    } catch (err) {
      console.error('[create-payment-intent legacy]', err.message);
      return sendJSON(res, 200, { ok: false, error: String(err.message) });
    }
  }

  // ---------- App Review support ----------
  // The reviewer signs in as a real Supabase user, and only that account sees a
  // demo barber whose side of the trip is driven by the server — Apple can't
  // run a second phone to play the barber. Real customers never see it.
  let demoBarberId = null, reviewSetup = { ok: false, at: 0, steps: [] };
  // Idempotent. Every step reports its error (Supabase returns errors instead of
  // throwing, so silent failures were easy to miss), and it retries on later
  // requests until it succeeds — e.g. if it ran before the DB migration.
  async function ensureReviewAccounts() {
    if (!supabase) return reviewSetup;
    if (reviewSetup.ok) return reviewSetup;
    if (Date.now() - reviewSetup.at < 30000) return reviewSetup;   // don't hammer
    const steps = []; const log = (k, err) => { steps.push(err ? k + ': ' + (err.message || err) : k + ': ok'); };
    reviewSetup = { ok: false, at: Date.now(), steps };
    try {
      const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      log('listUsers', list.error);
      const users = (list.data && list.data.users) || [];
      const find = (e) => users.find(u => String(u.email || '').toLowerCase() === e);
      let rv = find(REVIEW_EMAIL);
      if (!rv) {
        const r = await supabase.auth.admin.createUser({ email: REVIEW_EMAIL, password: REVIEW_CODE, email_confirm: true, user_metadata: { full_name: 'App Review' } });
        log('create reviewer', r.error); rv = r.data && r.data.user;
      } else {
        const r = await supabase.auth.admin.updateUserById(rv.id, { password: REVIEW_CODE, email_confirm: true });
        log('reset reviewer password', r.error);
      }
      if (rv) { const r = await supabase.from('profiles').upsert({ id: rv.id, full_name: 'App Review' }, { onConflict: 'id' }); log('reviewer profile', r.error); }
      // App Review signs in as this barber (same code as the review account) to see the barber side
      let db = find(DEMO_BARBER_EMAIL);
      if (!db) {
        const r = await supabase.auth.admin.createUser({ email: DEMO_BARBER_EMAIL, password: REVIEW_CODE, email_confirm: true, user_metadata: { full_name: 'Demo Barber (App Review)' } });
        log('create demo barber', r.error); db = r.data && r.data.user;
      } else {
        const r = await supabase.auth.admin.updateUserById(db.id, { password: REVIEW_CODE, email_confirm: true });
        log('reset demo barber password', r.error);
      }
      if (!db) throw new Error('no demo barber user');
      let r = await supabase.from('profiles').upsert({ id: db.id, role: 'barber', full_name: 'Demo Barber (App Review)' }, { onConflict: 'id' });
      log('demo profile', r.error);
      // is_available stays false so older app builds (which list every
      // "available" barber) never show it; new builds include it for the reviewer.
      r = await supabase.from('barbers').upsert({
        profile_id: db.id, bio: 'Demo barber for App Review — completes the trip automatically.',
        is_verified: true, is_available: false, is_demo: true, rating: 5.0
      }, { onConflict: 'profile_id' }).select().single();
      log('demo barber row', r.error);
      if (!r.data) throw new Error('demo barber row missing');
      demoBarberId = r.data.id;
      const { data: svc } = await supabase.from('services').select('id').eq('barber_id', demoBarberId);
      if (!svc || !svc.length) {
        const ins = await supabase.from('services').insert([
          { barber_id: demoBarberId, name: 'Fade', price_cents: 3500, duration_min: 45 },
          { barber_id: demoBarberId, name: 'Haircut', price_cents: 3000, duration_min: 40 },
          { barber_id: demoBarberId, name: 'Beard trim', price_cents: 2000, duration_min: 20 }
        ]);
        log('demo services', ins.error);
      }
      reviewSetup.ok = !steps.some(x => !/: ok$/.test(x));
    } catch (e) { log('setup', e); }
    console.log('[marketplace] review setup ' + (reviewSetup.ok ? 'OK' : 'FAILED') + ' — ' + steps.join(' | '));
    return reviewSetup;
  }
  // Drive the demo barber through a real booking so every status, the live map
  // and the payment capture are exercised end to end.
  function runDemoTrip(booking) {
    const id = booking.id;
    const dest = [Number(booking.lat) || 40.758, Number(booking.lng) || -73.9855];
    const start = [dest[0] + 0.012, dest[1] + 0.014];
    const step = async (fn, ms) => new Promise(r => setTimeout(async () => { try { await fn(); } catch (e) { console.warn('[demo]', e.message); } r(); }, ms));
    (async () => {
      const alive = async () => { const b = await loadBooking(id); return b && !['cancelled', 'expired', 'declined', 'completed'].includes(b.status) ? b : null; };
      await step(async () => { if (await alive()) announce(await setBooking(id, { status: 'accepted', accepted_at: new Date().toISOString() }), 'barber'); }, 6000);
      if (booking.scheduled_at) return;   // a scheduled cut is only confirmed; it shows as Upcoming until its time
      await step(async () => { if (await alive()) announce(await setBooking(id, { status: 'en_route' }), 'barber'); }, 4000);
      for (let i = 0; i <= 20; i++) {
        if (!(await alive())) return;
        const t = i / 20;
        await supabase.from('barber_locations').upsert({ barber_id: booking.barber_id, lat: start[0] + (dest[0] - start[0]) * t, lng: start[1] + (dest[1] - start[1]) * t, updated_at: new Date().toISOString() });
        await new Promise(r => setTimeout(r, 3000));
      }
      await step(async () => { if (await alive()) announce(await setBooking(id, { status: 'arrived' }), 'barber'); }, 500);
      await step(async () => { if (await alive()) await setBooking(id, { status: 'in_progress' }); }, 20000);
      await step(async () => {
        const b = await alive(); if (!b) return;
        await captureHold(b.payment_intent_id);
        announce(await setBooking(id, { status: 'completed', completed_at: new Date().toISOString() }), 'barber');
      }, 20000);
    })();
  }

  // ---------- route handler ----------
  return {
    ensureReviewAccounts,
    async handle(req, res, url) {
      const p = url.pathname;
      const post = req.method === 'POST';

      if (p === '/api/review-setup') {
        if (!reviewSetup.ok) await ensureReviewAccounts();
        return sendJSON(res, 200, { ok: reviewSetup.ok, steps: reviewSetup.steps }), true;
      }

      // Who am I: admin flag + my barber row (if I applied) + payout status.
      if (post && p === '/api/me') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const barber = await barberForUser(u.id);
        return sendJSON(res, 200, { ok: true, isAdmin: isAdmin(u), barber }), true;
      }

      if (post && p === '/api/register-push') {
        const d = await readJSON(req, 4000) || {};
        const tok = String(d.token || '').trim();
        const u = d.accessToken ? await authUser(d.accessToken) : null;
        if (u && /^[0-9a-fA-F]{32,200}$/.test(tok)) {
          await supabase.from('profiles').upsert({ id: u.id, push_token: tok }, { onConflict: 'id' });
        }
        return sendJSON(res, 200, { ok: !!tok, saved: !!u }), true;
      }

      // ---- payment hold for a real booking ----
      if (post && p === '/api/create-payment-intent') {
        const d = await readJSON(req, 10000);
        if (!d) return sendJSON(res, 400, { ok: false, error: 'bad json' }), true;
        if (!d.barberId) return legacyPaymentIntent(req, res, d), true;   // app 1.0.x still in the wild
        if (!stripe || !supabase) return sendJSON(res, 200, { ok: false, configured: false }), true;
        if (rateLimited(req, 'pi', 12, 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many payment attempts. Please wait a moment.' }), true;
        const u = await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'Please sign in to book.' }), true;
        const { data: barber } = await supabase.from('barbers').select('*').eq('id', d.barberId).maybeSingle();
        if (!barber || !barber.is_verified) return sendJSON(res, 400, { ok: false, error: 'This barber is not available.' }), true;
        if (barber.is_demo && !isReviewer(u)) return sendJSON(res, 400, { ok: false, error: 'This barber is not available.' }), true;
        // Builds before 1.0.7 (34) tell customers every barber is licensed, so they can't book one who isn't.
        if (!barber.is_licensed && !barber.is_demo && !d.licenseAware) return sendJSON(res, 400, { ok: false, error: 'Update Catch a Fade in the App Store to book this barber.' }), true;
        if (barber.profile_id === u.id) return sendJSON(res, 400, { ok: false, error: 'You can\'t book yourself.' }), true;
        // The price comes from the barber's catalog, never from the app.
        const { data: svcs } = await supabase.from('services').select('name, price_cents').eq('barber_id', barber.id);
        if (!svcs || !svcs.length) return sendJSON(res, 400, { ok: false, error: 'This barber has no services listed yet.' }), true;
        const want = String(d.serviceName || '').toLowerCase();
        const svc = svcs.find(s => s.name.toLowerCase() === want) || svcs[0];
        const lat = Number(d.lat), lng = Number(d.lng);
        const mult = await demandMultiplier(Number.isFinite(lat) && d.lat != null ? lat : barber.home_lat, Number.isFinite(lng) && d.lng != null ? lng : barber.home_lng).catch(() => 1);
        let scheduledAt = null;
        if (d.scheduledAt) {
          const at = Date.parse(d.scheduledAt);
          if (!Number.isFinite(at) || at < Date.now() + SCHEDULE_MIN_MS - 5 * 60 * 1000 || at > Date.now() + SCHEDULE_MAX_MS)
            return sendJSON(res, 400, { ok: false, error: 'Pick a time at least 90 minutes from now and within the next 5 days.' }), true;
          scheduledAt = new Date(at).toISOString();
        }
        const flex = !!d.flex && !scheduledAt;
        const q = quote(svc.price_cents, scheduledAt ? 1 : mult, flex);
        const servicePrice = q.servicePrice, fee = q.platformFee, total = q.total;
        const params = {
          amount: total, currency: 'usd', capture_method: 'manual', payment_method_types: ['card'],
          metadata: { customer_id: u.id, barber_id: barber.id, service_name: svc.name,
                      servicePrice: String(servicePrice), platformFee: String(fee), takePercent: String(TAKE_PERCENT),
                      multiplier: String(q.multiplier), flex: flex ? '1' : '0', scheduled_at: scheduledAt || '' }
        };
        const sc = stripeFor(u);
        if (barber.stripe_account_id && sc === stripe) {
          try {
            const acct = await stripe.accounts.retrieve(barber.stripe_account_id);
            if (acct.charges_enabled) {
              params.application_fee_amount = fee;
              params.transfer_data = { destination: barber.stripe_account_id };
            }
          } catch (e) { /* payouts not ready — platform holds the funds until the barber connects */ }
        }
        try {
          const idem = String(d.idempotencyKey || '').slice(0, 200);
          const pi = idem ? await sc.paymentIntents.create(params, { idempotencyKey: idem }) : await sc.paymentIntents.create(params);
          piClients.set(pi.id, sc);
          return sendJSON(res, 200, { ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id, publishableKey: pkFor(u),
            breakdown: { servicePrice, platformFee: fee, total, takePercent: TAKE_PERCENT, multiplier: q.multiplier, flex, serviceName: svc.name } }), true;
        } catch (err) {
          console.error('[create-payment-intent] stripe error:', err.message);
          return sendJSON(res, 200, { ok: false, error: err.message }), true;
        }
      }

      // ---- turn an authorized hold into a booking request ----
      if (post && p === '/api/bookings/request') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const piId = String(d.paymentIntentId || '');
        if (!/^pi_[A-Za-z0-9_]+$/.test(piId)) return sendJSON(res, 400, { ok: false, error: 'invalid payment' }), true;
        const { data: existing } = await supabase.from('bookings').select('*').eq('payment_intent_id', piId).maybeSingle();
        if (existing) return sendJSON(res, 200, { ok: true, booking: publicBooking(existing) }), true;
        let pi;
        try { pi = await (await piClient(piId)).paymentIntents.retrieve(piId); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'payment not found' }), true; }
        if (pi.metadata.customer_id !== u.id) return sendJSON(res, 403, { ok: false, error: 'not your payment' }), true;
        if (pi.status !== 'requires_capture') return sendJSON(res, 400, { ok: false, error: 'Card authorization did not complete.' }), true;
        await supabase.from('profiles').upsert({ id: u.id }, { onConflict: 'id', ignoreDuplicates: true });
        const sp = Number(pi.metadata.servicePrice), fee = Number(pi.metadata.platformFee);
        const notes = String(d.notes || '').replace(/\s+/g, ' ').trim().slice(0, 300);   // "my usual", for this barber only
        const { data: bk, error } = await supabase.from('bookings').insert({
          ...(notes ? { notes } : {}),
          customer_id: u.id, barber_id: pi.metadata.barber_id, status: 'requested',
          service_name: pi.metadata.service_name, service_price_cents: sp, fee_cents: fee, total_cents: sp + fee,
          address: String(d.address || '').slice(0, 300) || null,
          lat: Number.isFinite(Number(d.lat)) ? Number(d.lat) : null,
          lng: Number.isFinite(Number(d.lng)) ? Number(d.lng) : null,
          arrival_pin: pin4(), payment_intent_id: piId,
          flex: pi.metadata.flex === '1',
          ...(pi.metadata.scheduled_at ? { scheduled_at: pi.metadata.scheduled_at } : {}),
          flex_until: pi.metadata.flex === '1' ? new Date(Date.now() + FLEX_WINDOW_MS).toISOString() : null
        }).select().single();
        if (error) {
          await cancelHold(piId);
          const blocked = /isn't allowed/.test(error.message || '');
          return sendJSON(res, blocked ? 400 : 500, { ok: false, error: blocked ? 'Your notes contain language that isn\'t allowed. Edit them and try again. Your card was not charged.' : error.message }), true;
        }
        const { data: barber } = await supabase.from('barbers').select('is_demo').eq('id', bk.barber_id).maybeSingle();
        if (barber && barber.is_demo) runDemoTrip(bk);
        else if (bk.scheduled_at) pushBarber(bk.barber_id, 'New booking · ' + whenText(bk.scheduled_at),
          (bk.service_name || 'Haircut') + ' · you earn ' + money(bk.service_price_cents) + '. Open Catch a Fade to accept.', { bookingId: bk.id });
        else if (bk.flex) pushBarber(bk.barber_id, 'New flexible request · ' + (bk.service_name || 'Haircut'),
          'You earn ' + money(bk.service_price_cents) + '. Any time in the next 2 hours. Open Catch a Fade to accept.', { bookingId: bk.id });
        else pushBarber(bk.barber_id, 'New request · ' + (bk.service_name || 'Haircut'),
          'You earn ' + money(bk.service_price_cents) + '. Open Catch a Fade to accept — 3 min to respond.', { bookingId: bk.id });
        supabase.from('waitlist').delete().eq('customer_id', u.id).then(() => {}, () => {});   // booked: no longer waiting
        return sendJSON(res, 200, { ok: true, booking: publicBooking(bk) }), true;
      }

      // ---- lock-screen Live Activity: the customer's activity push token ----
      if (post && p === '/api/bookings/activity') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const tok = String(d.token || '').trim();
        if (!/^[0-9a-fA-F]{32,300}$/.test(tok)) return sendJSON(res, 400, { ok: false, error: 'bad token' }), true;
        const { error } = await supabase.from('bookings').update({ activity_token: tok }).eq('id', String(d.bookingId || '')).eq('customer_id', u.id);
        return sendJSON(res, 200, { ok: !error }), true;
      }

      // ---- tips after the cut: a separate charge, 100% to the barber ----
      if (post && (p === '/api/tips' || p === '/api/tips/confirm')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const bk = await loadBooking(String(d.bookingId || ''));
        if (!bk || bk.customer_id !== u.id || bk.status !== 'completed') return sendJSON(res, 400, { ok: false, error: 'You can tip after your cut is complete.' }), true;
        if (bk.tip_cents > 0) return sendJSON(res, 400, { ok: false, error: 'You already tipped for this cut. Thank you!' }), true;
        const sc = stripeFor(u);
        if (p === '/api/tips') {
          if (rateLimited(req, 'tip', 10, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many attempts. Try again later.' }), true;
          const amount = Math.round(Number(d.amountCents) || 0);
          if (amount < 100 || amount > 20000) return sendJSON(res, 400, { ok: false, error: 'Tips can be $1 to $200.' }), true;
          const params = { amount, currency: 'usd', payment_method_types: ['card'],
            description: 'Tip for your Catch a Fade barber', metadata: { kind: 'tip', booking_id: bk.id, customer_id: u.id, barber_id: bk.barber_id } };
          const { data: barber } = await supabase.from('barbers').select('stripe_account_id').eq('id', bk.barber_id).maybeSingle();
          if (barber && barber.stripe_account_id && sc === stripe) {
            try { const a = await stripe.accounts.retrieve(barber.stripe_account_id); if (a.charges_enabled) params.transfer_data = { destination: barber.stripe_account_id }; } catch (e) {}
          }
          const pi = await sc.paymentIntents.create(params, { idempotencyKey: 'tip_' + bk.id + '_' + amount });
          piClients.set(pi.id, sc);
          return sendJSON(res, 200, { ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id, publishableKey: pkFor(u), amountCents: amount }), true;
        }
        const piId = String(d.paymentIntentId || '');
        let pi; try { pi = await (await piClient(piId)).paymentIntents.retrieve(piId); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'payment not found' }), true; }
        if (pi.metadata.kind !== 'tip' || pi.metadata.booking_id !== bk.id || pi.status !== 'succeeded') return sendJSON(res, 400, { ok: false, error: 'The tip didn\'t go through.' }), true;
        const done = await setBooking(bk.id, { tip_cents: pi.amount, tip_payment_intent_id: pi.id });
        const cust = (await firstNameOf(u.id)) || 'Your customer';
        pushBarber(bk.barber_id, cust + ' tipped you ' + money(pi.amount) + ' 💸', '100% of tips go to you.', { bookingId: bk.id, type: 'tip' });
        return sendJSON(res, 200, { ok: true, booking: done }), true;
      }

      // ---- barbers: where the demand is (heatmap) and this week's goal ----
      if (post && (p === '/api/barber/demand' || p === '/api/barber/quests')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const barber = await barberForUser(u.id);
        if (!barber) return sendJSON(res, 400, { ok: false, error: 'Apply as a barber first.' }), true;
        if (p === '/api/barber/quests') return sendJSON(res, 200, Object.assign({ ok: true }, await questStatus(barber))), true;
        const lat = Number(d.lat != null ? d.lat : barber.home_lat), lng = Number(d.lng != null ? d.lng : barber.home_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return sendJSON(res, 200, { ok: true, cells: [], multiplier: 1 }), true;
        const box = 0.3, since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
        const { data: rows } = await supabase.from('bookings').select('lat, lng, created_at').gte('created_at', since)
          .not('lat', 'is', null).gte('lat', lat - box).lte('lat', lat + box).gte('lng', lng - box).lte('lng', lng + box).limit(2000);
        // ~1 km cells; only aggregate counts leave the server, never addresses
        const cells = new Map();
        for (const r of rows || []) {
          const k = (Math.round(r.lat * 100) / 100).toFixed(2) + ',' + (Math.round(r.lng * 100) / 100).toFixed(2);
          cells.set(k, (cells.get(k) || 0) + 1);
        }
        const out = [...cells.entries()].map(([k, n]) => { const [a, b] = k.split(',').map(Number); return { lat: a, lng: b, count: n }; })
          .sort((x, y) => y.count - x.count).slice(0, 120);
        const multiplier = await demandMultiplier(lat, lng).catch(() => 1);
        return sendJSON(res, 200, { ok: true, cells: out, multiplier }), true;
      }

      // ---- "Notify me when a barber is near" (customers waiting while supply ramps up) ----
      if (post && p === '/api/waitlist') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        if (rateLimited(req, 'waitlist', 30, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many tries. Try again later.' }), true;
        if (d.action === 'leave') {
          await supabase.from('waitlist').delete().eq('customer_id', u.id);
          return sendJSON(res, 200, { ok: true, waiting: false }), true;
        }
        if (d.action === 'join') {
          const lat = Number(d.lat), lng = Number(d.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
            return sendJSON(res, 400, { ok: false, error: 'We need your location to know when a barber is near.' }), true;
          const { error } = await supabase.from('waitlist').upsert({ customer_id: u.id, lat: round2(lat), lng: round2(lng) }, { onConflict: 'customer_id' });
          if (error) return sendJSON(res, 500, { ok: false, error: error.message }), true;
        }
        const { data: me } = await supabase.from('waitlist').select('lat, lng').eq('customer_id', u.id).maybeSingle();
        return sendJSON(res, 200, { ok: true, waiting: !!me, nearby: me ? await waitingNear(me.lat, me.lng) : 0 }), true;
      }
      // how many customers are waiting around a spot (a count only, for barbers and the /barbers page)
      if (req.method === 'GET' && p === '/api/waitlist/count') {
        const qa = url.searchParams.get('lat'), qn = url.searchParams.get('lng');
        const lat = Number(qa), lng = Number(qn);
        if (!qa || !qn || !Number.isFinite(lat) || !Number.isFinite(lng)) return sendJSON(res, 400, { ok: false, error: 'lat and lng required' }), true;
        return sendJSON(res, 200, { ok: true, waiting: await waitingNear(lat, lng) }), true;
      }

      // ---- every status change goes through here ----
      if (post && p === '/api/bookings/action') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        const bk = await loadBooking(String(d.bookingId || ''));
        if (!bk) return sendJSON(res, 404, { ok: false, error: 'booking not found' }), true;
        const action = String(d.action || '');
        const myBarber = await barberForUser(u.id);
        const asBarber = !!myBarber && myBarber.id === bk.barber_id;
        const asCustomer = bk.customer_id === u.id;
        const now = new Date().toISOString();
        const age = Date.now() - new Date(bk.created_at).getTime();
        const bad = (msg) => (sendJSON(res, 400, { ok: false, error: msg, booking: bk }), true);
        // wrap the reply so the other party hears about every successful change
        const _send = sendJSON;
        const reply = (status, obj) => { if (obj && obj.ok && obj.booking) announce(obj.booking, asBarber ? 'barber' : 'customer'); return _send(res, status, obj); };
        try {
          if (asBarber) {
            if (action === 'accept') {
              if (bk.status !== 'requested') return bad('This request is no longer available.');
              if (age > requestTtl(bk)) { await cancelHold(bk.payment_intent_id); await setBooking(bk.id, { status: 'expired' }); return bad('This request expired.'); }
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'accepted', accepted_at: now }) }), true;
            }
            if (action === 'decline') {
              if (bk.status !== 'requested') return bad('Already handled.');
              await cancelHold(bk.payment_intent_id);
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'declined' }) }), true;
            }
            if (action === 'en_route') {
              if (bk.status !== 'accepted') return bad('Accept the job first.');
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'en_route' }) }), true;
            }
            if (action === 'arrived') {
              if (!['accepted', 'en_route'].includes(bk.status)) return bad('Not on the way to this job.');
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'arrived' }) }), true;
            }
            if (action === 'start') {
              if (bk.status !== 'arrived') return bad('Mark yourself as arrived first.');
              if (String(d.pin || '').trim() !== String(bk.arrival_pin)) return bad('That PIN doesn\'t match. Ask the customer for the 4-digit PIN in their app.');
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'in_progress' }) }), true;
            }
            if (action === 'complete') {
              if (bk.status !== 'in_progress') return bad('Start the cut with the customer\'s PIN first.');
              await captureHold(bk.payment_intent_id);
              const done = await setBooking(bk.id, { status: 'completed', completed_at: now });
              await supabase.from('barbers').update({ cuts_completed: (myBarber.cuts_completed || 0) + 1 }).eq('id', myBarber.id);
              payQuestIfDue(myBarber).catch(e => console.error('[quest]', e.message));
              return reply(200, { ok: true, booking: done }), true;
            }
            if (action === 'cancel') {
              if (!['accepted', 'en_route', 'arrived'].includes(bk.status)) return bad('Can\'t cancel now.');
              await cancelHold(bk.payment_intent_id);
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: 'cancelled' }) }), true;
            }
          }
          if (asCustomer) {
            if (action === 'expire' || (action === 'cancel' && bk.status === 'requested')) {
              if (bk.status !== 'requested') return reply(200, { ok: true, booking: bk }), true;
              await cancelHold(bk.payment_intent_id);
              return reply(200, { ok: true, booking: await setBooking(bk.id, { status: action === 'expire' ? 'expired' : 'cancelled' }) }), true;
            }
            if (action === 'cancel') {
              if (!['accepted', 'en_route', 'arrived'].includes(bk.status)) return bad('This booking can no longer be cancelled.');
              const sinceAccept = Date.now() - new Date(bk.accepted_at || bk.created_at).getTime();
              const at = bk.scheduled_at ? Date.parse(bk.scheduled_at) : 0;
              const free = at
                ? bk.status === 'accepted' && (Date.now() < at - SCHEDULE_FREE_CANCEL_MS || Date.now() > at + SCHEDULE_LATE_MS)
                : sinceAccept <= FREE_CANCEL_MS;
              const fee = (bk.status === 'arrived' || !free) ? CANCEL_FEE_CENTS : 0;
              if (fee > 0) await captureHold(bk.payment_intent_id, fee); else await cancelHold(bk.payment_intent_id);
              return reply(200, { ok: true, cancellationFee: fee,
                booking: await setBooking(bk.id, { status: bk.status === 'arrived' ? 'no_show' : 'cancelled', cancel_fee_cents: fee }) }), true;
            }
          }
          return sendJSON(res, 403, { ok: false, error: 'Not allowed.' }), true;
        } catch (err) {
          console.error('[bookings/action]', action, err.message);
          return sendJSON(res, 500, { ok: false, error: err.message }), true;
        }
      }

      // ---- Stripe Connect payouts for barbers ----
      if (post && (p === '/api/connect/onboard' || p === '/api/connect/status' || p === '/api/connect/dashboard')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        if (!stripe) return sendJSON(res, 200, { ok: false, error: 'payments not configured' }), true;
        const barber = await barberForUser(u.id);
        if (!barber) return sendJSON(res, 400, { ok: false, error: 'Apply as a barber first.' }), true;
        if (barber.is_demo) return sendJSON(res, 200, p === '/api/connect/status'
          ? { ok: true, connected: false, demo: true, heldCents: 0 }
          : { ok: false, error: 'Payouts are turned off for the App Review demo account. Real barbers connect their bank through Stripe here.' }), true;
        const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
        // An account made with the other Stripe mode (test before going live) doesn't
        // exist here: forget it, so the barber can set up payouts again instead of being stuck.
        if (barber.stripe_account_id) {
          try { await stripe.accounts.retrieve(barber.stripe_account_id); }
          catch (e) {
            if (e && (e.code === 'resource_missing' || e.statusCode === 404 || /no such account|does not have access/i.test(e.message || ''))) {
              console.log('[connect] dropping account from the other Stripe mode', barber.id);
              await supabase.from('barbers').update({ stripe_account_id: null }).eq('id', barber.id);
              barber.stripe_account_id = null;
            }
          }
        }
        try {
          if (p === '/api/connect/status') {
            if (!barber.stripe_account_id) return sendJSON(res, 200, { ok: true, connected: false, heldCents: await heldCents(barber) }), true;
            const a = await stripe.accounts.retrieve(barber.stripe_account_id);
            if (a.charges_enabled) await releaseHeldEarnings(barber).catch(e => console.error('[held earnings]', e.message));
            return sendJSON(res, 200, { ok: true, connected: true, chargesEnabled: a.charges_enabled,
              payoutsEnabled: a.payouts_enabled, detailsSubmitted: a.details_submitted, heldCents: await heldCents(barber) }), true;
          }
          if (p === '/api/connect/dashboard') {
            if (!barber.stripe_account_id) return sendJSON(res, 400, { ok: false, error: 'Set up payouts first.' }), true;
            const link = await stripe.accounts.createLoginLink(barber.stripe_account_id);
            return sendJSON(res, 200, { ok: true, url: link.url }), true;
          }
          let acct = barber.stripe_account_id;
          if (!acct) {
            const a = await stripe.accounts.create({
              type: 'express', email: u.email, business_type: 'individual',
              capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
              business_profile: { product_description: 'Mobile barber services booked through Catch a Fade', mcc: '7241' },
              metadata: { barber_id: barber.id }
            });
            acct = a.id;
            await supabase.from('barbers').update({ stripe_account_id: acct }).eq('id', barber.id);
          }
          const link = await stripe.accountLinks.create({ account: acct, type: 'account_onboarding',
            refresh_url: base + '/connect/refresh', return_url: base + '/connect/done' });
          return sendJSON(res, 200, { ok: true, url: link.url }), true;
        } catch (err) {
          console.error('[connect]', err.message);
          return sendJSON(res, 200, { ok: false, error: err.message }), true;
        }
      }
      if (req.method === 'GET' && (p === '/connect/done' || p === '/connect/refresh')) {
        const done = p === '/connect/done';
        return sendHTML(res, pageHTML(done ? 'Payouts set up' : 'Link expired',
          done ? '<h1>You\'re all set ✂</h1><p>Your payout details were sent to Stripe. Go back to the Catch a Fade app — your dashboard will show when payouts are active.</p>'
               : '<h1>That link expired</h1><p>Go back to the Catch a Fade app and tap <b>Set up payouts</b> again to get a fresh link.</p>')), true;
      }

      // ---- barber verification photos (government ID + selfie) ----
      // Stored in a PRIVATE bucket; only admins ever see them, through
      // short-lived signed links in the approvals list.
      if (post && p === '/api/barber/docs') {
        const d = await readJSON(req, 6 * 1024 * 1024); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        if (rateLimited(req, 'docs', 12, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many uploads. Try again later.' }), true;
        const kind = ['id', 'selfie', 'photo'].includes(d.kind) ? d.kind : '';
        const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(d.dataUrl || ''));
        if (!kind || !m) return sendJSON(res, 400, { ok: false, error: 'Send a JPEG or PNG photo.' }), true;
        const bytes = Buffer.from(m[2], 'base64');
        if (bytes.length < 2000 || bytes.length > 4.5 * 1024 * 1024) return sendJSON(res, 400, { ok: false, error: 'That photo is too small or too large.' }), true;
        if (!(await ensureDocsBucket())) return sendJSON(res, 500, { ok: false, error: 'Storage is unavailable. Try again shortly.' }), true;
        const { error } = await supabase.storage.from(DOCS_BUCKET)
          .upload(u.id + '/' + kind + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), bytes, { contentType: 'image/' + m[1], upsert: true });
        if (error) return sendJSON(res, 500, { ok: false, error: error.message }), true;
        if (kind === 'photo' && await ensureAvatarBucket()) {
          const path = u.id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
          const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/' + m[1], upsert: true });
          if (!up.error) {
            const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
            await supabase.from('profiles').update({ avatar_url: url }).eq('id', u.id);
            return sendJSON(res, 200, { ok: true, avatarUrl: url }), true;
          }
        }
        return sendJSON(res, 200, { ok: true }), true;
      }

      // ---- a barber's shareable booking page: catch-a-fade.onrender.com/b/<id> ----
      if (req.method === 'GET' && BARBER_PAGE.test(p)) {
        const id = p.slice(3);
        const { data: b } = await supabase.from('barbers')
          .select('id, profile_id, bio, rating, cuts_completed, is_verified, is_demo, profile:profiles!barbers_profile_id_fkey(full_name, avatar_url), services(name, price_cents)')
          .eq('id', id).maybeSingle();
        if (!b || !b.is_verified || b.is_demo) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(barberPage(null)); return true; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
        res.end(barberPage(b, await portfolioOf(b.profile_id), await review.publicLicense(b.profile_id)));
        return true;
      }

      // ---- current pricing near the customer (one-price display + busy note) ----
      if (req.method === 'GET' && p === '/api/pricing') {
        const mult = await demandMultiplier(url.searchParams.get('lat'), url.searchParams.get('lng')).catch(() => 1);
        return sendJSON(res, 200, { ok: true, takePercent: TAKE_PERCENT, multiplier: mult, flexDiscount: FLEX_DISCOUNT, flexWindowMin: FLEX_WINDOW_MS / 60000 }), true;
      }

      // ---- portfolio: photos of the barber's cuts, public on their profile ----
      if (req.method === 'GET' && p === '/api/portfolio') {
        const { data: b } = await supabase.from('barbers').select('profile_id, is_verified, is_demo').eq('id', String(url.searchParams.get('barberId') || '')).maybeSingle();
        if (!b || !(b.is_verified || b.is_demo)) return sendJSON(res, 200, { ok: true, photos: [] }), true;
        return sendJSON(res, 200, { ok: true, photos: await portfolioOf(b.profile_id), license: b.is_demo ? null : await review.publicLicense(b.profile_id) }), true;
      }
      // ---- live license check while a barber fills in the application ----
      if (post && p === '/api/license-check') {
        if (rateLimited(req, 'liccheck', 30, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many checks. Try again later.' }), true;
        const d = await readJSON(req);
        const r = await review.checkLicense(d && d.license, d && d.fullName);
        // never echo the license holder's name back
        return sendJSON(res, 200, { ok: true, status: r.status, type: r.record && r.record.type, expires: r.status === 'verified' ? r.record.expires : undefined }), true;
      }
      if (post && p === '/api/barber/portfolio') {
        const d = await readJSON(req, 6 * 1024 * 1024); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        if (!(await ensureAvatarBucket())) return sendJSON(res, 500, { ok: false, error: 'Storage is unavailable. Try again shortly.' }), true;
        const dir = 'portfolio/' + u.id;
        if (d.action === 'add') {
          if (rateLimited(req, 'portfolio', 30, 60 * 60 * 1000)) return sendJSON(res, 429, { ok: false, error: 'Too many uploads. Try again later.' }), true;
          if ((await portfolioOf(u.id)).length >= PORTFOLIO_MAX) return sendJSON(res, 400, { ok: false, error: 'Your portfolio is full. Remove a photo first.' }), true;
          const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(d.dataUrl || ''));
          if (!m) return sendJSON(res, 400, { ok: false, error: 'Send a JPEG or PNG photo.' }), true;
          const bytes = Buffer.from(m[2], 'base64');
          if (bytes.length < 2000 || bytes.length > 4.5 * 1024 * 1024) return sendJSON(res, 400, { ok: false, error: 'That photo is too small or too large.' }), true;
          // Guideline 1.2: portfolio photos are public, so each one is screened first.
          const verdict = await screenPortfolioPhoto(m[1], m[2], d.label);
          if (!verdict.ok) return sendJSON(res, 400, { ok: false, error: verdict.error }), true;
          const slug = String(d.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cut';
          const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(dir + '/' + Date.now() + '-' + slug + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), bytes, { contentType: 'image/' + m[1] });
          if (error) return sendJSON(res, 500, { ok: false, error: error.message }), true;
        } else if (d.action === 'remove') {
          const name = String(d.name || '').replace(/[^a-z0-9.-]/gi, '');
          if (name) await supabase.storage.from(AVATAR_BUCKET).remove([dir + '/' + name]);
        }
        return sendJSON(res, 200, { ok: true, photos: await portfolioOf(u.id) }), true;
      }

      // ---- automatic review: application received / status ----
      if (post && (p === '/api/barber/submitted' || p === '/api/barber/review-status')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        if (p === '/api/barber/submitted') await review.received(u.id);
        return sendJSON(res, 200, Object.assign({ ok: true }, await review.status(u.id))), true;
      }
      if (post && p === '/api/admin/review') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!isAdmin(u)) return sendJSON(res, 403, { ok: false, error: 'admins only' }), true;
        const { data: b } = await supabase.from('barbers').select('profile_id').eq('id', String(d.barberId || '')).maybeSingle();
        if (!b) return sendJSON(res, 404, { ok: false, error: 'no such barber' }), true;
        return sendJSON(res, 200, { ok: true, review: await review.run(b.profile_id, { force: true }) }), true;
      }

      // ---- barber license + Independent Barber Agreement ----
      // Kept in the account's app_metadata: only the server can write it, so a
      // barber can't edit their own record after we verified it.
      if (post && p === '/api/barber/compliance') {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!u) return sendJSON(res, 401, { ok: false, error: 'sign in required' }), true;
        // The license is optional: barbers without one join on the identity check alone.
        const license = String(d.licenseNumber || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
        const state = String(d.licenseState || 'FL').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'FL';
        if (license && license.length < 3) return sendJSON(res, 400, { ok: false, error: 'Check your barber license number, or leave it blank.' }), true;
        if (!d.agreed) return sendJSON(res, 400, { ok: false, error: 'Please accept the Independent Barber Agreement.' }), true;
        const meta = Object.assign({}, u.app_metadata || {}, {
          barber_license: license || null, barber_license_state: license ? state : null,
          barber_agreement: { version: AGREEMENT_VERSION, accepted_at: new Date().toISOString() }
        });
        const { error } = await supabase.auth.admin.updateUserById(u.id, { app_metadata: meta });
        if (error) return sendJSON(res, 500, { ok: false, error: error.message }), true;
        return sendJSON(res, 200, { ok: true }), true;
      }

      // ---- admin: approve new barbers ----
      if (post && (p === '/api/admin/barbers' || p === '/api/admin/verify')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!isAdmin(u)) return sendJSON(res, 403, { ok: false, error: 'admins only' }), true;
        if (p === '/api/admin/verify') {
          const { data, error } = await supabase.from('barbers')
            .update({ is_verified: !!d.verified, ...(d.verified ? {} : { is_available: false }) })
            .eq('id', String(d.barberId || '')).select().single();
          if (error) return sendJSON(res, 400, { ok: false, error: error.message }), true;
          if (d.verified) pushBarber(data.id, 'You\'re approved ✂', 'Open Catch a Fade, set up payouts and go online to start taking requests.', { type: 'barber_approved' });
          return sendJSON(res, 200, { ok: true, barber: data }), true;
        }
        const { data: rows } = await supabase.from('barbers')
          .select('id, bio, is_verified, is_available, is_demo, stripe_account_id, created_at, cuts_completed, rating, profile:profiles!barbers_profile_id_fkey(id, full_name, phone), services(name, price_cents)')
          .eq('is_demo', false).order('created_at', { ascending: false });
        const out = [];
        for (const r of rows || []) {
          let email = '', am = {};
          try { const g = await supabase.auth.admin.getUserById(r.profile.id); const gu = g.data && g.data.user; email = (gu && gu.email) || ''; am = (gu && gu.app_metadata) || {}; } catch (e) {}
          out.push({ ...r, email, docs: r.profile ? await docLinks(r.profile.id) : { id: null, selfie: null },
                     license: am.barber_license || '', licenseState: am.barber_license_state || '',
                     agreedAt: (am.barber_agreement && am.barber_agreement.accepted_at) || '',
                     review: am.barber_review || null });
        }
        return sendJSON(res, 200, { ok: true, barbers: out }), true;
      }

      return false;
    }
  };
};
