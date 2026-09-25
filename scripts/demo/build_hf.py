"""
Write the HyperFrames composition for the Juno demo film.

    python3 scripts/demo/build_hf.py .juno/video/final/hf

Reads hf/plan.json (chapter clip lengths from the speed-up step) and the
voiceover durations, lays every scene on one timeline, and writes
hf/index.html. Order: the "Gone Public" cat film, the landing site, the
problem card, twelve feature chapters, how it's built, the end card.
"""
import html
import json
import sys

HF = sys.argv[1]
plan = json.load(open(f"{HF}/plan.json"))
vo = json.load(open(f"{HF}/../vo/durations.json"))

BG = "#DCE6D4"  # the phone clips' decoded background, so the seam vanishes
INK = "#12150E"
LIME = "#D6FF3D"
MUTED = "#566150"

CHAPTERS = [
    ("c01", "A wallet in seconds", "No seed phrase, no extension. The key lives in the phone's keychain.",
     ["Create a wallet in one tap", "Fund it from the in-app faucet", "Claim a name with a signed message"], ["Solana"]),
    ("c02", "Every post has a price", "Buy the posts you believe in. The quote comes from the live bonding curve.",
     ["Live quote, fee and price impact", "Signed on the phone, confirmed on Solana", "“Bought by” read from real swaps"], ["Meteora DBC"]),
    ("c03", "Reels are markets too", "Full-screen video, with the market right under the caption.",
     ["Market cap and progress to graduation", "Buy and sell from the dock", "Likes stored against each wallet"], ["Meteora DBC"]),
    ("c04", "Real likes, real comments", "Every count is stored. Every comment is signed by its wallet.",
     ["4 likes and 2 comments from other wallets", "Post a comment, the count goes to 3", "Nothing hardcoded"], ["Social"]),
    ("c05", "Posting is launching", "Pick a photo, choose a curve shape, sign twice. The pool is live.",
     ["Four shapes: Content, Thin name, IPO book, Tight NAV", "Live receipts: IPFS, curve config, pool", "Every step timestamped to the second"], ["Meteora DBC", "IPFS"]),
    ("c06", "Reels launch the same way", "Video in, market out, in two signatures.",
     ["Video pinned to IPFS with a poster frame", "Config and pool, each with its hash", "Straight into the swipe feed"], ["Meteora DBC", "IPFS"]),
    ("c07", "Creators get paid", "Every trade pays the creator. They claim it from the coin page.",
     ["Claim shown only to the coin's creator", "Signed on the phone, receipt on screen", "ClaimCreatorTradingFee, finalized on-chain"], ["Meteora DBC"]),
    ("c08", "Pre-IPO, on a curve", "OpenAI, Kalshi and SpaceX, marked by Tessera before they list.",
     ["Live marks, holders and valuations", "A Juno curve priced against each mark", "Warned before buying outside the band"], ["Tessera"]),
    ("c09", "Listed stocks, priced by Pyth", "Microsoft, Tesla, NVIDIA and Apple, read on-chain.",
     ["Pyth PriceUpdateV2, read from mainnet", "Curve versus price on every card", "A live reference card per stock"], ["Pyth"]),
    ("c10", "Depth, and exact-out", "See what every size of buy does to the price. Then buy an exact amount.",
     ["Twelve live quotes from the curve", "Buy exactly 1,000,000 tokens", "Capped by a maximum spend"], ["Meteora DBC"]),
    ("c11", "Graduation to DAMM v2", "A filled curve migrates into a Meteora DAMM v2 pool.",
     ["Curve completes at 100%", "Migrated on-chain, trading continues", "The full fill history is kept"], ["DAMM v2"]),
    ("c12", "Live on mainnet", "Five pools on Solana mainnet. One is priced in tokenized Tesla.",
     ["All four curve shapes launched on mainnet", "Indexed by Jupiter within minutes", "JUNOTSLA: quote mint TSLAx, via token badge"], ["Mainnet", "Meteora DBC", "xStocks"]),
]

LOGO = (
    '<svg viewBox="0 0 48 48" fill="none"><path d="M9 38.5C9 38.5 18 36.5 24 30C29 24.6 30.5 18.5 30.5 18.5" '
    'stroke="{c}" stroke-width="5" stroke-linecap="round"/><circle cx="36.5" cy="10.5" r="4.8" fill="{c}"/></svg>'
)

# ------------------------------------------------------------------ timing
T = {}
T["cat"] = (0.0, 20.0)
T["web"] = (20.0, 11.0)
T["prob"] = (31.0, 14.5)
t = 45.5
for cid, *_ in CHAPTERS:
    T[cid] = (round(t, 2), plan[cid]["len"])
    t += plan[cid]["len"]
T["stack"] = (round(t, 2), 21.0)
t += 21.0
T["outro"] = (round(t, 2), 9.0)
TOTAL = round(t + 9.0, 2)
DEMO_START, DEMO_END = T["c01"][0], T["stack"][0]

esc = html.escape
parts = []
tl = []  # timeline lines


def at(key, offset=0.0):
    return round(T[key][0] + offset, 2)


# ------------------------------------------------------------------ cat film
parts.append(f'<video id="cat" class="clip full" data-start="0" data-duration="{T["cat"][1]}" src="assets/cat.mp4" muted playsinline></video>')
parts.append(f'<audio id="cat-audio" data-start="0" data-duration="{T["cat"][1]}" data-volume="1" data-fade-out="0.4" src="assets/audio/cat.wav"></audio>')

# ------------------------------------------------------------------ website
s, d = T["web"]
parts.append(f"""
<div id="web" class="clip scene" data-start="{s}" data-duration="{d}" style="background:{BG}">
  <div id="web-window" class="browser">
    <div class="bar"><span class="dot" style="background:#FF5F57"></span><span class="dot" style="background:#FEBC2E"></span><span class="dot" style="background:#28C840"></span>
      <div class="url">juno-landing-beta.vercel.app</div></div>
    <div class="viewport"><img id="web-shot" src="assets/landing-full.png" alt="Juno landing page"></div>
  </div>
</div>""")
tl.append(f'tl.fromTo("#web-window", {{opacity: 0, scale: 0.94, y: 30}}, {{opacity: 1, scale: 1, y: 0, duration: 0.8, ease: "power3.out"}}, {at("web", 0.05)});')
tl.append(f'tl.fromTo("#web-shot", {{y: 0}}, {{y: -4110, duration: 9.2, ease: "power1.inOut"}}, {at("web", 0.9)});')
parts.append(f'<audio id="vo-intro" data-start="{at("web", 1.2)}" data-duration="{vo["intro"] + 0.2}" data-volume="1" src="assets/audio/vo-intro.wav"></audio>')

# ------------------------------------------------------------------ problem
s, d = T["prob"]
parts.append(f"""
<div id="prob" class="clip scene dark" data-start="{s}" data-duration="{d}">
  <div class="prob-logo" id="prob-logo">{LOGO.format(c=LIME)}<span>juno</span></div>
  <div class="prob-lines">
    <div class="pl" id="pl1">Creators get paid last.</div>
    <div class="pl muted" id="pl2">Their first fans get nothing.</div>
    <div class="pl" id="pl3">On Juno, every post is <span class="hl">a market.</span></div>
  </div>
</div>""")
tl.append(f'tl.fromTo("#prob-logo", {{opacity: 0, y: -12}}, {{opacity: 1, y: 0, duration: 0.6}}, {at("prob", 0.2)});')
for i, off in ((1, 1.0), (2, 5.2), (3, 8.9)):
    tl.append(f'tl.fromTo("#pl{i}", {{opacity: 0, y: 40}}, {{opacity: 1, y: 0, duration: 0.7, ease: "power3.out"}}, {at("prob", off)});')
tl.append(f'tl.to(".prob-lines", {{opacity: 0, duration: 0.4}}, {at("prob", 14.0)});')
parts.append(f'<audio id="vo-problem" data-start="{at("prob", 0.9)}" data-duration="{vo["problem"] + 0.2}" data-volume="1" src="assets/audio/vo-problem.wav"></audio>')

# ------------------------------------------------------------------ demo frame (persistent)
parts.append(f"""
<div id="demo-chrome" class="clip scene" data-start="{DEMO_START}" data-duration="{round(DEMO_END - DEMO_START, 2)}" style="background:{BG}">
  <div class="brand">{LOGO.format(c=INK)}<span>juno</span></div>
  <div class="rail">{''.join(f'<div class="seg"><div class="fill" id="fill-{c[0]}"></div></div>' for c in CHAPTERS)}</div>
</div>""")
tl.append(f'tl.fromTo("#demo-chrome .brand", {{opacity: 0}}, {{opacity: 1, duration: 0.5}}, {DEMO_START});')

# ------------------------------------------------------------------ chapters
for n, (cid, title, body, facts, chips) in enumerate(CHAPTERS, start=1):
    s, d = T[cid]
    chip_html = "".join(f'<span class="chip">{esc(c)}</span>' for c in chips)
    fact_html = "".join(
        f'<div class="fact" id="{cid}-f{i}"><span class="tick">✓</span><span>{esc(f)}</span></div>' for i, f in enumerate(facts)
    )
    parts.append(f"""
<div id="{cid}" class="clip scene" data-start="{s}" data-duration="{d}">
  <div class="col" id="{cid}-col">
    <div class="eyebrow" id="{cid}-eye"><span class="num">{n:02d}</span>{chip_html}</div>
    <h1 class="title" id="{cid}-title">{esc(title)}</h1>
    <p class="body" id="{cid}-body">{esc(body)}</p>
    <div class="facts">{fact_html}</div>
  </div>
</div>""")
    # the phone: an untimed wrapper (animated) around a timed video
    last = n == len(CHAPTERS)
    vdur = round(d + (0 if last else 0.5), 2)
    parts.append(
        f'<div class="phone" id="{cid}-phone" style="z-index:{10 + n}">'
        f'<video id="{cid}-video" class="clip phone-video" data-start="{s}" data-duration="{vdur}" src="assets/clips/{cid}.mp4" muted playsinline></video></div>'
    )
    tl.append(f'tl.fromTo("#{cid}-phone", {{opacity: 0, y: 24}}, {{opacity: 1, y: 0, duration: 0.45, ease: "power2.out"}}, {s});')
    tl.append(f'tl.fromTo("#{cid}-eye", {{opacity: 0, y: 20}}, {{opacity: 1, y: 0, duration: 0.5, ease: "power3.out"}}, {at(cid, 0.15)});')
    tl.append(f'tl.fromTo("#{cid}-title", {{opacity: 0, y: 36}}, {{opacity: 1, y: 0, duration: 0.6, ease: "power3.out"}}, {at(cid, 0.3)});')
    tl.append(f'tl.fromTo("#{cid}-body", {{opacity: 0, y: 24}}, {{opacity: 1, y: 0, duration: 0.6, ease: "power3.out"}}, {at(cid, 0.5)});')
    for i in range(len(facts)):
        tl.append(f'tl.fromTo("#{cid}-f{i}", {{opacity: 0, x: -24}}, {{opacity: 1, x: 0, duration: 0.5, ease: "power2.out"}}, {at(cid, 1.1 + i * 0.35)});')
    tl.append(f'tl.to("#{cid}-col", {{opacity: 0, y: -16, duration: 0.35, ease: "power1.in"}}, {round(s + d - 0.4, 2)});')
    tl.append(f'tl.fromTo("#fill-{cid}", {{scaleX: 0}}, {{scaleX: 1, duration: {d}, ease: "none"}}, {s});')
    if last:
        tl.append(f'tl.to("#{cid}-phone", {{opacity: 0, duration: 0.4}}, {round(s + d - 0.4, 2)});')
    parts.append(f'<audio id="vo-{cid}" data-start="{at(cid, 0.7)}" data-duration="{vo[cid] + 0.2}" data-volume="1" src="assets/audio/vo-{cid}.wav"></audio>')

# ------------------------------------------------------------------ stack
s, d = T["stack"]
cards = [
    ("One app, three platforms", "Expo on iOS, Android and the web."),
    ("Keys stay on the phone", "The server builds each transaction. The device signs it."),
    ("Meteora curves", "Dynamic Bonding Curve into DAMM v2, four measured shapes."),
    ("Real reference prices", "Tessera for pre-IPO, Pyth on-chain for stocks, IPFS for media."),
]
stats = [("5", "pools on mainnet"), ("4", "curve shapes, measured"), ("236", "unit tests"), ("3", "platforms")]
parts.append(f"""
<div id="stack" class="clip scene dark" data-start="{s}" data-duration="{d}">
  <div class="stack-wrap">
    <div class="kicker" id="st-kick">How it's built</div>
    <div class="cards">{''.join(f'<div class="card" id="st-c{i}"><div class="ct">{esc(a)}</div><div class="cb">{esc(b)}</div></div>' for i, (a, b) in enumerate(cards))}</div>
    <div class="stats">{''.join(f'<div class="stat" id="st-s{i}"><div class="sv">{a}</div><div class="sl">{esc(b)}</div></div>' for i, (a, b) in enumerate(stats))}</div>
  </div>
</div>""")
tl.append(f'tl.fromTo("#st-kick", {{opacity: 0, y: 20}}, {{opacity: 1, y: 0, duration: 0.5}}, {at("stack", 0.3)});')
for i in range(4):
    tl.append(f'tl.fromTo("#st-c{i}", {{opacity: 0, y: 40}}, {{opacity: 1, y: 0, duration: 0.6, ease: "power3.out"}}, {at("stack", 0.8 + i * 0.9)});')
for i in range(4):
    tl.append(f'tl.fromTo("#st-s{i}", {{opacity: 0, y: 30}}, {{opacity: 1, y: 0, duration: 0.6, ease: "power3.out"}}, {at("stack", 10.5 + i * 0.5)});')
tl.append(f'tl.to(".stack-wrap", {{opacity: 0, duration: 0.4}}, {at("stack", 20.5)});')
parts.append(f'<audio id="vo-stack" data-start="{at("stack", 1.0)}" data-duration="{vo["stack"] + 0.2}" data-volume="1" src="assets/audio/vo-stack.wav"></audio>')

# ------------------------------------------------------------------ outro
s, d = T["outro"]
parts.append(f"""
<div id="outro" class="clip scene" data-start="{s}" data-duration="{d}" style="background:{BG}">
  <div class="end">
    <div class="end-mark" id="end-mark">{LOGO.format(c=INK)}<span>juno</span></div>
    <div class="end-tag" id="end-tag">Every post is a market.</div>
    <div class="end-links" id="end-links"><span>juno-app-chi.vercel.app</span><span class="sep">·</span><span>github.com/nickthelegend/zorr-solana</span></div>
    <div class="end-built" id="end-built">Built on Solana with Meteora, Tessera and Pyth</div>
  </div>
</div>""")
tl.append(f'tl.fromTo("#end-mark", {{opacity: 0, scale: 0.9}}, {{opacity: 1, scale: 1, duration: 0.8, ease: "power3.out"}}, {at("outro", 0.2)});')
tl.append(f'tl.fromTo("#end-tag", {{opacity: 0, y: 24}}, {{opacity: 1, y: 0, duration: 0.6}}, {at("outro", 1.0)});')
tl.append(f'tl.fromTo("#end-links", {{opacity: 0, y: 16}}, {{opacity: 1, y: 0, duration: 0.6}}, {at("outro", 2.0)});')
tl.append(f'tl.fromTo("#end-built", {{opacity: 0}}, {{opacity: 1, duration: 0.6}}, {at("outro", 2.6)});')
parts.append(f'<audio id="vo-outro" data-start="{at("outro", 0.9)}" data-duration="{vo["outro"] + 0.2}" data-volume="1" src="assets/audio/vo-outro.wav"></audio>')

# ------------------------------------------------------------------ music
parts.append(f'<audio id="music" data-start="20" data-duration="{round(TOTAL - 20, 2)}" data-volume="0.9" data-fade-in="1.5" data-fade-out="4" src="assets/audio/music-bed.wav"></audio>')

CSS = f"""
@font-face {{ font-family: "Plus Jakarta Sans"; src: url("fonts/jakarta-400.woff2") format("woff2"); font-weight: 200 800; font-style: normal; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: {BG}; }}
#root {{ position: relative; width: 100%; height: 100%; font-family: "Plus Jakarta Sans", sans-serif; color: {INK}; background: {BG}; }}
.clip {{ position: absolute; inset: 0; }}
.full {{ width: 1920px; height: 1080px; object-fit: cover; }}
.scene {{ overflow: hidden; }}
.dark {{ background: {INK}; color: #F3F7EE; }}
/* website */
.browser {{ position: absolute; left: 160px; top: 80px; width: 1600px; height: 920px; border-radius: 22px; overflow: hidden; background: #fff; box-shadow: 0 40px 90px rgba(18,21,14,0.28), 0 0 0 1px rgba(18,21,14,0.08); }}
.bar {{ height: 52px; background: #F4F6F1; display: flex; align-items: center; gap: 10px; padding: 0 22px; border-bottom: 1px solid #E2E8DC; }}
.dot {{ width: 14px; height: 14px; border-radius: 7px; display: block; }}
.url {{ margin-left: 380px; width: 560px; height: 32px; border-radius: 10px; background: #fff; border: 1px solid #E2E8DC; font-size: 17px; font-weight: 600; color: {MUTED}; display: flex; align-items: center; justify-content: center; }}
.viewport {{ position: relative; width: 1600px; height: 868px; overflow: hidden; }}
#web-shot {{ position: absolute; left: 0; top: 0; width: 1600px; height: auto; display: block; }}
/* problem */
.prob-logo {{ position: absolute; left: 140px; top: 90px; display: flex; align-items: center; gap: 14px; font-size: 44px; font-weight: 800; letter-spacing: -0.03em; }}
.prob-logo svg {{ width: 54px; height: 54px; display: block; }}
.prob-lines {{ position: absolute; left: 140px; top: 330px; width: 1640px; }}
.pl {{ font-size: 96px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.12; margin-bottom: 18px; }}
.pl.muted {{ color: #8B9683; }}
.hl {{ color: {LIME}; }}
/* demo chrome */
.brand {{ position: absolute; left: 140px; top: 64px; display: flex; align-items: center; gap: 12px; font-size: 34px; font-weight: 800; letter-spacing: -0.03em; }}
.brand svg {{ width: 40px; height: 40px; display: block; }}
.rail {{ position: absolute; left: 140px; bottom: 64px; width: 900px; display: flex; gap: 8px; }}
.seg {{ flex: 1; height: 5px; border-radius: 3px; background: rgba(18,21,14,0.14); overflow: hidden; }}
.fill {{ width: 100%; height: 100%; background: {INK}; transform-origin: 0 50%; }}
/* chapter */
.col {{ position: absolute; left: 140px; top: 250px; width: 900px; }}
.eyebrow {{ display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }}
.num {{ font-size: 22px; font-weight: 800; background: {INK}; color: {LIME}; border-radius: 999px; padding: 8px 18px; letter-spacing: 0.02em; }}
.chip {{ font-size: 20px; font-weight: 700; background: #fff; color: {INK}; border-radius: 999px; padding: 8px 18px; }}
.title {{ font-size: 84px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; margin-bottom: 26px; }}
.body {{ font-size: 32px; font-weight: 500; color: {MUTED}; line-height: 1.38; margin-bottom: 42px; width: 820px; }}
.facts {{ display: flex; flex-direction: column; gap: 20px; }}
.fact {{ display: flex; align-items: center; gap: 18px; font-size: 28px; font-weight: 600; }}
.tick {{ width: 40px; height: 40px; border-radius: 20px; background: {LIME}; color: {INK}; font-size: 22px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none; }}
.phone {{ position: absolute; left: 1190px; top: 0; width: 608px; height: 1080px; }}
.phone-video {{ position: absolute; inset: auto; left: 0; top: 0; width: 608px; height: 1080px; }}
/* stack */
.stack-wrap {{ position: absolute; left: 140px; top: 120px; width: 1640px; }}
.kicker {{ font-size: 28px; font-weight: 800; color: {LIME}; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 40px; }}
.cards {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 70px; }}
.card {{ background: #1C2118; border-radius: 24px; padding: 34px 30px; min-height: 250px; }}
.ct {{ font-size: 32px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; color: #F3F7EE; }}
.cb {{ font-size: 24px; font-weight: 500; color: #A9B4A2; line-height: 1.4; }}
.stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }}
.stat {{ border-top: 2px solid rgba(214,255,61,0.4); padding-top: 22px; }}
.sv {{ font-size: 110px; font-weight: 800; letter-spacing: -0.04em; color: {LIME}; line-height: 1; }}
.sl {{ font-size: 26px; font-weight: 600; color: #C8D2C1; margin-top: 10px; }}
/* outro */
.end {{ position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }}
.end-mark {{ display: flex; align-items: center; gap: 28px; font-size: 190px; font-weight: 800; letter-spacing: -0.045em; line-height: 1; }}
.end-mark svg {{ width: 190px; height: 190px; display: block; }}
.end-tag {{ font-size: 56px; font-weight: 700; letter-spacing: -0.03em; margin-top: 36px; }}
.end-links {{ display: flex; gap: 18px; font-size: 30px; font-weight: 600; color: {MUTED}; margin-top: 44px; }}
.sep {{ color: #8B9683; }}
.end-built {{ font-size: 24px; font-weight: 600; color: #8B9683; margin-top: 26px; }}
"""

doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>{CSS}</style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
{chr(10).join(parts)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join('      ' + line for line in tl).strip()}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""
open(f"{HF}/index.html", "w").write(doc)
json.dump({k: list(v) for k, v in T.items()} | {"total": TOTAL}, open(f"{HF}/timeline.json", "w"), indent=1)
print("total", TOTAL, "s; chapters", DEMO_START, "->", DEMO_END)
