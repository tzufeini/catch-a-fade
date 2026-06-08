from PIL import Image, ImageDraw, ImageFont
import os, textwrap

W, H = 1080, 1350
BG = "#0A0A0A"
BLUE = "#00D4FF"
WHITE = "#FFFFFF"
GRAY = "#666666"
RED = "#FF3366"
GREEN = "#00FF88"
OUT = "/Users/tzufeini/Downloads/Econ Presentation 2/Instagram_Slides/carousel02"
os.makedirs(OUT, exist_ok=True)

def try_font(names, size):
    paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in paths:
        try: return ImageFont.truetype(p, size)
        except: pass
    return ImageFont.load_default()

def draw_slide(slide_num, total, draw, im):
    # Top chrome bar
    draw.rectangle([0, 0, W, 6], fill=BLUE)
    # Chrome row
    tag_font = try_font([], 24)
    draw.text((40, 22), "● AI TOOLS", font=tag_font, fill=BLUE)
    counter_text = f"{slide_num:02d} / {total:02d}"
    draw.text((W - 140, 22), counter_text, font=tag_font, fill=GRAY)

def wrap_draw(draw, text, x, y, max_w, font, fill, spacing=8):
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        if draw.textlength(test, font=font) <= max_w:
            line.append(w)
        else:
            if line: lines.append(" ".join(line))
            line = [w]
    if line: lines.append(" ".join(line))
    for l in lines:
        draw.text((x, y), l, font=font, fill=fill)
        y += font.size + spacing
    return y

slides = [
    {   # Slide 1 - HOOK
        "label": None,
        "type": "hook",
        "lines": [
            ("YOU'RE", WHITE, 140),
            ("BURNING", BLUE, 140),
            ("CLAUDE", WHITE, 140),
            ("CREDITS", WHITE, 100),
            ("10×", BLUE, 130),
            ("FASTER", WHITE, 100),
            ("THAN YOU", WHITE, 100),
            ("NEED TO.", WHITE, 100),
        ],
        "sub": "The average dev wastes 60% of tokens per session.",
        "ticker": "CLAUDE CODE ▼ 100K tokens/hr avg  ·  MOST WASTED  ·  HERE'S THE FIX",
    },
    {   # Slide 2
        "label": "01 · THE PROBLEM",
        "stat": ("100K", BLUE, 200),
        "stat_sub": "tokens burned per hour",
        "body": "Context window fills. Performance degrades. Your bill spikes.\nAnd you didn't even finish the task.",
        "extra": "50–100K tokens in 1 focused hour of dev work",
    },
    {   # Slide 3
        "label": "02 · FIX #1",
        "stat": ("/compact", BLUE, 120),
        "stat_sub": "Run it between phases. Not when you're already broken.",
        "body": "Saves up to 80% of context window\nPerformance stays sharp · Works like a memory wipe + summary",
        "extra": "Also: /clear between unrelated tasks resets everything",
    },
    {   # Slide 4
        "label": "03 · CLAUDE.md RULE",
        "stat": ("200", BLUE, 260),
        "stat_sub": "lines max. That's your limit.",
        "body": "Claude reloads CLAUDE.md on EVERY message.\nA 1,000-line file = 1,000 lines consumed per prompt.\nKeep it tight. Keep it surgical.",
        "extra": "Use it as project memory, not a novel",
    },
    {   # Slide 5
        "label": "04 · CAP YOUR THREADS",
        "stat": ("15–20", BLUE, 200),
        "stat_sub": "messages max per thread",
        "body": "After that — stop. Ask Claude to summarize in 10 bullets.\nPaste into a new chat. Three short sessions = fraction of a marathon.",
        "extra": "3 short chats = 3× cheaper than 1 long one",
    },
    {   # Slide 6
        "label": "05 · BATCH YOUR QUESTIONS",
        "col_left": ("3 SEPARATE\nMESSAGES", "3× full re-read", RED),
        "col_right": ("1 MESSAGE\n3 QUESTIONS", "1 re-read only", GREEN),
        "body": "Every message triggers a full re-read of the conversation.\nBatching is the single easiest win with zero downside.",
        "extra": "Up to 3× token savings. Zero effort.",
    },
    {   # Slide 7
        "label": "06 · FILE HYGIENE",
        "stat": ("60–90%", BLUE, 200),
        "stat_sub": "reduction in Read tool tokens",
        "body": "Never make Claude search for files. Give direct paths.\nUse a read-once hook that blocks redundant re-reads.",
        "extra": "Direct path → Claude reads once. Vague → Claude searches, reads, re-reads",
    },
    {   # Slide 8
        "label": "07 · THE MODEL MATH",
        "tiers": [
            ("HAIKU", "80% of tasks — email, summaries, formatting", "10× cheaper than Opus", GREEN),
            ("SONNET", "15% of tasks — code review, analysis", "", BLUE),
            ("OPUS", "5% of tasks — complex strategy only", "", WHITE),
        ],
        "extra": "Most users run Opus on everything = 10× overspend",
    },
    {   # Slide 9
        "label": "08 · SCHEDULE SMART",
        "stat": ("2–3×", BLUE, 220),
        "stat_sub": "longer sessions off-peak",
        "body": "Peak hours: 8AM–2PM ET weekdays.\nSame queries hit limits faster at peak.\nSchedule heavy work for evenings & weekends.",
        "extra": "Big refactors → Friday night.  Quick edits → anytime.",
    },
    {   # Slide 10 - CTA
        "label": None,
        "type": "cta",
    },
]

for i, s in enumerate(slides):
    im = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)
    draw_slide(i+1, len(slides), draw, im)

    if s.get("type") == "hook":
        y = 110
        for (text, color, size) in s["lines"]:
            f = try_font([], size)
            draw.text((40, y), text, font=f, fill=color)
            y += size + 8
        sub_f = try_font([], 36)
        draw.text((40, y+10), s["sub"], font=sub_f, fill=BLUE)
        # Ticker
        tick_f = try_font([], 26)
        draw.rectangle([0, H-70, W, H], fill="#001A33")
        draw.text((20, H-52), s["ticker"], font=tick_f, fill=BLUE)

    elif s.get("type") == "cta":
        cta_f = try_font([], 160)
        sm_f = try_font([], 36)
        blue_sq = 28
        draw.text((60, 300), "SAVE", font=cta_f, fill=WHITE)
        draw.rectangle([60, 520, 60+blue_sq, 520+blue_sq], fill=BLUE)
        draw.text((110, 500), "SHARE", font=cta_f, fill=WHITE)
        draw.rectangle([60, 720, 60+blue_sq, 720+blue_sq], fill=BLUE)
        draw.text((110, 700), "FOLLOW", font=cta_f, fill=WHITE)
        handle_f = try_font([], 72)
        draw.text((60, 950), "@yourhandle", font=handle_f, fill=BLUE)
        draw.text((60, 1060), "FOR MORE AI HACKS → REAL RESULTS", font=sm_f, fill=GRAY)

    else:
        y = 65
        label_f = try_font([], 28)
        if s.get("label"):
            draw.text((40, y), s["label"], font=label_f, fill=BLUE)
            y += 50

        if s.get("stat"):
            stat_text, stat_color, stat_size = s["stat"]
            stat_f = try_font([], stat_size)
            draw.text((40, y), stat_text, font=stat_f, fill=stat_color)
            y += stat_size + 20
            if s.get("stat_sub"):
                sub_f = try_font([], 44)
                draw.text((40, y), s["stat_sub"], font=sub_f, fill=WHITE)
                y += 60

        elif s.get("col_left"):
            # Two column layout
            col_f = try_font([], 56)
            sm_f2 = try_font([], 30)
            ltext, lsub, lcol = s["col_left"]
            rtext, rsub, rcol = s["col_right"]
            # Left column
            draw.rectangle([40, y, 490, y+280], fill="#1A0A0A")
            draw.text((60, y+20), ltext, font=col_f, fill=lcol)
            draw.text((60, y+160), lsub, font=sm_f2, fill=lcol)
            # Right column
            draw.rectangle([540, y, 1040, y+280], fill="#0A1A0A")
            draw.text((560, y+20), rtext, font=col_f, fill=rcol)
            draw.text((560, y+160), rsub, font=sm_f2, fill=rcol)
            y += 320

        elif s.get("tiers"):
            tier_f = try_font([], 52)
            desc_f = try_font([], 30)
            for (name, desc, note, color) in s["tiers"]:
                draw.rectangle([40, y, W-40, y+110], fill="#111111")
                draw.text((60, y+12), name, font=tier_f, fill=color)
                draw.text((60, y+70), desc, font=desc_f, fill=WHITE)
                y += 130

        if s.get("body"):
            body_f = try_font([], 36)
            by = y + 30
            for line in s["body"].split("\n"):
                draw.text((40, by), line, font=body_f, fill=WHITE)
                by += 48
            y = by

        if s.get("extra"):
            draw.rectangle([40, H-130, W-40, H-50], fill="#0A1A2A")
            extra_f = try_font([], 30)
            draw.text((60, H-110), s["extra"], font=extra_f, fill=BLUE)

        # Swipe arrow
        if i < len(slides)-1:
            arr_f = try_font([], 34)
            draw.text((W-160, H-60), "SWIPE →", font=arr_f, fill=BLUE)

    path = f"{OUT}/slide_{i+1:02d}.png"
    im.save(path, "PNG")
    print(f"Saved {path}")

print("All 10 slides generated!")
