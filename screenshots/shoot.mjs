// Renders the App Store screenshots (1320x2868) from screenshots/site via a real Chrome
// window driven over CDP. Needs the "fadeprev" preview server on :3790.
// Usage: node screenshots/shoot.mjs <outDir>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] || 'screenshots/out';
mkdirSync(OUT, { recursive: true });
const SCENES = [['home', 'store-1-home'], ['profile', 'store-2-profile'], ['pay', 'store-3-applepay'], ['track', 'store-4-coming-to-you'], ['account', 'store-5-account']];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--remote-debugging-port=9334', '--user-data-dir=/tmp/caf-shoot-profile', '--no-first-run', '--no-default-browser-check',
  '--window-position=-3000,0', '--window-size=700,1200', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; const t = setTimeout(() => rej(new Error('timeout ' + method)), 60000);
  pending.set(i, (v) => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params }));
});
try {
  let target;
  for (let t = 0; t < 80 && !target; t++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(x => x.type === 'page'); } catch (e) {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 3, mobile: true });
  for (const [scene, name] of SCENES) {
    await send('Page.navigate', { url: 'http://localhost:3790/screenshots/site/index.html?s=' + scene + '&r=' + Date.now() });
    for (let t = 0; t < 120; t++) {
      await sleep(250);
      const r = await send('Runtime.evaluate', { expression: '!!window.DEMO_READY', returnByValue: true });
      if (r.result && r.result.value) break;
    }
    await sleep(scene === 'home' || scene === 'track' ? 6000 : 2500);   // map tiles + labels
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(OUT + '/' + name + '.png', Buffer.from(shot.data, 'base64'));
    console.log('saved', name);
  }
} finally { try { ws && ws.close(); } catch (e) {} chrome.kill(); }
