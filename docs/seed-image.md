# The seed image

*How the first picture gets made — the lever pull.*

One place, one year, one photograph. This is the app's primary action and its
only paid one: browsing is free, settling on a station you already own restores
it for nothing, and **nothing spends money until the lever is thrown**.

It is a different code path from a sweep. This lives in `engine.ts`;
`coreSample.ts` never runs here. See [multi-image.md](multi-image.md) for what
happens afterwards, when this frame becomes a sweep's seed.

---

## Two paths

Everything below forks on one question: **is a photograph attached?**

| | A · no photograph | B · with a photograph |
|---|---|---|
| what the frame IS | drawn for this spacetime | **that photograph** |
| what the model gets | a description of a spacetime | a picture of this place, and a description |
| framing | free, deliberately loose | that photograph, cover-cropped to 16:9 |
| era palette | applied | never consulted — it is a real photograph |
| calls | 1 text + 1 image | **1 text, no image** |

Both produce a frame stored under the same key. **A station is a station**, and
whichever picture is there is the one you keep.

**The attachment is not a reference.** It was: a frame was still generated for
the year on the dial, with the photograph fixing only where the camera stood.
That is gone. For a place you have already photographed, the app has nothing
better to offer than your photograph, and drawing over it spent money to lose
information.

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

## Path B — the photograph IS the frame

`run()` forks **after `generateSceneDirection` and before the prompts are
built**, and that placement is the whole design. The planner still runs and still
sees the photograph, so the station has its narrative, its atmosphere and a real
`direction`: it talks while it works, the archive entry is complete, and
`widen()` works on it. Only `buildCoreSamplePrompts` and `renderStill` are
skipped.

**One text call. No image call, so no image cost.** The seed stops being the paid
action; a sweep becomes the only thing that spends real money.

### The planner still sees it

```js
reference: job.reference
```

The photograph is still worth the planner seeing, even though no picture will be
drawn from it, because the prose has to be about the right place. A coordinate
alone says "Brooklyn", and the planner given only that picks the most photogenic
thing in the borough — it once chose the Brooklyn Bridge while the visitor's
photograph showed a residential side street. A narrative about the bridge under a
photograph of a stoop is the same failure in words that it used to be in pixels.

This is the **vision** shape — image in, text out — which is what
`/chat/completions` does correctly. It is now the *only* place a photograph is
sent anywhere.

### Why nothing downstream notices

What a sweep needs from a seed is **pixels**. `planStandpoint` reads the geometry
out of the seed photograph itself, and every station plans its own year. Nothing
in `coreSample.ts` asks whether a model made the picture it is cutting — it asks
for `stored.heroUrl`. A kept photograph is a *better* seed by the doc's own
argument in [multi-image.md](multi-image.md): a photograph is the only thing that
fixes a viewpoint, and this one has not been through a generation first.

### It is cover-cropped, and that is a real loss

`toWidescreen` crops centred to 16:9. The anchored path never needed this — its
clause asked the model to *recompose*, which extends the view rather than
discarding any of it — but there is no model here to do that, and a frame that is
not 16:9 is cut at the wrong shape by every sweep that grows out of it.

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

## A photograph can no longer be refused

It is never sent to an image model, so there is nothing to moderate. The
machinery that handled this — `renderStill`'s `references`, its
`unanchoredPrompts` fallback list, the `onDegrade` handler and promptcraft's
`'photograph'` `ReferenceKind` — is still there and is still used **by the
sweep**, which attaches a cut-out to every station. Nothing on the lever path
passes a reference to it any more.

---

## Storage

On success `putFrame` upserts under

```
sceneKey = lat|lng|year|styleId   (+ |phase when it is not midday)
```

That record is what a sweep later restores for free as its seed, and what makes a
revisit both free and identical.

**The photograph is deliberately not in the key.** It was, briefly, so a
photograph frame could not collide with a plain one. But a fingerprint
in the key makes the photograph a standing property of the app: clear it and the
frame it produced becomes unreachable, so it can never be put down. The
photograph belongs to the moment of making a seed and is spent by it.

The consequence is worth stating plainly: **pull the lever twice at the same
station and the second frame overwrites the first**, photograph or no. That is
deliberate — the lever always makes a new picture, and it upserts rather than
deleting first, so a regeneration that fails leaves the frame you had.

Path B sharpens that consequence without changing the rule. A drawn frame
overwritten by another drawn frame loses a roll of the dice; a **photograph**
overwritten loses something nothing can make again. The answer is the warning on
the glass rather than a fingerprint in the key — putting it in the key was
already tried and rejected above, and the reason it was rejected does not get
weaker here.

---

## Files

| file | what it holds |
|---|---|
| `src/portal/lib/engine.ts` | the queue, the cache, `request`/`retry`, and the generation path |
| `src/portal/Portal.tsx` | `pullLever`, the seed-photo lifecycle, `sceneKey`'s style half |
| `src/portal/components/SeedPhoto.tsx` | file picker, paste and drop |
| `src/portal/lib/seedImage.ts` | reading and downscaling a photograph, and `toWidescreen` |
| `src/portal/components/StreetViewSeed.tsx` | the Google panorama route |
| `src/lib/openrouter.ts` | `generateSceneDirection` — the one call a photograph still reaches |
| `src/lib/promptcraft.ts` | prompt assembly; its photograph clause is now sweep-only |
| `src/portal/lib/render.ts` | `renderStill` and its moderation ladder |
