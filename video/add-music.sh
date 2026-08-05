#!/bin/zsh
#
# Lay the music bed over the silent Remotion render.
#
# The track is SIMPLE2, one of the theme pieces bundled with iMovie. Apple's
# licence covers using this content in your own productions, including
# commercially; what it does not allow is redistributing the track on its own.
# So the mp4 is fine to post, and the audio file is not committed here.
#
# It is real recorded music rather than something synthesised. An earlier pass
# generated a bed from oscillators and it sounded like what it was.
#
# The source is ~60s and the cut is ~31s, so it is trimmed rather than looped —
# no seam to hide.
#
# Usage: ./add-music.sh [track-name]     (BRIGHT MODERN NEON NEWS PLAYFUL SIMPLE2 TRAVEL)

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
TRACK="${1:-SIMPLE2}"
LIBRARY="/Applications/iMovie.app/Contents/Resources/iMovie Theme Music"
SRC="$LIBRARY/$TRACK.m4a"

VIDEO="$DIR/out/gl4ss-30s.mp4"        # the silent Remotion render
FINAL="$DIR/out/gl4ss-launch-30s.mp4"
DURATION=30.933                        # 928 frames at 30 fps

if [ ! -f "$SRC" ]; then
  echo "no such track: $SRC" >&2
  echo "available:" >&2
  ls "$LIBRARY" 2>/dev/null | sed 's/\.m4a$//' | sed 's/^/  /' >&2
  exit 1
fi

if [ ! -f "$VIDEO" ]; then
  echo "render first: npx remotion render LookingGlass out/gl4ss-30s.mp4" >&2
  exit 1
fi

ffmpeg -y -v error -i "$VIDEO" -i "$SRC" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -af "atrim=0:$DURATION,asetpts=N/SR/TB,\
afade=t=in:st=0:d=0.8,afade=t=out:st=29.2:d=1.7,volume=0.85" \
  -shortest -movflags +faststart "$FINAL"

echo "$TRACK  →  $FINAL"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$FINAL"
