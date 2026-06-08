from PIL import Image, ImageDraw, ImageFont
import os

# ── Canvas & Palette ──────────────────────────────────────────────────────────
W, H        = 1080, 1350
PAD         = 50
HEADER_H    = 70
FOOTER_H    = 90
CONTENT_Y   = HEADER_H + 20
CONTENT_BOT = H - FOOTER_H - 20

BG      = "#0A0800"
GOLD    = "#FFD60A"
RED     = "#FF4444"
WHITE   = "#FFFFFF"
GRAY    = "#888888"
GREEN   = "#00CC66"
DARK    = "#1A1400"
DGOLD   = "#2A2000"

OUT = "/Users/tzufeini/Downloads/Econ Presentation 2/Instagram_Slides/carousel04"
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

def draw_chrome(draw, num, total, ticker=""):
    draw.rectangle([0, 0, W, 6], fill=GOLD)
    f = font(26)
    draw.text((PAD, 20), "● ECONOMICS", font=f, fill=GOLD)
    counter = f"{num:02d} / {total:02d}"
    draw.text((W - PAD - tw(draw, counter, f), 20), counter, font=f, fill=GRAY)
    if ticker:
        draw.rectangle([0, H - FOOTER_H, W, H], fill="#1A1000")
        draw.text((PAD, H - FOOTER_H + 18), ticker, font=font(24), fill=GOLD)

def swipe(draw, num, total):
    if num < total:
        f = font(26)
        draw.text((W - PAD - tw(draw, "SWIPE →", f), H - FOOTER_H - 36), "SWIPE →", font=f, fill=GOLD)

def pill(draw, text, y, bg="#1A1200", fg=GOLD):
    f = font(28)
    lines = wrap(draw, text, f, W - PAD * 2 - 40)
    box_h = 28 + len(lines) * 40
    py = min(y, CONTENT_BOT - box_h - 10)
    draw.rounded_rectangle([PAD, py, W - PAD, py + box_h], radius=8, fill=bg)
    for i, ln in enumerate(lines):
        draw.text((PAD + 20, py + 14 + i * 40), ln, font=f, fill=fg)

def divider(draw, y):
    draw.rectangle([PAD, y, W - PAD, y + 3], fill=GOLD)
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
TICKER = "US TARIFFS  ▲  145% on China  ·  25% on cars  ·  $2,000/yr household cost  ·  LARGEST SINCE 1930"

slides = [

    # 1 – HOOK
    {
        "type": "hook",
        "lines": [
            ("YOU'RE",      WHITE, 100),
            ("PAYING A",    WHITE, 90),
            ("HIDDEN",      GOLD,  130),
            ("TAX.",        WHITE, 130),
        ],
        "sub1": "Every tariff is a tax on American consumers — not on foreign countries.",
        "sub2": "Here's what the data actually shows.",
        "ticker": TICKER,
    },

    # 2 – HOW TARIFFS WORK
    {
        "type": "explainer",
        "label": "01 · HOW TARIFFS ACTUALLY WORK",
        "points": [
            ("What is a tariff?", "A tax on imported goods — collected by US Customs from US importers", GOLD),
            ("Who pays it?", "The US importer pays the tax, then passes the cost to consumers", RED),
            ("NOT a foreign tax", "China does NOT pay US tariffs. Americans do. Full stop.", WHITE),
            ("Purpose", "Protect domestic industry, generate revenue, apply trade pressure", GRAY),
        ],
        "pill_text": "IMF 2019: 'The full cost of US tariffs was borne by US consumers and firms'",
    },

    # 3 – CURRENT RATES
    {
        "type": "bars",
        "label": "02 · CURRENT US TARIFF RATES (2025)",
        "bars": [
            ("China — most goods",       145, RED),
            ("China — select exemptions", 20, RED),
            ("EU — steel & aluminum",     25, GOLD),
            ("Imported automobiles",       25, GOLD),
            ("Canada & Mexico (some)",     25, GOLD),
            ("Global avg pre-2018",         2, GREEN),
        ],
        "max_val": 160,
        "note": "Rate as % of import value",
        "pill_text": "US average effective tariff rate: 2.4% (2017) → 17%+ (2025)",
    },

    # 4 – HOUSEHOLD COST
    {
        "type": "stat",
        "label": "03 · WHAT IT COSTS YOUR HOUSEHOLD",
        "big": "$2,000",
        "big_color": RED,
        "big_size": 150,
        "sub": "extra per year for the average US household",
        "body": "Yale Budget Lab (2025): $1,900–$2,100 annual cost per household.\nLow-income families hit hardest — spend higher % on affected goods.\nFood, electronics, clothing, cars: all impacted.\nCumulative since 2018: estimated $500B+ in consumer costs.",
        "pill_text": "Peterson Institute: tariffs act as a $79B/yr US consumer tax",
    },

    # 5 – PRICE EXAMPLES
    {
        "type": "items",
        "label": "04 · REAL PRICE HIKES FROM TARIFFS",
        "items": [
            ("🚗  New Car",           "+$3,500–$5,000", RED),
            ("📱  Smartphone",        "+$100–$200",      GOLD),
            ("👖  Clothing item",     "+$10–$25",        GOLD),
            ("🖥️  TV / Electronics", "+$100–$400",      GOLD),
            ("🏠  Home appliance",   "+$86–$300",       GOLD),
            ("🌽  Groceries (avg)",   "+$100–$150/yr",   GRAY),
        ],
        "pill_text": "Tariffs on steel raised washing machine prices $86 each (NBER 2019)",
    },

    # 6 – JOBS MATH
    {
        "type": "cols",
        "label": "05 · THE JOBS MATH",
        "col_left":  ("1,700", "steel jobs\nsaved", GREEN),
        "col_right": ("75,000", "manufacturing\njobs lost", RED),
        "body": "Steel tariffs protected upstream jobs — but downstream\nmanufacturers (autos, appliances) paid more for inputs and cut jobs.\nNet US job loss: tens of thousands.",
        "pill_text": "Trade Partnership (2020): steel tariffs cost 75K US jobs downstream",
    },

    # 7 – GDP IMPACT
    {
        "type": "stat",
        "label": "06 · THE GDP DAMAGE",
        "big": "-1%",
        "big_color": RED,
        "big_size": 200,
        "sub": "estimated US GDP reduction from full tariff regime",
        "body": "IMF World Economic Outlook 2025 baseline estimate.\nGlobal GDP hit: up to -0.5% if trade war escalates.\nUS exports also fell: China retaliated on soybeans, pork, autos.\nUS farm bailouts: $23 billion in 2018–2019 to offset ag losses.",
        "pill_text": "Retaliation cost US farmers $27B in exports (USDA 2019)",
    },

    # 8 – HISTORY LESSON
    {
        "type": "stat",
        "label": "07 · THE LAST TIME WE DID THIS",
        "big": "1930",
        "big_color": GOLD,
        "big_size": 190,
        "sub": "Smoot-Hawley Tariff Act — the cautionary tale",
        "body": "US raised tariffs to 45–50% avg on 20,000+ goods.\n60+ countries retaliated immediately.\nUS imports fell 66%. US exports fell 61%.\nWidely cited as deepening the Great Depression.\nGDP fell 26.7% from 1929–1933.",
        "pill_text": "History rhymes: every major tariff escalation triggered retaliation",
    },

    # 9 – WHAT ACTUALLY HELPS
    {
        "type": "explainer",
        "label": "08 · WHAT ECONOMISTS SAY WORKS",
        "points": [
            ("Targeted industrial policy", "Subsidize domestic production directly — no consumer tax", GREEN),
            ("Trade agreements", "Lower barriers mutually — proven to raise real wages", GREEN),
            ("Workforce retraining", "Address job displacement without raising consumer prices", GOLD),
            ("Currency policy", "Exchange rate adjustments can correct trade imbalances", GOLD),
        ],
        "pill_text": "Consensus: tariffs work as leverage — not as permanent economic policy",
    },

    # 10 – CTA
    {"type": "cta"},
]

TOTAL = len(slides)

for idx, s in enumerate(slides):
    n = idx + 1
    im   = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)
    draw_chrome(draw, n, TOTAL, s.get("ticker", ""))
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
            draw.text((PAD, y), s["label"], font=lf, fill=GOLD)
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
        draw.text((PAD, y), s["label"], font=lf, fill=GOLD)
        y += th(draw, s["label"], lf) + 10
        nf = font(24)
        draw.text((PAD, y), s["note"], font=nf, fill=GRAY)
        y += th(draw, s["note"], nf) + 20

        BAR_MAX = W - PAD * 2 - 90
        MAX_VAL = s.get("max_val", 160)
        for name, val, color in s["bars"]:
            bar_w = max(int(BAR_MAX * val / MAX_VAL), 8)
            bf2 = font(28)
            draw.text((PAD, y), name, font=bf2, fill=WHITE)
            y += th(draw, name, bf2) + 6
            draw.rounded_rectangle([PAD, y, PAD + bar_w, y + 36], radius=6, fill=color)
            pct_text = f"{val}%"
            draw.text((PAD + bar_w + 10, y + 6), pct_text, font=bf2, fill=color)
            y += 50
        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── ITEMS ─────────────────────────────────────────────────────────────────
    elif t == "items":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=GOLD)
        y += th(draw, s["label"], lf) + 20

        for item, price, color in s["items"]:
            nf2 = font(34)
            pf  = font(38)
            draw.rounded_rectangle([PAD, y, W - PAD, y + 80], radius=8, fill=DARK)
            draw.text((PAD + 20, y + 10), item, font=nf2, fill=WHITE)
            pw = tw(draw, price, pf)
            draw.text((W - PAD - pw - 20, y + 16), price, font=pf, fill=color)
            y += 92

        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── EXPLAINER ─────────────────────────────────────────────────────────────
    elif t == "explainer":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=GOLD)
        y += th(draw, s["label"], lf) + 20

        for title, desc, color in s["points"]:
            tf2 = font(36)
            df  = font(28)
            draw.rounded_rectangle([PAD, y, W - PAD, y + 108], radius=8, fill=DARK)
            draw.rectangle([PAD, y, PAD + 6, y + 108], fill=color)
            draw.text((PAD + 20, y + 12), title, font=tf2, fill=color)
            desc_y = y + 12 + th(draw, title, tf2) + 8
            for ln in wrap(draw, desc, df, W - PAD * 2 - 30):
                draw.text((PAD + 20, desc_y), ln, font=df, fill=WHITE)
                desc_y += th(draw, ln, df) + 6
            y += 122

        if s.get("pill_text"):
            pill(draw, s["pill_text"], y + 10)

    # ── COLS ──────────────────────────────────────────────────────────────────
    elif t == "cols":
        y = CONTENT_Y
        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=GOLD)
        y += th(draw, s["label"], lf) + 22

        col_w = (W - PAD * 2 - 20) // 2
        mid   = PAD + col_w + 20
        col_h = 260
        h1f = font(72)
        h2f = font(28)

        ltext, lsub, lcol = s["col_left"]
        draw.rounded_rectangle([PAD, y, PAD + col_w, y + col_h], radius=10, fill="#001A08")
        draw.rectangle([PAD, y, PAD + 6, y + col_h], fill=lcol)
        draw.text((PAD + 20, y + 16), ltext, font=h1f, fill=lcol)
        sy = y + 16 + th(draw, ltext, h1f) + 10
        for ln in wrap(draw, lsub, h2f, col_w - 30):
            draw.text((PAD + 20, sy), ln, font=h2f, fill=WHITE)
            sy += th(draw, ln, h2f) + 6

        rtext, rsub, rcol = s["col_right"]
        draw.rounded_rectangle([mid, y, mid + col_w, y + col_h], radius=10, fill="#1A0000")
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
            draw.ellipse([PAD, y + 16, PAD + 22, y + 38], fill=GOLD)
            draw.text((PAD + 40, y), label, font=big, fill=WHITE)
            y += th(draw, label, big) + 10
        y += 30
        draw.rectangle([PAD, y, W - PAD, y + 4], fill=GOLD)
        y += 24
        hf = font(62)
        draw.text((PAD, y), "@boundtobehere", font=hf, fill=GOLD)
        y += th(draw, "@boundtobehere", hf) + 18
        sf = font(36)
        for ln in wrap(draw, "ECONOMICS EXPLAINED — NO SPIN", sf, W - PAD * 2):
            draw.text((PAD, y), ln, font=sf, fill=GRAY)
            y += th(draw, ln, sf) + 8

    path = f"{OUT}/slide_{n:02d}.png"
    im.save(path, "PNG")
    print(f"✓  {path}")

print(f"\nAll {TOTAL} Tariffs slides done ✅")
