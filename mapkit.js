/* Catch a Fade — Apple Maps (MapKit JS) authorization tokens.
 *
 * MapKit JS draws maps only with a token signed by a MapKit key from
 * developer.apple.com → Keys (enable "MapKit JS"). Set on the host:
 *   MAPKIT_KEY_P8   the full contents of the AuthKey_XXXXXXXXXX.p8 file
 *   MAPKIT_KEY_ID   the 10-character Key ID
 *   MAPKIT_TEAM_ID  8P38L363W8 (defaults to APNS_TEAM_ID)
 * Without them /api/mapkit-token answers { ok:false } and the app keeps using
 * its OpenStreetMap fallback.
 */
const crypto = require('crypto');

module.exports = function createMapkit(env) {
  const KEY = String(env.MAPKIT_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const KEY_ID = String(env.MAPKIT_KEY_ID || '').trim();
  const TEAM_ID = String(env.MAPKIT_TEAM_ID || env.APNS_TEAM_ID || '8P38L363W8').trim();
  const enabled = !!(KEY && KEY_ID && TEAM_ID);

  let tok = null, tokExp = 0;
  // Tokens live 12 hours, so the app can keep one between launches and show the
  // map without waiting for this server; MapKit JS asks for a fresh one when it
  // expires. Every token handed out has at least an hour left.
  const TTL = 12 * 3600;
  function token() {
    const now = Math.floor(Date.now() / 1000);
    if (tok && tokExp - now > 3600) return tok;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
    const body = b64({ iss: TEAM_ID, iat: now, exp: now + TTL });
    const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    tok = head + '.' + body + '.' + sig; tokExp = now + TTL;
    return tok;
  }

  return { enabled, token };
};
