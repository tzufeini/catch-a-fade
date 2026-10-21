// Barber recruiting: catch-a-fade.onrender.com/barbers and a printable flyer at /barbers/flyer.
// Every claim here must stay true to the app: barbers keep 100% of their listed price
// (the fee is added on the customer's side), 100% of tips, and the weekly bonus in marketplace.js.
const APP_STORE_URL = 'https://apps.apple.com/us/app/catch-a-fade/id6790179224';
const PAGE_URL = 'https://catch-a-fade.onrender.com/barbers';
const QUEST_TARGET = Number(process.env.QUEST_TARGET || 10);
const QUEST_BONUS = '$' + Math.round(Number(process.env.QUEST_BONUS_CENTS || 1500) / 100);
// QR code for PAGE_URL (generated once with python-qrcode, error correction M)
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><path fill="#15110D" d="M0 0h1v1h-1zM1 0h1v1h-1zM2 0h1v1h-1zM3 0h1v1h-1zM4 0h1v1h-1zM5 0h1v1h-1zM6 0h1v1h-1zM11 0h1v1h-1zM14 0h1v1h-1zM16 0h1v1h-1zM17 0h1v1h-1zM18 0h1v1h-1zM19 0h1v1h-1zM20 0h1v1h-1zM22 0h1v1h-1zM23 0h1v1h-1zM24 0h1v1h-1zM25 0h1v1h-1zM26 0h1v1h-1zM27 0h1v1h-1zM28 0h1v1h-1zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h1v1h-1zM13 1h1v1h-1zM15 1h1v1h-1zM16 1h1v1h-1zM17 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM8 2h1v1h-1zM11 2h1v1h-1zM12 2h1v1h-1zM15 2h1v1h-1zM18 2h1v1h-1zM19 2h1v1h-1zM20 2h1v1h-1zM22 2h1v1h-1zM24 2h1v1h-1zM25 2h1v1h-1zM26 2h1v1h-1zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM6 3h1v1h-1zM8 3h1v1h-1zM9 3h1v1h-1zM10 3h1v1h-1zM11 3h1v1h-1zM13 3h1v1h-1zM14 3h1v1h-1zM15 3h1v1h-1zM17 3h1v1h-1zM19 3h1v1h-1zM22 3h1v1h-1zM24 3h1v1h-1zM25 3h1v1h-1zM26 3h1v1h-1zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h1v1h-1zM3 4h1v1h-1zM4 4h1v1h-1zM6 4h1v1h-1zM8 4h1v1h-1zM10 4h1v1h-1zM11 4h1v1h-1zM16 4h1v1h-1zM19 4h1v1h-1zM20 4h1v1h-1zM22 4h1v1h-1zM24 4h1v1h-1zM25 4h1v1h-1zM26 4h1v1h-1zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h1v1h-1zM11 5h1v1h-1zM13 5h1v1h-1zM15 5h1v1h-1zM17 5h1v1h-1zM18 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h1v1h-1zM1 6h1v1h-1zM2 6h1v1h-1zM3 6h1v1h-1zM4 6h1v1h-1zM5 6h1v1h-1zM6 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM23 6h1v1h-1zM24 6h1v1h-1zM25 6h1v1h-1zM26 6h1v1h-1zM27 6h1v1h-1zM28 6h1v1h-1zM8 7h1v1h-1zM12 7h1v1h-1zM18 7h1v1h-1zM19 7h1v1h-1zM20 7h1v1h-1zM0 8h1v1h-1zM2 8h1v1h-1zM3 8h1v1h-1zM4 8h1v1h-1zM5 8h1v1h-1zM6 8h1v1h-1zM9 8h1v1h-1zM11 8h1v1h-1zM13 8h1v1h-1zM14 8h1v1h-1zM15 8h1v1h-1zM17 8h1v1h-1zM19 8h1v1h-1zM22 8h1v1h-1zM23 8h1v1h-1zM24 8h1v1h-1zM25 8h1v1h-1zM26 8h1v1h-1zM2 9h1v1h-1zM5 9h1v1h-1zM10 9h1v1h-1zM11 9h1v1h-1zM12 9h1v1h-1zM16 9h1v1h-1zM18 9h1v1h-1zM19 9h1v1h-1zM21 9h1v1h-1zM22 9h1v1h-1zM23 9h1v1h-1zM24 9h1v1h-1zM28 9h1v1h-1zM0 10h1v1h-1zM1 10h1v1h-1zM3 10h1v1h-1zM4 10h1v1h-1zM6 10h1v1h-1zM14 10h1v1h-1zM15 10h1v1h-1zM16 10h1v1h-1zM20 10h1v1h-1zM21 10h1v1h-1zM22 10h1v1h-1zM23 10h1v1h-1zM0 11h1v1h-1zM1 11h1v1h-1zM4 11h1v1h-1zM5 11h1v1h-1zM9 11h1v1h-1zM12 11h1v1h-1zM14 11h1v1h-1zM16 11h1v1h-1zM20 11h1v1h-1zM21 11h1v1h-1zM24 11h1v1h-1zM25 11h1v1h-1zM27 11h1v1h-1zM1 12h1v1h-1zM2 12h1v1h-1zM4 12h1v1h-1zM6 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM9 12h1v1h-1zM13 12h1v1h-1zM14 12h1v1h-1zM17 12h1v1h-1zM21 12h1v1h-1zM25 12h1v1h-1zM26 12h1v1h-1zM5 13h1v1h-1zM7 13h1v1h-1zM8 13h1v1h-1zM9 13h1v1h-1zM10 13h1v1h-1zM12 13h1v1h-1zM14 13h1v1h-1zM17 13h1v1h-1zM18 13h1v1h-1zM19 13h1v1h-1zM20 13h1v1h-1zM21 13h1v1h-1zM22 13h1v1h-1zM23 13h1v1h-1zM24 13h1v1h-1zM28 13h1v1h-1zM0 14h1v1h-1zM5 14h1v1h-1zM6 14h1v1h-1zM7 14h1v1h-1zM10 14h1v1h-1zM11 14h1v1h-1zM13 14h1v1h-1zM15 14h1v1h-1zM16 14h1v1h-1zM17 14h1v1h-1zM22 14h1v1h-1zM24 14h1v1h-1zM25 14h1v1h-1zM26 14h1v1h-1zM0 15h1v1h-1zM1 15h1v1h-1zM2 15h1v1h-1zM3 15h1v1h-1zM4 15h1v1h-1zM7 15h1v1h-1zM12 15h1v1h-1zM15 15h1v1h-1zM16 15h1v1h-1zM18 15h1v1h-1zM20 15h1v1h-1zM23 15h1v1h-1zM24 15h1v1h-1zM27 15h1v1h-1zM0 16h1v1h-1zM2 16h1v1h-1zM3 16h1v1h-1zM6 16h1v1h-1zM7 16h1v1h-1zM8 16h1v1h-1zM11 16h1v1h-1zM12 16h1v1h-1zM13 16h1v1h-1zM14 16h1v1h-1zM17 16h1v1h-1zM23 16h1v1h-1zM25 16h1v1h-1zM26 16h1v1h-1zM0 17h1v1h-1zM1 17h1v1h-1zM3 17h1v1h-1zM7 17h1v1h-1zM10 17h1v1h-1zM11 17h1v1h-1zM12 17h1v1h-1zM14 17h1v1h-1zM16 17h1v1h-1zM18 17h1v1h-1zM19 17h1v1h-1zM20 17h1v1h-1zM21 17h1v1h-1zM22 17h1v1h-1zM23 17h1v1h-1zM24 17h1v1h-1zM26 17h1v1h-1zM28 17h1v1h-1zM0 18h1v1h-1zM2 18h1v1h-1zM4 18h1v1h-1zM6 18h1v1h-1zM9 18h1v1h-1zM13 18h1v1h-1zM15 18h1v1h-1zM16 18h1v1h-1zM20 18h1v1h-1zM21 18h1v1h-1zM23 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM0 19h1v1h-1zM2 19h1v1h-1zM9 19h1v1h-1zM11 19h1v1h-1zM14 19h1v1h-1zM16 19h1v1h-1zM18 19h1v1h-1zM24 19h1v1h-1zM27 19h1v1h-1zM0 20h1v1h-1zM6 20h1v1h-1zM8 20h1v1h-1zM9 20h1v1h-1zM10 20h1v1h-1zM17 20h1v1h-1zM20 20h1v1h-1zM21 20h1v1h-1zM22 20h1v1h-1zM23 20h1v1h-1zM24 20h1v1h-1zM26 20h1v1h-1zM27 20h1v1h-1zM28 20h1v1h-1zM8 21h1v1h-1zM9 21h1v1h-1zM10 21h1v1h-1zM11 21h1v1h-1zM12 21h1v1h-1zM13 21h1v1h-1zM16 21h1v1h-1zM18 21h1v1h-1zM20 21h1v1h-1zM24 21h1v1h-1zM25 21h1v1h-1zM26 21h1v1h-1zM27 21h1v1h-1zM28 21h1v1h-1zM0 22h1v1h-1zM1 22h1v1h-1zM2 22h1v1h-1zM3 22h1v1h-1zM4 22h1v1h-1zM5 22h1v1h-1zM6 22h1v1h-1zM11 22h1v1h-1zM13 22h1v1h-1zM14 22h1v1h-1zM15 22h1v1h-1zM16 22h1v1h-1zM19 22h1v1h-1zM20 22h1v1h-1zM22 22h1v1h-1zM24 22h1v1h-1zM25 22h1v1h-1zM26 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM12 23h1v1h-1zM13 23h1v1h-1zM19 23h1v1h-1zM20 23h1v1h-1zM24 23h1v1h-1zM0 24h1v1h-1zM2 24h1v1h-1zM3 24h1v1h-1zM4 24h1v1h-1zM6 24h1v1h-1zM8 24h1v1h-1zM9 24h1v1h-1zM12 24h1v1h-1zM14 24h1v1h-1zM15 24h1v1h-1zM17 24h1v1h-1zM20 24h1v1h-1zM21 24h1v1h-1zM22 24h1v1h-1zM23 24h1v1h-1zM24 24h1v1h-1zM26 24h1v1h-1zM27 24h1v1h-1zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h1v1h-1zM3 25h1v1h-1zM4 25h1v1h-1zM6 25h1v1h-1zM8 25h1v1h-1zM9 25h1v1h-1zM11 25h1v1h-1zM12 25h1v1h-1zM16 25h1v1h-1zM20 25h1v1h-1zM21 25h1v1h-1zM25 25h1v1h-1zM26 25h1v1h-1zM27 25h1v1h-1zM28 25h1v1h-1zM0 26h1v1h-1zM2 26h1v1h-1zM3 26h1v1h-1zM4 26h1v1h-1zM6 26h1v1h-1zM8 26h1v1h-1zM9 26h1v1h-1zM10 26h1v1h-1zM11 26h1v1h-1zM13 26h1v1h-1zM15 26h1v1h-1zM17 26h1v1h-1zM18 26h1v1h-1zM19 26h1v1h-1zM21 26h1v1h-1zM22 26h1v1h-1zM23 26h1v1h-1zM24 26h1v1h-1zM25 26h1v1h-1zM26 26h1v1h-1zM27 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM9 27h1v1h-1zM11 27h1v1h-1zM13 27h1v1h-1zM16 27h1v1h-1zM18 27h1v1h-1zM20 27h1v1h-1zM22 27h1v1h-1zM23 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM0 28h1v1h-1zM1 28h1v1h-1zM2 28h1v1h-1zM3 28h1v1h-1zM4 28h1v1h-1zM5 28h1v1h-1zM6 28h1v1h-1zM8 28h1v1h-1zM9 28h1v1h-1zM10 28h1v1h-1zM12 28h1v1h-1zM14 28h1v1h-1zM17 28h1v1h-1zM18 28h1v1h-1zM19 28h1v1h-1zM24 28h1v1h-1zM26 28h1v1h-1z"/></svg>';

const SCISSORS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>';

function landing() {
  const faq = [
    ['Do I need a shop or a chair?', 'No. You cut at the customer\'s place. Bring your clippers, a cape and your sanitizing kit.'],
    ['Is there a fee for barbers?', 'No sign-up fee and nothing taken from your price. Catch a Fade\'s service fee is added on the customer\'s side, so the price you list is what you earn.'],
    ['When do I work?', 'Whenever you want. Go online in the app and requests near you pop up. Accept the ones that fit; ignore the rest.'],
    ['How do I get paid?', 'Payouts go to your bank through Stripe. Set up payouts in the app once. If you cut before finishing that setup, your earnings are held for you and sent as soon as it\'s done.'],
    ['How fast is approval?', 'Your Florida license is checked against the state\'s DBPR records and your photo ID is matched to you automatically, usually within a day.'],
    ['Do I need an iPhone?', 'Yes, for now. Catch a Fade is on the App Store; Android is coming later.']
  ];
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Barbers · Catch a Fade</title>'
    + '<meta name="description" content="House calls for licensed Florida barbers. Set your prices, choose your hours, keep 100% of your price plus tips.">'
    + '<meta property="og:title" content="Barbers: get booked for house calls">'
    + '<meta property="og:description" content="Set your prices, choose your hours, keep 100% of your price plus tips. Starting in Florida.">'
    + '<meta property="og:image" content="https://catch-a-fade.onrender.com/apple-touch-icon.png">'
    + '<meta name="apple-itunes-app" content="app-id=6790179224">'
    + '<style>'
    + ':root{--bg:#F4EDE1;--ink:#15110D;--dim:#5C616C;--line:rgba(21,17,13,.12);--card:#FBF7F0;--green:#2E9E6A}'
    + '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Segoe UI,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}'
    + '.w{max-width:560px;margin:0 auto;padding:22px 20px 56px}'
    + '.top{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px}.top small{margin-left:auto;font-weight:650;color:var(--dim);font-size:13px}'
    + '.mark{width:34px;height:34px;border-radius:10px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center}'
    + 'h1{font-size:38px;line-height:1.05;letter-spacing:-1.2px;margin:34px 0 14px}'
    + '.lede{font-size:17px;line-height:1.5;color:#3A3530;margin:0 0 22px}'
    + '.btn{display:block;text-align:center;padding:17px;border-radius:16px;font-weight:760;font-size:16.5px;text-decoration:none;background:var(--ink);color:var(--bg)}'
    + '.hint{font-size:13px;color:var(--dim);text-align:center;margin:10px 0 0}'
    + '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:30px 0 8px}'
    + '.st{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 10px;text-align:center}.st b{display:block;font-size:22px;letter-spacing:-.5px}.st span{font-size:12px;color:var(--dim);font-weight:600;line-height:1.3;display:block;margin-top:3px}'
    + '.ex{margin:18px 0 0;padding:16px;border-radius:18px;background:var(--ink);color:var(--bg)}.ex .r{display:flex;justify-content:space-between;font-size:15px;padding:6px 0}.ex .r b{font-size:17px}.ex p{margin:8px 0 0;font-size:12.5px;opacity:.7;line-height:1.45}'
    + 'h2{font-size:13px;text-transform:uppercase;letter-spacing:.9px;color:var(--dim);margin:38px 0 12px}'
    + '.step{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}.step i{font-style:normal;flex:0 0 30px;height:30px;border-radius:50%;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}'
    + '.step b{display:block;font-size:15.5px}.step span{font-size:14px;color:var(--dim);line-height:1.45}'
    + 'ul.need{list-style:none;padding:0;margin:0}ul.need li{padding:10px 0 10px 28px;position:relative;font-size:15px;border-bottom:1px solid var(--line)}ul.need li:before{content:"✓";position:absolute;left:4px;color:var(--green);font-weight:900}'
    + 'details{border-bottom:1px solid var(--line);padding:14px 0}summary{font-weight:700;font-size:15.5px;cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary:after{content:"+";float:right;color:var(--dim);font-weight:500}details[open] summary:after{content:"–"}details p{margin:8px 0 0;font-size:14.5px;line-height:1.5;color:#3A3530}'
    + '.demand{display:none;margin:0 0 18px;padding:12px 14px;border-radius:14px;background:rgba(46,158,106,.12);border:1px solid rgba(46,158,106,.3);font-size:14.5px;line-height:1.4}.demand b{font-weight:800}'
    + '.end{margin-top:34px}.f{margin-top:30px;font-size:12px;color:#8C9099;text-align:center;line-height:1.8}.f a{color:#8C9099}'
    + '@media(min-width:600px){h1{font-size:46px}}'
    + '</style></head><body><div class="w">'
    + '<div class="top"><div class="mark">' + SCISSORS + '</div>Catch a Fade<small>For barbers</small></div>'
    + '<h1>Cut at their place. Keep what you charge.</h1>'
    + '<p class="lede">Catch a Fade sends house-call requests to licensed barbers, starting in Florida. Set your prices, go online when you want, and keep 100% of your price plus every tip.</p>'
    + '<div class="demand" id="demand"></div>'
    + '<a class="btn" href="' + APP_STORE_URL + '">Get the app and apply</a>'
    + '<p class="hint">Already have it? Open Catch a Fade and tap <b>Are you a barber?</b></p>'
    + '<div class="stats"><div class="st"><b>100%</b><span>of the price you set</span></div><div class="st"><b>100%</b><span>of your tips</span></div>'
    + '<div class="st"><b>' + QUEST_BONUS + '</b><span>bonus for ' + QUEST_TARGET + ' cuts in a week</span></div></div>'
    + '<div class="ex"><div class="r"><span>You list a skin fade at</span><b>$20</b></div><div class="r"><span>You earn</span><b>$20 + tip</b></div>'
    + '<p>Our fee is added to the customer\'s price, never taken out of yours. If a customer cancels after you\'ve headed out, the cancellation fee goes to you.</p></div>'
    + '<h2>How it works</h2>'
    + '<div class="step"><i>1</i><div><b>Apply in the app</b><span>Your license number, a photo of your ID, a selfie and a profile photo.</span></div></div>'
    + '<div class="step"><i>2</i><div><b>Get approved</b><span>We check your license with the state of Florida and match your ID, usually within a day.</span></div></div>'
    + '<div class="step"><i>3</i><div><b>Set your services and prices</b><span>Fades, tapers, lineups, beards, kids cuts. You decide what you offer and what it costs.</span></div></div>'
    + '<div class="step"><i>4</i><div><b>Go online and get booked</b><span>Requests near you pop up with the address, service and what you\'ll earn. Accept, drive over, cut, get paid.</span></div></div>'
    + '<h2>What you need</h2><ul class="need"><li>An active Florida barber license</li><li>A photo ID and a quick selfie</li><li>Your own clippers, cape and sanitizing kit</li><li>An iPhone</li></ul>'
    + '<h2>Questions</h2>' + faq.map(q => '<details><summary>' + q[0] + '</summary><p>' + q[1] + '</p></details>').join('')
    + '<div class="end"><a class="btn" href="' + APP_STORE_URL + '">Download Catch a Fade</a></div>'
    + '<div class="f"><a href="/barber-agreement">Barber agreement</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/support">Support</a><br>Barbers on Catch a Fade are independent professionals.</div>'
    + '</div>'
    // real demand: customers near the launch area who asked to be told when a barber is online (shown from 3 up)
    + '<script>fetch("/api/waitlist/count?lat=29.65&lng=-82.34").then(function(r){return r.json()}).then(function(j){'
    + 'if(j&&j.ok&&j.waiting>=3){var d=document.getElementById("demand");d.innerHTML="🔔 <b>"+j.waiting+" people</b> are waiting for a barber to go online near them.";d.style.display="block"}}).catch(function(){})</script>'
    + '</body></html>';
}

function flyer() {
  const tab = '<div class="tab"><b>Catch a Fade · barbers</b><span>catch-a-fade.onrender.com/barbers</span></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Barber Flyer · Catch a Fade</title>'
    + '<style>'
    + '@page{size:letter;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#D8D2C7}'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",Helvetica,Arial,sans-serif;color:#15110D;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.bar{max-width:8.5in;margin:16px auto;display:flex;gap:10px;align-items:center;padding:0 16px;font-size:14px;color:#3A3530}.bar button{margin-left:auto;font:700 15px inherit;padding:11px 18px;border:0;border-radius:12px;background:#15110D;color:#F4EDE1;cursor:pointer}'
    + '.page{width:8.5in;height:11in;margin:0 auto 24px;background:#F4EDE1;position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.18)}'
    + '.hd{background:#15110D;color:#F4EDE1;padding:.42in .6in .34in}.hd .k{font-size:15px;font-weight:800;letter-spacing:4px;opacity:.75}'
    + '.hd h1{font-size:64px;line-height:.98;letter-spacing:-2px;margin:.14in 0 0}'
    + '.bd{display:flex;gap:.4in;padding:.3in .6in 0}'
    + '.pts{flex:1;list-style:none;margin:0;padding:0}.pts li{font-size:26px;font-weight:750;padding:.1in 0 .1in .47in;position:relative;border-bottom:2px solid rgba(21,17,13,.12);line-height:1.2}.pts li small{display:block;font-size:15px;font-weight:500;color:#5C616C;margin-top:3px}'
    + '.pts li:before{content:"✓";position:absolute;left:0;top:.08in;width:.3in;height:.3in;border-radius:50%;background:#2E9E6A;color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center}'
    + '.qr{width:2.55in;flex:0 0 2.55in;text-align:center}.qr .box{background:#fff;border-radius:.18in;padding:.2in}.qr svg{width:100%;height:auto;display:block}'
    + '.qr b{display:block;font-size:21px;margin-top:.14in}.qr span{display:block;font-size:13px;color:#5C616C;margin-top:4px;word-break:break-all}'
    + '.ex{margin:.26in .6in 0;padding:.22in .28in;border-radius:.2in;background:#15110D;color:#F4EDE1;display:flex;justify-content:space-between;align-items:center;font-size:21px}.ex b{font-size:30px;letter-spacing:-.5px}.ex small{display:block;font-size:13px;opacity:.7;margin-top:3px}'
    + '.how{display:flex;gap:.2in;margin:.26in .6in 0}.how div{flex:1;font-size:17px;font-weight:700;line-height:1.25}.how i{font-style:normal;display:flex;width:.36in;height:.36in;border-radius:50%;background:#15110D;color:#F4EDE1;align-items:center;justify-content:center;font-size:15px;margin-bottom:.08in}.how span{display:block;font-size:13px;font-weight:500;color:#5C616C;margin-top:3px}'
    + '.fine{margin-top:auto;padding:.2in .6in .18in;font-size:13px;color:#5C616C}'
    + '.tabs{display:flex;border-top:2px dashed rgba(21,17,13,.35);height:1.9in}'
    + '.tab{flex:1;border-left:2px dashed rgba(21,17,13,.35);writing-mode:vertical-rl;transform:rotate(180deg);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;font-size:10.5px;color:#3A3530;white-space:nowrap}.tab:last-child{border-left:0}.tab b{font-size:12.5px;color:#15110D}'
    + '@media print{html,body{background:#F4EDE1}.bar{display:none}.page{margin:0;box-shadow:none}}'
    + '@media screen and (max-width:8.6in){.page{zoom:.45}}'
    + '</style></head><body>'
    + '<div class="bar">Print on letter paper, then post it at barber schools, shops and campus boards.<button onclick="print()">Print flyer</button></div>'
    + '<div class="page"><div class="hd"><div class="k">BARBERS WANTED · FLORIDA</div><h1>Get booked for house calls.</h1></div>'
    + '<div class="bd"><ul class="pts">'
    + '<li>Set your own prices<small>Fades, tapers, lineups, beards, kids cuts</small></li>'
    + '<li>Keep 100% of your price<small>Plus 100% of your tips</small></li>'
    + '<li>Work when you want<small>Go online, accept the requests that fit</small></li>'
    + '<li>' + QUEST_BONUS + ' weekly bonus<small>When you finish ' + QUEST_TARGET + ' cuts in a week</small></li>'
    + '</ul><div class="qr"><div class="box">' + QR_SVG + '</div><b>Scan to apply</b><span>catch-a-fade.onrender.com/barbers</span></div></div>'
    + '<div class="ex"><div>You list a skin fade at <b>$20</b><small>Our fee is added on the customer\'s side, never taken from yours.</small></div><div style="text-align:right">You earn<br><b>$20 + tip</b></div></div>'
    + '<div class="how"><div><i>1</i>Download Catch a Fade<span>Free on the App Store</span></div><div><i>2</i>Add your license and ID<span>Approved in about a day</span></div><div><i>3</i>Go online, get booked<span>Requests near you pop up</span></div></div>'
    + '<div class="fine">Active Florida barber license and an iPhone required. Barbers are independent professionals. App: Catch a Fade on the App Store.</div>'
    + '<div class="tabs">' + tab.repeat(7) + '</div></div>'
    + '</body></html>';
}

// Advertising page for customers: catch-a-fade.onrender.com/get (Instagram bio, ads).
// Not linked from the app or the site's main page.
// Only claims that are true today: licensed barbers, price shown first, card charged
// when the cut is done, tips 100% to the barber.
function home() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Catch a Fade · A barber at your door</title>'
    + '<meta name="description" content="Book a licensed barber to come to your place, starting in Florida. See the full price first, pay with Apple Pay, tip after.">'
    + '<meta property="og:title" content="Catch a Fade · A barber at your door">'
    + '<meta property="og:description" content="Book a licensed barber to come to your place. Starting in Florida.">'
    + '<meta property="og:image" content="https://catch-a-fade.onrender.com/apple-touch-icon.png">'
    + '<meta name="apple-itunes-app" content="app-id=6790179224">'
    + '<link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    // a password-reset link lands here with tokens in the hash: hand it to the web app
    + '<script>if(/access_token|type=recovery|error_description/.test(location.hash))location.replace("/app"+location.hash)</script>'
    + '<style>'
    + ':root{--bg:#F4EDE1;--ink:#15110D;--dim:#5C616C;--line:rgba(21,17,13,.12);--card:#FBF7F0;--green:#2E9E6A}'
    + '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Segoe UI,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}'
    + '.w{max-width:560px;margin:0 auto;padding:22px 20px 56px}'
    + '.top{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px}.top a{margin-left:auto;font-weight:650;color:var(--dim);font-size:13px;text-decoration:none}'
    + '.mark{width:34px;height:34px;border-radius:10px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center}'
    + 'h1{font-size:42px;line-height:1.03;letter-spacing:-1.4px;margin:38px 0 14px}'
    + '.lede{font-size:17px;line-height:1.5;color:#3A3530;margin:0 0 24px}'
    + '.btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:17px;border-radius:16px;font-weight:760;font-size:16.5px;text-decoration:none;background:var(--ink);color:var(--bg)}'
    + '.hint{font-size:13px;color:var(--dim);text-align:center;margin:10px 0 0;line-height:1.5}'
    + '.feats{display:grid;gap:10px;margin:34px 0 0}'
    + '.f{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px}'
    + '.f i{font-style:normal;font-size:22px;line-height:1;flex:0 0 auto;margin-top:1px}.f b{display:block;font-size:15.5px;margin-bottom:3px}.f span{font-size:14px;color:var(--dim);line-height:1.45}'
    + 'h2{font-size:13px;text-transform:uppercase;letter-spacing:.9px;color:var(--dim);margin:38px 0 12px}'
    + '.step{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}.step em{font-style:normal;flex:0 0 30px;height:30px;border-radius:50%;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}'
    + '.step b{display:block;font-size:15.5px}.step span{font-size:14px;color:var(--dim);line-height:1.45}'
    + '.barber{display:block;margin-top:34px;padding:18px;border-radius:18px;background:var(--ink);color:var(--bg);text-decoration:none}.barber b{font-size:16px;display:block}.barber span{font-size:13.5px;opacity:.75}'
    + '.foot{margin-top:30px;font-size:12px;color:#8C9099;text-align:center;line-height:1.8}.foot a{color:#8C9099}'
    + '@media(min-width:600px){h1{font-size:52px}}'
    + '</style></head><body><div class="w">'
    + '<div class="top"><div class="mark">' + SCISSORS + '</div>Catch a Fade<a href="/barbers">For barbers →</a></div>'
    + '<h1>A barber at your door.</h1>'
    + '<p class="lede">Book a licensed barber to come to your place: your dorm, your apartment, your house. Starting in Florida.</p>'
    + '<a class="btn" href="' + APP_STORE_URL + '"><svg width="17" height="20" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true"><path d="M14.1 10.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4 1-1.4 1.3-2.7 1.4-2.8-.1 0-2.5-1-2.5-4.1zM11.7 3.2c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 3 1 .1 2.1-.5 2.8-1.4z"/></svg>Download on the App Store</a>'
    + '<p class="hint">Free to download. No barber online near you yet? Tap <b>Notify me</b> in the app and we\'ll tell you the moment one is.</p>'
    + '<div class="feats">'
    + '<div class="f"><i>✅</i><div><b>Licensed, checked barbers</b><span>Every barber\'s Florida license is checked with the state, and their ID is matched to them.</span></div></div>'
    + '<div class="f"><i>💳</i><div><b>Price first, pay after</b><span>You see the full price before you book. Your card is only charged when the cut is done. Apple Pay works.</span></div></div>'
    + '<div class="f"><i>📍</i><div><b>Watch them come to you</b><span>Follow your barber on the map, then share a 4-digit PIN at the door.</span></div></div>'
    + '<div class="f"><i>💈</i><div><b>Tip after, 100% to them</b><span>Rate your cut and tip on the spot. Every dollar of the tip goes to your barber.</span></div></div>'
    + '</div>'
    + '<h2>How it works</h2>'
    + '<div class="step"><em>1</em><div><b>Pick a barber</b><span>See who\'s online near you, their work, reviews and prices.</span></div></div>'
    + '<div class="step"><em>2</em><div><b>Choose your cut</b><span>ASAP, or Wait & Save to pay less when you can wait up to 2 hours.</span></div></div>'
    + '<div class="step"><em>3</em><div><b>They come to you</b><span>Live tracking, a PIN at the door, and a fresh cut without leaving home.</span></div></div>'
    + '<a class="barber" href="/barbers"><b>Are you a barber? ✂</b><span>Set your prices, keep 100% plus tips, go online when you want.</span></a>'
    + '<div class="foot"><a href="/support">Support</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/barbers">Barbers</a><br>© 2026 Catch a Fade · Florida</div>'
    + '</div></body></html>';
}

module.exports = { landing, flyer, home, PAGE_URL };
