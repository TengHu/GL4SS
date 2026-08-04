# The launch cut

A 30-second, 1920×1080 silent cut of one end-to-end run of THE LOOKING GLASS —
Rome, four temporal stations, one film — built in Remotion from a FocuSee screen
recording.

> time travel to any neighborhood on Earth, watch history pass before your eyes

The end card points at `github.com/TengHu/GL4SS` and credits the upstream fork
(`elder-plinius/GL4SS`) in small type underneath. It deliberately does **not**
show `GL4SS.ai` — that is upstream's domain, and sending a viral video's traffic
there would hand the attention to the wrong repo.

Silent on purpose: X and LinkedIn autoplay muted, so everything that has to be
said is on screen.

## Commands

```console
npm i                      # install
./cut-source.sh            # cut public/*.mp4 out of the raw recording
npm run dev                # preview in Remotion Studio
npx remotion render LookingGlass out/gl4ss-30s.mp4 \
  --codec=h264 --image-format=png --crf=16
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
