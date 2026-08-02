# The seed image

*How the first picture gets made — the lever pull.*

One place, one year, one photograph. This is the app's primary action and its
only paid one: browsing is free, settling on a station you already own restores
it for nothing, and **nothing spends money until the lever is thrown**.

It is a different code path from a sweep. This lives in `engine.ts`;
`coreSample.ts` never runs here. See [multi-image.md](multi-image.md) for what
happens afterwards, when this frame becomes a sweep's seed.

---

## Three paths

The first fork is **is a photograph attached?** The second, only reachable with
one, is **should it be drawn from, or kept?**

| | A · no photograph | B · anchored | C · verbatim |
|---|---|---|---|
| what the model gets | a description of a spacetime | a picture of this place, and a description | a picture of this place, and a description |
| what the attachment IS | — | **the subject** — reproduce it | **the frame** — nothing draws it |
| framing | free, deliberately loose | that photograph's standpoint, recomposed to 16:9 | that photograph, cover-cropped to 16:9 |
| era palette | applied | stands aside — the photograph authors its own colour | never consulted |
| calls | 1 text + 1 image | 1 text + 1 image | **1 text, no image** |

All three produce a frame stored under the same key. **A station is a station**,
and whichever picture is there is the one you keep.

---

## Where the photograph comes from

Three routes in, and from the moment any of them produces a `SeedImage` nothing
downstream can tell them apart:

- **the file picker** — "USE MY OWN PHOTO"
- **paste or drop** — the same box accepts both
- **Street View** — look around a Google panorama and keep the view you are
  looking at. **Capturing moves the dial**, because the panorama carries a date
  and the picture belongs to the year it was actually taken.

The photograph is **spent by one lever pull** and cleared. It is also dropped
whenever the pin moves — a photograph is a photograph *of a place*, and once you
click somewhere else it has stopped being evidence about where you are standing.
Moving the *dial* does not drop it: that is how you say "this picture, at that
year", which is the whole point.

---

## Path A — no photograph

### 1 · The planner — one text call

```js
generateSceneDirection(apiKey, location, coordinates, year, 'wide-field',
  textModel, styleOverride, {
    phase:      the chosen hour, as a sentence about the light
    neighbours: neighbourContrast(year),   // the DIAL's stations either side
  })
```

Returns `habitation`, `biome`, `periodMarkers`, `atmosphere`, `cameraNotes`,
three subjects and a narrative.

`neighbours` here is the **dial's** neighbours — for 1987 that is 1986 and
1988 — so "must not resemble" means the frame one click away. A sweep overrides
this with its own spacing, because being told to differ from a year one apart is
useless when the step is thirty-five.

**The narrative is shown the moment it arrives.** That is what puts prose on the
glass while the picture is still cooking.

### 2 · The image — one image call

Three candidate prompts are assembled locally — **centre subject first**, then
left, then right. Only the first is sent; the others are moderation fallbacks, so
a blocked gladiator degrades to the stonemason in the same moment rather than
failing the station outright.

The prompt, in order:

```
[0] camera, film stock, cameraNotes, and the film's own evidence
[1] centre subject, place, year
[2] habitation
[3] periodMarkers
[4] "everything belongs to 1900 AD EXACTLY"
[5] biome
[6] atmosphere + the era's palette and surfaces
[7] "a single wide 16:9 photograph"
```

### What is in a seed prompt and NOT in a sweep frame

This is the interesting part, and all four are **right here and wrong there**:

- *"framing that sits a little loose and slightly off centre, nothing arranged"*
- *"the centre of the scene"* — the subject owns the frame's centre
- *"the near ones large and sharp"* — the habitation clause placing the camera
- a named **35 mm** lens
- the full era palette — *"Colours run to sepia and faded olive. Surfaces are
  wool suiting, plate glass, lacquered wood."*

A seed has no predecessor to hold the camera on. It is **free to frame the place
however it likes**, which is what an independent photograph of a spacetime should
be. `fixedFraming` is off, so every one of them fires.

In a sweep those same four instructions fight the standpoint and the cut-out, and
are silenced. Same code, opposite intent — see *The knobs* in
[multi-image.md](multi-image.md).

---

## Path B — with a photograph

Everything in Path A still happens. Two things change.

### The planner sees it too

```js
reference: job.reference
```

Not decoration. A coordinate alone says "Brooklyn", and the planner given only
that picks the most photogenic thing in the borough — it once chose the Brooklyn
Bridge while the visitor's photograph showed a residential side street, and the
image model was then asked to draw the bridge from a brownstone stoop. No
reference can reconcile that: the two describe different LOCATIONS, not different
framings of one.

This is the **vision** shape — image in, text out — which is what
`/chat/completions` does correctly.

### One clause goes FIRST

> *The attached photograph shows this exact place at this exact time. It is the
> subject: reproduce what it shows — the same street or ground, the same
> buildings and structures, the same vantage and direction of view, the same
> light and season, the same period in every visible detail. Do not relocate it,
> do not modernise it, do not age it, and do not substitute a more famous view of
> the same district. Where the photograph is unclear or cut off, extend it
> plausibly rather than inventing something else. Recompose to a wide 16:9 frame
> from that same standpoint.*

**First, not appended.** The most important thing goes first; the one instruction
governing what the picture IS must not sit behind eight blocks of scene
description.

**It claims the year, not just the place.** The visitor's photograph is asserted
to be of this place *at this time* — they own that claim — so the clause asks for
fidelity rather than change. That is the entire difference from a sweep's
cut-out clause, which describes a picture of a DIFFERENT year and asks for change
in the erased parts. The two cannot share wording, which is why `ReferenceKind`
has two values.

**The only licence taken is the frame shape.** The portal is full-bleed 16:9 and
everything downstream assumes it, so recomposing is stated openly rather than
being contradicted by a claim of an identical lens.

### The era palette stands aside

`photographAnchored` fires, and block `[6]` collapses from

> *The air is high hazy Roman light, lit by pre-electric daylight, slight haze.
> Colours run to sepia and faded olive. Surfaces are wool suiting, plate glass,
> lacquered wood.*

to

> *The air is high hazy Roman light.*

The photograph authors its own colour and texture, exactly as a style does. Both
keep the era's **substance** — the period, the materials, what is standing — and
yield only its palette. Telling the model which colours the century runs to, on
top of a photograph that already shows them, is a second opinion about something
already settled.

### The API shape is different

A reference goes to `/api/v1/images` in `input_references` — **the only endpoint
that takes one**. `/chat/completions` with an `image_url` block is the vision
shape: image in, text out. An image-output model accepts that request, reads the
prompt, has nowhere to put the attachment, and generates from the prompt alone.
Nothing fails, so nothing reports. That bug shipped once.

---

## Path C — the photograph IS the frame

Chosen on the control itself: **draw from it** (the default, Path B) or **keep it
as-is**. The choice is about *this photograph*, so it is cleared with it — by the
lever, and by the pin moving.

Everything in Path B's planner still happens, and that is the point of where the
branch sits: `run()` forks **after `generateSceneDirection` and before the
prompts are built**. So the station still has its narrative, its atmosphere and a
real `direction` — the planner *saw* the photograph — and `widen()` still works
on the archive entry. What is skipped is `buildCoreSamplePrompts` and
`renderStill`.

**One text call. No image call, so no image cost.** The seed stops being the paid
action; the sweep becomes the only thing that spends real money.

### Why nothing downstream notices

What a sweep needs from a seed is **pixels**. `planStandpoint` reads the geometry
out of the seed photograph itself, and every station plans its own year. Nothing
in `coreSample.ts` asks whether a model made the picture it is cutting — it asks
for `stored.heroUrl`. A kept photograph is a *better* seed by the doc's own
argument in [multi-image.md](multi-image.md): a photograph is the only thing that
fixes a viewpoint, and this one has not been through a generation first.

### It is cover-cropped, and that is a real loss

`toWidescreen` crops centred to 16:9. Path B never needs this — the anchor clause
asks the model to *recompose*, which extends the view rather than discarding any
of it — but Path C has no model to do that, and a frame that is not 16:9 is cut
at the wrong shape by every sweep that grows out of it.

**Cover, not contain.** Letterbox bars baked into the pixels get cropped straight
back off by the portal's own `object-fit: cover`, so the same edges are lost
either way and the frame would carry black borders into every cut-out. A portrait
photograph gives up most of its height. The control says so before the lever is
pulled.

### The frame must declare itself

`verbatim` is stored on the frame and shown on the glass. Two reasons, and the
second is the sharp one:

- Every other picture in the archive was drawn. An undeclared photograph sitting
  among them reads as an unusually good generation.
- **The photograph is not in the `sceneKey`** — see *Storage* — so the next lever
  pull at that station overwrites it with a drawn frame. Every other frame in the
  app can be made again. This one cannot. The visitor is owed that warning while
  it is still on screen.

It survives a reload because the question it answers ("was this drawn?") cannot
be recovered by looking at the pixels. Rows written before the flag existed read
back `undefined`, which means what it always meant: generated. No migration, and
none possible.

---

## If the photograph is refused

Providers moderate input images **separately from prompts**. `renderStill` drops
the attachment and retries with `unanchoredPrompts` — a separately built
candidate list that never mentions a photograph, because otherwise the model
would be reading instructions about a picture it no longer has.

Only a **structural** refusal drops the attachment. Moderation of the prompt is
handled inside `generateImageWithFallback`, and treating a moderated prompt as an
input-image problem would throw away the photograph every time a frame happened
to contain a gladiator.

---

## Storage

On success `putFrame` upserts under

```
sceneKey = lat|lng|year|styleId   (+ |phase when it is not midday)
```

That record is what a sweep later restores for free as its seed, and what makes a
revisit both free and identical.

**The photograph is deliberately not in the key.** It was, briefly, so a
photograph-anchored frame could not collide with a plain one. But a fingerprint
in the key makes the photograph a standing property of the app: clear it and the
frame it produced becomes unreachable, so it can never be put down. The
photograph belongs to the moment of making a seed and is spent by it.

The consequence is worth stating plainly: **pull the lever twice at the same
station and the second frame overwrites the first**, photograph or no. That is
deliberate — the lever always makes a new picture, and it upserts rather than
deleting first, so a regeneration that fails leaves the frame you had.

Path C sharpens that consequence without changing the rule. A drawn frame
overwritten by another drawn frame loses a roll of the dice; a **kept** frame
overwritten loses the visitor's photograph, which nothing can make again. The
answer is the warning on the glass rather than a fingerprint in the key — putting
it in the key was already tried and rejected above, and the reason it was
rejected does not get weaker here.

---

## Files

| file | what it holds |
|---|---|
| `src/portal/lib/engine.ts` | the queue, the cache, `request`/`retry`, and the generation path |
| `src/portal/Portal.tsx` | `pullLever`, the seed-photo lifecycle, `sceneKey`'s style half |
| `src/portal/components/SeedPhoto.tsx` | file picker, paste and drop, and the draw-from-it / keep-it choice |
| `src/portal/lib/seedImage.ts` | reading and downscaling a photograph, and `toWidescreen` |
| `src/portal/components/StreetViewSeed.tsx` | the Google panorama route |
| `src/lib/openrouter.ts` | `generateSceneDirection`, `generateImageWithReference` |
| `src/lib/promptcraft.ts` | prompt assembly and the photograph clause |
| `src/portal/lib/render.ts` | `renderStill` and its moderation ladder |
