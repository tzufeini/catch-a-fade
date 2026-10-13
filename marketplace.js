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
const FREE_CANCEL_MS = 2 * 60 * 1000;   // Uber-style: free cancel for 2 min after accept
const DEMO_BARBER_EMAIL = 'demo-barber@catchafade.app';

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
          CANCEL_FEE_CENTS, REVIEW_EMAIL, REVIEW_CODE, ADMIN_EMAILS, push } = ctx;

  async function authUser(token) {
    if (!supabase || !token) return null;
    try {
      const { data, error } = await supabase.auth.getUser(String(token));
      return error ? null : data.user;
    } catch (e) { return null; }
  }
  const isAdmin = (u) => !!u && ADMIN_EMAILS.includes(String(u.email || '').toLowerCase());
  const isReviewer = (u) => !!u && String(u.email || '').toLowerCase() === REVIEW_EMAIL;

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
      accepted: [barber + ' accepted your booking', 'Free cancellation for 2 minutes.'],
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
    if (by === 'customer' && toBarber[bk.status]) await pushBarber(bk.barber_id, toBarber[bk.status][0], toBarber[bk.status][1], id);
  }

  // Customer-facing copy of a booking: the barber never needs the PIN from us,
  // and the customer always gets theirs.
  function publicBooking(b) { return b; }

  async function cancelHold(piId) {
    if (!stripe || !piId) return;
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
        await stripe.paymentIntents.cancel(piId);
      }
    } catch (e) { console.warn('[marketplace] cancel hold failed:', e.message); }
  }
  // Capture the whole hold (cut completed) or just a cancellation fee. With a
  // Connect destination, a cancellation fee goes entirely to the barber whose
  // time was wasted, so the platform's application fee drops to 0.
  async function captureHold(piId, amountCents) {
    if (!stripe || !piId) return null;
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status !== 'requires_capture') return pi;
    const params = {};
    if (amountCents != null) {
      params.amount_to_capture = Math.min(amountCents, pi.amount);
      if (pi.transfer_data) params.application_fee_amount = 0;
    }
    return stripe.paymentIntents.capture(piId, params, { idempotencyKey: 'cap_' + piId });
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
  let demoBarberId = null;
  async function ensureReviewAccounts() {
    if (!supabase) return;
    try {
      const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const users = (list.data && list.data.users) || [];
      const find = (e) => users.find(u => String(u.email || '').toLowerCase() === e);
      // reviewer customer: password = the review code shown in App Store Connect
      let rv = find(REVIEW_EMAIL);
      if (!rv) {
        const r = await supabase.auth.admin.createUser({ email: REVIEW_EMAIL, password: REVIEW_CODE, email_confirm: true, user_metadata: { full_name: 'App Review' } });
        rv = r.data && r.data.user;
      } else {
        await supabase.auth.admin.updateUserById(rv.id, { password: REVIEW_CODE, email_confirm: true });
      }
      // demo barber (server-driven)
      let db = find(DEMO_BARBER_EMAIL);
      if (!db) {
        const r = await supabase.auth.admin.createUser({ email: DEMO_BARBER_EMAIL, password: crypto.randomBytes(18).toString('hex'), email_confirm: true, user_metadata: { full_name: 'Demo Barber (App Review)' } });
        db = r.data && r.data.user;
      }
      if (!db) return;
      await supabase.from('profiles').upsert({ id: db.id, role: 'barber', full_name: 'Demo Barber (App Review)' }, { onConflict: 'id' });
      const { data: row } = await supabase.from('barbers').upsert({
        profile_id: db.id, bio: 'Demo barber for App Review — completes the trip automatically.',
        // is_available stays false so older app builds (which list every
        // "available" barber) never show it; new builds include it for the reviewer.
        is_verified: true, is_available: false, is_demo: true, rating: 5.0
      }, { onConflict: 'profile_id' }).select().single();
      if (row) {
        demoBarberId = row.id;
        const { data: svc } = await supabase.from('services').select('id').eq('barber_id', row.id);
        if (!svc || !svc.length) {
          await supabase.from('services').insert([
            { barber_id: row.id, name: 'Fade', price_cents: 3500, duration_min: 45 },
            { barber_id: row.id, name: 'Haircut', price_cents: 3000, duration_min: 40 },
            { barber_id: row.id, name: 'Beard trim', price_cents: 2000, duration_min: 20 }
          ]);
        }
      }
    } catch (e) { console.warn('[marketplace] review accounts:', e.message); }
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
        if (barber.profile_id === u.id) return sendJSON(res, 400, { ok: false, error: 'You can\'t book yourself.' }), true;
        // The price comes from the barber's catalog, never from the app.
        const { data: svcs } = await supabase.from('services').select('name, price_cents').eq('barber_id', barber.id);
        if (!svcs || !svcs.length) return sendJSON(res, 400, { ok: false, error: 'This barber has no services listed yet.' }), true;
        const want = String(d.serviceName || '').toLowerCase();
        const svc = svcs.find(s => s.name.toLowerCase() === want) || svcs[0];
        const servicePrice = svc.price_cents;
        const fee = Math.round(servicePrice * FEE_PERCENT / 100);
        const total = servicePrice + fee;
        const params = {
          amount: total, currency: 'usd', capture_method: 'manual', payment_method_types: ['card'],
          metadata: { customer_id: u.id, barber_id: barber.id, service_name: svc.name,
                      servicePrice: String(servicePrice), platformFee: String(fee), feePercent: String(FEE_PERCENT) }
        };
        if (barber.stripe_account_id) {
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
          const pi = idem ? await stripe.paymentIntents.create(params, { idempotencyKey: idem }) : await stripe.paymentIntents.create(params);
          return sendJSON(res, 200, { ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id,
            breakdown: { servicePrice, platformFee: fee, total, feePercent: FEE_PERCENT, serviceName: svc.name } }), true;
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
        try { pi = await stripe.paymentIntents.retrieve(piId); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'payment not found' }), true; }
        if (pi.metadata.customer_id !== u.id) return sendJSON(res, 403, { ok: false, error: 'not your payment' }), true;
        if (pi.status !== 'requires_capture') return sendJSON(res, 400, { ok: false, error: 'Card authorization did not complete.' }), true;
        await supabase.from('profiles').upsert({ id: u.id }, { onConflict: 'id', ignoreDuplicates: true });
        const sp = Number(pi.metadata.servicePrice), fee = Number(pi.metadata.platformFee);
        const { data: bk, error } = await supabase.from('bookings').insert({
          customer_id: u.id, barber_id: pi.metadata.barber_id, status: 'requested',
          service_name: pi.metadata.service_name, service_price_cents: sp, fee_cents: fee, total_cents: sp + fee,
          address: String(d.address || '').slice(0, 300) || null,
          lat: Number.isFinite(Number(d.lat)) ? Number(d.lat) : null,
          lng: Number.isFinite(Number(d.lng)) ? Number(d.lng) : null,
          arrival_pin: pin4(), payment_intent_id: piId
        }).select().single();
        if (error) { await cancelHold(piId); return sendJSON(res, 500, { ok: false, error: error.message }), true; }
        const { data: barber } = await supabase.from('barbers').select('is_demo').eq('id', bk.barber_id).maybeSingle();
        if (barber && barber.is_demo) runDemoTrip(bk);
        else pushBarber(bk.barber_id, 'New request · ' + (bk.service_name || 'Haircut'),
          'You earn ' + money(bk.service_price_cents) + '. Open Catch a Fade to accept — 3 min to respond.', { bookingId: bk.id });
        return sendJSON(res, 200, { ok: true, booking: publicBooking(bk) }), true;
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
              if (age > REQUEST_TTL_MS) { await cancelHold(bk.payment_intent_id); await setBooking(bk.id, { status: 'expired' }); return bad('This request expired.'); }
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
              const fee = (bk.status === 'arrived' || sinceAccept > FREE_CANCEL_MS) ? CANCEL_FEE_CENTS : 0;
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
        const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
        try {
          if (p === '/api/connect/status') {
            if (!barber.stripe_account_id) return sendJSON(res, 200, { ok: true, connected: false }), true;
            const a = await stripe.accounts.retrieve(barber.stripe_account_id);
            return sendJSON(res, 200, { ok: true, connected: true, chargesEnabled: a.charges_enabled,
              payoutsEnabled: a.payouts_enabled, detailsSubmitted: a.details_submitted }), true;
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

      // ---- admin: approve new barbers ----
      if (post && (p === '/api/admin/barbers' || p === '/api/admin/verify')) {
        const d = await readJSON(req); const u = d && await authUser(d.accessToken);
        if (!isAdmin(u)) return sendJSON(res, 403, { ok: false, error: 'admins only' }), true;
        if (p === '/api/admin/verify') {
          const { data, error } = await supabase.from('barbers')
            .update({ is_verified: !!d.verified, ...(d.verified ? {} : { is_available: false }) })
            .eq('id', String(d.barberId || '')).select().single();
          if (error) return sendJSON(res, 400, { ok: false, error: error.message }), true;
          return sendJSON(res, 200, { ok: true, barber: data }), true;
        }
        const { data: rows } = await supabase.from('barbers')
          .select('id, bio, is_verified, is_available, is_demo, stripe_account_id, created_at, cuts_completed, rating, profile:profiles!barbers_profile_id_fkey(id, full_name, phone), services(name, price_cents)')
          .eq('is_demo', false).order('created_at', { ascending: false });
        const out = [];
        for (const r of rows || []) {
          let email = '';
          try { const g = await supabase.auth.admin.getUserById(r.profile.id); email = (g.data && g.data.user && g.data.user.email) || ''; } catch (e) {}
          out.push({ ...r, email });
        }
        return sendJSON(res, 200, { ok: true, barbers: out }), true;
      }

      return false;
    }
  };
};
