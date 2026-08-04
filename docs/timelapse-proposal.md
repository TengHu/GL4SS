# Proposal: build the time-lapse from the stills

*A cohesive film of one place across time, composed locally, for nothing.*

---

## The problem

A filmed sweep is currently N generated clips, one per adjacent pair of stills,
each pinned at both ends. Played back, the joins swing: the camera whips from one
vantage to another and the middle of the transition is a blur with nothing
legible in it.

**That is not a prompting failure and cannot be fixed by prompting.** The clip is
pinned to two stills whose cameras do not match, so to begin on one and end on
the other it has to travel. The transition prompt already forbids panning,
zooming and dollying; the endpoints overrule it, correctly. Two images from
different viewpoints cannot be bridged without moving the camera.

So the swing is a *measurement* of the still drift — a more honest one than the
drift check, because it renders the actual distance the camera must cover.

The stills drift because the image model composes rather than reproduces; that is
recorded at length in [multi-image.md](multi-image.md) and is not solved.

---

## The proposal

**Compose the film from the still frames directly, in the browser, with no video
model involved.**

```
1900  ████████░░░░  1943  ████████░░░░  1987  ████████░░░░  2010
      hold   fade         hold   fade         hold   fade
```

Hold each still for about a second, cross-dissolve into the next over about half
a second, and encode the result. The encoder already exists — WebCodecs and
mp4-muxer, written for the download button — so this is a compositor, not new
infrastructure.

### Why it is cohesive rather than a slideshow

A slideshow is hard cuts. Hold-and-dissolve is how every "same place across
decades" film is made, and it reads as time passing rather than as pictures being
turned over.

**It cannot swing.** There is no camera being generated. A dissolve fades one
picture into another; nothing pans because nothing is being drawn.

### Alignment, which is what makes it work

Before dissolving, each frame is scaled and shifted so its content sits on top of
the previous one. Without this the dissolve slides, which reads as a mistake.
With it the frames register and the change is all you see.

This is deterministic image work — no model, no call, no variance. Estimating a
translation and scale between two frames of the same scene is a solved problem
and a small amount of code.

### What it costs

**Nothing.** No OpenRouter calls: the stills are already on disk, paid for when
the sweep ran. The film can be regenerated any number of times — different
timing, different order, different subset — for free, which is the opposite of
today, where every look at the result costs a film pass.

### What it gives up

**Motion inside a frame.** Nobody walks, nothing sways, no leaves move. It is
stills evolving, not footage. That is the whole trade: generated motion is what
introduces the swing, because generated motion is what needs a camera.

---

## What this does NOT replace

The generated film stays. When two adjacent stills genuinely share a camera, the
clip between them has nothing to travel and produces exactly what was wanted all
along — the scene evolving, people moving, the building still. That is the better
result and it is worth having wherever it is achievable.

**They compose.** The drift check already measures whether an adjacent pair
shares a camera. So a finished film can be:

| adjacent pair | treatment |
|---|---|
| cameras agree | the generated clip — real motion, real evolution |
| cameras disagree | a dissolve — no swing, no blur, no cost |

Which turns today's worst frames into the cheapest ones, and means improving the
stills improves the film automatically rather than requiring a second pass.

---

## Scope

**In:**

- a compositor over the sweep's ready frames: hold, dissolve, hold
- a deterministic alignment pass (scale + translation to the seed)
- reuse of the existing WebCodecs encoder and download path
- the existing local test harness extended to cover it, so it can be exercised
  without generating anything

**Out, for now:**

- audio
- easing curves, ken-burns drift, or any motion beyond the dissolve
- choosing per-pair between clip and dissolve — worth doing, but only once the
  dissolve path is known good

**Unknown:** how well simple scale-and-translate alignment holds up when the
drift includes a change in tilt or azimuth, which it sometimes does. A rotation
or a perspective change cannot be corrected by shifting, and those frames will
still slide. Whether that matters is a thing to look at rather than predict.

---

## Why this is worth doing even if the stills get fixed

Because it is free and instant. Iterating on the *film* — timing, ordering, which
years to include — currently costs a film pass every time. Composed locally, that
loop costs nothing, and the expensive generated clips can be spent only where
they earn their place.
