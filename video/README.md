# The launch cuts

Two videos, same visual language, cut from two screen recordings:

| | | |
|---|---|---|
| `LookingGlass` | 30.9 s | **the launch post** — Rome, four stations, one film |
| `GoldenGate` | 23.4 s | **follow-up** — San Francisco, 1913 → 2013 |
| `Berlin` | 23.9 s | **follow-up** — Potsdamer Platz, 1928 → 2022 |

---

# The launch cut

A 30-second, 1920×1080 silent cut of one end-to-end run of THE LOOKING GLASS —
Rome, four temporal stations, one film — built in Remotion from a FocuSee screen
recording.

> time travel to any neighborhood on Earth, watch history pass before your eyes

The end card points at `github.com/TengHu/GL4SS` and credits the upstream fork
(`elder-plinius/GL4SS`) in small type underneath. It deliberately does **not**
show `GL4SS.ai` — that is upstream's domain, and sending a viral video's traffic
there would hand the attention to the wrong repo.

Everything that has to be said is on screen, because X and LinkedIn autoplay
muted. The music is a bed for the people who unmute, not a carrier — the cut
reads exactly the same with the sound off.

## Commands

```console
npm i                      # install
./cut-source.sh            # cut public/*.mp4 out of the raw recording
npm run dev                # preview in Remotion Studio
npx remotion render LookingGlass out/gl4ss-30s.mp4 \
  --codec=h264 --image-format=png --crf=16
./add-music.sh             # lay the music bed over the render
```

`cut-source.sh` takes the path to the raw capture as an optional argument; it
defaults to the FocuSee project bundle in `~/Movies`. The clips it writes are
gitignored — they are derived, and the script is the source of truth.

## The cut

| Frames | Scene | Rate | On screen |
|---|---|---|---|
| 0–69 | cold open | real time | the finished film, with nothing explaining it yet |
| 69–114 | title | — | *one pin. one year. / nobody writes a prompt* |
| 114–226 | map | ×4.2 | world → Rome → the Colosseum |
| 226–268 | lever | **real time** | committing the year |
| 268–328 | develop | ×10 | the wormhole |
| 328–418 | core sample | ×2.1 | opening the sweep, *render 3 frames* |
| 418–526 | the wait | ×36 | four frames landing, one by one |
| 526–580 | the wait | ×75 | the film rendering |
| 580–808 | payoff | **real time** | one uncut pass: 1700 → 1810 → 1915 → 2015, with the vision line over it |
| 808–900 | end card | — | what it cost, the repo, the credit |

## The music

**SIMPLE2**, one of the theme pieces bundled with iMovie, trimmed to length with
a short fade at each end and sat at 85%. Apple's licence covers using it in your
own productions, including commercially; redistributing the track on its own is
what it forbids, so the mp4 is fine to post and the audio is not committed here.

It is real recorded music. An earlier pass synthesised a bed from oscillators,
and it sounded like what it was.

`./add-music.sh [TRACK]` swaps it — BRIGHT, MODERN, NEON, NEWS, PLAYFUL,
SIMPLE2, TRAVEL.

## Why the rate is on screen

A sweep takes minutes and this video is thirty seconds, so the waits had to go.
A jump cut looks like something was removed; a visible `×36` and a running
elapsed clock look like something was compressed. The two beats that carry the
claim — pulling the lever, and the film playing back — are the only ones left at
real speed, and they are labelled `REAL TIME` so that reads as a choice.

The end card names the runtime for the same reason. The first reply asking *how
slow is it actually* costs more than the seconds it saves.

## Every number in the video, and where it came from

Nothing here is estimated. All of it is legible in the raw recording:

- **4 frames · 1700 → 2015 AD** — the four labelled thumbnails in the filmstrip
  at the end of the run.
- **3 frames rendered** — the dialog's own confirm button reads `RENDER 3 FRAMES`;
  the 2015 station already existed, so the sweep only paid for three.
- **3 clips** — the status line reads `rendering 2 of 3 clips`, one clip per gap
  between stations.
- **5:27 of real time** — from the lever pull (26.3 s into the capture) to the
  finished film playing back (353.0 s).
- **The station years on the payoff** — read off the filmstrip labels, not
  inferred from what the pictures look like.
- **252 million years ago → 3050 AD** — `MIN_YEAR` and `MAX_YEAR` in
  `src/lib/format.ts`, not the README badge.

## "This run", not "this is all it does"

The receipt is prefixed *this run* and the reach line sits directly under it,
because 4 frames across 1700–2015 is one arbitrary sample, not the ceiling.
Frame counts are configurable and `coreSample.ts` ships whole-span presets —
*All of time* (the Great Dying to 3050), *Since the ice*, *Recorded history*,
*Living memory*. Without that framing the honest receipt quietly reads as a
spec sheet, and the most impressive fact about the instrument — that it reaches
from the Triassic to the next millennium — never makes it on screen.

Change any of these in `src/gl4ss/theme.ts`, which is also where the scene
timings, the palette lifted from `portal.css`, and the elapsed-clock anchors
live.

---

# The follow-up cut — Golden Gate

```console
./cut-goldengate.sh
npx remotion render GoldenGate out/gg-raw.mp4 \
  --codec=h264 --image-format=png --crf=16
./add-music.sh SIMPLE2 out/gg-raw.mp4 out/gl4ss-goldengate-23s.mp4
```

23.4 s, same fonts, same badges, same end card, same music. Shorter than the
launch cut on purpose — a follow-up is watched by people who already know what
the thing is, so it re-explains nothing.

| Frames | Scene | Rate | On screen |
|---|---|---|---|
| 0–78 | cold open | **backwards** | the bridge dissolves out of the strait |
| 78–135 | title | — | *same instrument. new pin. / the bridge isn't there yet* |
| 135–225 | map | ×4.3 | the pin, and the Street View seed |
| 225–267 | lever | **real time** | committing the year |
| 267–327 | develop | ×15 | the wormhole |
| 327–381 | seed frame | ×3.3 | 2013 lands, drawn from the photograph |
| 381–588 | payoff | **real time** | the film forwards: 1913 → 2013 |
| 588–702 | end card | — | what it cost |

## Why the cold open runs backwards

The forward pass is the payoff, and playing it twice in twenty-three seconds
would be the same clip twice. Reversed, the opening is its own beat — the bridge
dissolves out of the one view of San Francisco everybody already holds in their
head — and frame 0 is the finished bridge, which is what a muted autoplaying
timeline needs as a poster.

## Two things cropped out, deliberately

The `BLEED` crop in `cut-goldengate.sh` is not just a 16:9 reframe. It starts
below the app's corner label and stops before the right edge, because:

- **The corner label reads the DIAL's year, not the film's.** Over the 1913
  picture it says `2013 AD`. That is a UI artifact, but on a posted video it
  would read as a false caption, so the video draws its own year chips instead.
- **A park sign in the 1913 frame carries garbled model text** — *GOLDEN PARSTOR
  AREA*. Invisible on a phone, obvious to anyone who zooms, and exactly the
  detail a reply would be built around.

The future stations rendered in that session are not used at all, and the end
card states the reach as past-only — *back to 252 million years ago* — rather
than the launch cut's `252 million years ago → 3050 AD`.

---

# The follow-up cut — Potsdamer Platz

```console
./cut-berlin.sh
npx remotion render Berlin out/bl-raw.mp4 \
  --codec=h264 --image-format=png --crf=16
./add-music.sh SIMPLE2 out/bl-raw.mp4 out/gl4ss-berlin-24s.mp4
```

23.9 s. The strongest of the three, because Potsdamer Platz has four genuinely
different states inside a century and the sweep landed all four on one camera:

| Frames | Scene | Rate | On screen |
|---|---|---|---|
| 0–75 | cold open | real time | 1928 collapsing into rubble |
| 75–132 | title | — | *one corner. four Berlins. / one building stands in all four* |
| 132–210 | map | ×4.8 | Berlin down to the Platz, picking the vantage |
| 210–249 | lever | **real time** | committing 2022 |
| 249–309 | develop | ×11 | the wormhole |
| 309–603 | payoff | **real time** | 1946 → 1972 → 2022, uncut |
| 603–717 | end card | — | what it cost |

## The film looks broken until it isn't

Watched from the middle of the recording, the film cuts between eras with no
transition and reads as a failure. It is not: playback there is looping over the
clips that had finished while the rest were still rendering. The bar says so —
*rendering 2 of 3 clips · pending*.

By 510 s it reads **4 of 4 frames · 3 clips** and the same loop runs clean,
holding one camera through all four stations. Both cuts come from after that
point. **Anything cut from before it would be showing a progress bar as if it
were a result.**

## The two cuts split the arc rather than repeat it

The cold open spends 1928 → rubble. The payoff picks up at the rubble and runs
to 2022. No frame appears twice, and between them they cover the whole sweep —
which is why this one does not need the reversed-hook trick the Golden Gate cut
uses.

## The anchor

Weinhaus Huth is the one building in shot in every station, so the camera has
something to hold onto that is genuinely present in 1928, 1946, 1972 and 2022.
The title claims exactly that and nothing more — *one building stands in all
four* is checkable against the video itself, unlike any claim about what else
did or did not survive.

The `BLEED` crop is pushed right to drop a generated `Achtung!` prop sign that
sits half in frame at the left edge, and starts below the app's corner label for
the same reason as the Golden Gate cut — that label reads the dial's year, not
the film's.
