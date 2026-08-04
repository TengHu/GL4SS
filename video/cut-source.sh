#!/bin/zsh
#
# Cuts public/*.mp4 out of the raw FocuSee screen recording.
#
# The clips are derived, not authored — they are gitignored, and this script is
# what regenerates them. Each one is cut to its final length AND its final
# speed, so the Remotion composition only has to place them and draw on top.
# That keeps rendering fast and keeps the speed ramps out of React.
#
# The raw capture is 3416x1764 @ 60fps, 6:47 long, and lives in the FocuSee
# project bundle rather than in this repo.
#
# Usage: ./cut-source.sh [path-to-screen_record.mp4]

set -e

SRC="${1:-$HOME/Movies/FocuSee Project/Custom recording 2026-08-04 10-30-36.focusee/recording/screen_record.mp4}"
OUT="$(cd "$(dirname "$0")" && pwd)/public"

if [[ ! -f "$SRC" ]]; then
  echo "source recording not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

# The whole browser window, for the steps where the UI is the point.
FRAMED="scale=1728:892:flags=lanczos"
# Just the picture, cropped to 16:9, for the cold open and the payoff.
BLEED="crop=2738:1540:339:8,scale=1920:1080:flags=lanczos"

# enc <start> <duration> <filters> <name>
enc() {
  ffmpeg -y -v error -ss "$1" -t "$2" -i "$SRC" -vf "$3" \
    -r 30 -c:v libx264 -crf 15 -preset medium -pix_fmt yuv420p -an "$OUT/$4"
  echo "  $4"
}

echo "cutting from: $SRC"

# Cold open — second pass of the finished film, 1700 -> 1810.
enc 361.2 2.6 "$BLEED" s0_hook.mp4

# World map down to the Colosseum. 15.8s at x4.23.
# Starts at 10.5s, not earlier: the map tiles are still resolving before that
# and the scene would open on a brown smear.
enc 10.5 15.8 "setpts=PTS/4.23,$FRAMED" s2_map.mp4

# Committing the year. Real time — this is the beat that has to look unedited.
enc 26.3 1.7 "$FRAMED" s3_lever.mp4

# The frame developing. 21s at x10.
enc 28.0 21.0 "setpts=PTS/10,$FRAMED" s4_wormhole.mp4

# Opening the core sample and confirming it. 6.6s at x2.1.
enc 62.0 6.6 "setpts=PTS/2.1,$FRAMED" s5_year.mp4

# The long wait while the three new frames land. 132s at x36.5.
enc 68.5 132.0 "setpts=PTS/36.5,$FRAMED" s6_strip.mp4

# The second wait while the film renders. 136s at x75.
enc 205.0 136.0 "setpts=PTS/75,$FRAMED" s7_render.mp4

# The payoff — one uncut pass through all four stations, real time.
enc 353.0 7.9 "$BLEED" s8_payoff.mp4

# Backdrop for the title card.
ffmpeg -y -v error -ss 363.5 -i "$SRC" -frames:v 1 -vf "$BLEED" "$OUT/title_bg.png"
echo "  title_bg.png"
echo "done"
