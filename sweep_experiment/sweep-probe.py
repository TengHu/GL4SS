#!/usr/bin/env python3
"""
SWEEP PROBE — run one station of the sweep outside the app, from the terminal.

Every finding in this pipeline so far cost a UI round trip: open the portal, pull
the lever, wait, screenshot, paste, argue about it. This is the same three calls
the sweep makes for one frame, with every intermediate written to disk — the
cut-out that was sent, the prompt that went with it, the picture that came back.

    scripts/sweep-probe.py Colosseum-1.jpg --from 2010 --to 1700

It is deliberately a SEPARATE implementation, not a shared one. The app runs in a
browser and composites on a canvas; this runs on PIL. Keeping them apart means
this file can be edited freely to try something without touching what ships — and
it means a result here is a result about the METHOD, not about our code.

The constants and the wording are copied from the app and are marked where they
came from. When they drift apart, this file is the one that is wrong.

Needs OPENROUTER_API_KEY, and Pillow.
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageFilter

CHAT = "https://openrouter.ai/api/v1/chat/completions"
IMAGES = "https://openrouter.ai/api/v1/images"

TEXT_MODEL = "google/gemini-3-flash-preview"
IMAGE_MODEL = "google/gemini-3.1-flash-lite-image"

GREY = (0x8C, 0x8C, 0x8C)


def post(url: str, body: dict, key: str, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://lookingglass.local",
            "X-Title": "The Looking Glass - sweep probe",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def data_url(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


# ---------------------------------------------------------------- segmentation
# Copied from timeMask.ts segmentAnachronisms, including the ordering rule: by
# CERTAINTY, not by size, because a bird is the smallest thing in the frame and
# the most certainly absent, and size-ordering dropped it off the end of the cap.
def segment(img_url: str, src_year: int, tgt_year: int, place: str, key: str, limit: int = 60):
    prompt = "\n".join([
        f'This photograph of "{place}" was taken in {src_year}. I want to render the SAME VIEW as it was in the year {tgt_year}.',
        "",
        f"List everything visible that would NOT be present, unchanged, at this spot in {tgt_year}.",
        f"Think about DATES. Buildings, structures, monuments, roads, landscaping, fittings and street furniture all have construction dates; anything completed after {tgt_year}, or demolished before it, must be listed as absent. Every person, animal and vehicle is transient and must be listed. Anything that existed in {tgt_year} but was laid out, weathered, buried, overgrown or otherwise materially different then must be listed as altered.",
        f"Do NOT list things that were already there in {tgt_year} and looked much the same.",
        "",
        "Return ONLY a compact JSON array, no prose, no markdown. Each entry exactly:",
        '{"b":[y0,x0,y1,x1],"l":"short label","c":"absent"|"altered"}',
        f"Coordinates normalised 0-1000. MERGE contiguous runs of the same thing into ONE entry covering the whole run. Return at most {limit} entries. ORDER BY CERTAINTY, NOT BY SIZE: whatever is most certainly not there in the target year comes first, however small it is in the frame, and a thing that was standing there and merely looked different comes last. Anything alive or in motion is gone from every other year by definition and must never be dropped for being small.",
    ])
    data = post(CHAT, {
        "model": TEXT_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": img_url}},
        ]}],
        "max_tokens": 5000,
    }, key)
    raw = data["choices"][0]["message"]["content"] or ""
    if not isinstance(raw, str):
        raw = json.dumps(raw)

    # Tolerant on purpose — regex, not json.loads. See parseAnachronisms.
    out = []
    pat = r'"b"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*"l"\s*:\s*"([^"]*)"\s*,\s*"c"\s*:\s*"([^"]*)"'
    for m in re.finditer(pat, raw):
        box = [int(m.group(i)) for i in range(1, 5)]
        area = ((box[2] - box[0]) * (box[3] - box[1])) / 1e6
        if area > 0.9 or box[2] <= box[0] or box[3] <= box[1]:
            continue
        change = "altered" if m.group(6) == "altered" else "absent"
        if change == "altered" and area > 0.05:   # see the altered-box cap
            continue
        out.append({"box": box, "label": m.group(5), "change": change})
    return out


# ------------------------------------------------------------------- the cut
# compositeCutout: altered first (so a region both changed and partly absent ends
# up erased), absent grown, grey #8c8c8c. No perspective grid here.
def composite(src: Path, items, dest: Path):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    grow = max(4, round(min(W, H) / 160))
    blur = max(4, round(min(W, H) / 90))

    def rect(b, g):
        y0, x0, y1, x1 = b
        return (round(x0 / 1000 * W) - g, round(y0 / 1000 * H) - g,
                round(x1 / 1000 * W) + g, round(y1 / 1000 * H) + g)

    canvas = im.copy()
    alt = [i for i in items if i["change"] == "altered"]
    if alt:
        blurred = im.filter(ImageFilter.GaussianBlur(radius=blur))
        mask = Image.new("L", (W, H), 0)
        for i in alt:
            mask.paste(255, rect(i["box"], 0))
        canvas = Image.composite(blurred, canvas, mask)

    gone = [i for i in items if i["change"] == "absent"]
    if gone:
        mask = Image.new("L", (W, H), 0)
        for i in gone:
            mask.paste(255, rect(i["box"], grow))
        canvas = Image.composite(Image.new("RGB", (W, H), GREY), canvas, mask)

    canvas.save(dest)
    return dest


# ---------------------------------------------------------------- the planner
# `standing` — the one block worth its length: written by the only step that both
# saw the picture and knows the date.
def standing(img_url: str, src_year: int, tgt_year: int, place: str, key: str) -> str:
    prompt = (
        f'The attached photograph of "{place}" was taken in {src_year}. '
        f"In ONE short paragraph and nothing else, say what is different about this exact view in {tgt_year}: "
        f"what visible here did not exist yet or had already gone, what was standing then that is missing now, "
        f"and who is about and what they wear and travel in."
    )
    data = post(CHAT, {
        "model": TEXT_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": img_url}},
        ]}],
        "max_tokens": 700,
    }, key)
    text = data["choices"][0]["message"]["content"] or ""
    return text.strip() if isinstance(text, str) else ""


# ----------------------------------------------------------------- the prompt
# buildSweepPrompts. Short on purpose: the sentence that matters was one of forty
# in the version this replaced, and nine words held a vantage in a bare test.
def build_prompt(mode: str, src_year: int, tgt_year: int, what_changed: str) -> str:
    if mode == "both":
        lead = (
            f"TWO PHOTOGRAPHS ARE ATTACHED AND THEY SHOW THE SAME VIEW. Read them as follows.\n\n"
            f"The FIRST has parts removed. Its flat grey regions are missing — render what stood on that ground in {tgt_year}. "
            f"Its blurred regions were there but looked different — rebuild them as they were. Everything else in it is correct "
            f"and is reproduced exactly. It is the authority on WHAT IS PRESENT.\n\n"
            f"The SECOND is that same view uncut, as it stood in {src_year}. It is attached for one thing only: THE CAMERA. "
            f"Take the position, the direction of view, the framing, the lens and the distance from it exactly, so that the two "
            f"pictures line up. What it shows belongs to {src_year} and not to {tgt_year} — where the two disagree about whether "
            f"something is there, the FIRST is correct."
        )
    elif mode == "cut":
        lead = (
            f"The attached photograph has parts removed. The flat grey regions are missing — render what stood on that ground "
            f"in {tgt_year}. Blurred regions are still there but looked different — rebuild them as they were. Everything neither "
            f"grey nor blurred is correct: reproduce it exactly, the same viewpoint, the same framing, the same lens."
        )
    else:  # raw
        lead = (
            f"The attached photograph shows this exact view in {src_year}. Render the same view in {tgt_year}: the exact same "
            f"camera position, the same direction of view, the same framing, the same lens, the same distance. Nothing is moved "
            f"and nothing is recomposed. Only what time changed is different."
        )
    parts = [lead]
    if what_changed:
        parts.append(f"What is different in {tgt_year}: {what_changed}")
    parts.append("A single wide 16:9 photograph.")
    return "\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser(description="Run one sweep station from the terminal.")
    ap.add_argument("image")
    ap.add_argument("--from", dest="src", type=int, required=True, help="year the input photograph was taken")
    ap.add_argument("--to", dest="tgt", type=int, required=True, help="year to render")
    ap.add_argument("--place", default="the Colosseum, Rome")
    ap.add_argument("--mode", choices=["both", "cut", "raw"], default="both",
                    help="both = cut-out + uncut for the camera (the current experiment)")
    ap.add_argument("--model", default=IMAGE_MODEL)
    ap.add_argument("--out", default="probe-out")
    ap.add_argument("--no-planner", action="store_true", help="skip the `standing` call")
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set")

    src = Path(args.image)
    out = Path(args.out) / f"{src.stem}-{args.src}-to-{args.tgt}-{args.mode}"
    out.mkdir(parents=True, exist_ok=True)
    src_url = data_url(src)

    refs = []
    if args.mode in ("both", "cut"):
        t0 = time.time()
        items = segment(src_url, args.src, args.tgt, args.place, key)
        n_abs = sum(1 for i in items if i["change"] == "absent")
        print(f"  segment  {len(items)} boxes ({n_abs} absent)  {time.time()-t0:.1f}s")
        (out / "boxes.json").write_text(json.dumps(items, indent=2))
        cut = composite(src, items, out / "cutout.png")
        print(f"  cut-out  {cut}")
        refs.append(data_url(cut))
    if args.mode in ("both", "raw"):
        refs.append(src_url)

    changed = "" if args.no_planner else standing(src_url, args.src, args.tgt, args.place, key)
    if changed:
        print(f"  planner  {len(changed.split())} words")

    prompt = build_prompt(args.mode, args.src, args.tgt, changed)
    (out / "prompt.txt").write_text(prompt)
    print(f"  prompt   {len(prompt.split())} words · {len(refs)} reference(s) · {args.model}")

    t0 = time.time()
    data = post(IMAGES, {
        "model": args.model,
        "prompt": prompt,
        "aspect_ratio": "16:9",
        "input_references": [{"type": "image_url", "image_url": {"url": u}} for u in refs],
    }, key)
    first = (data.get("data") or [{}])[0]
    dest = out / "output.png"
    if first.get("b64_json"):
        dest.write_bytes(base64.b64decode(first["b64_json"]))
    elif first.get("url"):
        with urllib.request.urlopen(first["url"], timeout=120) as r:
            dest.write_bytes(r.read())
    else:
        sys.exit(f"no image in response: {json.dumps(data)[:400]}")
    print(f"  image    {dest}  {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
