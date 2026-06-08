from PIL import Image, ImageDraw, ImageFont
import os

# ── Canvas & Palette ──────────────────────────────────────────────────────────
W, H        = 1080, 1350
PAD         = 50
HEADER_H    = 70
FOOTER_H    = 90
CONTENT_Y   = HEADER_H + 20
CONTENT_BOT = H - FOOTER_H - 20

BG      = "#0D0008"
PINK    = "#FF3366"
GREEN   = "#00FF88"
WHITE   = "#FFFFFF"
GRAY    = "#888888"
YELLOW  = "#FFD700"
DARK    = "#1A0010"
DPINK   = "#3D0018"
DGREEN  = "#003D1A"

OUT = "/Users/tzufeini/Downloads/Econ Presentation 2/Instagram_Slides/carousel03"
os.makedirs(OUT, exist_ok=True)

FONT_PATHS = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
]

def font(size):
    for p in FONT_PATHS:
        try: return ImageFont.truetype(p, size)
        except: pass
    return ImageFont.load_default()

def th(draw, text, fnt):
    bb = draw.textbbox((0, 0), text, font=fnt)
    return bb[3] - bb[1]

def tw(draw, text, fnt):
    bb = draw.textbbox((0, 0), text, font=fnt)
    return bb[2] - bb[0]

def wrap(draw, text, fnt, max_w):
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        if tw(draw, test, fnt) <= max_w:
            line.append(w)
        else:
            if line: lines.append(" ".join(line))
            line = [w]
    if line: lines.append(" ".join(line))
    return lines

def draw_chrome(draw, num, total, accent=PINK, ticker=""):
    draw.rectangle([0, 0, W, 6], fill=accent)
    f = font(26)
    draw.text((PAD, 20), "● HEALTH & SCIENCE", font=f, fill=accent)
    counter = f"{num:02d} / {total:02d}"
    draw.text((W - PAD - tw(draw, counter, f), 20), counter, font=f, fill=GRAY)
    if ticker:
        draw.rectangle([0, H - FOOTER_H, W, H], fill="#1A0010")
        draw.text((PAD, H - FOOTER_H + 18), ticker, font=font(24), fill=accent)

def swipe(draw, num, total):
    if num < total:
        f = font(26)
        draw.text((W - PAD - tw(draw, "SWIPE →", f), H - FOOTER_H - 36), "SWIPE →", font=f, fill=PINK)

def pill(draw, text, y, bg="#2A0010", fg=PINK):
    f = font(28)
    lines = wrap(draw, text, f, W - PAD * 2 - 40)
    box_h = 28 + len(lines) * 40
    py = min(y, CONTENT_BOT - box_h - 10)
    draw.rounded_rectangle([PAD, py, W - PAD, py + box_h], radius=8, fill=bg)
    for i, ln in enumerate(lines):
        draw.text((PAD + 20, py + 14 + i * 40), ln, font=f, fill=fg)

def divider(draw, y, color=PINK):
    draw.rectangle([PAD, y, W - PAD, y + 3], fill=color)
    return y + 20

def body_block(draw, text, y, size=34, color=WHITE):
    f = font(size)
    for para in text.split("\n"):
        for ln in wrap(draw, para, f, W - PAD * 2):
            draw.text((PAD, y), ln, font=f, fill=color)
            y += th(draw, ln, f) + 10
        y += 6
    return y

# ── Slides ────────────────────────────────────────────────────────────────────
TICKER = "OZEMPIC  ▼  15% avg weight loss  ·  $1,200/mo  ·  40% off-label  ·  THE REAL DATA"

slides = [

    # 1 – HOOK
    {
        "type": "hook",
        "lines": [
            ("THE DRUG",      WHITE, 110),
            ("THAT'S",        WHITE, 90),
            ("CHANGING",      PINK,  120),
            ("EVERYTHING.",   WHITE, 90),
        ],
        "sub1": "Ozempic & GLP-1s are rewriting medicine.",
        "sub2": "Here's what the clinical data actually says.",
        "ticker": TICKER,
    },

    # 2 – WHAT IS IT
    {
        "type": "explainer",
        "label": "01 · WHAT IS SEMAGLUTIDE?",
        "points": [
            ("GLP-1 Receptor Agonist", "Mimics a gut hormone that regulates hunger & blood sugar", PINK),
            ("Originally for Type 2 Diabetes", "FDA approved 2017 (Ozempic) · 2021 for obesity (Wegovy)", WHITE),
            ("Weekly injection", "0.25 mg → 2.4 mg dose over 16–20 weeks", GRAY),
            ("Mechanism", "Slows gastric emptying, suppresses appetite, lowers glucose", WHITE),
        ],
        "pill_text": "Same drug · Different dose · Different brand name · Same results",
    },

    # 3 – CLINICAL DATA
    {
        "type": "stat",
        "label": "02 · THE CLINICAL TRIAL RESULTS",
        "big": "15%",
        "big_color": PINK,
        "big_size": 200,
        "sub": "average body weight lost — STEP 1 Trial (2021)",
        "body": "1,961 participants over 68 weeks.\nPlacebo group lost just 2.4%.\nTop performers lost 20%+ of body weight.",
        "pill_text": "NEJM 2021: Largest weight-loss drug trial in history at the time",
    },

    # 4 – DRUG COMPARISON
    {
        "type": "bars",
        "label": "03 · VS OTHER WEIGHT-LOSS DRUGS",
        "bars": [
            ("Tirzepatide (Mounjaro)", 22, GREEN),
            ("Semaglutide (Ozempic)", 15, PINK),
            ("Phentermine-Topiramate",  9, YELLOW),
            ("Naltrexone-Bupropion",    5, GRAY),
            ("Orlistat",               4, GRAY),
            ("Diet + Exercise alone",  3, GRAY),
        ],
        "note": "% average body weight lost in clinical trials",
        "pill_text": "Tirzepatide is the new leader — Phase 3 SURMOUNT trial, 2022",
    },

    # 5 – SIDE EFFECTS
    {
        "type": "stat",
        "label": "04 · SIDE EFFECTS — THE REAL NUMBERS",
        "big": "44%",
        "big_color": YELLOW,
        "big_size": 180,
        "sub": "of patients experience nausea",
        "body": "Vomiting: 24%  ·  Diarrhea: 30%  ·  Constipation: 24%\nPancreatitis risk: rare but real — 0.1% incidence.\nThyroid C-cell tumors: seen in rodents, unconfirmed in humans.\nMost GI side effects fade within 4–8 weeks.",
        "pill_text": "Serious adverse events: 9.8% Ozempic vs 6.4% placebo (STEP 1)",
    },

    # 6 – COST CRISIS
    {
        "type": "cols",
        "label": "05 · THE COST PROBLEM",
        "col_left":  ("$1,200", "per month\nwithout insurance", PINK),
        "col_right": ("$50", "per month\nin other countries", GREEN),
        "body": "Same drug. 24× cheaper abroad.\nUS Medicare covers Wegovy for heart disease only.\nOnly ~35% of insured Americans get coverage for weight loss.",
        "pill_text": "Annual US cost: $14,400 · Annual Denmark cost: ~$600",
    },

    # 7 – WHO'S USING IT
    {
        "type": "stat",
        "label": "06 · WHO'S ACTUALLY USING IT",
        "big": "40%",
        "big_color": PINK,
        "big_size": 190,
        "sub": "of prescriptions are off-label (not for diabetes)",
        "body": "12 million Americans prescribed GLP-1s in 2023.\nPrescriptions grew 300% from 2020–2023.\nDrug shortages hit in 2022 — diabetic patients lost access.\nCelebrities drove awareness: usage spiked 40% after media coverage.",
        "pill_text": "FDA issued shortage notice 2022–2024 due to demand surge",
    },

    # 8 – THE REBOUND PROBLEM
    {
        "type": "stat",
        "label": "07 · THE REBOUND REALITY",
        "big": "2/3",
        "big_color": YELLOW,
        "big_size": 190,
        "sub": "of lost weight returns within 1 year of stopping",
        "body": "STEP 4 trial (2022): Patients who stopped Ozempic\nregained 66% of lost weight within 52 weeks.\nHunger hormones return to baseline immediately.\nThis is a chronic treatment — not a short-term fix.",
        "pill_text": "NEJM 2022: GLP-1 drugs may need to be taken indefinitely",
    },

    # 9 – WHAT'S NEXT
    {
        "type": "explainer",
        "label": "08 · WHAT'S COMING NEXT",
        "points": [
            ("Oral Semaglutide", "Rybelsus pill — daily tablet, 50 mg dose approved 2023", GREEN),
            ("Triple Agonists", "GLP-1 + GIP + Glucagon — targeting 25%+ weight loss", PINK),
            ("Alzheimer's Research", "GLP-1s showing promise in early cognitive decline trials", YELLOW),
            ("Generic Timeline", "Patent expires 2032 — generics could cut cost to <$100/mo", WHITE),
        ],
        "pill_text": "Novo Nordisk & Eli Lilly combined now worth more than Germany's GDP",
    },

    # 10 – CTA
    {"type": "cta"},
]

TOTAL = len(slides)

for idx, s in enumerate(slides):
    n = idx + 1
    im   = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)
    draw_chrome(draw, n, TOTAL, PINK, s.get("ticker", ""))
    swipe(draw, n, TOTAL)
    t = s.get("type")

    # ── HOOK ──────────────────────────────────────────────────────────────────
    if t == "hook":
        y = CONTENT_Y + 10
        for text, color, size in s["lines"]:
            f = font(size)
            draw.text((PAD, y), text, font=f, fill=color)
            y += th(draw, text, f) + 12
        y += 14
        sf = font(36)
        for ln in wrap(draw, s["sub1"], sf, W - PAD * 2):
            draw.text((PAD, y), ln, font=sf, fill=WHITE)
            y += th(draw, ln, sf) + 8
        y += 10
        sf2 = font(30)
        for ln in wrap(draw, s["sub2"], sf2, W - PAD * 2):
            draw.text((PAD, y), ln, font=sf2, fill=GRAY)
            y += th(draw, ln, sf2) + 8

    # ── STAT ──────────────────────────────────────────────────────────────────
    elif t == "stat":
        y = CONTENT_Y
        if s.get("label"):
            lf = font(28)
            draw.text((PAD, y), s["label"], font=lf, fill=PINK)
            y += th(draw, s["label"], lf) + 22
        bf = font(s["big_size"])
        draw.text((PAD, y), s["big"], font=bf, fill=s["big_color"])
        y += th(draw, s["big"], bf) + 14
        if s.get("sub"):
            sf = font(38)
            for ln in wrap(draw, s["sub"], sf, W - PAD * 2):
                draw.text((PAD, y), ln, font=sf, fill=WHITE)
                y += th(draw, ln, sf) + 8
            y += 12
        y = divider(draw, y)
        if s.get("body"):
            y = body_block(draw, s["body"], y)
        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 16)

    # ── BARS ──────────────────────────────────────────────────────────────────
    elif t == "bars":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=PINK)
        y += th(draw, s["label"], lf) + 10
        nf = font(24)
        draw.text((PAD, y), s["note"], font=nf, fill=GRAY)
        y += th(draw, s["note"], nf) + 20

        BAR_MAX = W - PAD * 2 - 80
        MAX_VAL = 25
        for name, val, color in s["bars"]:
            bar_w = int(BAR_MAX * val / MAX_VAL)
            bf2 = font(28)
            draw.text((PAD, y), name, font=bf2, fill=WHITE)
            y += th(draw, name, bf2) + 6
            draw.rounded_rectangle([PAD, y, PAD + bar_w, y + 36], radius=6, fill=color)
            pct_text = f"{val}%"
            draw.text((PAD + bar_w + 10, y + 6), pct_text, font=bf2, fill=color)
            y += 50

        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── EXPLAINER ─────────────────────────────────────────────────────────────
    elif t == "explainer":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=PINK)
        y += th(draw, s["label"], lf) + 20

        for title, desc, color in s["points"]:
            tf2 = font(38)
            df  = font(28)
            draw.rounded_rectangle([PAD, y, W - PAD, y + 112], radius=8, fill=DARK)
            draw.rectangle([PAD, y, PAD + 6, y + 112], fill=color)
            draw.text((PAD + 20, y + 12), title, font=tf2, fill=color)
            desc_y = y + 12 + th(draw, title, tf2) + 8
            for ln in wrap(draw, desc, df, W - PAD * 2 - 30):
                draw.text((PAD + 20, desc_y), ln, font=df, fill=WHITE)
                desc_y += th(draw, ln, df) + 6
            y += 126

        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── COLS ──────────────────────────────────────────────────────────────────
    elif t == "cols":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=PINK)
        y += th(draw, s["label"], lf) + 22

        col_w = (W - PAD * 2 - 20) // 2
        mid   = PAD + col_w + 20
        col_h = 260

        ltext, lsub, lcol = s["col_left"]
        draw.rounded_rectangle([PAD, y, PAD + col_w, y + col_h], radius=10, fill=DPINK)
        draw.rectangle([PAD, y, PAD + 6, y + col_h], fill=lcol)
        h1f = font(72)
        h2f = font(28)
        draw.text((PAD + 20, y + 16), ltext, font=h1f, fill=lcol)
        sy = y + 16 + th(draw, ltext, h1f) + 10
        for ln in wrap(draw, lsub, h2f, col_w - 30):
            draw.text((PAD + 20, sy), ln, font=h2f, fill=WHITE)
            sy += th(draw, ln, h2f) + 6

        rtext, rsub, rcol = s["col_right"]
        draw.rounded_rectangle([mid, y, mid + col_w, y + col_h], radius=10, fill=DGREEN)
        draw.rectangle([mid, y, mid + 6, y + col_h], fill=rcol)
        draw.text((mid + 20, y + 16), rtext, font=h1f, fill=rcol)
        sy = y + 16 + th(draw, rtext, h1f) + 10
        for ln in wrap(draw, rsub, h2f, col_w - 30):
            draw.text((mid + 20, sy), ln, font=h2f, fill=WHITE)
            sy += th(draw, ln, h2f) + 6

        y += col_h + 24
        y = divider(draw, y)
        y = body_block(draw, s["body"], y, size=32)
        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── CTA ───────────────────────────────────────────────────────────────────
    elif t == "cta":
        y = CONTENT_Y + 60
        big = font(140)
        for label in ["SAVE", "SHARE", "FOLLOW"]:
            draw.ellipse([PAD, y + 16, PAD + 22, y + 38], fill=PINK)
            draw.text((PAD + 40, y), label, font=big, fill=WHITE)
            y += th(draw, label, big) + 10
        y += 30
        draw.rectangle([PAD, y, W - PAD, y + 4], fill=PINK)
        y += 24
        hf = font(62)
        draw.text((PAD, y), "@boundtobehere", font=hf, fill=PINK)
        y += th(draw, "@boundtobehere", hf) + 18
        sf = font(36)
        for ln in wrap(draw, "HEALTH DATA THAT ACTUALLY MATTERS", sf, W - PAD * 2):
            draw.text((PAD, y), ln, font=sf, fill=GRAY)
            y += th(draw, ln, sf) + 8

    path = f"{OUT}/slide_{n:02d}.png"
    im.save(path, "PNG")
    print(f"✓  {path}")

print(f"\nAll {TOTAL} Ozempic slides done ✅")
