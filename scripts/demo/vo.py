"""
Voiceover for the Juno product demo, one clip per chapter, with Kokoro TTS
(male voice `am_michael`). Writes vo/<id>.wav and vo/durations.json.

    python3 scripts/demo/vo.py .juno/video/final/vo
"""
import json
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

MODEL = "/Volumes/Extreme SSD/Projects/swipe-fit/.cache/kokoro/kokoro-v1.0.onnx"
VOICES = "/Volumes/Extreme SSD/Projects/swipe-fit/.cache/kokoro/voices-v1.0.bin"
VOICE = "am_michael"

LINES = {
    "intro": "This is Juno. Every post is a market.",
    "problem": "Today, creators get paid by platforms, months later, in ad money. The fans who found them first get nothing. On Juno, every post is its own market on Solana.",
    "c01": "Open the app, and you have a wallet in seconds. No seed phrase, no extension. Fund it from the faucet, claim a name, and you're in.",
    "c02": "The feed is made of posts, and every post has a price. Tap buy, pick an amount, and the quote comes straight from the live bonding curve. Confirmed on Solana in a couple of seconds.",
    "c03": "Reels work the same way. Full screen video, with the market right under the caption. Market cap, progress to graduation, buy and sell, one tap away. Swipe, and the next creator's market is already loaded. Like it, and that like is stored against your wallet.",
    "c04": "Likes and comments come from real wallets. Every count on screen is stored, and every comment is signed by the wallet that wrote it.",
    "c05": "Posting is launching. Pick a photo, give it a name and a ticker, and choose one of four curve shapes. Juno pins the photo to IPFS, creates a Meteora bonding curve, and opens the pool. You watch every step land, with its transaction hash and the second it confirmed.",
    "c06": "A reel is the same flow, with a video. Pick the clip, name it, and choose a curve. Then the receipts, one by one: the video pinned to IPFS, the token metadata, the curve config, and the pool, each with its hash and the second it landed. Two signatures, and it's a live market in the swipe feed.",
    "c07": "And this is the point. Every trade pays the creator. They claim their fees right from the coin page, signed on the phone, with the receipt on screen.",
    "c08": "The same curves can issue something bigger. OpenAI, Kalshi and SpaceX haven't listed yet, but Tessera publishes marks for them. Each one has a Juno curve priced against that mark, and you're warned before you buy outside the band.",
    "c09": "Listed stocks are marked against Pyth, read on chain. Microsoft, Tesla, NVIDIA and Apple, each with a live price, and a card that shows exactly where the curve sits against it.",
    "c10": "Every coin shows what a buy of each size does to its price, quoted from the live curve. And you can buy an exact number of tokens, capped by a maximum spend.",
    "c11": "When a curve fills, it graduates into a Meteora DAMM v2 pool, and trading carries on there.",
    "c12": "And it isn't just devnet. All four curve shapes are live on mainnet, indexed by Jupiter within minutes. And this pool is priced in TSLAx, tokenized Tesla. Its config's quote mint is the Tesla xStock itself, accepted through Meteora's token badge. Every address is in the README, verifiable on chain.",
    "stack": "Under the hood, one Expo app runs on iOS, Android and the web. The server builds every transaction, and the phone signs it, so keys never leave the device. Meteora runs the curves, Tessera and Pyth supply reference prices, and IPFS holds the media.",
    "outro": "Juno. Every post is a market. Built on Solana.",
}

out = sys.argv[1]
kokoro = Kokoro(MODEL, VOICES)
durations = {}
only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
old = json.load(open(f"{out}/durations.json")) if only else {}
durations.update(old)
for key, text in LINES.items():
    if only and key not in only:
        continue
    samples, rate = kokoro.create(text, voice=VOICE, speed=1.02, lang="en-us")
    sf.write(f"{out}/{key}.wav", samples, rate)
    durations[key] = round(len(samples) / rate, 2)
    print(key, durations[key])
json.dump(durations, open(f"{out}/durations.json", "w"), indent=1)
