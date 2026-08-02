# Multi-image generation

*How MANY PICTURES, ACROSS TIME works, and what you can turn.*

One place, one camera, many years. You pull the lever once to make a **seed** —
a real photograph of a real moment — and the sweep renders the same view at
other stations on the ladder.

---

## The idea in one line

**Cut the seed down to what survives into the target year, and let the drawing
model refill the holes.**

Everything else follows from that.

---

## Why it is built this way

Three earlier designs failed, and the failures are worth knowing because they
explain every odd-looking decision below.

**Editing the seed directly.** Every year was made by handing the seed to an
image-editing call. The model found each person, masked them and repainted their
clothes: same crowd, same poses, same bicycle in the same spot, the same birds in
the same patch of sky across ninety years — and it missed the white trainers,
which were still on the same seated figure in 1900. A wardrobe department, not a
time machine.

**Chaining frame to frame.** Each year drawn from its neighbour, to keep every
step small. It propagated the same problem down the chain and added drift on top.

**Describing the camera in words.** No attachment at all; the vantage carried by
a written standpoint. Measured across one Colosseum sweep, prose fixed the focal
length — 74° against 72°, inside the error of the estimate — and let the camera
climb 1.6 m and level out by 6.2°, moving the horizon 13.4% of the frame height.
In the seed the photographer stands in the crowd and the horizon runs through
their eyes; in the generated frame nobody's head reaches it, because the
photographer is a storey up.

The lesson from all three: **a photograph is the only thing that fixes a
viewpoint, and any photograph you hand over brings its contents with it.** So the
contents are removed before it is handed over.

---

## The pipeline

### Once per sweep

**1. Restore the seed.** Looked up by `sceneKey` (place + year + hour + style). If
you already own it, it costs nothing.

**2. The standpoint** — one text call, seed attached, `planStandpoint()`.
Returns JSON: lens height in metres, bearing, tilt in degrees, horizontal field
of view, distance to the nearest thing in shot, plus two prose paragraphs (a
frame map and the permanent fabric).

The camera *sentence* is built from the figures rather than asked for as prose,
so the numbers and the words are two renderings of one set of figures and cannot
contradict each other.

### Per station

**3. The anachronism pass** — one text call, `segmentAnachronisms()`.

> *"This photograph was taken in 2020. List everything visible that would not be
> present, unchanged, at this spot in 1900."*

Returns boxes with labels and a verdict of `absent` or `altered`. **Open
vocabulary — nothing in the code knows what a person is, or a building, or a
railing.** The model names whatever it finds, so one call serves a crowd, a
monument, a glacier and a burnt-out street.

Measured against the live API:

| seed | target | result |
|---|---|---|
| Colosseum 2020 | 1600 | the 1806 and 1820s buttresses correctly removed, ground level raised over the lowest arcade, vantage held |
| Washington DC 2020 | 1900 | Federal Triangle replaced by the brick quarter that stood there, the B&P railway back across the Mall, obelisk unmoved, on a frame ~60% erased |

~6 seconds, ~$0.003 each.

**4. The cut-out** — **no API call**, `compositeCutout()`, entirely in the browser.

Three states end up in the picture, and every pixel is in exactly one of them:

| what you see | verdict | means |
|---|---|---|
| **flat grey** | `absent` | was not there *at all* in the target year — invent something new. Box grown before filling |
| **blurred** | `altered` | *was* there but looked different — the shape survives, the detail is freed |
| **untouched** | not listed | the same in the target year — copy it exactly |

Worked example, the DC seed asked for 1900 — nine `absent`, thirteen `altered`:

- **grey:** the Federal Triangle, the National Archives, the Smithsonian museums
  on Constitution Ave, the Department of Commerce, the Reflecting Pool. None of
  them existed, so there is nothing to preserve and the model builds the 1900
  city from nothing.
- **blurred:** the Mall lawn and its paths, the roads, the Ellipse, the Tidal
  Basin, the plaza at the Monument's base. The ground was there — but as a
  Victorian garden with winding drives, not a modern greensward.
- **untouched:** the Monument itself, finished 1884 and correct as it stands.

Grey says *"something else goes here."* Blur says *"this thing, differently."*
Greying the Mall too would tell the model nothing about there being open ground
rather than more buildings; the blur keeps the massing and frees the period.

Then the **perspective grid** is painted into the grey regions only, from the
standpoint numbers. Where pixels survive they state the camera themselves; where
they are gone, the grid is the only thing left saying where the ground lies.

### Who does what

The division of labour is worth being exact about, because the cut-out looks like
something a model produced and it is not.

| step | who | what comes out |
|---|---|---|
| **decide** | `gemini-2.5-flash`, vision in / text out | a JSON list — box, label, and the word `absent` or `altered`. Nothing else |
| **paint** | our canvas code, no network | the grey, the blur, the grid |
| **generate** | the image model | the finished frame |

Gemini's entire contribution is numbers and two words:

```json
{"b":[164,477,401,843], "l":"Federal Triangle buildings", "c":"absent"}
{"b":[390,484,532,923], "l":"National Mall landscaping",  "c":"altered"}
```

It never sees the cut-out and never produces an image — it only ever looked at
the seed photograph.

**Which two words exist is our choice, not the model's.** The prompt asks for
`absent` or `altered`; the model only assigns them. That is why there are exactly
two treatments and no gradient between them — we never asked for a third, and a
box has no interior to grade anyway. See *Known weaknesses*.

**5. The planner** — one text call, the existing `generateSceneDirection()`. Sees
the seed. Returns habitation, biome, period markers, atmosphere, the light,
subjects, and `standing` — what stood here in this year.

**6. Generate** — one image call. The cut-out is the *only* attachment.

```
seed photograph
   │
   ├── standpoint  ──── camera numbers ──┐
   │                                     │
   ├── anachronism pass (per year) ──► cut-out ──► image call ──► frame
   │                                     │
   └── planner (per year) ──── prose ────┘
```

**Per station: 2 text calls + 1 image call.** Per sweep: one extra text call.
The cut-out is free — canvas, no network, no cache.

---

## Two rules that are load-bearing

**Direct from the seed, never from a neighbour.** A probe took one photograph
from 2020 to 1900 in a single step with the vantage intact, so the "keep each
step small" premise is weak. Direct-from-seed buys three things chaining cannot:
the reference is a real photograph rather than an interpretation of one, nothing
accumulates down a chain, and every station can run at once.

**Prompts are phrased as what IS there.** The 1900 probe asked for *"no fencing,
no signage, no railings"* and got railings back. The 1600 probe said *"the arches
meet the earth directly"* and got clean masonry. Naming an absent object summons
it — the rule the deleted negatives module in `promptcraft.ts` exists to record —
and an edit prompt is no exception.

---

## Boxes, not masks

Gemini will return per-pixel masks. We do not use them.

- **Cost.** One large mask ate 30k output tokens; a full request cost **$0.10 and
  146 seconds** to return one and a half objects. Boxes cost a thousandth of that.
- **Failure modes are asymmetric.** Erase too much and the model reinvents
  background, which it does well. Erase too little and a fragment survives, and
  inpainting *bridges it back* — a 95%-accurate mask leaves 5% of a fence, which
  is a seed for the fence. Boxes are grown rather than tightened for this reason.

**What this loses:** a thin thing lying on content that must survive exactly — a
handrail across a facade, whose box is mostly facade. That is a real limitation
and it is not worked around. If a railing ever refuses to leave, this is why.

---

## The knobs

### In the UI

| control | values | effect |
|---|---|---|
| **how many pictures** | 2 · 4 · 8 · 16 · 24 | **the biggest lever.** More stations, smaller gaps, smoother transitions |
| **span** | Living memory · Recorded history · Since the ice · All of time | same thing from the other end. Only `deep` (All of time) uses a log curve; the other three are linear |
| **explicit years** | typed in | override the span entirely |
| **style / phase** | chips | part of `sceneKey`, so they change what is cached |

### Constants in the code

| knob | file | now | turn it **up** → |
|---|---|---|---|
| box grow | `timeMask.ts` | `min(W,H)/160` ≈ 8 px | more erased, frames differ more, fewer survivors |
| blur radius | `timeMask.ts` | `min(W,H)/90` ≈ 14 px | more freedom to repaint an `altered` region |
| object cap | `timeMask.ts` | 30 | more things caught per frame, more tokens |
| whole-frame reject | `timeMask.ts` | area > 0.9 dropped | a box covering the frame is the model giving up |
| planner lookahead | `coreSample.ts` | 3 | more text calls in flight at once |
| camera limits | `cameraSkeleton.ts` | tilt ±60°, FOV 10–140°, eye 0.3–120 m | outside these, no grid is drawn |

Turn grow and blur **down** and frames hug the seed: smoother, but modern things
start surviving. Turn them **up** and each year is more its own picture, at the
cost of drift.

#### Grow and blur are not the same mechanism

They are easy to read as one dial applied to two kinds of box. They are not:
**one changes geometry, the other changes pixels, and each touches only one
verdict.**

| | applies to | what it does | resizes the box? |
|---|---|---|---|
| **box grow** | `absent` only | enlarges the rectangle **before** filling it grey | **yes** |
| **blur radius** | `altered` only | how blurry the pixels **inside** the rectangle get | **no** — used at the size the model returned |

```js
// absent — grown
const r = toRect(a, grow);      // grow = min(W,H)/160
ctx.clip(); ctx.fillStyle = '#8c8c8c'; ctx.fillRect(...)

// altered — NOT grown
const r = toRect(a, 0);         // <- zero
ctx.clip(); ctx.filter = `blur(${...}px)`; ctx.drawImage(...)
```

**Only `absent` grows, because under-erasing is the expensive mistake.** Leave a
sliver of a fence at the edge of the box and inpainting bridges it back across
the hole — that is exactly how the railings returned in the 1900 Colosseum probe.
Surplus erased wall is simply reinvented, which the model does well, so erase
boxes are deliberately generous.

Blurring has no such failure mode. A sliver of sharp pixels at the edge of a
blurred region is not a seed for anything, it is just sharp — so there is nothing
to buy by growing it.

The two knobs answer different questions:

- **grow** — *how much extra do we throw away?*
- **blur** — *how much freedom do we give to what we keep?*

### How abrupt the transitions feel

The real driver is **how much of the frame gets erased** — two frames sharing 90%
of their pixels feel continuous, two sharing 30% feel like separate photographs.
That is set by how much history happened between the stations, so most of the
abruptness is honest. 2000 → 2010 barely changes; 1900 → 1943 changes a lot.

To smooth it: more stations, or a narrower span, or smaller grow and blur.
To sharpen it: the reverse.

The **film step** morphs between stills with both endpoints pinned, so longer
clips soften any join regardless of how different the two stills are.

**Not built:** attaching the previous frame as a second reference. It is the
strongest smoothing available — consecutive frames would share their invented
details instead of each making them up separately — and it is safe now in a way
it was not before, because a cut-out contains no people to propagate.

---

## Reading the console

```
[looking-glass] standpoint: {"eyeHeightM":1.6,"tiltDeg":7.2,"hfovDeg":74,…}
[looking-glass] 1900: 22 anachronisms (9 absent) · cut-out built
```

| what you see | what it means |
|---|---|
| `0 anachronisms` | the pass failed or found nothing — **this frame goes out with the whole seed intact**, so anything modern in it survives |
| `cut-out none` | boxes came back but compositing failed (a tainted cross-origin canvas is the usual cause); falls through to unmasked |
| no standpoint line | the call failed — holes still get erased, but no grid is painted into them |
| a low `absent` count on a distant year | distrust it. 1900 should be erasing a lot |

---

## How it degrades

Nothing here fails the run. In order of severity:

1. **Standpoint numbers out of range** → no grid in the holes. Still works.
2. **Standpoint unparseable** → no camera and no prose; frames compose as they
   did before any of this existed.
3. **Anachronism pass fails** → no cut-out, the frame renders unmasked.
4. **Compositing throws** → same.
5. **Provider refuses the attachment** → retries with a prompt that never
   mentions a cut-out, because a clause about a picture the model was never given
   is a mistake this codebase has already made once.

---

## Known weaknesses

- **Hard edges.** The shipped compositor uses `ctx.clip()`, which cuts sharply.
  The versions this design was validated against feathered every boundary with a
  9 px Gaussian. Visible rectangular seams are possible.
- **Thin objects on preserved surfaces** — see *Boxes, not masks*.
- **The object cap forces a trade-off.** A DC probe spent all 30 entries on
  architecture and dropped the people and street furniture entirely.
- **Degree is binary.** `absent` or `altered`, nothing between, so lightly
  weathered and completely rebuilt get the same 14 px of blur.
- **Kept pixels are byte-identical to the seed** — same sun angle, same shadows,
  same haze, same white balance. The building is right and the *photograph* is the
  2020 one, which is what makes a frame read as an edit rather than as a separate
  exposure.

---

## Files

| file | what it holds |
|---|---|
| `src/portal/lib/coreSample.ts` | the runner: ordering, the seed restore, per-station orchestration |
| `src/portal/lib/timeMask.ts` | the anachronism pass and the compositor |
| `src/portal/lib/cameraSkeleton.ts` | the perspective grid and the horizon arithmetic |
| `src/lib/openrouter.ts` | `planStandpoint`, `generateSceneDirection`, the image call |
| `src/lib/promptcraft.ts` | prompt assembly, including the clause explaining the cut-out |
| `src/portal/lib/render.ts` | `renderStill` — the shared still primitive and its moderation ladder |
