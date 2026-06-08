from PIL import Image, ImageDraw, ImageFont
import os, textwrap

# ── Canvas & Palette ──────────────────────────────────────────────────────────
W, H        = 1080, 1350
PAD         = 50           # horizontal padding
HEADER_H    = 70           # top chrome bar height
FOOTER_H    = 90           # bottom ticker/footer height
CONTENT_Y   = HEADER_H + 20       # content starts here
CONTENT_BOT = H - FOOTER_H - 20   # content ends here
CONTENT_H   = CONTENT_BOT - CONTENT_Y  # ~1170 px of usable space

BG    = "#0A0A0A"
BLUE  = "#00D4FF"
WHITE = "#FFFFFF"
GRAY  = "#888888"
RED   = "#FF4466"
GREEN = "#00FF88"
DARK  = "#111111"

OUT = "/Users/tzufeini/Downloads/Econ Presentation 2/Instagram_Slides/carousel02"
os.makedirs(OUT, exist_ok=True)

# ── Font helpers ──────────────────────────────────────────────────────────────
FONT_PATHS = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
]

def font(size):
    for p in FONT_PATHS:
        try:
            return ImageFont.truetype(p, size)
        except:
            pass
    return ImageFont.load_default()

def text_h(draw, text, fnt):
    """Actual height of a single line of text."""
    bb = draw.textbbox((0, 0), text, font=fnt)
    return bb[3] - bb[1]

def text_w(draw, text, fnt):
    bb = draw.textbbox((0, 0), text, font=fnt)
    return bb[2] - bb[0]

def wrap_text(draw, text, fnt, max_width):
    """Break text into lines that fit max_width."""
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        if text_w(draw, test, fnt) <= max_width:
            line.append(w)
        else:
            if line:
                lines.append(" ".join(line))
            line = [w]
    if line:
        lines.append(" ".join(line))
    return lines

def draw_text_block(draw, lines_data, start_y, line_gap=12):
    """
    lines_data: list of (text, color, fnt)
    Returns final y after all lines.
    """
    y = start_y
    for text, color, fnt in lines_data:
        wrapped = wrap_text(draw, text, fnt, W - PAD * 2)
        for ln in wrapped:
            draw.text((PAD, y), ln, font=fnt, fill=color)
            y += text_h(draw, ln, fnt) + line_gap
        y += 4  # extra gap between logical lines
    return y

# ── Chrome Header & Footer ────────────────────────────────────────────────────
def draw_chrome(draw, slide_num, total, ticker=""):
    # Accent bar
    draw.rectangle([0, 0, W, 6], fill=BLUE)
    # Tag + counter
    f = font(26)
    draw.text((PAD, 20), "● AI TOOLS", font=f, fill=BLUE)
    counter = f"{slide_num:02d} / {total:02d}"
    cw = text_w(draw, counter, f)
    draw.text((W - PAD - cw, 20), counter, font=f, fill=GRAY)

    if ticker:
        draw.rectangle([0, H - FOOTER_H, W, H], fill="#001830")
        tf = font(24)
        draw.text((PAD, H - FOOTER_H + 18), ticker, font=tf, fill=BLUE)

    # Swipe hint — drawn per slide if needed
    return

def swipe_hint(draw, slide_num, total):
    if slide_num < total:
        f = font(26)
        draw.text((W - PAD - 120, H - FOOTER_H - 36), "SWIPE →", font=f, fill=BLUE)

# ── Slide definitions ─────────────────────────────────────────────────────────
TICKER = "CLAUDE CODE  ▼  100K tokens/hr avg  ·  MOST WASTED  ·  HERE'S THE FIX"

slides = [

    # 1 ─ HOOK ─────────────────────────────────────────────────────────────────
    {
        "type": "hook",
        "lines": [
            ("YOU'RE",      WHITE, 120),
            ("BURNING",     BLUE,  120),
            ("CLAUDE",      WHITE, 100),
            ("CREDITS",     WHITE,  90),
            ("10×",         BLUE,  130),
            ("TOO FAST.",   WHITE,  80),
        ],
        "sub": "The avg dev wastes 60% of tokens per session.",
        "ticker": TICKER,
    },

    # 2 ─ THE PROBLEM ──────────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "01 · THE PROBLEM",
        "big":   "100K",
        "big_color": BLUE,
        "big_size": 180,
        "sub":   "tokens burned per hour",
        "body":  "Context window fills up. Performance tanks.\nYour bill spikes — and you didn't finish the task.",
        "pill":  "50–100K tokens in 1 focused hour of dev work",
    },

    # 3 ─ FIX #1 ───────────────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "02 · FIX #1",
        "big":   "/compact",
        "big_color": BLUE,
        "big_size": 100,
        "sub":   "Run between phases — not when you're broken.",
        "body":  "Saves up to 80% of context window.\nPerformance stays sharp.\nWorks like a memory wipe + summary.",
        "pill":  "Also: /clear between unrelated tasks resets everything",
    },

    # 4 ─ CLAUDE.md RULE ───────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "03 · CLAUDE.md RULE",
        "big":   "200",
        "big_color": BLUE,
        "big_size": 200,
        "sub":   "lines max. That's your hard limit.",
        "body":  "Claude reloads CLAUDE.md on EVERY message.\n1,000-line file = 1,000 lines consumed per prompt.\nKeep it tight. Keep it surgical.",
        "pill":  "Use it as project memory — not a novel",
    },

    # 5 ─ CAP THREADS ──────────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "04 · CAP YOUR THREADS",
        "big":   "15–20",
        "big_color": BLUE,
        "big_size": 160,
        "sub":   "messages max per thread",
        "body":  "After that — stop. Ask Claude to summarize in 10 bullets.\nPaste into a new chat.\n3 short sessions = fraction of a marathon.",
        "pill":  "3 short chats = 3× cheaper than 1 long one",
    },

    # 6 ─ BATCH QUESTIONS ──────────────────────────────────────────────────────
    {
        "type": "cols",
        "label": "05 · BATCH YOUR QUESTIONS",
        "col_left":  ("3 MSGS", "3× full context\nre-read", RED),
        "col_right": ("1 MSG",  "1 re-read only.\n3× savings.", GREEN),
        "body":  "Every message triggers a full re-read.\nBatching is the easiest win with zero downside.",
        "pill":  "Up to 3× token savings. Zero effort.",
    },

    # 7 ─ FILE HYGIENE ─────────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "06 · FILE HYGIENE",
        "big":   "60–90%",
        "big_color": BLUE,
        "big_size": 150,
        "sub":   "reduction in Read tool tokens",
        "body":  "Never make Claude search for files.\nGive direct paths every time.\nUse a read-once hook to block redundant re-reads.",
        "pill":  "Direct path → reads once. Vague → searches & re-reads",
    },

    # 8 ─ MODEL MATH ───────────────────────────────────────────────────────────
    {
        "type": "tiers",
        "label": "07 · THE MODEL MATH",
        "tiers": [
            ("HAIKU",  "80% of tasks — emails, summaries, formatting", "10× cheaper", GREEN),
            ("SONNET", "15% of tasks — code review, analysis",         "",            BLUE),
            ("OPUS",   "5% of tasks — complex strategy only",          "",            WHITE),
        ],
        "pill": "Most users run Opus on everything = 10× overspend",
    },

    # 9 ─ SCHEDULE SMART ───────────────────────────────────────────────────────
    {
        "type": "stat",
        "label": "08 · SCHEDULE SMART",
        "big":   "2–3×",
        "big_color": BLUE,
        "big_size": 180,
        "sub":   "longer sessions off-peak",
        "body":  "Peak hours: 8 AM–2 PM ET weekdays.\nSame queries hit rate limits faster at peak.\nSchedule heavy work for evenings & weekends.",
        "pill":  "Big refactors → Friday night.  Quick edits → anytime.",
    },

    # 10 ─ CTA ─────────────────────────────────────────────────────────────────
    {
        "type": "cta",
    },
]

TOTAL = len(slides)

# ── Render loop ───────────────────────────────────────────────────────────────
for idx, s in enumerate(slides):
    slide_num = idx + 1
    im   = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)

    ticker_text = s.get("ticker", "")
    draw_chrome(draw, slide_num, TOTAL, ticker_text)
    swipe_hint(draw, slide_num, TOTAL)

    t = s.get("type", "stat")

    # ── HOOK ──────────────────────────────────────────────────────────────────
    if t == "hook":
        y = CONTENT_Y + 10
        for text, color, size in s["lines"]:
            f = font(size)
            draw.text((PAD, y), text, font=f, fill=color)
            y += text_h(draw, text, f) + 14
        # Subtitle
        sf = font(34)
        y += 10
        for ln in wrap_text(draw, s["sub"], sf, W - PAD * 2):
            draw.text((PAD, y), ln, font=sf, fill=GRAY)
            y += text_h(draw, ln, sf) + 8

    # ── STAT ──────────────────────────────────────────────────────────────────
    elif t == "stat":
        y = CONTENT_Y

        # Label
        if s.get("label"):
            lf = font(28)
            draw.text((PAD, y), s["label"], font=lf, fill=BLUE)
            y += text_h(draw, s["label"], lf) + 24

        # Big number / word
        bf = font(s["big_size"])
        draw.text((PAD, y), s["big"], font=bf, fill=s["big_color"])
        y += text_h(draw, s["big"], bf) + 16

        # Sub-label
        if s.get("sub"):
            sf = font(40)
            for ln in wrap_text(draw, s["sub"], sf, W - PAD * 2):
                draw.text((PAD, y), ln, font=sf, fill=WHITE)
                y += text_h(draw, ln, sf) + 10
            y += 14

        # Divider
        draw.rectangle([PAD, y, W - PAD, y + 3], fill=BLUE)
        y += 20

        # Body
        if s.get("body"):
            bf2 = font(34)
            for para in s["body"].split("\n"):
                for ln in wrap_text(draw, para, bf2, W - PAD * 2):
                    draw.text((PAD, y), ln, font=bf2, fill=WHITE)
                    y += text_h(draw, ln, bf2) + 10
                y += 6
            y += 10

        # Pill box at bottom
        if s.get("pill"):
            pill_f = font(28)
            pill_y = min(y + 20, CONTENT_BOT - 80)
            draw.rounded_rectangle([PAD, pill_y, W - PAD, pill_y + 66], radius=8, fill="#002244")
            for i, ln in enumerate(wrap_text(draw, s["pill"], pill_f, W - PAD * 2 - 40)):
                draw.text((PAD + 20, pill_y + 12 + i * 36), ln, font=pill_f, fill=BLUE)

    # ── COLS ──────────────────────────────────────────────────────────────────
    elif t == "cols":
        y = CONTENT_Y

        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=BLUE)
        y += text_h(draw, s["label"], lf) + 24

        col_w   = (W - PAD * 2 - 20) // 2   # ~490 px each
        col_h   = 300
        mid     = PAD + col_w + 20

        # Left box
        ltext, lsub, lcol = s["col_left"]
        draw.rounded_rectangle([PAD, y, PAD + col_w, y + col_h], radius=10, fill="#1A0808")
        draw.rectangle([PAD, y, PAD + 6, y + col_h], fill=lcol)
        h1f = font(64)
        h2f = font(28)
        draw.text((PAD + 20, y + 24), ltext, font=h1f, fill=lcol)
        sub_y = y + 24 + text_h(draw, ltext, h1f) + 12
        for ln in wrap_text(draw, lsub, h2f, col_w - 30):
            draw.text((PAD + 20, sub_y), ln, font=h2f, fill=WHITE)
            sub_y += text_h(draw, ln, h2f) + 8

        # Right box
        rtext, rsub, rcol = s["col_right"]
        draw.rounded_rectangle([mid, y, mid + col_w, y + col_h], radius=10, fill="#081A08")
        draw.rectangle([mid, y, mid + 6, y + col_h], fill=rcol)
        draw.text((mid + 20, y + 24), rtext, font=h1f, fill=rcol)
        sub_y = y + 24 + text_h(draw, rtext, h1f) + 12
        for ln in wrap_text(draw, rsub, h2f, col_w - 30):
            draw.text((mid + 20, sub_y), ln, font=h2f, fill=WHITE)
            sub_y += text_h(draw, ln, h2f) + 8

        y += col_h + 30

        # Divider
        draw.rectangle([PAD, y, W - PAD, y + 3], fill=BLUE)
        y += 20

        # Body
        bf2 = font(34)
        for para in s["body"].split("\n"):
            for ln in wrap_text(draw, para, bf2, W - PAD * 2):
                draw.text((PAD, y), ln, font=bf2, fill=WHITE)
                y += text_h(draw, ln, bf2) + 10
            y += 6
        y += 10

        # Pill
        if s.get("pill"):
            pill_f = font(28)
            pill_y = min(y + 10, CONTENT_BOT - 80)
            draw.rounded_rectangle([PAD, pill_y, W - PAD, pill_y + 66], radius=8, fill="#002244")
            for i, ln in enumerate(wrap_text(draw, s["pill"], pill_f, W - PAD * 2 - 40)):
                draw.text((PAD + 20, pill_y + 12 + i * 36), ln, font=pill_f, fill=BLUE)

    # ── TIERS ─────────────────────────────────────────────────────────────────
    elif t == "tiers":
        y = CONTENT_Y

        lf = font(28)
        draw.text((PAD, y), s["label"], font=lf, fill=BLUE)
        y += text_h(draw, s["label"], lf) + 24

        tier_name_f = font(52)
        tier_desc_f = font(30)
        tier_note_f = font(26)

        for name, desc, note, color in s["tiers"]:
            box_h = 150
            draw.rounded_rectangle([PAD, y, W - PAD, y + box_h], radius=8, fill=DARK)
            # Color accent strip on left
            draw.rectangle([PAD, y, PAD + 8, y + box_h], fill=color)
            draw.text((PAD + 24, y + 14), name, font=tier_name_f, fill=color)
            draw.text((PAD + 24, y + 76), desc, font=tier_desc_f, fill=WHITE)
            if note:
                note_w = text_w(draw, note, tier_note_f)
                draw.text((W - PAD - note_w - 16, y + 14), note, font=tier_note_f, fill=color)
            y += box_h + 18

        y += 10

        if s.get("pill"):
            pill_f = font(28)
            pill_y = min(y + 10, CONTENT_BOT - 80)
            draw.rounded_rectangle([PAD, pill_y, W - PAD, pill_y + 66], radius=8, fill="#002244")
            for i, ln in enumerate(wrap_text(draw, s["pill"], pill_f, W - PAD * 2 - 40)):
                draw.text((PAD + 20, pill_y + 12 + i * 36), ln, font=pill_f, fill=BLUE)

    # ── CTA ───────────────────────────────────────────────────────────────────
    elif t == "cta":
        y = CONTENT_Y + 40

        big = font(140)
        sm  = font(38)
        dot = font(30)

        for label in ["SAVE", "SHARE", "FOLLOW"]:
            # Bullet dot
            draw.ellipse([PAD, y + 16, PAD + 22, y + 38], fill=BLUE)
            draw.text((PAD + 40, y), label, font=big, fill=WHITE)
            y += text_h(draw, label, big) + 10

        y += 30
        draw.rectangle([PAD, y, W - PAD, y + 4], fill=BLUE)
        y += 24

        handle_f = font(62)
        draw.text((PAD, y), "@boundtobehere", font=handle_f, fill=BLUE)
        y += text_h(draw, "@boundtobehere", handle_f) + 20

        for ln in wrap_text(draw, "FOR MORE AI HACKS → REAL RESULTS", sm, W - PAD * 2):
            draw.text((PAD, y), ln, font=sm, fill=GRAY)
            y += text_h(draw, ln, sm) + 10

    # ── Save ──────────────────────────────────────────────────────────────────
    path = f"{OUT}/slide_{slide_num:02d}.png"
    im.save(path, "PNG")
    print(f"✓  Saved {path}")

print(f"\nAll {TOTAL} slides generated at {W}×{H} px ✅")
