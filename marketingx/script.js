/* ===========================
   MarketingX — Interactivity
   =========================== */

/* --- 1. Hero particle mesh (gold dots on navy) --- */
(function particles(){
  const canvas = document.getElementById('particles');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, dots;

  function resize(){
    w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  }
  function init(){
    resize();
    const count = Math.min(80, Math.floor((w*h)/30000));
    dots = Array.from({length:count}).map(()=>({
      x: Math.random()*w,
      y: Math.random()*h,
      vx: (Math.random()-.5)*.3,
      vy: (Math.random()-.5)*.3,
      r: Math.random()*1.6 + .4
    }));
  }
  function draw(){
    ctx.clearRect(0,0,w,h);
    // lines
    for(let i=0;i<dots.length;i++){
      for(let j=i+1;j<dots.length;j++){
        const a = dots[i], b = dots[j];
        const dx = a.x-b.x, dy = a.y-b.y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if(d < 140*window.devicePixelRatio){
          ctx.strokeStyle = `rgba(255,208,0,${0.18 * (1 - d/(140*window.devicePixelRatio))})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x,a.y);
          ctx.lineTo(b.x,b.y);
          ctx.stroke();
        }
      }
    }
    // dots
    for(const d of dots){
      ctx.fillStyle = 'rgba(255,208,0,0.7)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r*window.devicePixelRatio, 0, Math.PI*2);
      ctx.fill();
      d.x += d.vx; d.y += d.vy;
      if(d.x<0||d.x>w) d.vx*=-1;
      if(d.y<0||d.y>h) d.vy*=-1;
    }
    requestAnimationFrame(draw);
  }
  init();
  draw();
  window.addEventListener('resize', init);
})();

/* --- 2. Reveal on scroll --- */
(function reveal(){
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  },{threshold:.15});
  els.forEach(el=>io.observe(el));
})();

/* --- 3. Timeline progress line --- */
(function timeline(){
  const tl = document.querySelector('.timeline');
  if(!tl) return;
  function update(){
    const rect = tl.getBoundingClientRect();
    const total = rect.height;
    const visible = Math.min(total, Math.max(0, window.innerHeight*0.7 - rect.top));
    const pct = Math.min(100, (visible / total) * 100);
    tl.style.setProperty('--line-progress', pct + '%');
  }
  window.addEventListener('scroll', update, {passive:true});
  update();
})();

/* --- 4. Count-up numbers --- */
(function countUp(){
  const counts = document.querySelectorAll('.count');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting) return;
      const el = e.target;
      const target = parseInt(el.dataset.target, 10) || 0;
      const duration = 1400;
      const start = performance.now();
      function tick(now){
        const t = Math.min(1, (now-start)/duration);
        const eased = 1 - Math.pow(1-t, 3);
        el.textContent = Math.round(target * eased);
        if(t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      io.unobserve(el);
    });
  },{threshold:.5});
  counts.forEach(c=>io.observe(c));
})();

/* --- 5. Portfolio parallax tilt on hover --- */
(function tilt(){
  const cards = document.querySelectorAll('.port-card');
  cards.forEach(card=>{
    card.addEventListener('mousemove', e=>{
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `translateY(-8px) rotateX(${-y*6}deg) rotateY(${x*6}deg)`;
    });
    card.addEventListener('mouseleave', ()=>{
      card.style.transform = '';
    });
  });
})();

/* --- 6. Industry filter --- */
(function industryFilter(){
  const tags = document.querySelectorAll('.ind-tag');
  const cards = document.querySelectorAll('.port-card');
  let active = null;
  tags.forEach(tag=>{
    tag.addEventListener('click', ()=>{
      const filter = tag.dataset.filter;
      if(active === filter){
        // deselect — show all
        active = null;
        tags.forEach(t=>t.classList.remove('active'));
        cards.forEach(c=>c.classList.remove('hidden'));
      } else {
        active = filter;
        tags.forEach(t=>t.classList.toggle('active', t === tag));
        cards.forEach(c=>{
          c.classList.toggle('hidden', c.dataset.industry !== filter);
        });
      }
      // smooth scroll to portfolio
      document.getElementById('work').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
})();

/* --- 7. Before/After slider --- */
(function beforeAfter(){
  const slider = document.getElementById('baSlider');
  if(!slider) return;
  const after = document.getElementById('baAfter');
  const handle = document.getElementById('baHandle');
  let dragging = false;

  function setPos(x){
    const r = slider.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
    // Reveal the AFTER from the LEFT of the handle outward
    after.style.clipPath = `inset(0 0 0 ${pct}%)`;
    after.style.webkitClipPath = `inset(0 0 0 ${pct}%)`;
    handle.style.left = pct + '%';
  }
  function startDrag(){dragging = true;document.body.style.userSelect='none'}
  function endDrag(){dragging = false;document.body.style.userSelect=''}
  function move(e){
    if(!dragging) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    setPos(x);
  }
  slider.addEventListener('mousedown', e=>{startDrag();setPos(e.clientX)});
  slider.addEventListener('touchstart', e=>{startDrag();setPos(e.touches[0].clientX)},{passive:true});
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, {passive:true});
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
})();

/* --- 8. Countdown timer (end of current month) --- */
(function countdown(){
  const d = document.getElementById('cd-days');
  const h = document.getElementById('cd-hours');
  const m = document.getElementById('cd-mins');
  const s = document.getElementById('cd-secs');
  if(!d) return;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth()+1, 1, 0, 0, 0);
  function pad(n){return String(n).padStart(2,'0')}
  function tick(){
    const diff = end - new Date();
    if(diff <= 0){
      d.textContent = h.textContent = m.textContent = s.textContent = '00';
      return;
    }
    const days = Math.floor(diff/86400000);
    const hrs = Math.floor(diff/3600000) % 24;
    const mins = Math.floor(diff/60000) % 60;
    const secs = Math.floor(diff/1000) % 60;
    d.textContent = pad(days);
    h.textContent = pad(hrs);
    m.textContent = pad(mins);
    s.textContent = pad(secs);
  }
  tick();
  setInterval(tick, 1000);
})();

/* --- 9. Smooth-scroll for in-page anchors (offset for nav) --- */
(function smoothScroll(){
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click', e=>{
      const id = a.getAttribute('href');
      if(id.length < 2) return;
      const target = document.querySelector(id);
      if(!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({top, behavior:'smooth'});
    });
  });
})();
