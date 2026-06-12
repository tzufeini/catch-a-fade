/* CatchAFade — static file server + tiny Resend email backend.
 * The Resend API key lives HERE (server-side) and is never sent to the browser.
 * Routes:
 *   POST /api/send-code     { email, code }  → emails the code via Resend
 *   POST /api/support-chat  { messages }     → AI support reply via Claude (needs ANTHROPIC_API_KEY)
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

// Claude-powered support chat ("CAF Support" in the app). Without a key the app
// falls back to its built-in canned answers — nothing breaks.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || LOCAL.ANTHROPIC_API_KEY || '';
const SUPPORT_MODEL = 'claude-opus-4-8';
const SUPPORT_SYSTEM = [
  'You are CAF Support, the in-app support assistant for Catch a Fade (CatchAFade), an on-demand mobile barber marketplace — customers book a verified barber who travels to them. Introduce yourself as CAF Support if asked who you are.',
  'Policies you know:',
  '- Cancellation: free within the first 2 minutes after booking; then $5 once the barber is on the way, $10 after they have arrived, $25 once the cut has started. The fee compensates the barber for their time.',
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

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/send-code') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      const email = String(data.email || '').trim();
      const code = String(data.code || '').trim();
      if (!email || email.indexOf('@') < 1 || !/^\d{4,8}$/.test(code)) {
        return sendJSON(res, 400, { ok: false, error: 'missing email or code' });
      }
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: email, subject: 'Your CatchAFade code is ' + code, html: codeEmailHTML(code) })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) return sendJSON(res, 200, { ok: true, id: j.id });
        // Resend refused (e.g. test-mode recipient restriction) — tell the client so it can fall back.
        return sendJSON(res, 200, { ok: false, error: (j && j.message) || ('resend ' + r.status), restricted: r.status === 403 });
      } catch (err) {
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
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
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Pitchcraft — AI marketing-copy generator. POST { product, audience, format, tone }
  if (req.method === 'POST' && url.pathname === '/api/pitch') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); } catch (e) { return sendJSON(res, 400, { ok: false, error: 'bad json' }); }
      // No key → tell the client to use its built-in sample generator (keeps the demo working).
      if (!ANTHROPIC_KEY) return sendJSON(res, 200, { ok: false, configured: false });

      const product = String(data.product || '').slice(0, 1200).trim();
      const audience = String(data.audience || '').slice(0, 600).trim();
      const format = String(data.format || 'cold-email').slice(0, 40).trim();
      const tone = String(data.tone || 'confident').slice(0, 40).trim();
      if (!product) return sendJSON(res, 400, { ok: false, error: 'missing product' });

      const FORMAT_BRIEF = {
        'cold-email': 'a short cold outreach email (subject line + 3-5 sentence body + clear CTA). Format as "Subject: ..." then a blank line then the body.',
        'landing-headline': 'three landing-page hero options, each a punchy headline plus a one-line subhead. Number them 1-3.',
        'product-description': 'a compelling e-commerce product description (~60-90 words) that sells benefits, then 3 short bullet feature highlights.',
        'ad': 'three high-converting paid-ad variations (Google/Meta style): each with a headline (max ~40 chars) and one-line primary text. Number them 1-3.',
        'linkedin': 'an engaging LinkedIn post (hook first line, 4-7 short lines, light line breaks, one soft CTA). No more than 1-2 emojis.',
        'tweet': 'three scroll-stopping X/Twitter posts under 270 characters each. Number them 1-3.'
      };
      const brief = FORMAT_BRIEF[format] || FORMAT_BRIEF['cold-email'];
      const system = [
        'You are Pitchcraft, an elite direct-response copywriter. You write marketing copy that is specific, benefit-led, and free of clichés and corporate filler.',
        'Rules: never use the words "revolutionary", "game-changer", "unlock", "elevate", or "in today\'s fast-paced world". No fabricated statistics or fake testimonials. Write copy a real founder could ship today.',
        'Output ONLY the requested copy — no preamble, no explanations, no markdown headers.'
      ].join('\n');
      const userMsg = 'Write ' + brief
        + '\n\nProduct / offer:\n' + product
        + (audience ? '\n\nTarget audience:\n' + audience : '')
        + '\n\nTone: ' + tone + '.';

      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: SUPPORT_MODEL, max_tokens: 900, system: system, messages: [{ role: 'user', content: userMsg }] })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const copy = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          if (copy) return sendJSON(res, 200, { ok: true, copy });
          return sendJSON(res, 200, { ok: false, error: 'empty reply' });
        }
        return sendJSON(res, 200, { ok: false, error: (j && j.error && j.error.message) || ('anthropic ' + r.status) });
      } catch (err) {
        return sendJSON(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    });
    return;
  }

  // Static files
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html'; // serve directory index (/, /pitchcraft/, …)
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
