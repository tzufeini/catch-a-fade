/* ===== CUTNOW — APP LOGIC ===== */

const App = (() => {

  /* ── State ── */
  const state = {
    page: 'landing',
    reqStep: 1,
    selectedService: null,
    locationMode: null,
    barberOnline: false,
    dispatchPhase: 'searching', // searching | found | accepted | enroute | arrived
    dispatchTimer: null,
    reqTimer: null,
  };

  const services = [
    { id: 'fade',    icon: '✂️',  name: 'Fade',          price: '$35–60',  desc: 'Classic to skin fade' },
    { id: 'beard',   icon: '🧔',  name: 'Beard Trim',    price: '$20–35',  desc: 'Shape & line-up' },
    { id: 'lineup',  icon: '📐',  name: 'Line-up',       price: '$25–40',  desc: 'Edge & temple work' },
    { id: 'full',    icon: '💈',  name: 'Full Cut',      price: '$45–80',  desc: 'All-inclusive style' },
    { id: 'premium', icon: '⭐',  name: 'Premium Style', price: '$65–100', desc: 'Full grooming session' },
    { id: 'kids',    icon: '👦',  name: "Kids' Cut",     price: '$25–40',  desc: 'Under 12 years' },
  ];

  const barbers = [
    { id: 1, emoji:'💈', name:'Marcus J.',   rating:4.9, cuts:847, dist:'0.8 mi', eta:8,  specialties:['Fade Expert','Beard Pro'],  status:'online' },
    { id: 2, emoji:'✂️', name:'Devon R.',   rating:4.8, cuts:612, dist:'1.2 mi', eta:11, specialties:['Lineup King','Full Cuts'],   status:'online' },
    { id: 3, emoji:'🧔', name:'Carlos M.',  rating:4.7, cuts:421, dist:'1.6 mi', eta:14, specialties:['Beard Trim','Classic Cuts'], status:'online' },
    { id: 4, emoji:'💇', name:'Jamal T.',   rating:4.8, cuts:958, dist:'2.0 mi', eta:18, specialties:['Fade Expert','Premium'],     status:'busy'   },
    { id: 5, emoji:'⭐', name:'Darius W.',  rating:5.0, cuts:234, dist:'0.5 mi', eta:6,  specialties:['All Styles','Premium'],      status:'online' },
  ];

  const acceptedBarber = barbers[0];

  /* ── Router ── */
  function navigate(page, opts = {}) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.add('active');
    state.page = page;
    window.scrollTo(0, 0);

    if (page === 'matching') startDispatch();
    if (page === 'landing') renderLanding();
    if (page === 'dashboard') renderDashboard();
  }

  /* ── Landing page ── */
  function renderLanding() {
    renderMapBarbers('hero-map');
  }

  /* ── Shared Map Renderer ── */
  function renderMapBarbers(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;

    const roads = [
      { type:'h', top:'30%', height:'11px' },
      { type:'h', top:'60%', height:'11px' },
      { type:'v', left:'25%', width:'11px' },
      { type:'v', left:'60%', width:'11px' },
    ];
    const parks = [
      { top:'12%', left:'30%', w:'120px', h:'80px' },
      { top:'65%', left:'65%', w:'90px',  h:'70px' },
    ];
    const buildings = [
      { top:'35%', left:'5%',  w:'60px', h:'50px' },
      { top:'15%', left:'65%', w:'80px', h:'55px' },
      { top:'55%', left:'30%', w:'50px', h:'40px' },
      { top:'70%', left:'5%',  w:'70px', h:'45px' },
      { top:'40%', left:'70%', w:'55px', h:'60px' },
    ];

    const mapBarbers = [
      { x:'72%', y:'20%', cls:'barber-b1', status:'online', label:'Marcus', delay:'' },
      { x:'15%', y:'55%', cls:'barber-b2', status:'busy',   label:'Devon',  delay:'' },
      { x:'55%', y:'75%', cls:'barber-b3', status:'online', label:'Carlos', delay:'' },
    ];

    let html = '<div class="map-bg">';
    roads.forEach(r => {
      if (r.type === 'h') html += `<div class="map-road-h" style="top:${r.top};height:${r.height}"></div>`;
      else html += `<div class="map-road-v" style="left:${r.left};width:${r.width}"></div>`;
    });
    parks.forEach(p => html += `<div class="map-park" style="top:${p.top};left:${p.left};width:${p.w};height:${p.h}"></div>`);
    buildings.forEach(b => html += `<div class="map-building" style="top:${b.top};left:${b.left};width:${b.w};height:${b.h}"></div>`);

    mapBarbers.forEach(mb => {
      html += `
        <div class="map-barber ${mb.cls}" style="left:${mb.x};top:${mb.y};transform:translate(-50%,-50%)">
          <div class="barber-marker ${mb.status}">✂️</div>
          <div class="barber-label ${mb.status}">${mb.label}</div>
        </div>`;
    });

    html += `
      <div class="user-pin">
        <div class="user-ping"></div>
        <div class="user-dot"></div>
      </div>
      <div class="map-status">
        <div class="status-green"><span>●</span> 3 barbers nearby</div>
        <span style="color:var(--muted);font-size:.75rem">Live ⚡</span>
      </div>
    </div>`;

    c.innerHTML = html;
  }

  /* ── Request flow ── */
  function setReqStep(n) {
    state.reqStep = n;
    document.querySelectorAll('.req-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === n);
    });
    document.querySelectorAll('.progress-step').forEach((el, i) => {
      el.classList.remove('done', 'active');
      if (i + 1 < n) el.classList.add('done');
      if (i + 1 === n) el.classList.add('active');
    });
    window.scrollTo(0, 0);
  }

  function selectService(id) {
    state.selectedService = id;
    document.querySelectorAll('.svc-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.svc === id);
    });
  }

  function selectLocation(mode) {
    state.locationMode = mode;
    document.querySelectorAll('.loc-btn').forEach(el => {
      el.classList.toggle('active', el.dataset.loc === mode);
    });
    const manualInput = document.getElementById('manual-addr');
    if (manualInput) manualInput.style.display = mode === 'manual' ? 'block' : 'none';
    if (mode === 'gps') showToast('📍 Location detected: 1842 W. 43rd St');
  }

  function goToSummary() {
    if (!state.selectedService) { showToast('⚠️ Please select a service'); return; }
    if (!state.locationMode) { showToast('⚠️ Please set your location'); return; }

    const svc = services.find(s => s.id === state.selectedService);
    const summaryEl = document.getElementById('req-summary');
    if (summaryEl && svc) {
      summaryEl.innerHTML = `
        <div class="summary-row"><span class="k">Service</span><span class="v">${svc.name}</span></div>
        <div class="summary-row"><span class="k">Location</span><span class="v">${state.locationMode === 'gps' ? '📍 Current Location' : '✏️ Manual Address'}</span></div>
        <div class="summary-row"><span class="k">Estimated Price</span><span class="v g">${svc.price}</span></div>
        <div class="summary-row"><span class="k">ETA</span><span class="v">~8–15 min</span></div>
        <div class="summary-row"><span class="k">Cancellation</span><span class="v text-muted">Free within 2 min</span></div>
      `;
    }
    setReqStep(3);
  }

  /* ── Dispatch ── */
  function startDispatch() {
    state.dispatchPhase = 'searching';
    showDispatchState('searching');
    renderDispatchMap();

    // Phase 2: barber found (after 3s)
    clearTimeout(state.dispatchTimer);
    state.dispatchTimer = setTimeout(() => {
      state.dispatchPhase = 'found';
      updateSearchText('Barber found — awaiting acceptance…');
    }, 3000);

    // Phase 3: accepted (after 5.5s)
    setTimeout(() => {
      state.dispatchPhase = 'accepted';
      showDispatchState('accepted');
      renderAcceptedCard();
      startArrivalProgress();
    }, 5500);
  }

  function updateSearchText(msg) {
    const el = document.getElementById('search-title');
    if (el) el.textContent = msg;
  }

  function showDispatchState(phase) {
    document.querySelectorAll('.d-state').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`d-${phase}`);
    if (el) el.classList.add('active');
  }

  function renderAcceptedCard() {
    const b = acceptedBarber;
    const card = document.getElementById('d-accepted');
    if (!card) return;
    card.innerHTML = `
      <div class="accept-card">
        <div class="accept-avatar">${b.emoji}</div>
        <div class="accept-info">
          <div class="accept-name">${b.name}</div>
          <div class="accept-rating">
            <span style="color:var(--yellow)">★★★★★</span>
            <span style="font-weight:700">${b.rating}</span>
            <span style="color:var(--muted)">(${b.cuts} cuts)</span>
          </div>
          <div class="accept-tags">
            ${b.specialties.map(s => `<span class="tag g">${s}</span>`).join('')}
          </div>
        </div>
        <div class="accept-eta">
          <div class="eta-big">${b.eta}</div>
          <div class="eta-lbl">min away</div>
        </div>
      </div>
      <div class="info-row">
        <div class="info-pill">
          <div class="ip-val">$45</div>
          <div class="ip-lbl">Fixed Price</div>
        </div>
        <div class="info-pill">
          <div class="ip-val">${b.dist}</div>
          <div class="ip-lbl">Distance</div>
        </div>
        <div class="info-pill">
          <div class="ip-val">4.9 ★</div>
          <div class="ip-lbl">Rating</div>
        </div>
      </div>
      <div class="arrival-bar"><div class="arrival-fill" id="arrival-fill"></div></div>
      <div class="arrival-labels"><span>Barber departing</span><span>You</span></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" style="flex:1;justify-content:center" onclick="App.callBarber()">📞 Call</button>
        <button class="btn btn-red" style="flex:1;justify-content:center" onclick="App.cancelRide()">Cancel</button>
      </div>
    `;
    // start barber en-route on map
    const barberEl = document.querySelector('#dispatch-map .map-barber');
    if (barberEl) barberEl.classList.add('barber-en-route');
  }

  function startArrivalProgress() {
    let pct = 0;
    const fill = document.getElementById('arrival-fill');
    const interval = setInterval(() => {
      pct = Math.min(pct + 1.2, 100);
      if (fill) fill.style.width = pct + '%';
      if (pct >= 100) {
        clearInterval(interval);
        showToast('🚶 Marcus has arrived!');
      }
    }, 500);
  }

  function renderDispatchMap() {
    const c = document.getElementById('dispatch-map');
    if (!c) return;

    let html = '<div class="map-bg">';
    // Roads
    html += `
      <div class="map-road-h" style="top:28%;height:12px"></div>
      <div class="map-road-h" style="top:58%;height:12px"></div>
      <div class="map-road-v" style="left:22%;width:12px"></div>
      <div class="map-road-v" style="left:58%;width:12px"></div>
      <div class="map-road-v" style="left:80%;width:12px"></div>
      <div class="map-park" style="top:10%;left:28%;width:130px;height:90px"></div>
      <div class="map-park" style="top:63%;left:62%;width:100px;height:75px"></div>
      <div class="map-building" style="top:35%;left:4%;width:65px;height:55px"></div>
      <div class="map-building" style="top:10%;left:62%;width:85px;height:60px"></div>
      <div class="map-building" style="top:65%;left:25%;width:55px;height:45px"></div>
    `;

    // Barber that will animate en-route
    html += `
      <div class="map-barber" style="left:74%;top:18%;transform:translate(-50%,-50%)">
        <div class="barber-marker online">✂️</div>
        <div class="barber-label online">Marcus</div>
      </div>
      <div class="map-barber barber-b2" style="left:14%;top:64%;transform:translate(-50%,-50%)">
        <div class="barber-marker busy">✂️</div>
        <div class="barber-label">Devon</div>
      </div>
    `;

    // User pin (center)
    html += `
      <div class="user-pin">
        <div class="user-ping"></div>
        <div class="user-dot"></div>
      </div>
    `;

    html += '</div>';
    c.innerHTML = html;
  }

  /* ── Dashboard ── */
  function renderDashboard() {
    const dashContent = document.getElementById('dash-content');
    if (!dashContent) return;

    const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

    dashContent.innerHTML = `
      <div class="dash-header">
        <div>
          <div class="dash-greeting">Hey, Marcus 👋</div>
          <div class="dash-date">${today}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('landing')">← Exit</button>
      </div>

      <!-- Status Toggle -->
      <div class="status-card ${state.barberOnline ? 'online' : ''}" id="status-card">
        <div class="status-info">
          <h3>${state.barberOnline ? '🟢 You\'re Online' : '⚫ You\'re Offline'}</h3>
          <p>${state.barberOnline ? 'Accepting nearby requests' : 'Toggle to start earning'}</p>
        </div>
        <button class="toggle ${state.barberOnline ? 'on' : ''}" id="dash-toggle" onclick="App.toggleOnline()"></button>
      </div>

      <!-- Earnings -->
      <div class="earnings-row">
        <div class="e-card">
          <div class="e-lbl">Today</div>
          <div class="e-val g">$${state.barberOnline ? '127' : '0'}</div>
          <div class="e-sub">${state.barberOnline ? '3 cuts' : 'Go online'}</div>
        </div>
        <div class="e-card">
          <div class="e-lbl">This Week</div>
          <div class="e-val">$684</div>
          <div class="e-sub">18 cuts</div>
        </div>
        <div class="e-card">
          <div class="e-lbl">Rating</div>
          <div class="e-val">4.9 ★</div>
          <div class="e-sub">847 reviews</div>
        </div>
      </div>

      <!-- Incoming Request -->
      ${state.barberOnline ? renderIncomingRequest() : renderNoRequests()}

      <!-- Active Job -->
      ${state.barberOnline ? renderActiveJob() : ''}

      <!-- Rating breakdown -->
      <div class="dash-title"><span>Your Ratings</span></div>
      <div class="rating-card">
        <div style="font-size:3rem;font-weight:900;letter-spacing:-2px">4.9</div>
        <div class="rating-stars-big">★★★★★</div>
        <div style="font-size:.875rem;color:var(--muted);margin-bottom:12px">Based on 847 reviews</div>
        <div class="rating-bars">
          ${[[5,92],[4,6],[3,1],[2,1],[1,0]].map(([n,pct]) => `
            <div class="rbar-row">
              <span class="rbar-lbl">${n}</span>
              <div class="rbar"><div class="rbar-fill" style="width:${pct}%"></div></div>
              <span class="rbar-count">${pct}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent Jobs -->
      <div class="dash-title"><span>Recent Jobs</span><a onclick="App.showToast('📋 Full history coming soon')">See all</a></div>
      <div class="card">
        ${[
          { icon:'✂️', type:'Fade + Lineup',      meta:'Today, 2:14 PM · Marcus Johnson',  amt:'$52', stars:'★★★★★' },
          { icon:'🧔', type:'Beard Trim',           meta:'Today, 11:30 AM · Kevin Brown',    amt:'$28', stars:'★★★★★' },
          { icon:'💈', type:'Full Haircut',         meta:'Yesterday · Damien Williams',      amt:'$60', stars:'★★★★☆' },
          { icon:'✂️', type:'Fade',                 meta:'Yesterday · Omar Hassan',          amt:'$40', stars:'★★★★★' },
          { icon:'⭐', type:'Premium Style Package', meta:'Mon, May 6 · Tyler Jackson',      amt:'$95', stars:'★★★★★' },
        ].map(j => `
          <div class="recent-job">
            <div class="rj-icon">${j.icon}</div>
            <div class="rj-info">
              <div class="rj-type">${j.type}</div>
              <div class="rj-meta">${j.meta} · <span style="color:var(--yellow)">${j.stars}</span></div>
            </div>
            <div class="rj-amt">${j.amt}</div>
          </div>
        `).join('')}
      </div>

      <!-- Payout info -->
      <div class="card">
        <div class="dash-title" style="margin-bottom:12px"><span>💰 Payout</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:.9375rem">
          <span style="color:var(--muted)">Gross earnings (week)</span><span style="font-weight:700">$684</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:.9375rem">
          <span style="color:var(--muted)">Platform fee (15%)</span><span style="font-weight:700;color:var(--red)">–$102.60</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:.9375rem">
          <span style="font-weight:700">Net payout</span><span style="font-weight:900;color:var(--green);font-size:1.125rem">$581.40</span>
        </div>
        <button class="btn btn-primary btn-full mt-16" onclick="App.showToast('💳 Payout initiated')">Request Payout</button>
      </div>
    `;

    if (state.barberOnline) startRequestTimer();
  }

  function renderNoRequests() {
    return `
      <div class="no-req">
        <div class="no-req-icon">📡</div>
        <div class="no-req-text">Go online to receive requests</div>
        <div class="no-req-sub">Toggle the switch above to start accepting jobs</div>
      </div>
    `;
  }

  function renderIncomingRequest() {
    return `
      <div class="dash-title"><span>⚡ Incoming Request</span></div>
      <div class="incoming-card" id="incoming-card">
        <div class="inc-head">
          <div>
            <div class="inc-type">Full Fade + Beard Trim</div>
            <div class="inc-meta">📍 1.2 mi away · ~4 min drive · $52 fixed</div>
            <div style="margin-top:6px;font-size:.8125rem;color:var(--muted)">Kevin B. · ⭐⭐⭐⭐⭐ · 34 past cuts</div>
          </div>
          <div class="timer" id="req-timer">15</div>
        </div>
        <div class="inc-actions">
          <button class="btn btn-decline" onclick="App.declineRequest()">Decline</button>
          <button class="btn btn-accept" onclick="App.acceptRequest()">✓ Accept</button>
        </div>
      </div>
    `;
  }

  function renderActiveJob() {
    return `
      <div class="dash-title"><span>🚗 Active Job</span></div>
      <div class="job-card">
        <div style="font-weight:700;font-size:1rem;margin-bottom:4px">Fade · David M. · $45</div>
        <div style="color:var(--muted);font-size:.875rem;margin-bottom:16px">📍 892 N. Michigan Ave — 0.4 mi away</div>
        <div class="job-steps">
          <div class="jstep done"><div class="jstep-dot">✓</div><span>Request accepted</span></div>
          <div class="jstep done"><div class="jstep-dot">✓</div><span>En route to client</span></div>
          <div class="jstep current"><div class="jstep-dot">●</div><span>Arrived — service in progress</span></div>
          <div class="jstep"><div class="jstep-dot">4</div><span>Mark as completed</span></div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" style="flex:1;justify-content:center;font-size:.9rem" onclick="App.showToast('🗺️ Opening navigation…')">🗺️ Navigate</button>
          <button class="btn btn-primary" style="flex:1;justify-content:center;font-size:.9rem" onclick="App.completeJob()">✓ Mark Complete</button>
        </div>
      </div>
    `;
  }

  let reqTimerInterval;
  function startRequestTimer() {
    clearInterval(reqTimerInterval);
    let t = 15;
    reqTimerInterval = setInterval(() => {
      t--;
      const el = document.getElementById('req-timer');
      if (el) {
        el.textContent = t;
        if (t <= 5) el.style.background = '#7f1d1d';
      }
      if (t <= 0) {
        clearInterval(reqTimerInterval);
        const card = document.getElementById('incoming-card');
        if (card) {
          card.style.opacity = '.4';
          card.innerHTML = '<div style="text-align:center;padding:8px;color:var(--muted);font-weight:700">⏱ Request expired</div>';
        }
      }
    }, 1000);
  }

  /* ── Dashboard actions ── */
  function toggleOnline() {
    state.barberOnline = !state.barberOnline;
    clearInterval(reqTimerInterval);
    renderDashboard();
    showToast(state.barberOnline ? '🟢 You\'re now online!' : '⚫ You\'re offline');
  }

  function acceptRequest() {
    clearInterval(reqTimerInterval);
    showToast('✅ Request accepted! Navigate to client.');
    setTimeout(renderDashboard, 600);
  }

  function declineRequest() {
    clearInterval(reqTimerInterval);
    const card = document.getElementById('incoming-card');
    if (card) {
      card.style.transition = 'all .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateX(100px)';
      setTimeout(() => { card.remove(); }, 300);
    }
    showToast('↩️ Request declined');
  }

  function completeJob() {
    showToast('🎉 Job completed! $45 added to earnings.');
    setTimeout(renderDashboard, 800);
  }

  function callBarber() { showToast('📞 Calling Marcus…'); }
  function cancelRide() {
    if (confirm('Cancel this request?')) {
      clearTimeout(state.dispatchTimer);
      navigate('landing');
      showToast('Request cancelled');
    }
  }

  /* ── Toast ── */
  let toastTimeout;
  function showToast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 3000);
  }

  /* ── Profile ── */
  function renderProfile(id) {
    navigate('profile');
    const b = barbers.find(b => b.id === id) || barbers[0];
    const el = document.getElementById('profile-content');
    if (!el) return;

    el.innerHTML = `
      <div class="profile-hero">
        <div class="profile-hero-glow"></div>
        <div class="p-avatar">
          <span>${b.emoji}</span>
          <div class="p-online-ring"></div>
        </div>
        <div class="p-name">${b.name}</div>
        <div style="color:rgba(255,255,255,.6);font-size:.9375rem">Freelance Barber · ${b.dist} away</div>
        <div class="verified-badge">✅ Identity Verified · Background Checked</div>
        <div class="p-stats">
          <div class="pstat"><div class="pstat-val">${b.rating}</div><div class="pstat-lbl">Rating</div></div>
          <div class="pstat"><div class="pstat-val">${b.cuts}</div><div class="pstat-lbl">Cuts</div></div>
          <div class="pstat"><div class="pstat-val">3yr</div><div class="pstat-lbl">Experience</div></div>
        </div>
      </div>
      <div class="profile-body">
        <div class="p-section">
          <div class="p-section-title">Specialties</div>
          <div class="chip-row">
            ${b.specialties.map(s => `<span class="chip g">${s}</span>`).join('')}
            <span class="chip">Scissor Cuts</span>
            <span class="chip">Kids Cuts</span>
            <span class="chip">Hair Design</span>
          </div>
        </div>
        <div class="p-section">
          <div class="p-section-title">Portfolio</div>
          <div class="portfolio-grid">
            ${'💈✂️🧔💇⭐💈💇🧔✂️'.split('').map(e => `<div class="portfolio-item">${e}</div>`).join('')}
          </div>
        </div>
        <div class="p-section">
          <div class="p-section-title">Recent Reviews</div>
          ${[
            { name:'Jordan T.', stars:5, text:'Marcus is absolutely elite. Perfect fade, precise lineup. He came right to my hotel. Will book again.', date:'2 days ago' },
            { name:'Alex R.',   stars:5, text:'On time, professional, and the cut was immaculate. 10/10 experience.', date:'4 days ago' },
            { name:'Damon W.', stars:5, text:'Best barber on the platform. Came to my office lobby. Did a full fade in 30 min.', date:'1 week ago' },
          ].map(r => `
            <div class="review-card">
              <div class="review-head">
                <div>
                  <div class="reviewer">${r.name}</div>
                  <div style="color:var(--yellow);font-size:.9rem">${'★'.repeat(r.stars)}</div>
                </div>
                <div class="review-date">${r.date}</div>
              </div>
              <div class="review-text">${r.text}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="profile-cta-bar">
        <button class="btn btn-secondary" onclick="App.showToast('💬 Message feature coming soon')">💬 Message</button>
        <button class="btn btn-primary" onclick="App.navigate('request')">Request ${b.name.split(' ')[0]} — ${b.eta} min</button>
      </div>
    `;
  }

  /* ── Init ── */
  function init() {
    // Render barber cards on landing
    renderLandingBarbers();
    // Start with landing
    navigate('landing');
  }

  function renderLandingBarbers() {
    const el = document.getElementById('barber-cards');
    if (!el) return;
    el.innerHTML = barbers.map(b => `
      <div class="barber-card ${b.status === 'online' ? 'available' : ''}" onclick="App.renderProfile(${b.id})">
        <div class="b-avatar">${b.emoji}</div>
        ${b.status === 'online' ? '<div class="online-badge">Online</div>' : '<div style="display:inline-flex;align-items:center;gap:5px;font-size:.75rem;font-weight:700;color:var(--yellow);margin-bottom:6px">● Busy</div>'}
        <div class="b-name">${b.name}</div>
        <div class="stars"><span class="rt">${'★'.repeat(Math.floor(b.rating))}</span> <span>${b.rating}</span> <span>(${b.cuts})</span></div>
        <div class="b-tags">${b.specialties.map(s => `<span class="tag g">${s}</span>`).join('')}</div>
        <div class="b-eta">🕐 <strong>${b.eta} min</strong> · ${b.dist}</div>
      </div>
    `).join('');
  }

  /* ── Public API ── */
  return {
    init,
    navigate,
    setReqStep,
    selectService,
    selectLocation,
    goToSummary,
    toggleOnline,
    acceptRequest,
    declineRequest,
    completeJob,
    callBarber,
    cancelRide,
    showToast,
    renderProfile,
    renderMapBarbers,
  };

})();

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  App.renderMapBarbers('hero-map');

  // Nav scroll shadow
  window.addEventListener('scroll', () => {
    document.querySelector('nav').classList.toggle('scrolled', window.scrollY > 10);
  });
});
