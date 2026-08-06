#!/bin/zsh
#
# Lay the music bed over a silent Remotion render.
#
# The track is SIMPLE2, one of the theme pieces bundled with iMovie. Apple's
# licence covers using this content in your own productions, including
# commercially; what it does not allow is redistributing the track on its own.
# So the mp4 is fine to post, and the audio file is not committed here.
#
# It is real recorded music rather than something synthesised. An earlier pass
# generated a bed from oscillators and it sounded like what it was.
#
# The source is ~60s and the cuts are shorter, so it is trimmed rather than
# looped — no seam to hide. Length is read off the video, so the fade lands at
# the real end of whichever cut is passed in.
#
# Usage: ./add-music.sh [TRACK] [IN] [OUT]
#   TRACK  BRIGHT MODERN NEON NEWS PLAYFUL SIMPLE2 TRAVEL   (default SIMPLE2)
#   IN     silent render        (default out/gl4ss-30s.mp4)
#   OUT    scored deliverable   (default out/gl4ss-launch-30s.mp4)

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
TRACK="${1:-SIMPLE2}"
VIDEO="${2:-$DIR/out/gl4ss-30s.mp4}"
FINAL="${3:-$DIR/out/gl4ss-launch-30s.mp4}"

LIBRARY="/Applications/iMovie.app/Contents/Resources/iMovie Theme Music"
SRC="$LIBRARY/$TRACK.m4a"

if [ ! -f "$SRC" ]; then
  echo "no such track: $SRC" >&2
  echo "available:" >&2
  ls "$LIBRARY" 2>/dev/null | sed 's/\.m4a$//' | sed 's/^/  /' >&2
  exit 1
fi

if [ ! -f "$VIDEO" ]; then
  echo "render first — no such file: $VIDEO" >&2
  exit 1
fi

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
FADE_OUT_AT=$(python3 -c "print(round(float('$DURATION') - 1.733, 3))")

ffmpeg -y -v error -i "$VIDEO" -i "$SRC" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -af "atrim=0:$DURATION,asetpts=N/SR/TB,\
afade=t=in:st=0:d=0.8,afade=t=out:st=$FADE_OUT_AT:d=1.7,volume=0.85" \
  -shortest -movflags +faststart "$FINAL"

echo "$TRACK  →  $FINAL"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$FINAL"
