#!/usr/bin/env python3
"""
Instagram Carousel Slide Generator
Generates 200 branded slides (20 carousels × 10 slides) as 1080×1350 PNGs.

Style: Dark mode, bold sans-serif, category-coded accents, Instagram-native.
"""

import os
import re
import textwrap
from PIL import Image, ImageDraw, ImageFont

# --- CONFIG ---
OUTPUT_DIR = "/Users/tzufeini/Downloads/Econ Presentation 2/Instagram_Slides"
WIDTH, HEIGHT = 1080, 1350
BG = (10, 10, 10)  # #0A0A0A
WHITE = (255, 255, 255)
GRAY = (110, 110, 110)
HANDLE = "@yourhandle"  # placeholder — user will update

# Category -> accent color
COLORS = {
    "finance": (0, 255, 136),      # #00FF88 electric green
    "health":  (255, 214, 10),     # #FFD60A yellow
    "dating":  (255, 51, 102),     # #FF3366 pink/red
    "ai":      (0, 212, 255),      # #00D4FF electric blue
    "money":   (0, 255, 136),
}

# Font paths (macOS system fonts — Helvetica Neue is iconic and always present)
FONT_BOLD = "/System/Library/Fonts/HelveticaNeue.ttc"
FONT_HEAVY = "/System/Library/Fonts/Helvetica.ttc"


def font(size, heavy=False):
    path = FONT_HEAVY if heavy else FONT_BOLD
    try:
        # index 1 is usually Bold; 8 is Black for Helvetica.ttc
        idx = 8 if heavy else 1
        return ImageFont.truetype(path, size, index=idx)
    except Exception:
        return ImageFont.truetype(path, size)


def wrap_text(text, max_chars):
    return textwrap.wrap(text, width=max_chars, break_long_words=False)


def highlight_numbers(draw, x, y, text, f, body_color, accent_color, align="left", max_width=None):
    """Render text, coloring numbers/$/% in accent color."""
    # Tokenize — split on whitespace, keep tokens
    tokens = text.split(" ")
    # Simple: draw line by line, compute widths
    # For multi-line, pre-wrap
    lines = wrap_text(text, 28) if max_width else [text]

    total_h = 0
    for line in lines:
        total_h += f.getbbox(line)[3] - f.getbbox(line)[1] + 20
    start_y = y

    for line in lines:
        # Measure full line width for centering
        line_w = draw.textlength(line, font=f)
        if align == "center":
            cx = (WIDTH - line_w) / 2
        else:
            cx = x

        # Draw token by token
        words = line.split(" ")
        for i, word in enumerate(words):
            is_accent = bool(re.search(r'[\$\d%]', word)) or word.lower() in [
                "peak", "lowest", "highest", "new", "free", "save", "always", "never",
                "out", "in", "wins", "winners", "losers"
            ]
            # Keep original word (with punctuation)
            color = accent_color if is_accent else body_color
            draw.text((cx, start_y), word, fill=color, font=f)
            cx += draw.textlength(word + " ", font=f)
        start_y += f.getbbox(line)[3] - f.getbbox(line)[1] + 20
    return start_y


def draw_slide(idx, total, text, kind, accent, category_label):
    """kind: 'hook' (slide 1), 'body' (2-9), 'cta' (10)"""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Top accent bar
    draw.rectangle([(0, 0), (WIDTH, 10)], fill=accent)

    # Category label top-left
    cat_font = font(28)
    draw.text((60, 45), category_label.upper(), fill=accent, font=cat_font)

    # Slide counter top-right
    counter_font = font(28)
    counter_text = f"{idx}/{total}"
    cw = draw.textlength(counter_text, font=counter_font)
    draw.text((WIDTH - 60 - cw, 45), counter_text, fill=GRAY, font=counter_font)

    # Main content
    if kind == "hook":
        # Giant bold text, wrapped, centered vertically
        lines = wrap_text(text, 18)
        f = font(110, heavy=True)
        line_h = 130
        total_h = len(lines) * line_h
        y = (HEIGHT - total_h) / 2 - 60
        for line in lines:
            lw = draw.textlength(line, font=f)
            x = (WIDTH - lw) / 2
            draw.text((x, y), line, fill=WHITE, font=f)
            y += line_h

        # Accent underline under last bit
        draw.rectangle([(WIDTH/2 - 80, y + 30), (WIDTH/2 + 80, y + 40)], fill=accent)

    elif kind == "body":
        # Parse for emphasis — look for numbers/dollar amounts
        f = font(72, heavy=True)
        lines = wrap_text(text, 22)
        line_h = 92
        total_h = len(lines) * line_h
        y = (HEIGHT - total_h) / 2 - 30

        for line in lines:
            # Draw line with number highlighting
            words = line.split(" ")
            # Measure total width for centering
            total_w = sum(draw.textlength(w + " ", font=f) for w in words) - draw.textlength(" ", font=f)
            x = (WIDTH - total_w) / 2
            for word in words:
                has_num = bool(re.search(r'[\$\d%+\-]', word))
                color = accent if has_num else WHITE
                draw.text((x, y), word, fill=color, font=f)
                x += draw.textlength(word + " ", font=f)
            y += line_h

    elif kind == "cta":
        # Two lines: "SAVE · SHARE · FOLLOW" + @handle
        f1 = font(92, heavy=True)
        f2 = font(64, heavy=True)
        f3 = font(36)

        cta = "SAVE  ·  SHARE"
        lw = draw.textlength(cta, font=f1)
        draw.text(((WIDTH - lw) / 2, HEIGHT / 2 - 180), cta, fill=WHITE, font=f1)

        follow = "FOLLOW"
        lw2 = draw.textlength(follow, font=f1)
        draw.text(((WIDTH - lw2) / 2, HEIGHT / 2 - 70), follow, fill=accent, font=f1)

        handle_w = draw.textlength(HANDLE, font=f2)
        draw.text(((WIDTH - handle_w) / 2, HEIGHT / 2 + 80), HANDLE, fill=WHITE, font=f2)

        sub = "For more news → moves"
        sw = draw.textlength(sub, font=f3)
        draw.text(((WIDTH - sw) / 2, HEIGHT / 2 + 200), sub, fill=GRAY, font=f3)

    # Swipe arrow bottom-right (on slides 1-9)
    if idx < total:
        arrow_font = font(48, heavy=True)
        draw.text((WIDTH - 100, HEIGHT - 100), "→", fill=accent, font=arrow_font)

    # Footer disclaimer for finance / health
    return img


# --- 20 CAROUSELS DATA ---

CAROUSELS = [
    {
        "id": "01_oil_crash",
        "category": "finance",
        "label": "Markets",
        "slides": [
            "OIL JUST CRASHED 8% EVERYONE MISSED THE TRADE",
            "Brent $120 to $94 Iran reopened Hormuz",
            "Wall Street panicked Smart money bought",
            "The play XOM + CVX Permian Basin",
            "Lowest cost per barrel Profitable at $70 or $120",
            "Both raised dividends 4% Beat Q1 earnings",
            "Morgan Stanley Only oil plays you need",
            "If Hormuz flares again +15% in a week",
            "3 to 5 percent of portfolio Hold through Q2",
        ],
    },
    {
        "id": "02_nvidia",
        "category": "finance",
        "label": "AI Stocks",
        "slides": [
            "$78 BILLION IN ONE QUARTER",
            "Nvidia Q1 FY27 guidance +77% YoY",
            "Data center revenue up 75%",
            "AI capex is exploding",
            "AMZN MSFT GOOG META = $700B in 2026",
            "Up 60% from 2025 Every dollar to NVDA",
            "Missed it? NBIS + LRCX",
            "Picks and shovels plays Motley Fool flagged",
            "Next earnings late May Position before",
        ],
    },
    {
        "id": "03_bitcoin",
        "category": "finance",
        "label": "Crypto",
        "slides": [
            "BITCOIN $74,800 HALFWAY THROUGH THE CYCLE",
            "Halving was April 20 2024",
            "Cycles peak 12 to 18 months after halving",
            "We are at month 24",
            "JP Morgan target $150K by year end",
            "BTC hit $126K Oct 2025 dumped to $60K",
            "That was the shakeout",
            "Rules 5% max DCA weekly",
            "Skip altcoins 90% go to zero",
        ],
    },
    {
        "id": "04_gold",
        "category": "finance",
        "label": "Metals",
        "slides": [
            "GOLD HIT $5,589 ALL TIME HIGH",
            "Up 40% YoY Silver up 150%",
            "Too late? No",
            "Goldman $5,400 JPM $6,300 UBS $5,600",
            "BofA silver target $135",
            "20 to 40% upside still",
            "Iran war + central banks + sticky inflation",
            "Skip physical coins Spreads kill you",
            "Buy GLD IAU SLV GDX 5% of portfolio",
        ],
    },
    {
        "id": "05_fed_day",
        "category": "finance",
        "label": "Macro",
        "slides": [
            "FED DAY APRIL 29 3 MOVES TO MAKE NOW",
            "99% of retail is on the wrong side",
            "Rates 3.50 to 3.75% Only 1 cut projected",
            "Powell called oil crisis temporary",
            "Translation higher for longer",
            "Move 1 Cash to HYSA or 3mo T bill 4%+",
            "Move 2 Trim small caps IWM",
            "Move 3 Buy aristocrats JNJ PG KO",
            "Yields beat bonds Save this",
        ],
    },
    {
        "id": "06_tariffs",
        "category": "finance",
        "label": "Policy",
        "slides": [
            "TARIFF PAIN PEAKS APRIL TO OCTOBER",
            "Consumers eat 70% of the cost",
            "+1.2% inflation just from tariffs",
            "LOSERS PG STZ NKE",
            "PG raised prices on 25% of products",
            "Constellation -$20M from aluminum",
            "Nike 40% production overseas",
            "WINNERS NUE CAT TSCO",
            "Domestic steel infrastructure US retail",
        ],
    },
    {
        "id": "07_jawline",
        "category": "health",
        "label": "Looksmaxxing",
        "slides": [
            "MASCULINE JAWLINE +60% ATTRACTION",
            "Frontiers in Psychology 2026",
            "Strong jaws rated most attractive short term",
            "Signals testosterone symmetry health",
            "Build one in 90 days no surgery",
            "1 Get to 12 to 15% body fat",
            "2 Mew daily tongue on roof",
            "3 Cut sodium + alcohol for 2 weeks",
            "4 Jaw exercises Jawzrsize chin tucks",
        ],
    },
    {
        "id": "08_sleep_t",
        "category": "health",
        "label": "Men's Health",
        "slides": [
            "5 HOURS OF SLEEP -15% TESTOSTERONE",
            "Bigger than most TRT doses",
            "1 week of 5 hour nights 10 to 15% T drop",
            "T peaks at 9.9 hours inverted U",
            "Low T = low energy mood muscle libido",
            "1 No screens 90 min before bed",
            "2 Bedroom 65F blackout phone out",
            "3 10 min morning sunlight",
            "4 No alcohol 3 hrs before bed",
        ],
    },
    {
        "id": "09_creatine",
        "category": "health",
        "label": "Nootropics",
        "slides": [
            "CREATINE MAKES YOUR BRAIN WORK BETTER",
            "Not just for muscles Science Direct 2026",
            "Boosts brain energy under cognitive load",
            "Nature 5g dose cognition up when sleep deprived",
            "Meta analysis memory wins in adults",
            "Even early Alzheimer's trials show benefit",
            "Protocol 5g per day monohydrate",
            "No loading phase timing doesn't matter",
            "$15 per month most studied supplement",
        ],
    },
    {
        "id": "10_retinal",
        "category": "health",
        "label": "Skincare",
        "slides": [
            "RETINOL IS OUT RETINAL IS IN",
            "Beats retinol 35% on wrinkles",
            "+25% skin penetration",
            "+22% elasticity vs retinol",
            "Retinal converts in 1 step retinol takes 2",
            "Men's stack under $100",
            "AM Cleanser Vitamin C SPF 50",
            "PM Cleanser Retinal 0.05% Moisturizer",
            "Brands Avene The Ordinary Medik8",
        ],
    },
    {
        "id": "11_cold_plunge",
        "category": "health",
        "label": "Fitness",
        "slides": [
            "ICE BATH AFTER LIFTING KILLS YOUR GAINS",
            "New research blocks satellite cells",
            "Reduces muscle protein synthesis",
            "But cold plunges aren't bad Just timed wrong",
            "Benefits stress down sleep up cardio recovery",
            "2025 PLOS One 3,177 participants",
            "Rule never within 4 to 6 hrs of lifting",
            "Use on cardio rest mornings",
            "Sweet spot 3 min at 50 to 59F",
        ],
    },
    {
        "id": "12_height",
        "category": "dating",
        "label": "Dating Data",
        "slides": [
            "UNDER 6 FEET THE DATING DATA IS BRUTAL",
            "6ft+ men get +23% more Tinder swipes",
            "80% of women prefer taller",
            "57% of women specify height vs 14% of men",
            "Average female minimum 5'10\"",
            "Height matters for SWIPES not in person",
            "Move 1 Get to 10 to 12% body fat",
            "Move 2 Photo angles slim fit vertical",
            "Move 3 Tailored monochrome groomed",
        ],
    },
    {
        "id": "13_eyes",
        "category": "dating",
        "label": "Attraction",
        "slides": [
            "IT'S NOT WHAT YOU THINK WOMEN LOOK AT",
            "Eye tracking study EYES + HAIR first",
            "Not jawline not arms not chest",
            "Eyes = health emotional IQ",
            "Hair = youth testosterone",
            "8 hrs sleep Dark circles tank attraction -20%",
            "Cut sodium 48 hrs before photos",
            "Eye contact 3 sec longer than comfortable",
            "Real barber Min + Fin if thinning",
        ],
    },
    {
        "id": "14_claude_money",
        "category": "ai",
        "label": "AI Money",
        "slides": [
            "CLAUDE 4.6 UNLOCKED $5K PER MONTH",
            "1,000,000 token context window",
            "Dump an entire business in one prompt",
            "3 plays printing money now",
            "1 Contract review $500 per doc",
            "2 Codebase audits $1,000+",
            "3 Content engines $3 to 5K per month",
            "30 days of social in 1 prompt",
            "Setup cost $200 Claude Max sub",
        ],
    },
    {
        "id": "15_lovable",
        "category": "ai",
        "label": "No Code",
        "slides": [
            "LOVABLE HIT $20M ARR IN 2 MONTHS",
            "Fastest growing AI app builder ever",
            "Describe an app in plain English",
            "Database auth payments deployment done",
            "Micro SaaS play",
            "Find industry with a spreadsheet problem",
            "Build app in a weekend for $20",
            "50 customers x $30 = $1,500 MRR per app",
            "Stack 5 niches = $7,500 per month",
        ],
    },
    {
        "id": "16_remote_jobs",
        "category": "money",
        "label": "Career",
        "slides": [
            "$250K REMOTE NO DEGREE HIRING NOW",
            "BLS + ZipRecruiter + FlexJobs data",
            "1 Enterprise sales $300K+ top performers",
            "SDR to AE in 18 months",
            "2 Machine learning engineer $160 to 250K",
            "Bootcamp + GitHub beats CS degree",
            "3 Performance marketing $80 to 200K",
            "Documented results beat a degree",
            "Bonus Customer success $100K easy entry",
        ],
    },
    {
        "id": "17_mortgage",
        "category": "money",
        "label": "Real Estate",
        "slides": [
            "MORTGAGE RATES 6.30% 4 WEEK LOW",
            "Morgan Stanley 5.75% by mid 2026",
            "Lock or wait?",
            "$400K at 6.30% = $2,479 per month",
            "$400K at 5.75% = $2,333 per month",
            "Difference $146 per month",
            "Fannie Mae 5.9% by year end",
            "Lock now + refi later",
            "80% of homeowners sub 5% Not selling",
        ],
    },
    {
        "id": "18_tax_hacks",
        "category": "money",
        "label": "Taxes",
        "slides": [
            "2026 TAX CODE HIDES $10,000 FOR YOU",
            "5 deductions most people miss",
            "1 No tax on tips up to $25K",
            "2 No tax on OT $12.5K single $25K joint",
            "3 Auto loan interest $10K US made",
            "4 HSA $4,400 single $8,750 family",
            "5 Trad IRA $7K by April 15",
            "Triple tax free on HSA",
            "Stacked = $10K+ in savings",
        ],
    },
    {
        "id": "19_coffee",
        "category": "health",
        "label": "Productivity",
        "slides": [
            "THE EXACT COFFEE DOSE FOR PEAK FOCUS",
            "Research 3 to 4 mg caffeine per kg",
            "Past 6 mg per kg anxiety no focus",
            "180 lb = 82 kg x 3.5 = 287 mg",
            "1 cup drip = 95 mg",
            "Peak 3 cups drip or 2 espresso + coffee",
            "Timing 90 to 120 min AFTER waking",
            "Cortisol high when you wake caffeine wasted",
            "Cut off by 3 PM Half life 5 to 6 hrs",
        ],
    },
    {
        "id": "20_upf",
        "category": "health",
        "label": "Nutrition",
        "slides": [
            "CUT 1 FOOD CATEGORY LOSE 2X THE WEIGHT",
            "Same calories no exercise",
            "2025 Nature Medicine RCT",
            "Ultra processed healthy 1% body weight lost",
            "Minimally processed 2% body weight lost",
            "Processing hijacks insulin + satiety",
            "Even healthy UPF cereal bars yogurt frozen",
            "Swap oats Greek yogurt thighs sourdough",
            "Goal UPF under 15% of calories",
        ],
    },
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    total_carousels = len(CAROUSELS)
    print(f"Generating {total_carousels} carousels × 10 slides = {total_carousels * 10} slides")

    for carousel in CAROUSELS:
        folder = os.path.join(OUTPUT_DIR, carousel["id"])
        os.makedirs(folder, exist_ok=True)
        accent = COLORS[carousel["category"]]
        label = carousel["label"]

        # Slide 1 = HOOK
        # Slides 2-9 = BODY (8 slides)
        # Slide 10 = CTA
        slides_text = carousel["slides"]
        # We have hook + 8 body = 9 text strings. CTA is generated separately.

        for i, text in enumerate(slides_text, start=1):
            kind = "hook" if i == 1 else "body"
            img = draw_slide(i, 10, text, kind, accent, label)
            img.save(os.path.join(folder, f"{i:02d}.png"), "PNG", optimize=True)

        # Final CTA slide
        img = draw_slide(10, 10, "", "cta", accent, label)
        img.save(os.path.join(folder, "10.png"), "PNG", optimize=True)

        print(f"  ✓ {carousel['id']}")

    print(f"\nDone. Output: {OUTPUT_DIR}")
    print(f"Total files: {total_carousels * 10}")


if __name__ == "__main__":
    main()
