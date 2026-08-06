#!/bin/zsh
#
# Cuts public/b*.mp4 out of the Potsdamer Platz screen recording.
#
# Geometry again differs: this capture is 3080x1600 (1.925:1). The BLEED crop is
# pushed right to drop a generated "Achtung!" prop sign that sits half in frame
# at the left edge, and starts below the app's corner label — which reads the
# DIAL's year, not the year of the frame the film is on.
#
# WHICH PART OF THE FILM IS USED, and why it is not the obvious one.
#
# The film appears to fall apart if you watch the middle of the recording. It
# does not: playback there is looping over the clips that had finished while the
# rest were still rendering, so it cuts between eras that have no transition
# between them yet. By 510s the bar reads "4 of 4 frames · 3 clips" and the same
# loop runs clean, holding one camera through all four stations.
#
# So both cuts come from after 510s, and they split the arc rather than repeat
# it: the cold open takes 1928 collapsing into rubble, the payoff takes the
# rubble through 1972 to 2022. Nothing is shown twice.
#
# Usage: ./cut-berlin.sh [path-to-screen_record.mp4]

set -e

SRC="${1:-$HOME/Movies/FocuSee Project/Custom recording 2026-08-05 09-53-08.focusee/recording/screen_record.mp4}"
OUT="$(cd "$(dirname "$0")" && pwd)/public"

if [[ ! -f "$SRC" ]]; then
  echo "source recording not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

FRAMED="scale=1660:862:flags=lanczos"
BLEED="crop=2293:1290:700:80,scale=1920:1080:flags=lanczos"

enc() {
  ffmpeg -y -v error -ss "$1" -t "$2" -i "$SRC" -vf "$3" \
    -r 30 -c:v libx264 -crf 15 -preset medium -pix_fmt yuv420p -an "$OUT/$4"
  echo "  $4"
}

echo "cutting from: $SRC"

# Cold open — 1928 dissolving into rubble. Frame 0 is the crowded square, which
# is the arresting thing to land on in a muted timeline.
enc 510.5 2.5 "$BLEED" b0_hook.mp4

# Berlin down to Potsdamer Platz, and picking the vantage. 12.5s at x4.8.
enc 11.0 12.5 "setpts=PTS/4.8,$FRAMED" b2_map.mp4

# Setting 2022 and throwing the lever. Real time.
enc 23.9 1.3 "$FRAMED" b3_lever.mp4

# The frame developing. 22.5s at x11.25.
enc 25.5 22.5 "setpts=PTS/11.25,$FRAMED" b4_wormhole.mp4

# The payoff — rubble through the death strip to the glass, one camera, uncut.
enc 512.6 9.8 "$BLEED" b8_payoff.mp4

# Backdrop for the title card.
ffmpeg -y -v error -ss 513.6 -i "$SRC" -frames:v 1 -vf "$BLEED" "$OUT/bl_title_bg.png"
echo "  bl_title_bg.png"
echo "done"
