/* Catch a Fade — Apple push notifications (APNs, token-based auth).
 *
 * Needs an APNs auth key from developer.apple.com → Keys (enable "Apple Push
 * Notifications service"), set on the host as:
 *   APNS_KEY_P8   the full contents of the AuthKey_XXXXXXXXXX.p8 file
 *   APNS_KEY_ID   the 10-character Key ID
 *   APNS_TEAM_ID  8P38L363W8
 * Without them every send is a silent no-op — the app still works, barbers
 * just have to keep it open to see requests.
 *
 * App Store/TestFlight builds get production tokens, Xcode debug builds get
 * sandbox tokens; we try production first and fall back to sandbox.
 */
const http2 = require('http2');
const crypto = require('crypto');

module.exports = function createPush(env) {
  const KEY = String(env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const KEY_ID = String(env.APNS_KEY_ID || '').trim();
  const TEAM_ID = String(env.APNS_TEAM_ID || '8P38L363W8').trim();
  const TOPIC = String(env.APNS_BUNDLE_ID || 'com.catchafade.app').trim();
  const enabled = !!(KEY && KEY_ID && TEAM_ID);

  let jwt = null, jwtAt = 0;
  function token() {
    // APNs accepts a provider token for up to an hour; refresh every 50 min.
    if (jwt && Date.now() - jwtAt < 50 * 60 * 1000) return jwt;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'ES256', kid: KEY_ID });
    const body = b64({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) });
    const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    jwt = head + '.' + body + '.' + sig; jwtAt = Date.now();
    return jwt;
  }

  function sendTo(host, deviceToken, payload) {
    return new Promise((resolve) => {
      let client;
      try { client = http2.connect('https://' + host); } catch (e) { return resolve({ status: 0, reason: e.message }); }
      client.on('error', (e) => resolve({ status: 0, reason: e.message }));
      const req = client.request({
        ':method': 'POST', ':path': '/3/device/' + deviceToken,
        authorization: 'bearer ' + token(), 'apns-topic': TOPIC,
        'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json'
      });
      let status = 0, data = '';
      req.on('response', (h) => { status = h[':status']; });
      req.on('data', (c) => { data += c; });
      req.on('end', () => { client.close(); let reason = ''; try { reason = JSON.parse(data).reason || ''; } catch (e) {} resolve({ status, reason }); });
      req.on('error', (e) => { client.close(); resolve({ status: 0, reason: e.message }); });
      req.setTimeout(10000, () => { req.close(); });
      req.end(JSON.stringify(payload));
    });
  }

  async function send(deviceToken, title, body, data) {
    if (!enabled || !deviceToken) return false;
    const payload = Object.assign({ aps: { alert: { title, body }, sound: 'default' } }, data || {});
    let r = await sendTo('api.push.apple.com', deviceToken, payload);
    if (r.status === 400 && /BadDeviceToken|BadEnvironmentKeyInToken/.test(r.reason)) {
      r = await sendTo('api.sandbox.push.apple.com', deviceToken, payload);
    }
    if (r.status !== 200) console.warn('[push] failed', r.status, r.reason);
    return r.status === 200;
  }

  return { enabled, send };
};
