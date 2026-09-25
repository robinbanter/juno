"""
Cut each chapter's phone screen out of the iOS-simulator footage and speed it
to fit that chapter's narration (never slower than real time, at most 3x).

    python3 scripts/demo/clips.py .juno/video/final/hf .juno/video/final/vo11

Reads the framed takes in .juno/video/full/, crops the screen (the phone body
is redrawn in HTML so a shape can sit behind it), writes hf/assets/clips/<id>.mp4
and hf/plan.json.
"""
import json
import subprocess
import sys

HF, VO = sys.argv[1], sys.argv[2]
FULL = "/Volumes/Extreme SSD/Projects/zorr-solana/.juno/video/full"
MAX_SPEED = 3.0
PAD = 1.8  # seconds of picture around the narration

CHAPTERS = [
    ("c01", ["01-wallet"]), ("c02", ["02-feed-buy"]), ("c03", ["03-reels"]), ("c04", ["04-comments"]),
    ("c05", ["05-post-launch-log"]), ("c06", ["06-reel-launch-log"]), ("c07", ["06b-creator-claim"]),
    ("c08", ["07-preipo-openai"]), ("c09", ["08-stocks", "08b-pyth-reference"]), ("c10", ["09-depth-exactout"]),
    ("c11", ["09b-graduated-damm-v2"]), ("c12", ["10-mainnet-proof", "10b-mainnet-tslax"]),
]


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


vo = json.load(open(f"{VO}/durations.json"))
plan = {}
for cid, parts in CHAPTERS:
    sources = [f"{FULL}/{p}.mp4" for p in parts]
    clip = sum(duration(s) for s in sources)
    length = round(max(vo[cid] + PAD, clip / MAX_SPEED), 2)
    speed = max(clip / length, 1.0)
    inputs = [arg for s in sources for arg in ("-i", s)]
    n = len(sources)
    join = "".join(f"[{i}:v]" for i in range(n)) + f"concat=n={n}:v=1:a=0[c];" if n > 1 else "[0:v]null[c];"
    graph = (f"{join}[c]crop=766:1666:157:127,setpts=PTS/{speed:.4f},fps=30,"
             f"scale=402:874:flags=lanczos,tpad=stop_mode=clone:stop_duration={length + 1:.2f}[v]")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", graph, "-map", "[v]",
                    "-t", f"{length + 0.6:.2f}", "-an", "-c:v", "libx264", "-crf", "17", "-preset", "medium",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HF}/assets/clips/{cid}.mp4"], check=True)
    plan[cid] = {"clip": round(clip, 2), "len": length, "speed": round(speed, 2), "vo": vo[cid]}
    print(cid, plan[cid])
json.dump(plan, open(f"{HF}/plan.json", "w"), indent=1)
print("chapters total", round(sum(p["len"] for p in plan.values()), 1))
