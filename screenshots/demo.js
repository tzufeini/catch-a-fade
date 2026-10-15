// App Store screenshot demo — runs after the app. Scenes: ?s=home|profile|pay|track|account
(function () {
  const P = '/screenshots/photos/';
  const HOME = [29.6497, -82.3393];   // Gainesville, FL
  const svc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { price: String(v) }]));
  const DEMO_BARBERS = [
    { id: 'd1', n: 'Andre Cole', in: 'AC', g: '#2457c5', r: '5.0', cuts: '198', yr: '8', pr: 10,
      sp: 'Skin Fade · Taper · Beard Trim', img: P + 'photo-1522529599102-193c0d76b5b6.jpg',
      about: 'I come to you with a full sterilized kit and a cape. Fades, tapers and sharp lineups, done at your kitchen table in about 40 minutes.',
      services: svc({ 'Skin Fade': 19, 'Taper': 17, 'Beard Trim & Shape': 10, 'Cut + Beard': 26 }), ll: [HOME[0] - 0.0010, HOME[1] + 0.0050] },
    { id: 'd2', n: 'Devon Reid', in: 'DR', g: '#2bb3a0', r: '4.9', cuts: '256', yr: '5', pr: 11,
      sp: 'Lineup · Beard Sculpt', img: P + 'p-1583123810408-23e7b5d1af9f.jpg', about: '',
      services: svc({ 'Lineup': 12, 'Beard Sculpt': 11, 'Skin Fade': 18 }), ll: [HOME[0] - 0.0031, HOME[1] + 0.0022] },
    { id: 'd3', n: 'Marcus Brown', in: 'MB', g: '#6b2a3a', r: '4.9', cuts: '312', yr: '11', pr: 16,
      sp: 'Taper · Scissor Cut', img: P + 'p-1507003211169-0a1dd7228f2d.jpg', about: '',
      services: svc({ 'Taper': 16, 'Scissor Cut': 20, 'Skin Fade': 18 }), ll: [HOME[0] - 0.0016, HOME[1] - 0.0046] },
    { id: 'd4', n: 'Jaylen Mills', in: 'JM', g: '#b02a2a', r: '5.0', cuts: '410', yr: '6', pr: 9,
      sp: 'Skin Fade · Kids Cut', img: P + 'p-1595152772835-219674b2a8a6.jpg', about: '',
      services: svc({ 'Skin Fade': 15, 'Kids Cut': 12, 'Lineup': 9 }), ll: [HOME[0] - 0.0040, HOME[1] - 0.0060] },
    { id: 'd5', n: 'Chris Navarro', in: 'CN', g: '#c47a1f', r: '4.9', cuts: '143', yr: '4', pr: 10,
      sp: 'Taper · Skin Fade', img: P + 'p-1625241152315-4a698f74ceb7.jpg', about: '',
      services: svc({ 'Taper': 16, 'Skin Fade': 18, 'Lineup': 10 }), ll: [HOME[0] - 0.0026, HOME[1] + 0.0070] },
    { id: 'd6', n: 'Tyler Brooks', in: 'TB', g: '#3b5bdb', r: '4.8', cuts: '97', yr: '3', pr: 8,
      sp: 'Buzz Cut · Taper', img: P + 'p-1564564244660-5d73c057f2d2.jpg', about: '',
      services: svc({ 'Buzz Cut': 12, 'Taper': 16, 'Beard Trim': 8 }), ll: [HOME[0] - 0.0043, HOME[1] - 0.0008] }
  ];
  const PORTFOLIO = [
    { url: P + 'p-1787006642123-e61bb935738b.jpg', label: 'Kids cut at home' },
    { url: P + 'p-1672642150228-3fcd5826ec26.jpg', label: 'Skin fade' },
    { url: P + 'p-1618515752143-5ce13affb1e8.jpg', label: 'Curly top trim' },
    { url: P + 'p-1493256338651-d82f7acb2b38.jpg', label: 'Taper + lineup' }
  ];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  function chrome() {
    const L = innerWidth >= 500 ? 30 : 0;   // headless needs a 500px window; a 440px viewport needs no offset
    document.documentElement.classList.add('native', 'native-ios');
    document.body.classList.add('native', 'light');
    const st = document.createElement('style');
    st.textContent = 'html,body{margin:0!important;overflow:hidden!important}'
      + 'body{display:block!important;width:' + (L ? 500 : 440) + 'px!important}'
      + '.stage{padding:0!important;display:block!important;min-height:0!important;width:440px!important;height:956px!important}'
      + '#phone{position:fixed!important;left:' + L + 'px!important;top:0!important;width:440px!important;height:956px!important;max-width:none!important;border-radius:0!important;transform:none!important;margin:0!important;box-shadow:none!important;border:0!important}'
      + '.island,.statusbar{visibility:hidden!important}';
    document.head.appendChild(st);
    // iPhone status bar + Dynamic Island, as on a device capture
    const dark = DEMO_SCENE === 'track' ? false : false;
    const ink = dark ? '#fff' : '#000';
    const sb = document.createElement('div');
    sb.style.cssText = 'position:fixed;left:' + L + 'px;top:0;width:440px;height:56px;z-index:99999;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;color:' + ink;
    sb.innerHTML = '<div style="position:absolute;left:54px;top:19px;font-size:17px;font-weight:600;letter-spacing:-.2px">9:41</div>'
      + '<div style="position:absolute;left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000"></div>'
      + '<div style="position:absolute;right:30px;top:21px;display:flex;align-items:center;gap:6px">'
      + '<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="' + ink + '"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="' + ink + '"/><rect x="10" y="3" width="3" height="9" rx="1" fill="' + ink + '"/><rect x="15" y="0" width="3" height="12" rx="1" fill="' + ink + '"/></svg>'
      + '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.6l2.3-2.6a3.4 3.4 0 0 0-4.6 0z" fill="' + ink + '"/><path d="M3.3 6.6a6.8 6.8 0 0 1 9.4 0l1.4-1.6a9 9 0 0 0-12.2 0z" fill="' + ink + '"/><path d="M.6 3.7a10.6 10.6 0 0 1 14.8 0L16 3A11.8 11.8 0 0 0 0 3z" fill="' + ink + '"/></svg>'
      + '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="' + ink + '" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.4" fill="' + ink + '"/><path d="M25 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2z" fill="' + ink + '" fill-opacity=".45"/></svg>'
      + '</div>';
    document.body.appendChild(sb);
  }

  async function scene() {
    const ci = $('clipperIntro'); if (ci) ci.style.display = 'none';
    document.querySelectorAll('.modal.show,.sheetOverlay.show,.applePay.show').forEach(m => m.classList.remove('show'));
    userLL = HOME.slice(); userCity = 'Gainesville, FL'; userAccuracy = 5; _locMode = 'gps';
    try { setLocPill('Nearby in Gainesville, FL', 'gps'); } catch (e) {}
    BARBERS = DEMO_BARBERS.map(b => Object.assign({}, b, { lat: b.ll[0], lng: b.ll[1], verified: true, fromDB: true }));
    try { loadAppleMaps(); } catch (e) {}
    for (let t = 0; t < 60 && !_appleReady; t++) await wait(100);
    const s = DEMO_SCENE;

    if (s === 'home') {
      stack = ['home']; render(); buildList();
      await wait(300); try { refreshBarbersUI(); } catch (e) {}
    }
    if (s === 'profile') {
      stack = ['home']; render(); openBarber(0);
      _dbReviews['d1'] = [];
      await wait(1500);   // let the app's own async profile refresh finish first
      $('bpGallery').innerHTML = portTiles(PORTFOLIO); $('bpPortWrap').style.display = '';
      $('bpCuts').textContent = '198';
      // demo barber: no invented reviews — the shot ends at Services
      const rh = $('revCountHead'); if (rh) rh.parentElement.style.display = 'none';
      const rb = $('revBox'); if (rb) rb.style.display = 'none';
    }
    if (s === 'pay') {
      stack = ['home']; render(); setBarber(0); nav('booking');
      const loc = $('bkLoc'); if (loc) loc.textContent = 'Home · 1420 NW 10th Ave';
      $('payMerchant').textContent = 'Catch a Fade';
      $('payItem').textContent = 'Skin Fade · Andre Cole';
      $('payItemAmt').textContent = '$25.00'; $('payTotalAmt').textContent = '$25.00';
      $('payBtn').textContent = 'Request · $25.00';
      $('payHoldNote').style.display = 'block';
      $('stripeCardBox').innerHTML = '<div style="display:flex;gap:10px;color:#62626C;font:16px -apple-system,system-ui,sans-serif"><span style="flex:1">Card number</span><span>MM / YY</span><span>CVC</span></div>';
      showApplePayOption(true);
      $('paySheet').classList.add('show');
    }
    if (s === 'track') {
      stack = ['home']; render(); setBarber(0); svcName = 'Skin Fade';
      nav('tracking');
      await wait(400);
      const b = BARBERS[0];
      setAv($('tcAv'), b); $('tcName').textContent = b.n;
      $('tcMeta').innerHTML = '<span class="star">★ 5.0</span><span class="dot"></span>Skin Fade<span class="dot"></span>Verified Pro';
      $('trkState').textContent = 'Andre is on the way to you';
      $('etaMin').textContent = '6';
      $('tdAddr').textContent = 'Home · 1420 NW 10th Ave'; $('tdSvc').textContent = 'Skin Fade'; $('tdTotal').textContent = '$25.00';
      $('trkDetails').style.display = '';
      try {
        clearTrackVisuals();
        const z = userLL, a = [z[0] + 0.0042, z[1] + 0.0058];
        trackDrawRoute([a, [a[0], z[1] + 0.0021], [z[0] + 0.0009, z[1] + 0.0021], [z[0] + 0.0009, z[1]], z]);
      } catch (e) { console.warn(e); }
    }
    if (s === 'account') {
      stack = ['profile']; render();
      await wait(300);
      const av = $('profAv');
      av.innerHTML = '<img src="' + P + 'photo-1757744705465-ea08b0ddc38a.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
      av.style.background = 'none'; av.style.overflow = 'hidden';
      $('profName').textContent = 'Daniel Reyes';
      $('profSub').innerHTML = '<div style="color:var(--dim);font-size:13px;font-weight:700">Gainesville, FL</div><div style="color:var(--faint);font-size:12px;margin-top:2px">Member since August 2026 · 6 cuts</div>';
      const ts = $('themeSwitch'); if (ts) ts.classList.remove('on');
      favorites = [0, 1, 2]; renderFavs();
    }
    window.DEMO_READY = true;
  }

  window.addEventListener('load', () => setTimeout(() => { chrome(); scene().catch(e => { console.error(e); window.DEMO_READY = true; }); }, 700));
})();
