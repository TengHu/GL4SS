#!/bin/zsh
#
# Cuts public/g*.mp4 out of the Golden Gate screen recording — the follow-up
# post to the launch cut.
#
# Same shape as cut-source.sh, different geometry: this capture is 3028x1604,
# not 3416x1764, so the crops are recomputed rather than copied.
#
# Two things are deliberately cropped away rather than shown:
#
#   1. The app's corner label reads the DIAL's year (2013), not the year of the
#      frame the film is currently on. Over the 1913 picture it says 2013, which
#      would be actively misleading, so the crop starts below it and the video
#      draws its own year chips instead.
#
#   2. A park sign in the 1913 frame carries garbled model text — "GOLDEN
#      PARSTOR AREA". Small on a phone, obvious to anyone who zooms. The crop
#      ends before it.
#
# The future stations rendered in this session are not used at all.
#
# Usage: ./cut-goldengate.sh [path-to-screen_record.mp4]

set -e

SRC="${1:-$HOME/Movies/FocuSee Project/Custom recording 2026-08-05 09-23-32.focusee/recording/screen_record.mp4}"
OUT="$(cd "$(dirname "$0")" && pwd)/public"

if [[ ! -f "$SRC" ]]; then
  echo "source recording not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

# The browser window, for the steps where the UI is the point. 3028x1604 is
# 1.888:1, so it seats in a 1650x874 bezel rather than the launch cut's 1728x892.
FRAMED="scale=1650:874:flags=lanczos"
# Just the picture: below the corner label, left of the garbled sign, 16:9.
BLEED="crop=2268:1276:0:100,scale=1920:1080:flags=lanczos"

enc() {
  ffmpeg -y -v error -ss "$1" -t "$2" -i "$SRC" -vf "$3" \
    -r 30 -c:v libx264 -crf 15 -preset medium -pix_fmt yuv420p -an "$OUT/$4"
  echo "  $4"
}

echo "cutting from: $SRC"

# Cold open — the film RUN BACKWARDS, so the bridge dissolves out of a frame
# everyone recognises. The forward pass is saved for the payoff, which makes the
# two ends of the video a matched pair rather than the same clip twice.
ffmpeg -y -v error -ss 292.6 -t 2.6 -i "$SRC" -vf "$BLEED,reverse" \
  -r 30 -c:v libx264 -crf 15 -preset medium -pix_fmt yuv420p -an "$OUT/g0_hook.mp4"
echo "  g0_hook.mp4"

# The pin, already on the strait, with the Street View seed offered. 13s at x4.33.
enc 10.0 13.0 "setpts=PTS/4.33,$FRAMED" g2_map.mp4

# Setting the year and throwing the lever. Real time.
enc 23.2 1.4 "$FRAMED" g3_lever.mp4

# The frame developing. 29.4s at x14.7.
enc 24.6 29.4 "setpts=PTS/14.7,$FRAMED" g4_wormhole.mp4

# The 2013 frame landing, drawn from the Street View photograph. It arrives at
# 59s, not 55s — the wormhole runs longer here than in the launch cut, and a
# segment started too early is just more wormhole under a caption that claims
# otherwise. 6s at x3.33.
enc 58.5 6.0 "setpts=PTS/3.33,$FRAMED" g5_frame.mp4

# The payoff — one uncut pass of the film, 1913 to 2013, real time.
enc 292.4 6.9 "$BLEED" g8_payoff.mp4

# Backdrop for the title card: the empty strait.
ffmpeg -y -v error -ss 293.0 -i "$SRC" -frames:v 1 -vf "$BLEED" "$OUT/gg_title_bg.png"
echo "  gg_title_bg.png"
echo "done"
