/* Catch a Fade — automatic barber review (Oct 2026).
 *
 * Every application is reviewed without anyone at Catch a Fade in the loop:
 *
 *   1. received   push "we'll review it within 24 hours" (+ email when possible)
 *   2. license    the Florida DBPR public license file (lic03bb.csv, refreshed
 *                 daily) must show an active barber license (BB or BR) under the
 *                 applicant's name
 *   3. identity   Claude looks at the ID photo, the selfie and the profile photo:
 *                 real government ID, same person, name matches the application,
 *                 profile photo is a clear, appropriate photo of that person
 *   4. decision   approve → barber is verified and can go online
 *                 decline → told why (when it's something they can fix) and can
 *                 apply again
 *
 * If a check can't run (DBPR or Claude unreachable) the application stays
 * pending and is retried by the sweep; nobody is declined because of an outage.
 * Each decision is also emailed to the owner (ADMIN_EMAILS[0]).
 */
const DBPR_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic03bb.csv';
const DBPR_TTL_MS = 20 * 60 * 60 * 1000;
const REVIEW_DELAY_MS = 90 * 1000;          // let the "received" push land first
const SWEEP_MS = 10 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const REVIEW_MODEL = 'claude-opus-5-5';

// "Ana-María O'Neil" → "ANA MARIA ONEIL"
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/['’]/g, '').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

// Florida license numbers: "BB8907037", "BR65", or the bare digits.
function licenseKeys(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^(BB|BR)?0*(\d{1,9})$/.exec(s);
  if (!m) return [];
  return m[1] ? [m[1] + m[2]] : ['BB' + m[2], 'BR' + m[2]];
}

// DBPR "LAST, FIRST M" vs the name typed in the application.
function namesMatch(dbprName, fullName) {
  const [last, rest] = String(dbprName || '').split(',');
  const L = norm(last).split(' ').filter(Boolean);
  const F = norm(rest).split(' ').filter(Boolean);
  const A = norm(fullName).split(' ').filter(Boolean);
  if (!L.length || A.length < 2) return false;
  const lastOk = L.some(t => t.length > 1 && A.slice(1).includes(t));
  const firstOk = !F.length || F[0][0] === A[0][0];
  return lastOk && firstOk;
}

module.exports = function createBarberReview(ctx) {
  const { supabase, anthropicKey, pushUser, sendEmail, adminEmail, DOCS_BUCKET } = ctx;

  /* ---------- 1. Florida license file ---------- */
  let dbpr = null, dbprAt = 0, dbprLoading = null;
  async function loadDbpr() {
    if (dbpr && Date.now() - dbprAt < DBPR_TTL_MS) return dbpr;
    if (dbprLoading) return dbprLoading;
    dbprLoading = (async () => {
      try {
        const r = await fetch(DBPR_URL, { headers: { 'User-Agent': 'CatchAFade/1.0 (license verification)' } });
        if (!r.ok) throw new Error('DBPR ' + r.status);
        const map = new Map();
        for (const line of (await r.text()).split(/\r?\n/)) {
          const c = line.trim().slice(1, -1).split('","');
          if (c.length < 21 || (c[1] !== 'BB' && c[1] !== 'BR')) continue;
          map.set(c[1] + String(c[12]).replace(/^0+/, ''), {
            type: c[1], name: c[2], city: c[8], primary: c[13], secondary: c[14], expires: c[17], number: c[20]
          });
        }
        if (map.size < 5000) throw new Error('DBPR file looks incomplete (' + map.size + ')');
        dbpr = map; dbprAt = Date.now();
      } catch (e) { console.error('[review] DBPR load failed:', e.message); }
      dbprLoading = null;
      return dbpr;
    })();
    return dbprLoading;
  }

  // → { status: verified | not_found | inactive | name_mismatch | unavailable, record }
  async function checkLicense(license, fullName) {
    const map = await loadDbpr();
    if (!map) return { status: 'unavailable' };
    const rec = licenseKeys(license).map(k => map.get(k)).find(Boolean);
    if (!rec) return { status: 'not_found' };
    const [mm, dd, yy] = String(rec.expires).split('/').map(Number);
    const expired = yy && new Date(yy, mm - 1, dd, 23, 59) < new Date();
    // C = current, P = current on probation; A = active. S = suspended, I = inactive.
    if (!['C', 'P'].includes(rec.primary) || rec.secondary !== 'A' || expired) return { status: 'inactive', record: rec };
    if (!namesMatch(rec.name, fullName)) return { status: 'name_mismatch', record: rec };
    return { status: 'verified', record: rec };
  }

  /* ---------- 2. identity check with Claude ---------- */
  async function docBytes(uid, kind) {
    for (const ext of ['jpg', 'png', 'webp']) {
      const { data } = await supabase.storage.from(DOCS_BUCKET).download(uid + '/' + kind + '.' + ext);
      if (data) return { media: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext, b64: Buffer.from(await data.arrayBuffer()).toString('base64') };
    }
    return null;
  }
  async function identityCheck(uid, fullName, licenseName) {
    if (!anthropicKey) return { unavailable: true };
    const [id, selfie, photo] = await Promise.all([docBytes(uid, 'id'), docBytes(uid, 'selfie'), docBytes(uid, 'photo')]);
    if (!id || !selfie) return { missing: !id ? 'id' : 'selfie' };
    const img = (d) => ({ type: 'image', source: { type: 'base64', media_type: d.media, data: d.b64 } });
    const content = [
      { type: 'text', text: 'Image 1: the applicant\'s government ID.' }, img(id),
      { type: 'text', text: 'Image 2: a selfie the applicant took during the application.' }, img(selfie)
    ];
    if (photo) content.push({ type: 'text', text: 'Image 3: the profile photo customers will see.' }, img(photo));
    content.push({ type: 'text', text:
      'You verify identity for Catch a Fade, an app where licensed barbers do haircuts at customers\' homes. '
      + 'Name typed in the application: "' + fullName + '". Name on the Florida barber license: "' + (licenseName || 'unknown') + '". Today is ' + new Date().toISOString().slice(0, 10) + '.\n'
      + 'Answer only with this JSON, no other text:\n'
      + '{"id_document":"valid|not_an_id|unreadable|expired","id_name":"name printed on the ID",'
      + '"name_matches":true|false,"selfie_matches_id":"yes|no|unsure",'
      + '"profile_photo":"ok|no_face|different_person|inappropriate|missing","notes":"one short sentence"}\n'
      + 'Rules: name_matches is true when the ID name and the application name are clearly the same person (nicknames, middle names and accents are fine). '
      + 'Use "no" for selfie_matches_id only when the faces are clearly different people; use "unsure" when the photo quality makes it hard to tell. '
      + 'profile_photo is "missing" when there is no image 3; "ok" when it clearly shows the same person\'s face and is appropriate for a professional profile.' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: REVIEW_MODEL, max_tokens: 400, messages: [{ role: 'user', content }] })
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || ('anthropic ' + r.status));
      const text = (j.content || []).map(c => c.text || '').join('');
      return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch (e) {
      console.error('[review] identity check failed:', e.message);
      return { unavailable: true };
    }
  }

  /* ---------- 3. decision ---------- */
  // Reasons are shown to the applicant, so each one says what to fix.
  function decide(lic, idc) {
    const reasons = [];
    if (lic.status === 'not_found') reasons.push('We couldn\'t find an active Florida barber license with the number you entered. Check the number and apply again.');
    if (lic.status === 'inactive') reasons.push('Your Florida barber license isn\'t active right now.');
    if (lic.status === 'name_mismatch') reasons.push('The name on your barber license doesn\'t match the name in your application. Use your name exactly as it appears on your license.');
    if (idc.id_document && idc.id_document !== 'valid') reasons.push(idc.id_document === 'expired' ? 'Your ID has expired. Apply again with a current ID.' : 'We couldn\'t read your ID. Apply again with a clear photo of your driver\'s license, state ID or passport.');
    if (idc.name_matches === false) reasons.push('The name on your ID doesn\'t match the name in your application.');
    if (idc.selfie_matches_id === 'no') reasons.push('Your selfie doesn\'t match the photo on your ID.');
    if (idc.profile_photo === 'no_face' || idc.profile_photo === 'inappropriate') reasons.push('Your profile photo needs to clearly show your face. Apply again with a new photo.');
    if (idc.profile_photo === 'different_person') reasons.push('Your profile photo has to be a photo of you.');
    return { approved: reasons.length === 0, reasons };
  }

  /* ---------- state, kept in the account's app_metadata (server-only) ---------- */
  async function getUser(uid) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    return data && data.user;
  }
  async function setReview(user, patch) {
    const review = Object.assign({}, (user.app_metadata || {}).barber_review || {}, patch);
    await supabase.auth.admin.updateUserById(user.id, { app_metadata: Object.assign({}, user.app_metadata || {}, { barber_review: review }) });
    return review;
  }
  async function notify(user, title, body, emailText, data) {
    try { await pushUser(user.id, title, body, data || { type: 'barber_review' }); } catch (e) {}
    if (user.email && sendEmail) sendEmail(user.email, title, emailText || body).catch(() => {});
  }

  // Called by the app right after the application is written.
  async function received(uid) {
    const user = await getUser(uid);
    if (!user) return null;
    const prev = (user.app_metadata || {}).barber_review || {};
    if (prev.status === 'approved') return prev;
    const review = await setReview(user, { status: 'pending', submitted_at: new Date().toISOString(), attempts: 0, reasons: [], decided_at: null });
    await notify(user, 'Application received ✓',
      'Thanks for applying to Catch a Fade. We\'ll review your application within 24 hours and let you know.',
      'Thanks for applying to cut with Catch a Fade.\n\nWe\'re reviewing your license, ID and photos now. You\'ll hear from us within 24 hours.\n\nCatch a Fade');
    setTimeout(() => run(uid).catch(e => console.error('[review] run', e.message)), REVIEW_DELAY_MS);
    return review;
  }

  const running = new Set();
  async function run(uid, opts) {
    if (running.has(uid)) return null;
    running.add(uid);
    try {
      const user = await getUser(uid);
      if (!user) return null;
      const meta = user.app_metadata || {};
      const prev = meta.barber_review || {};
      if (!(opts && opts.force) && prev.status !== 'pending') return prev;
      const { data: barber } = await supabase.from('barbers').select('id, is_demo, profile:profiles!barbers_profile_id_fkey(full_name)').eq('profile_id', uid).maybeSingle();
      if (!barber || barber.is_demo) return prev;
      const fullName = (barber.profile && barber.profile.full_name) || '';
      await setReview(user, { attempts: (prev.attempts || 0) + 1, last_attempt_at: new Date().toISOString() });

      const lic = await checkLicense(meta.barber_license, fullName);
      if (lic.status === 'unavailable') return prev;             // retry on the next sweep
      const idc = await identityCheck(uid, fullName, lic.record && lic.record.name);
      if (idc.unavailable) return prev;
      if (idc.missing) idc.id_document = 'unreadable';

      const { approved, reasons } = decide(lic, idc);
      const fresh = await getUser(uid);
      const review = await setReview(fresh, {
        status: approved ? 'approved' : 'declined', decided_at: new Date().toISOString(), reasons,
        license_check: { status: lic.status, number: lic.record && lic.record.number, name: lic.record && lic.record.name, expires: lic.record && lic.record.expires },
        identity_check: idc
      });
      await supabase.from('barbers').update(approved ? { is_verified: true } : { is_verified: false, is_available: false }).eq('id', barber.id);

      const first = fullName.split(' ')[0];
      if (approved) {
        await notify(fresh, 'Great news, you\'re a Catch a Fade barber ✂',
          'You\'re approved. Set up payouts, then go online to start taking requests.',
          'Hi ' + first + ',\n\nGreat news: you\'re approved as a Catch a Fade barber.\n\nOpen the app, set up payouts, and go online whenever you want to take requests near you.\n\nCatch a Fade',
          { type: 'barber_approved' });
      } else {
        await notify(fresh, 'About your Catch a Fade application',
          'Sorry, we can\'t approve your application right now. Open the app to see why and apply again.',
          'Hi ' + first + ',\n\nSorry, we can\'t approve your application right now.\n\n' + reasons.map(r => '• ' + r).join('\n') + '\n\nYou can fix this and apply again in the app.\n\nCatch a Fade',
          { type: 'barber_declined' });
      }
      if (adminEmail && sendEmail) {
        sendEmail(adminEmail, 'Barber ' + (approved ? 'APPROVED' : 'declined') + ': ' + fullName,
          fullName + ' (' + (fresh.email || '') + ')\nLicense: ' + JSON.stringify(review.license_check) + '\nIdentity: ' + JSON.stringify(idc) + (reasons.length ? '\nReasons:\n- ' + reasons.join('\n- ') : '')).catch(() => {});
      }
      return review;
    } finally { running.delete(uid); }
  }

  // Picks up anything a restart or an outage left behind.
  async function sweep() {
    try {
      const { data } = await supabase.from('barbers').select('profile_id').eq('is_verified', false).eq('is_demo', false);
      for (const b of data || []) {
        const user = await getUser(b.profile_id).catch(() => null);
        const meta = (user && user.app_metadata) || {};
        const rv = meta.barber_review;
        // Applied from an older app build that doesn't call /api/barber/submitted.
        if (!rv && meta.barber_license) { await received(b.profile_id).catch(() => {}); continue; }
        if (!rv || rv.status !== 'pending') continue;
        if (rv.last_attempt_at && Date.now() - Date.parse(rv.last_attempt_at) < RETRY_AFTER_MS) continue;
        if (Date.now() - Date.parse(rv.submitted_at || 0) < REVIEW_DELAY_MS) continue;
        await run(b.profile_id).catch(e => console.error('[review] sweep run', e.message));
      }
    } catch (e) { console.error('[review] sweep', e.message); }
  }
  function start() {
    if (!supabase) return;
    setTimeout(sweep, 60 * 1000);
    setInterval(sweep, SWEEP_MS);
    loadDbpr().catch(() => {});
  }

  async function status(uid) {
    const user = await getUser(uid);
    const rv = (user && (user.app_metadata || {}).barber_review) || null;
    return rv ? { status: rv.status, reasons: rv.reasons || [], submittedAt: rv.submitted_at || null, decidedAt: rv.decided_at || null } : { status: 'none', reasons: [] };
  }

  return { received, run, sweep, start, status, checkLicense, decide, _test: { licenseKeys, namesMatch, norm } };
};
