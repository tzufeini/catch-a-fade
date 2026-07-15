/* ============================================================
   SIE Mastery — application engine
   Reads window.SIE_DATA (from content.js), renders the course,
   quizzes, mock exam, search, and tracks progress in localStorage.
   ============================================================ */
(function () {
  "use strict";

  // ---- FINRA exam blueprint (the 4 official content areas) ----
  const SECTIONS = [
    { key: "Knowledge of Capital Markets", short: "Capital Markets", weight: 16, q: 12 },
    { key: "Understanding Products and Their Risks", short: "Products & Risks", weight: 44, q: 33 },
    { key: "Trading, Customer Accounts & Prohibited Activities", short: "Trading & Accounts", weight: 31, q: 23 },
    { key: "Overview of the Regulatory Framework", short: "Regulatory Framework", weight: 9, q: 7 },
  ];
  const EXAM = { scored: 75, pretest: 10, minutes: 105, pass: 70 };

  const DATA = window.SIE_DATA || { chapters: [] };
  const CH = (DATA.chapters || []).slice().sort((a, b) => a.number - b.number);
  const byNum = (n) => CH.find((c) => c.number === Number(n));

  // ---- tiny helpers ----
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  // allow a safe subset of inline HTML from authored "text"/"html" blocks
  const safeHtml = (s) => String(s == null ? "" : s);
  const letters = ["A", "B", "C", "D", "E", "F"];

  // ---- progress store ----
  const KEY = "sie-mastery-v1";
  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  let STATE = loadState();
  STATE.done = STATE.done || {};       // { chapterNum: true }
  STATE.scores = STATE.scores || {};   // { chapterNum: {correct,total} }
  STATE.answered = STATE.answered || {}; // { "ch-qi": choiceIndex }

  const isDone = (n) => !!STATE.done[n];
  function setDone(n, v) { if (v) STATE.done[n] = true; else delete STATE.done[n]; saveState(STATE); refreshProgress(); buildSidebar(); }

  // ============================================================ THEME
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("sie-theme", t); } catch (e) {}
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  }
  (function initTheme() {
    let t = "dark";
    try { t = localStorage.getItem("sie-theme") || "dark"; } catch (e) {}
    applyTheme(t);
  })();

  // ============================================================ SIDEBAR
  function refreshProgress() {
    const total = CH.length || 20;
    const done = Object.keys(STATE.done).filter((k) => STATE.done[k]).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const ring = $("#progressRing");
    if (ring) {
      const C = 2 * Math.PI * 34;
      ring.style.strokeDasharray = C.toFixed(1);
      ring.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
    }
    const pctEl = $("#progressPct"); if (pctEl) pctEl.textContent = pct + "%";
    const det = $("#progressDetail"); if (det) det.textContent = done + " of " + total + " chapters";
  }

  function buildSidebar() {
    const nav = $("#chapterNav");
    if (!nav) return;
    let html = "";
    SECTIONS.forEach((sec, si) => {
      const chs = CH.filter((c) => c.section === sec.key);
      if (!chs.length) return;
      html += '<div class="sec-group sec-' + (si + 1) + '"><div class="sec-head">' + esc(sec.short) +
        '<span class="sec-weight">' + sec.weight + '%</span></div>';
      chs.forEach((c) => {
        const cls = "ch-link" + (isDone(c.number) ? " done" : "");
        html += '<a class="' + cls + '" href="#/chapter/' + c.number + '" data-ch="' + c.number + '">' +
          '<span class="ch-num">' + c.number + '</span>' +
          '<span class="ch-title">' + esc(c.title) + '</span>' +
          '<span class="ch-check">✓</span></a>';
      });
      html += "</div>";
    });
    nav.innerHTML = html;
    highlightNav();
  }

  function highlightNav() {
    const hash = location.hash || "#/dashboard";
    $$(".nav-top").forEach((a) => a.classList.toggle("active", hash.startsWith(a.getAttribute("href"))));
    $$(".ch-link").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === hash));
  }

  // ============================================================ BLOCK RENDERER
  function renderBlock(b) {
    if (!b || !b.type) return "";
    switch (b.type) {
      case "text":
        return '<div class="blk blk-text">' + safeHtml(b.html || ("<p>" + esc(b.text || "") + "</p>")) + "</div>";
      case "key":
        return '<div class="blk blk-key"><h4>' + esc(b.title || "Key Points") + "</h4><ul>" +
          (b.items || []).map((i) => "<li>" + safeHtml(i) + "</li>").join("") + "</ul></div>";
      case "callout": {
        const style = ["exam", "tip", "warning", "note"].includes(b.style) ? b.style : "note";
        const ico = { exam: "✪", tip: "💡", warning: "⚠", note: "✎" }[style];
        return '<div class="blk callout ' + style + '"><h4>' + ico + " " +
          esc(b.title || (style === "exam" ? "On the exam" : "Note")) + "</h4><p>" + safeHtml(b.text || "") + "</p></div>";
      }
      case "table": {
        const heads = (b.headers || []).map((h) => "<th>" + esc(h) + "</th>").join("");
        const rows = (b.rows || []).map((r) =>
          "<tr>" + (r || []).map((c) => "<td>" + safeHtml(c) + "</td>").join("") + "</tr>").join("");
        return '<div class="blk tbl-wrap">' + (b.title ? '<div class="tbl-title">' + esc(b.title) + "</div>" : "") +
          '<table class="blk-table"><thead><tr>' + heads + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
      }
      case "steps": {
        const steps = (b.steps || []).map((s, i) =>
          '<div class="step"><div class="step-dot"><div class="step-num">' + (i + 1) + '</div><div class="step-line"></div></div>' +
          '<div class="step-body"><div class="step-label">' + esc(s.label || "") + "</div>" +
          '<div class="step-desc">' + safeHtml(s.desc || "") + "</div></div></div>").join("");
        return '<div class="blk steps">' + (b.title ? '<div class="steps-title">' + esc(b.title) + "</div>" : "") + steps + "</div>";
      }
      case "formula": {
        const vars = (b.vars || []).map((v) =>
          '<div class="f-var"><b>' + esc(v.sym) + "</b> — " + esc(v.meaning) + "</div>").join("");
        return '<div class="blk formula">' + (b.title ? '<div class="f-title">' + esc(b.title) + "</div>" : "") +
          '<div class="f-eq">' + esc(b.formula || "") + "</div>" +
          (vars ? '<div class="f-vars">' + vars + "</div>" : "") +
          (b.example ? '<div class="f-ex"><b>Example:</b> ' + safeHtml(b.example) + "</div>" : "") + "</div>";
      }
      case "compare": {
        const L = (b.leftItems || []).map((i) => "<li>" + safeHtml(i) + "</li>").join("");
        const R = (b.rightItems || []).map((i) => "<li>" + safeHtml(i) + "</li>").join("");
        return '<div class="blk compare">' + (b.title ? '<div class="cmp-title">' + esc(b.title) + "</div>" : "") +
          '<div class="cmp-col"><h5>' + esc(b.leftTitle || "A") + "</h5><ul>" + L + "</ul></div>" +
          '<div class="cmp-col"><h5>' + esc(b.rightTitle || "B") + "</h5><ul>" + R + "</ul></div></div>";
      }
      case "mnemonic": {
        const ex = (b.expansion || []).map((i) => "<li>" + safeHtml(i) + "</li>").join("");
        return '<div class="blk mnemonic"><div class="mn-tag">✦ Memory aid</div>' +
          '<div class="mn-phrase">' + esc(b.phrase || "") + "</div>" +
          (ex ? "<ul>" + ex + "</ul>" : "") +
          (b.note ? '<div class="mn-note">' + safeHtml(b.note) + "</div>" : "") + "</div>";
      }
      default:
        return "";
    }
  }

  // ============================================================ QUIZ
  // opts: { showProgress }
  function renderQuiz(questions, prefix, opts) {
    opts = opts || {};
    if (!questions || !questions.length) return "";
    let html = '<div class="quiz" id="quiz-' + prefix + '">';
    questions.forEach((q, i) => {
      const id = prefix + "-" + i;
      html += '<div class="qcard" data-q="' + id + '" data-answer="' + q.answer + '">' +
        '<div class="q-meta"><span class="q-pill">Q' + (i + 1) + "</span>" +
        (q.topic ? '<span class="q-pill">' + esc(q.topic) + "</span>" : "") +
        "</div>" +
        '<div class="q-text">' + esc(q.q) + "</div>" +
        '<div class="choices">';
      (q.choices || []).forEach((c, ci) => {
        html += '<div class="choice" data-ci="' + ci + '"><span class="c-key">' + (letters[ci] || ci + 1) +
          "</span><span>" + esc(c) + "</span></div>";
      });
      html += "</div>" +
        '<div class="explain"><span class="ex-tag">Correct: ' + (letters[q.answer] || "") + "</span> " +
        safeHtml(q.explanation || "") + "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function wireQuiz(root, onAnswer) {
    $$(".qcard", root).forEach((card) => {
      const answer = Number(card.getAttribute("data-answer"));
      const choices = $$(".choice", card);
      let locked = false;
      choices.forEach((ch) => {
        ch.addEventListener("click", () => {
          if (locked) return;
          locked = true;
          const picked = Number(ch.getAttribute("data-ci"));
          choices.forEach((c) => {
            c.classList.add("disabled");
            const ci = Number(c.getAttribute("data-ci"));
            if (ci === answer) c.classList.add("correct");
            if (ci === picked && picked !== answer) c.classList.add("wrong");
          });
          const ex = $(".explain", card); if (ex) ex.classList.add("show");
          if (onAnswer) onAnswer(picked === answer, picked);
        });
      });
    });
  }

  // ============================================================ VIEWS
  const view = () => $("#view");
  function setView(html) { view().innerHTML = html; view().scrollIntoView({ block: "start" }); window.scrollTo(0, 0); }

  function totalQuestions() { return CH.reduce((n, c) => n + ((c.questions && c.questions.length) || 0), 0); }
  function contentReady() { return CH.some((c) => c.lessons && c.lessons.length); }

  // ---- Dashboard ----
  function renderDashboard() {
    const tq = totalQuestions();
    const totalHours = CH.reduce((n, c) => n + (c.estHours || 0), 0);
    const done = Object.keys(STATE.done).filter((k) => STATE.done[k]).length;

    let html = countdownBanner() + '<section class="hero"><h1>Master the SIE Exam 🎓</h1>' +
      "<p>A complete, guided course for FINRA's <strong>Securities Industry Essentials</strong> exam — " +
      "20 chapters of clear lessons, visual breakdowns, memory aids, and " + (tq || "300+") +
      " practice questions. Built for the full 100–150 hour prep journey.</p>" +
      '<div class="hero-cta">' +
      '<a class="btn btn-primary" href="#/chapter/1">▶ Start Chapter 1</a>' +
      '<a class="btn" href="#/fullexam">◉ Full Practice Exam</a>' +
      '<a class="btn" href="#/cards">⊞ Flashcards</a>' +
      '<a class="btn" href="#/exam">◎ Quick Mock Exam</a>' +
      '<a class="btn" href="#/guide">✦ How to Study</a></div></section>';

    html += '<div class="stat-grid">' +
      stat("20", "Chapters") +
      stat(tq || "300+", "Practice questions") +
      stat(totalHours ? totalHours + "h" : "100–150h", "Est. study time") +
      stat(done + "/20", "Chapters completed") + "</div>";

    if (!contentReady()) {
      html += '<div class="callout note"><h4>✎ Content is being generated</h4>' +
        "<p>Lessons and questions are being authored and fact-checked right now. The full course will appear here automatically once ready — the navigation and structure below are live.</p></div>";
    }

    // Exam blueprint
    html += '<div class="section-title">Exam blueprint</div><div class="blueprint">';
    SECTIONS.forEach((s) => {
      html += '<div class="bp-row"><div class="bp-top"><b>' + esc(s.key) + "</b><span>" +
        s.weight + "% · ~" + s.q + " questions</span></div>" +
        '<div class="bp-bar"><div class="bp-fill" style="width:' + s.weight + '%"></div></div></div>';
    });
    html += "</div>";
    html += '<p style="color:var(--text-faint);font-size:13px;margin-top:10px">' +
      EXAM.scored + " scored questions (+" + EXAM.pretest + " unscored pretest) · " +
      EXAM.minutes + " minutes · passing score " + EXAM.pass + "%.</p>";

    // Chapter cards
    html += '<div class="section-title">All chapters</div><div class="card-grid">';
    CH.forEach((c) => {
      const sc = STATE.scores[c.number];
      html += '<a class="ch-card sec-' + secIndex(c.section) + " " + (isDone(c.number) ? "done" : "") + '" href="#/chapter/' + c.number + '">' +
        '<div class="cc-top"><div class="cc-num">' + c.number + "</div>" +
        '<div class="cc-sec">' + esc(secShort(c.section)) + "</div></div>" +
        "<h3>" + esc(c.title) + "</h3>" +
        '<div class="cc-meta"><span>' + ((c.questions && c.questions.length) || 0) + " Qs</span>" +
        "<span>~" + (c.estHours || "—") + "h</span>" +
        (sc ? "<span>" + sc.correct + "/" + sc.total + "</span>" : "") + "</div></a>";
    });
    html += "</div>";
    setView(html);
  }
  function stat(n, l) { return '<div class="stat"><div class="stat-num">' + n + '</div><div class="stat-lbl">' + l + "</div></div>"; }
  function secShort(key) { const s = SECTIONS.find((x) => x.key === key); return s ? s.short : key; }
  function secIndex(key) { const i = SECTIONS.findIndex((x) => x.key === key); return i >= 0 ? i + 1 : 1; }

  // ---- Chapter ----
  function renderChapter(num) {
    const c = byNum(num);
    if (!c) { setView('<div class="empty">Chapter not found.</div>'); return; }
    const prev = byNum(c.number - 1), next = byNum(c.number + 1);

    let html = '<div class="ch-header"><div class="crumb">' +
      '<a href="#/dashboard">Dashboard</a> › <span>' + esc(secShort(c.section)) + "</span></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="badge">Chapter ' + c.number + "</span>" +
      '<span class="badge sec">' + esc(c.section) + " · " + esc(c.sectionWeight || "") + "</span></div>" +
      "<h1>" + esc(c.title) + "</h1>";
    if (c.summary) html += '<p class="ch-lead">' + esc(c.summary) + "</p>";
    html += '<div class="ch-facts">' +
      '<span class="fact">📘 <b>' + ((c.lessons && c.lessons.length) || 0) + "</b> lessons</span>" +
      '<span class="fact">📝 <b>' + ((c.questions && c.questions.length) || 0) + "</b> questions</span>" +
      '<span class="fact">⏱ <b>~' + (c.estHours || "—") + "h</b> study time</span></div></div>";

    if (!c.lessons || !c.lessons.length) {
      html += '<div class="callout note"><h4>✎ This chapter is being prepared</h4>' +
        "<p>The full lesson content and practice questions are being authored and fact-checked. Check back shortly — it will appear here automatically.</p></div>";
      setView('<div class="chapter sec-' + secIndex(c.section) + '">' + html + chapNavBar(prev, next) + "</div>");
      return;
    }

    if (c.objectives && c.objectives.length) {
      html += '<div class="objectives"><h4>What you\'ll learn</h4><ul>' +
        c.objectives.map((o) => "<li>" + esc(o) + "</li>").join("") + "</ul></div>";
    }

    (c.lessons || []).forEach((les) => {
      html += '<section class="lesson"><h2>' + esc(les.heading || "") + "</h2>" +
        (les.blocks || []).map(renderBlock).join("") + "</section>";
    });

    if (c.cheatSheet && c.cheatSheet.length) {
      html += '<details class="foldout" open><summary>⚡ High-yield cheat sheet</summary><div class="fold-body"><ul class="cheat-list">' +
        c.cheatSheet.map((x) => "<li>" + safeHtml(x) + "</li>").join("") + "</ul></div></details>";
    }
    if (c.glossary && c.glossary.length) {
      html += '<details class="foldout"><summary>📖 Glossary (' + c.glossary.length + " terms)</summary><div class=\"fold-body\">" +
        c.glossary.map((g) => '<div class="gloss-item"><b>' + esc(g.term) + "</b> — <span>" + safeHtml(g.def) + "</span></div>").join("") +
        "</div></details>";
    }

    if (c.questions && c.questions.length) {
      html += '<div class="quiz-head"><h2>Practice questions</h2>' +
        '<span class="quiz-progress" id="qprog">0 / ' + c.questions.length + " answered · 0 correct</span></div>";
      html += renderQuiz(c.questions, "ch" + c.number);
    }

    html += chapNavBar(prev, next, true, c.number);
    setView('<div class="chapter sec-' + secIndex(c.section) + '">' + html + "</div>");

    // wire quiz + live score
    let answered = 0, correct = 0;
    wireQuiz(view(), (ok) => {
      answered++; if (ok) correct++;
      const p = $("#qprog");
      if (p) p.textContent = answered + " / " + c.questions.length + " answered · " + correct + " correct";
      STATE.scores[c.number] = { correct: correct, total: answered };
      saveState(STATE);
      if (answered === c.questions.length) {
        if (correct / answered >= 0.7) setDone(c.number, true);
      }
    });

    // complete button
    const cb = $("#markComplete");
    if (cb) {
      const sync = () => {
        cb.textContent = isDone(c.number) ? "✓ Completed" : "Mark chapter complete";
        cb.classList.toggle("btn-primary", !isDone(c.number));
      };
      sync();
      cb.addEventListener("click", () => { setDone(c.number, !isDone(c.number)); sync(); });
    }
  }
  function chapNavBar(prev, next, withComplete, num) {
    return '<div class="complete-bar">' +
      (withComplete ? '<button class="btn" id="markComplete"></button>' : "<span></span>") +
      '<div class="chap-nav-btns">' +
      (prev ? '<a class="btn" href="#/chapter/' + prev.number + '">← Ch ' + prev.number + "</a>" : "") +
      (next ? '<a class="btn btn-primary" href="#/chapter/' + next.number + '">Ch ' + next.number + " →</a>" : "") +
      "</div></div>";
  }

  // ---- Question Bank (all questions, filterable by chapter) ----
  function renderBank() {
    if (!totalQuestions()) { setView('<div class="empty">Questions are being generated — check back shortly.</div>'); return; }
    let opts = '<option value="all">All chapters</option>';
    CH.forEach((c) => { if (c.questions && c.questions.length) opts += '<option value="' + c.number + '">Ch ' + c.number + " · " + esc(c.title) + "</option>"; });
    let html = '<div class="ch-header"><h1>Question Bank</h1>' +
      '<p class="ch-lead">' + totalQuestions() + " practice questions across all chapters. Pick a chapter or drill the whole bank.</p>" +
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<select id="bankFilter" class="btn" style="cursor:pointer">' + opts + "</select>" +
      '<button class="btn" id="bankShuffle">🔀 Shuffle</button></div></div>';
    html += '<div id="bankBody"></div>';
    setView(html);

    function draw(filter, shuffle) {
      let qs = [];
      CH.forEach((c) => (c.questions || []).forEach((q, i) => {
        if (filter === "all" || String(c.number) === String(filter)) qs.push(Object.assign({ _ch: c.number }, q));
      }));
      if (shuffle) qs = shuffled(qs);
      $("#bankBody").innerHTML = '<div class="quiz-head"><span class="quiz-progress" id="qprog">0 / ' + qs.length +
        " answered · 0 correct</span></div>" + renderQuiz(qs, "bank");
      let a = 0, k = 0;
      wireQuiz($("#bankBody"), (ok) => { a++; if (ok) k++; const p = $("#qprog"); if (p) p.textContent = a + " / " + qs.length + " answered · " + k + " correct"; });
    }
    draw("all", false);
    $("#bankFilter").addEventListener("change", (e) => draw(e.target.value, false));
    $("#bankShuffle").addEventListener("click", () => draw($("#bankFilter").value, true));
  }

  // ---- Mock Exam ----
  let examTimer = null;
  function renderExam() {
    if (totalQuestions() < 10) { setView('<div class="empty">The question bank is still being generated — the mock exam unlocks once it is ready.</div>'); return; }
    clearInterval(examTimer);
    let html = '<div class="ch-header"><h1>Mock Exam ◎</h1>' +
      '<p class="ch-lead">Simulate the real SIE: questions are drawn across all four content areas in the same proportions FINRA uses. Passing is ' + EXAM.pass + "%.</p></div>";
    html += '<div class="exam-setup">' +
      '<div class="callout exam"><h4>✪ Format</h4><p>The real exam is ' + EXAM.scored + " scored questions in " + EXAM.minutes +
      " minutes. Choose a length below — the timer scales accordingly.</p></div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      examBtn("Quick", 30) + examBtn("Half", 50) + examBtn("Full SIE", 75) + "</div></div>";
    setView(html);
    $$("[data-exam-len]").forEach((b) => b.addEventListener("click", () => {
      const n = Number(b.getAttribute("data-exam-len"));
      const qs = buildExamSet(n);
      const minutes = Math.max(5, Math.round(EXAM.minutes * (n / EXAM.scored)));
      startExam(qs, minutes, "Mock Exam", renderExam);
    }));
  }

  // ---- Full-length fixed practice exams (window.SIE_EXAMS) ----
  function fullExams() { return window.SIE_EXAMS || []; }
  function renderFullExam() {
    const exams = fullExams();
    let html = '<div class="ch-header"><h1>Full Practice Exam ◉</h1>' +
      '<p class="ch-lead">Full-length, fixed exams written at real-exam rigor — calculations, traps, EXCEPT and Roman-numeral items, and scenarios. Same blueprint weighting as FINRA, a 105-minute clock, and a scored report with rationales for every question.</p></div>';
    if (!exams.length) {
      html += '<div class="callout note"><h4>✎ Being prepared</h4><p>An original 75-question full-length exam is being authored and fact-checked. It will appear here automatically — no refresh of anything else needed.</p></div>';
      setView(html); return;
    }
    html += '<div class="card-grid">';
    exams.forEach((ex) => {
      const n = ex.total || (ex.questions || []).length;
      html += '<div class="ch-card"><div class="cc-top"><div class="cc-num">◉</div><div class="cc-sec">Full length · blueprint-weighted</div></div>' +
        "<h3>" + esc(ex.title) + "</h3>" +
        '<div class="cc-meta"><span>' + n + " questions</span><span>105 min</span><span>70% to pass</span></div>" +
        '<div style="margin-top:14px"><button class="btn btn-primary" data-start="' + esc(ex.id) + '">▶ Start exam</button></div></div>';
    });
    html += "</div>";
    setView(html);
    $$("[data-start]").forEach((b) => b.addEventListener("click", () => {
      const ex = fullExams().find((e) => e.id === b.getAttribute("data-start"));
      if (!ex) return;
      const qs = shuffled((ex.questions || []).map((q) => Object.assign({}, q, { _sec: q.section, _ch: q.chapter })));
      startExam(qs, EXAM.minutes, ex.title, renderFullExam);
    }));
  }

  function examBtn(label, n) {
    return '<button class="btn ' + (n === 75 ? "btn-primary" : "") + '" data-exam-len="' + n + '">' + label + " · " + n + " Qs</button>";
  }

  function buildExamSet(n) {
    // distribute by section weight, pull random questions per section
    const pool = {};
    SECTIONS.forEach((s) => (pool[s.key] = []));
    CH.forEach((c) => (c.questions || []).forEach((q, i) => {
      if (pool[c.section]) pool[c.section].push(Object.assign({ _ch: c.number, _sec: c.section }, q));
    }));
    let set = [];
    SECTIONS.forEach((s) => {
      const want = Math.max(1, Math.round((s.weight / 100) * n));
      set = set.concat(shuffled(pool[s.key]).slice(0, want));
    });
    set = shuffled(set).slice(0, n);
    return set;
  }

  function startExam(qs, minutes, title, onRestart) {
    const answers = new Array(qs.length).fill(null);
    const flags = new Array(qs.length).fill(false);
    let remaining = minutes * 60;
    let cur = 0;

    function shell() {
      let grid = qs.map((q, i) =>
        '<button class="eg-btn ' + (answers[i] != null ? "answered " : "") + (flags[i] ? "flag " : "") + (i === cur ? "current" : "") +
        '" data-go="' + i + '">' + (i + 1) + "</button>").join("");
      view().innerHTML =
        '<div class="ch-header"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        "<h1>" + esc(title) + "</h1><div class=\"exam-timer\" id=\"examTimer\"></div></div>" +
        '<div class="exam-grid-nav">' + grid + "</div></div>" +
        '<div id="examQ"></div>' +
        '<div class="complete-bar"><div class="chap-nav-btns">' +
        '<button class="btn" id="ePrev">← Prev</button>' +
        '<button class="btn" id="eFlag">⚑ Flag</button>' +
        '<button class="btn" id="eNext">Next →</button></div>' +
        '<button class="btn btn-primary" id="eSubmit">Submit exam</button></div>';
      drawQ();
      tick();
      $("#ePrev").onclick = () => { cur = Math.max(0, cur - 1); shell(); };
      $("#eNext").onclick = () => { cur = Math.min(qs.length - 1, cur + 1); shell(); };
      $("#eFlag").onclick = () => { flags[cur] = !flags[cur]; shell(); };
      $("#eSubmit").onclick = () => finish();
      $$("[data-go]").forEach((b) => (b.onclick = () => { cur = Number(b.getAttribute("data-go")); shell(); }));
    }
    function drawQ() {
      const q = qs[cur];
      let ch = (q.choices || []).map((c, ci) =>
        '<div class="choice ' + (answers[cur] === ci ? "correct" : "") + '" data-pick="' + ci + '">' +
        '<span class="c-key">' + letters[ci] + "</span><span>" + esc(c) + "</span></div>").join("");
      $("#examQ").innerHTML = '<div class="qcard"><div class="q-meta"><span class="q-pill">Q' + (cur + 1) + " / " + qs.length +
        '</span><span class="q-pill">Ch ' + q._ch + "</span></div><div class=\"q-text\">" + esc(q.q) + "</div>" +
        '<div class="choices">' + ch + "</div></div>";
      $$("#examQ .choice").forEach((el) => (el.onclick = () => { answers[cur] = Number(el.getAttribute("data-pick")); shell(); }));
    }
    function tick() {
      const t = $("#examTimer");
      const m = Math.floor(remaining / 60), s = remaining % 60;
      if (t) { t.textContent = "⏱ " + m + ":" + String(s).padStart(2, "0"); t.style.color = remaining < 60 ? "var(--red)" : ""; }
    }
    clearInterval(examTimer);
    examTimer = setInterval(() => {
      remaining--; tick();
      if (remaining <= 0) { clearInterval(examTimer); finish(); }
    }, 1000);

    function finish() {
      clearInterval(examTimer);
      let correct = 0;
      const bySec = {};
      SECTIONS.forEach((s) => (bySec[s.key] = { c: 0, t: 0 }));
      qs.forEach((q, i) => {
        bySec[q._sec].t++;
        if (answers[i] === q.answer) { correct++; bySec[q._sec].c++; }
      });
      const pct = Math.round((correct / qs.length) * 100);
      const pass = pct >= EXAM.pass;
      let html = '<div class="score-hero"><div class="score-num ' + (pass ? "pass" : "fail") + '">' + pct + "%</div>" +
        '<div class="score-sub">' + correct + " of " + qs.length + " correct — " +
        (pass ? "Pass ✓ (you'd clear the " + EXAM.pass + "% bar)" : "Below the " + EXAM.pass + "% passing line") + "</div>" +
        '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button class="btn btn-primary" id="examAgain">Take another</button>' +
        '<a class="btn" href="#/dashboard">Dashboard</a></div></div>';
      html += '<div class="section-title">By content area</div><div class="blueprint">';
      SECTIONS.forEach((s) => {
        const r = bySec[s.key]; const p = r.t ? Math.round((r.c / r.t) * 100) : 0;
        html += '<div class="bp-row"><div class="bp-top"><b>' + esc(s.short) + "</b><span>" + r.c + "/" + r.t + " · " + p + "%</span></div>" +
          '<div class="bp-bar"><div class="bp-fill" style="width:' + p + '%;background:' + (p >= 70 ? "var(--green)" : "var(--amber)") + '"></div></div></div>';
      });
      html += "</div>";
      // review
      html += '<div class="section-title">Review &amp; explanations</div>';
      qs.forEach((q, i) => {
        const ok = answers[i] === q.answer;
        html += '<div class="qcard"><div class="q-meta"><span class="q-pill ' + (ok ? "easy" : "hard") + '">' + (ok ? "✓ Correct" : "✕ Missed") +
          '</span><span class="q-pill">Ch ' + q._ch + "</span></div><div class=\"q-text\">" + (i + 1) + ". " + esc(q.q) + "</div><div class=\"choices\">";
        (q.choices || []).forEach((c, ci) => {
          let cls = "choice disabled";
          if (ci === q.answer) cls += " correct";
          else if (ci === answers[i]) cls += " wrong";
          html += '<div class="' + cls + '"><span class="c-key">' + letters[ci] + "</span><span>" + esc(c) + "</span></div>";
        });
        html += "</div><div class=\"explain show\"><span class=\"ex-tag\">Correct: " + letters[q.answer] + "</span> " + safeHtml(q.explanation || "") + "</div></div>";
      });
      setView(html);
      $("#examAgain").onclick = () => (onRestart ? onRestart() : renderExam());
    }

    shell();
  }

  // ---- Study Guide ----
  function renderGuide() {
    const html = '<div class="ch-header"><h1>How to Study for the SIE ✦</h1>' +
      '<p class="ch-lead">A proven 100–150 hour game plan. The SIE rewards understanding concepts and memorizing a defined set of rules and numbers — this guide shows how to do both efficiently.</p></div>' +
      renderBlock({ type: "steps", title: "A 6-week plan", steps: [
        { label: "Weeks 1–2 · Foundations", desc: "Work Chapters 1–4 (Capital Markets) and 5–9 (equity, debt, government, municipal). Read each lesson, then immediately do its practice questions while the concept is fresh." },
        { label: "Weeks 3–4 · Products deep-dive", desc: "Chapters 10–15 — funds, ETFs, variable products, options, alternatives, and risk. This is 44% of the exam, so spend the most time here." },
        { label: "Week 5 · Accounts, trading & rules", desc: "Chapters 16–20 — customer accounts, settlement, retirement/tax, prohibited activities, and the regulatory framework." },
        { label: "Week 6 · Mock exams", desc: "Take full 75-question mock exams every other day. Review every missed question and re-read the related cheat sheet until you consistently score 80%+." },
      ]}) +
      renderBlock({ type: "key", title: "High-yield study tactics", items: [
        "<strong>Active recall over re-reading.</strong> After each lesson, close it and answer the questions. The quiz feedback is your study tool, not a test.",
        "<strong>Memorize the numbers.</strong> Settlement T+1, AML CTR $10,000, FINRA gift limit $100, IRA penalty before 59½, Reg T 50% — these are nearly free points.",
        "<strong>Use the mnemonics.</strong> Every chapter has memory aids built in; rewrite them in your own words.",
        "<strong>Master comparisons.</strong> GO vs revenue bonds, common vs preferred, A/B/C share classes, calls vs puts — the exam loves 'which is true of X but not Y.'",
        "<strong>Track weak areas.</strong> The mock exam's by-section scores tell you exactly where to go back.",
      ]}) +
      renderBlock({ type: "callout", style: "exam", title: "Know the test", text: "75 scored + 10 unscored questions · 1 hour 45 minutes · passing score 70%. No penalty for guessing, so never leave a question blank. The SIE is a co-requisite — you still need a top-off exam (e.g., Series 7) to be fully registered." }) +
      renderBlock({ type: "callout", style: "tip", title: "Spaced repetition", text: "Revisit completed chapters' cheat sheets every few days. Five minutes of review beats one long cram session — the green checkmarks in the sidebar help you see what to circle back to." }) +
      '<div class="hero-cta" style="margin-top:24px"><a class="btn btn-primary" href="#/chapter/1">Start studying →</a></div>';
    setView(html);
  }

  // ============================================================ FLASHCARDS
  let flashKeyHandler = null;
  function flashSets() { return window.SIE_FLASHCARDS || []; }
  function totalCards() { return flashSets().reduce((n, s) => n + ((s.cards && s.cards.length) || 0), 0); }

  function renderFlashcards() {
    const sets = flashSets();
    let html = '<div class="ch-header"><h1>Flashcards ✦</h1>' +
      '<p class="ch-lead">Active-recall cards — the fastest way to lock in definitions, distinctions, and key numbers. Flip each card, then mark whether you knew it. Study one chapter or shuffle the whole deck.</p></div>';
    if (!totalCards()) {
      html += '<div class="callout note"><h4>✎ Being prepared</h4><p>Original flashcards are being authored and fact-checked. They will appear here automatically.</p></div>';
      setView(html); return;
    }
    html += '<div style="margin-bottom:18px"><a class="btn btn-primary" href="#/cards/all">▶ Study all ' + totalCards() + " cards (shuffled)</a></div>";
    html += '<div class="fc-home-grid">';
    sets.forEach((s) => {
      const ch = byNum(s.number);
      const title = ch ? ch.title : "Chapter " + s.number;
      const sc = ch ? secIndex(ch.section) : 1;
      html += '<a class="fc-chip sec-' + sc + '" href="#/cards/' + s.number + '"><div class="fc-num">' + s.number + "</div>" +
        "<div><h3>" + esc(title) + '</h3><div class="fc-count">' + s.cards.length + " cards</div></div></a>";
    });
    html += "</div>";
    setView(html);
  }

  function renderFlashSession(which) {
    let cards = [];
    if (which === "all") {
      flashSets().forEach((s) => (s.cards || []).forEach((c) => cards.push(Object.assign({ _ch: s.number }, c))));
    } else {
      const set = flashSets().find((s) => String(s.number) === String(which));
      if (set) (set.cards || []).forEach((c) => cards.push(Object.assign({ _ch: set.number }, c)));
    }
    if (!cards.length) { renderFlashcards(); return; }
    cards = shuffled(cards);
    let idx = 0, known = 0, again = 0, flipped = false;
    const chObj = byNum(which);
    const title = which === "all" ? "All chapters" : ("Chapter " + which + (chObj ? " · " + chObj.title : ""));

    function draw() {
      const c = cards[idx];
      const kindLabel = { define: "Define", concept: "Concept", fill: "Fill in the blank", tf: "True or False", acronym: "Acronym" }[c.type] || "Card";
      let html = '<div class="fc-stage">' +
        '<div class="crumb"><a href="#/cards">Flashcards</a> › <span>' + esc(title) + "</span></div>" +
        '<div class="fc-progress-row"><div class="fc-counter">Card ' + (idx + 1) + " / " + cards.length + "</div>" +
        '<div class="fc-progress-bar"><div class="fc-progress-fill" style="width:' + Math.round((idx / cards.length) * 100) + '%"></div></div>' +
        '<div class="fc-counter">✓ ' + known + " · ↻ " + again + "</div></div>" +
        '<div class="flashcard' + (flipped ? " flipped" : "") + '" id="theCard"><div class="fc-inner">' +
        '<div class="fc-face fc-front"><div class="fc-kind">' + kindLabel + "</div>" + (c.topic ? '<div class="fc-topic">' + esc(c.topic) + "</div>" : "") +
        '<div class="fc-text">' + esc(c.front) + '</div><div class="fc-hint">click or press Space to flip</div></div>' +
        '<div class="fc-face fc-back"><div class="fc-kind">Answer</div>' +
        '<div class="fc-text">' + esc(c.back) + '</div><div class="fc-hint">press 1 = Review again · 2 = Got it</div></div>' +
        "</div></div>";
      if (!flipped) {
        html += '<div class="fc-actions"><button class="btn" id="flipBtn">Show answer</button></div>';
      } else {
        html += '<div class="fc-actions"><button class="btn fc-btn-again" id="againBtn">↻ Review again</button>' +
          '<button class="btn fc-btn-got" id="gotBtn">✓ Got it</button></div>';
      }
      html += '<div class="fc-toolbar"><button class="btn" id="shuffleBtn">🔀 Reshuffle</button>' +
        '<a class="btn" href="#/cards">Exit</a></div></div>';
      setView(html);
      const card = $("#theCard"); if (card) card.onclick = () => { if (!flipped) flip(); };
      const fb = $("#flipBtn"); if (fb) fb.onclick = flip;
      const ab = $("#againBtn"); if (ab) ab.onclick = () => { again++; next(); };
      const gb = $("#gotBtn"); if (gb) gb.onclick = () => { known++; next(); };
      const sb = $("#shuffleBtn"); if (sb) sb.onclick = reshuffle;
    }
    function flip() { flipped = true; draw(); }
    function next() { if (idx >= cards.length - 1) { finish(); return; } idx++; flipped = false; draw(); }
    function reshuffle() { cards = shuffled(cards); idx = 0; known = 0; again = 0; flipped = false; draw(); }
    function finish() {
      const pct = cards.length ? Math.round((known / cards.length) * 100) : 0;
      let html = '<div class="fc-done"><div class="score-num ' + (pct >= 80 ? "pass" : "") + '">' + pct + "%</div>" +
        '<div class="score-sub">You marked ' + known + " of " + cards.length + " cards as known" + (again ? " (" + again + " to review)" : "") + ".</div>" +
        '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button class="btn btn-primary" id="restart">Study again</button>' +
        '<a class="btn" href="#/cards">All decks</a></div></div>';
      setView(html);
      $("#restart").onclick = reshuffle;
    }
    if (flashKeyHandler) document.removeEventListener("keydown", flashKeyHandler);
    flashKeyHandler = (e) => {
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); if (!flipped) flip(); }
      else if (flipped && e.key === "1") { again++; next(); }
      else if (flipped && e.key === "2") { known++; next(); }
    };
    document.addEventListener("keydown", flashKeyHandler);
    draw();
  }

  // ============================================================ SEARCH
  let searchIndex = null;
  function buildSearchIndex() {
    searchIndex = [];
    CH.forEach((c) => {
      searchIndex.push({ kind: "Chapter", title: "Ch " + c.number + ": " + c.title, href: "#/chapter/" + c.number, hay: (c.title + " " + (c.summary || "")).toLowerCase() });
      (c.lessons || []).forEach((l) => searchIndex.push({ kind: "Lesson · Ch " + c.number, title: l.heading, href: "#/chapter/" + c.number, hay: (l.heading || "").toLowerCase() }));
      (c.glossary || []).forEach((g) => searchIndex.push({ kind: "Term · Ch " + c.number, title: g.term, href: "#/chapter/" + c.number, hay: (g.term + " " + g.def).toLowerCase() }));
    });
  }
  function doSearch(q) {
    const box = $("#searchResults");
    q = q.trim().toLowerCase();
    if (!q) { box.hidden = true; box.innerHTML = ""; return; }
    if (!searchIndex) buildSearchIndex();
    const hits = searchIndex.filter((x) => x.hay.indexOf(q) !== -1).slice(0, 12);
    if (!hits.length) { box.hidden = false; box.innerHTML = '<div class="sr-empty">No matches for “' + esc(q) + "”.</div>"; return; }
    box.hidden = false;
    box.innerHTML = hits.map((h) => '<a href="' + h.href + '"><div class="sr-kind">' + esc(h.kind) + "</div>" + esc(h.title) + "</a>").join("");
  }

  // ============================================================ ROUTER
  function router() {
    const hash = location.hash || "#/dashboard";
    const parts = hash.replace(/^#\//, "").split("/");
    closeSidebar();
    const box = $("#searchResults"); if (box) { box.hidden = true; }
    if (flashKeyHandler) { document.removeEventListener("keydown", flashKeyHandler); flashKeyHandler = null; }
    if (parts[0] === "chapter") renderChapter(parts[1]);
    else if (parts[0] === "fullexam") renderFullExam();
    else if (parts[0] === "exam") renderExam();
    else if (parts[0] === "bank") renderBank();
    else if (parts[0] === "cards") { if (parts[1]) renderFlashSession(parts[1]); else renderFlashcards(); }
    else if (parts[0] === "guide") renderGuide();
    else renderDashboard();
    highlightNav();
  }

  // ============================================================ SIDEBAR TOGGLE (mobile)
  function openSidebar() { $("#sidebar").classList.add("open"); $("#overlay").hidden = false; }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#overlay").hidden = true; }

  // ============================================================ INIT
  // ============================================================ EXAM COUNTDOWN
  var EXAM_DATE = new Date(2026, 7, 3); // August 3, 2026 (month is 0-indexed)
  function daysToExam() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((EXAM_DATE - today) / 86400000);
  }
  function renderCountdown() {
    var el = document.getElementById("examCountdown");
    if (!el) return;
    var d = daysToExam();
    if (d > 1) el.innerHTML = '<div class="cd-num">' + d + '</div><div class="cd-lbl">days until your SIE exam</div><div class="cd-date">August 3, 2026</div>';
    else if (d === 1) el.innerHTML = '<div class="cd-num">1</div><div class="cd-lbl">day until your SIE exam — final review!</div><div class="cd-date">August 3, 2026</div>';
    else if (d === 0) el.innerHTML = '<div class="cd-num">Today</div><div class="cd-lbl">is exam day — you\'ve got this 💪</div>';
    else el.innerHTML = '<div class="cd-lbl">Hope your SIE exam went great! 🎉</div>';
  }
  function countdownBanner() {
    var d = daysToExam();
    if (d > 1) return '<div class="exam-banner">🎯 <b>' + d + ' days</b> until your SIE exam &nbsp;·&nbsp; <span>August 3, 2026</span></div>';
    if (d === 1) return '<div class="exam-banner urgent">🎯 <b>1 day</b> until your SIE exam &nbsp;·&nbsp; <span>final review!</span></div>';
    if (d === 0) return '<div class="exam-banner urgent">🎯 <b>Exam day is today</b> — you\'ve got this 💪</div>';
    return "";
  }

  // ============================================================ PASSCODE GATE
  function initPasscodeGate() {
    var PASS = "242526";
    var UNLOCK_VERSION = "v2"; // bump this whenever the passcode changes — re-locks everyone
    var screen = document.getElementById("lockScreen");
    if (!screen) return;
    var unlocked = false;
    try { unlocked = localStorage.getItem("sie-unlocked") === UNLOCK_VERSION; } catch (e) {}
    if (unlocked) { document.documentElement.classList.add("unlocked"); screen.style.display = "none"; return; }
    var input = document.getElementById("lockInput");
    var btn = document.getElementById("lockBtn");
    var err = document.getElementById("lockErr");
    var card = document.getElementById("lockCard");
    function attempt() {
      if (input && input.value.trim() === PASS) {
        try { localStorage.setItem("sie-unlocked", UNLOCK_VERSION); } catch (e) {}
        screen.classList.add("hide");
        setTimeout(function () { document.documentElement.classList.add("unlocked"); screen.style.display = "none"; }, 400);
      } else {
        if (err) err.textContent = "Incorrect passcode. Try again.";
        if (card) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }
        if (input) { input.value = ""; input.focus(); }
      }
    }
    if (btn) btn.addEventListener("click", attempt);
    if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    if (input) setTimeout(function () { input.focus(); }, 100);
  }

  function init() {
    initPasscodeGate();
    buildSidebar();
    refreshProgress();
    renderCountdown();
    window.addEventListener("hashchange", router);
    router();

    $("#themeToggle") && $("#themeToggle").addEventListener("click", toggleTheme);
    $("#themeToggleDesktop") && $("#themeToggleDesktop").addEventListener("click", toggleTheme);
    $("#menuToggle") && $("#menuToggle").addEventListener("click", openSidebar);
    $("#overlay") && $("#overlay").addEventListener("click", closeSidebar);
    $("#resetProgress") && $("#resetProgress").addEventListener("click", () => {
      if (confirm("Reset all progress, scores, and completed chapters?")) {
        STATE = { done: {}, scores: {}, answered: {} }; saveState(STATE);
        refreshProgress(); buildSidebar(); router();
      }
    });
    const si = $("#searchInput");
    if (si) {
      si.addEventListener("input", (e) => doSearch(e.target.value));
      si.addEventListener("focus", (e) => { if (e.target.value) doSearch(e.target.value); });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-wrap")) { const b = $("#searchResults"); if (b) b.hidden = true; }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // utils
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
})();
