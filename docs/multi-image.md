# Multi-image generation

*How MANY PICTURES, ACROSS TIME works, and what you can turn.*

One place, one camera, many years. You pull the lever once to make a **seed** —
a real photograph of a real moment — and the sweep renders the same view at
other stations on the ladder.

**"One camera" is the goal and not yet the achievement.** Everything below is
built to hold a viewpoint across time, and measurement says the image model moves
it anyway — always lower, and by more than the machinery here can correct. Read
*Known weaknesses* before trusting the word "same".

---

## The idea in one line

**Hand over the picture beside this one, and a list of edits to it.**

Everything else follows from that.

It used to be *"cut the picture down to what survives and let the model refill
the holes"*, and the holes are what went wrong: erasing takes the buildings, the
roads and the ground that were stating the camera, and a model composing into a
large grey region composes the whole frame. So the same information now travels
as text — one line per thing, naming what is in the photograph and what stands in
its place this year — and the photograph itself goes over untouched.

The cut is still there behind `window.__cut`. See *Two ways to say the same
thing*.

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

**Chaining frame to frame, UNCUT.** Each year drawn from its neighbour to keep
every step small. It propagated the same crowd down the chain and added drift on
top. Note what actually failed: not the chaining, the *uncut*. Every link now
passes through the cut and the chain is back — see *The chain*.

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

## At a glance

Years `1900 1943 1987 [2010] 2030 2050`, seed at 2010.

### Topology — two chains from one pin

```
        <------------ past          future ------------>

   1900  <--  1943  <--  1987  <-- [2010] -->  2030  -->  2050
                                    seed
                                   (owned,
                                  not cut)

   each arrow = "is cut from"
```

The seed is a **pin, not a hub**. Its pixels reach 1900 *through* 1987 and 1943,
surviving wherever history left something standing and erased where it did not.

### Order — alternating outward

```
step   1      2      3      4      5
      2030   1987   2050   1943   1900
       |      |      |      |      |
      cut    cut    cut    cut    cut
      from   from   from   from   from
      2010   2010   2030   1987   1943
```

Alternating keeps the next picture adjacent to the one on screen, instead of
marching to one end and filling in behind.

### The per-station pipeline

```
  +- source = nearest finished frame toward the seed
  |
  +--> gemini-3-flash ........ "what in this 1943 picture
  |                             isn't there in 1900?"
  |                             -> [{box, label, absent|altered}]
  |                             THE LABELS ARE USED, NOT THE BOXES
  |
  +--> planner ............... given those labels, writes the EDIT LIST:
  |    (runs AFTER, not          "the asphalt road: unpaved earth"
  |     alongside)               "the yellow crane: open ground"
  |                             — never a description of the year
  |
  +--> image model ........... ONE attachment: the raw neighbour, uncut
  |                            -> FRAME 1900
  |
  +--> standpoint again ...... read the camera back OUT of the frame
       (diagnostic)           that came back, and compare
```

With `window.__cut = true` a canvas step returns between the planner and the
image model — absent regions greyed and grown, altered ones blurred, the
perspective grid painted into the grey — and both pictures are attached, the
cut-out as the authority on what is present and the raw one for the camera.

**3 text calls + 1 image call.** The canvas step is free; the third text call is
the drift measurement and it changes no pixels.

Nothing is cropped — regions are erased in place, and there is a third treatment
(blur) between keeping and erasing.

### What flows, and how

```
 seed --> standpoint (ONCE) --> camera numbers --> every frame, unchanged
   |                                                    ^
   |                                              never travels
   |                                              in the pixels
   |
   +--> pixels --> 1987 --> 1943 --> 1900
                  (attenuating: erased where history erased)
```

Two things propagate by two different routes. **The camera is text, so it cannot
decay.** The pixels decay exactly as fast as the world changed.

### The loop

```
for each station, outward from the seed:
    if this is the SEED and it is owned -> restore (free)
    source = nearest finished frame toward the seed
    if none           -> generate from prose alone, mark unanchored
    else              -> run the pipeline above
until every station is done
```

Serial by construction: 1900 cannot start until 1943 lands.

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

**Only the camera sentence reaches a frame that has a picture attached.** The
other two paragraphs — `frameMap` and `permanentFabric` — are written for an
observer who "will never see a photograph", which is what this call's own prompt
says and what was true before the cut-out existed. It is not true now. `frameMap`
pins the landmark to a position: *"the Flavian Amphitheatre sits exactly at the
horizontal centre of the frame, its interior floor one-third up."* Handed that
alongside an attachment where the amphitheatre is centre-right and low, a model
obeys both and draws two. A frame with no attachment still gets all three, which
is the case those paragraphs were written for.

**The height is the drop to the ground THE SCENE sits on**, not to the paving
under the photographer's feet. In a street they are the same number. From a
terrace over a city they differ by two orders of magnitude, and the second is the
one the perspective grid is drawn from — asked the other way, a seed on a
viewing terrace answered 1.6 m and the grid laid a street-level ground plane
across an aerial view.

**The horizon is stated as a fraction of the frame**, computed from the seed's
tilt and field of view by `horizonFraction()` — not estimated, and naming no
object, which is what makes it safe to say where the frame map was not. Every
other camera instruction is in metres, and metres are a claim about the world: to
obey "the lens is 45 m up" the model must reason from a height to a projection.
Where the horizon falls is a claim about the picture, which it can check against
its own canvas. Above about 20° of downward tilt at 65° field of view the horizon
leaves the top of a 16:9 frame entirely, which is the common case for these seeds
and the strongest form of the instruction: no sky anywhere in the picture is
harder to satisfy by accident than any percentage.

**3. The ruler check** — one text call, *diagnostic only*. The seed is read a
second time and the disagreement between two reads of one unchanged picture is
printed. Every drift figure below is the difference between two independent
model estimates, and that is only a measurement if the estimator is repeatable.
Measured: height came back 45m vs 45m on one seed and 45m vs 35m on another,
while tilt disagreed by 6° on an unchanged picture — which at 65° field of view
moves the horizon 16% of frame height, twice what the drift threshold was
originally set to catch.

### Per station

**4. The anachronism pass** — one text call, `segmentAnachronisms()`.

> *"This photograph was taken in 111. List everything visible that would not be
> present, unchanged, at this spot in 110."*

The picture it is asked about is **the frame beside this one**, not the seed —
except for the first frame out from the seed, which has nothing else to use. Same
prompt, same boxes, same treatment either way; only the input picture differs.

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

**5. The cut-out** — **no API call**, `compositeCutout()`, entirely in the browser.
Identical processing whatever picture was cut.

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
| **decide** | `config.models.text` (default `gemini-3-flash`), vision in / text out | a JSON list — box, label, and the word `absent` or `altered`. Nothing else |
| **paint** | our canvas code, no network | the grey, the blur, the grid |
| **generate** | the image model | the finished frame |

The text model's entire contribution is numbers and two words:

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

**6. The planner** — one text call, `generateSceneDirection()`, and it now runs
AFTER the segmenter rather than ahead of the cursor.

It is handed the labels from step 4 and asked for `standing` in a shape it was
not asked for before: **one line per item, "the ‹thing in the photograph›: ‹what
is in its place this year›"**, with an explicit instruction not to describe the
period, the mood, the politics or the events, and not to write a scene.

> the asphalt road: unpaved earth and tram rails
> the yellow crane: open ground
> the tourist queue: a few figures on foot in wartime dress
> the Arch of Constantine: standing, boarded and sandbagged

**Why the shape matters more than the content.** 1943 Rome came back as occupied
Rome — troops, sandbags, a street-level war photograph owing nothing to the
aerial it was handed — while 1987, one step earlier through the same pipeline,
held almost exactly. The difference is that one target year has a photograph the
world already knows and the other has none. And the prompt was feeding it:
`standing` used to be a paragraph about the year, which for 1943 describes the
occupation in detail, so the model received the reference and beside it a written
brief for the picture it was already going to draw.

Every clause now points at the picture instead of at the year, and the year has
nothing left to summon. `periodMarkers` is dropped for the same reason when a
picture is attached — the same shape in miniature. Both come back for a frame
drawn from nothing, which has only words to go on.

**WHAT THIS COST: the lookahead.** The planner used to run three stations ahead
of the renderer, which took roughly four minutes of text latency out of a
24-frame sweep. A planner that must know what is in the picture cannot start
before something has looked at it. The call count per station is unchanged; the
calls are simply serial now.

**7. Generate** — one image call. **The raw neighbour, untouched, one
attachment.**

Nothing is erased, so every pixel that was stating the camera is still there. The
temporal work is carried by the edit list from step 6.

**The sweep builds its own prompt**, `buildSweepPrompts`, and does not borrow the
lever's. `DEFAULT_IMAGE_TEMPLATE`'s eight slots exist to author a picture out of
nothing — a subject, a viewpoint, terrain, framing, a palette — and a sweep had
to argue every one of them down against its own attachment. `fixedFraming` was
the list of arguments it had won; three slots were never on it, and each produced
a failure. `{camera}` said *"eye level, a short walk back from the subject"* in
block zero and walked the camera off a terrace to the ground. `{subject}` named
the Colosseum while the attachment already held one, and the model drew a second.
`{biome}` describes terrain the attachment shows. An exception list grows and
never closes, so the sweep starts from the other premise: **every fact is stated
once, by the strongest source that knows it, and where the attachment settles
something the prompt is silent rather than overridden.**

**And short.** Measured outside the app: `gemini-3.1-flash-lite-image`, the
cheapest model of its family at temperature 1, given a clean aerial of the
Colosseum and the nine words *"give me the photo in 1700 in exact same camera
position"*, returned the same oblique with the Arch of Constantine still in its
corner. Ours was four hundred words and the sentence that mattered was one of
forty. What comes first is weighted most — and what comes ALONGSIDE competes.

The prompt is now the lead, the edit list, the people, the hour, and the aspect.

**The moderation ladder degrades by content, not by subject.** The lever falls
back from a blocked gladiator to the stonemason beside him; a sweep has no
subject, so three candidates differing only there would be one prompt three
times.

**8. Measure whether the camera held** — one text call, *diagnostic only*.
`planStandpoint` is run on the frame that came back and diffed against the seed.
It reports and does not retry: a re-render is another charge, and that is not this
step's decision to make.

```
seed photograph ──► standpoint ──► camera numbers ─────────┐
      │                                                    │
      └─► cut for 1987 ─► FRAME 1987                        │
                              │                             │
                              └─► cut for 1943 ─► FRAME 1943 │
                                                     │      │
                                                     └─► cut for 1900 ─► FRAME 1900
                                                                              ▲
                          planner (per year) ─── prose ─────────────────────┘
```

The standpoint is read once from the seed and reaches every frame unchanged. The
pixels travel along the chain.

**Per station: 3 text calls + 1 image call** — segment, plan, render, and a
fourth text call that measures the camera afterwards and changes no pixels. Per
sweep: two more, the standpoint and the ruler check. A 24-frame sweep pays 25
calls for diagnostics it could run without.

---

## Two rules that are load-bearing

**The chain, pinned at the seed.** Each frame cuts the frame beside it — the one
one step nearer the seed, always finished already because the order walks
outward. The seed is not a hub; it is the point where the timeline is pinned to a
real photograph.

This was a star for a while, every frame reading the seed independently, and it
breaks the moment the seed stops saying anything. A 2010 seed cut for 110 AD
comes back **95% grey** — the whole modern city gone — so 110 and 111 were two
unrelated inventions sharing only a camera, despite being one year apart and
effectively the same world. Cut 111 for 110 instead and only the people are
erased: the frame arrives as 111 with a different crowd, which is what a viewer
watching a timeline expects.

**The seed's pixels still reach the far end.** They travel along the chain,
surviving wherever history left something standing and being erased where it did
not, so its authority decays at exactly the rate the world actually changed —
rather than being asserted in full or not at all.

**Safe now, and it was not before.** The old chain carried a 1987 crowd into 1900
with their clothes repainted, but that was chaining UNCUT frames. Every link now
passes through the cut, people are always erased, so nobody can cross one. The
camera does not travel in the pixels either — it is in the standpoint text and
the grid, both year-independent — so the drift chaining used to cause is held by
something chaining cannot touch.

**What it costs: the sweep runs serially.** This frame waits for the one beside
it. The call count does not change — the neighbour is cut INSTEAD of the seed,
not as well.

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
| object cap | `timeMask.ts` | 60, ordered by CERTAINTY not size | more found per frame, more tokens |
| altered-box cap | `timeMask.ts` | `altered` over 5% dropped | more of the frame smeared |
| total erased cap | `timeMask.ts` | `absent` capped at 35%, largest dropped first | more erased, less left to state the camera |
| camera limits | `cameraSkeleton.ts` | tilt ±60°, FOV 10–140°, eye 0.3–4000 m | outside these, no grid and no drift check |
| drift thresholds | `coreSample.ts` | horizon 20%, height 40% | fewer frames flagged as drifted |

#### The two caps, and why they exist

Both answer the same failure: **the cut-out destroying what it is there to
preserve.**

**`altered` over 5% is dropped.** Blur is right for a walkway, a kiosk, a re-laid
surface. It is catastrophic for the landmark. Asked for 1987 from 2010 the pass
marked the Colosseum `altered` — correct in itself, the stone was dirtier before
the 1990s cleaning — and the compositor blurred the entire amphitheatre into a
smear. The one structure that must be identical in every frame became the one
the model could not see, so it rebuilt it from prose, in the place the prose put
it, while the smear rebuilt as a second. Nothing is lost by dropping the box:
`altered` means "still there, looked different", and how it looked different is
a sentence the planner has already written into `standing`. Words carry a colour
change perfectly and pixels carry a viewpoint perfectly; trading the second away
for the first is the wrong way round.

**Total `absent` is capped at 35%.** Past some point the attachment stops being a
photograph with holes and becomes holes with a photograph, and it has then
stopped stating the vantage — which is the only reason it is attached. Height is
legible only from the apparent size of things at known distance, so every erased
structure is a scale reference destroyed. Largest boxes go first, which is the
uncomfortable half: a big box is usually a genuine modern block, and dropping it
leaves something standing that was built later. It is the same trade the
whole-source path already makes. A surviving anachronism is a local error in one
part of one frame; a collapsed viewpoint is the whole picture wrong, and every
frame cut from it after that.

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

### Two ways to say the same thing

`window.__cut = true` puts the erasure back. Both branches derive the same edit
list from the same segmentation call, so the switch changes the ATTACHMENT and
nothing else.

| | attached | temporal correctness | composition |
|---|---|---|---|
| **default** | the raw neighbour | carried by the edit list, in words | nothing erased, nothing to compose into |
| **`__cut`** | the cut-out **and** the raw neighbour | carried by the holes AND the words | the cut-out says what is present, the raw one says where the camera is |

The thing to watch when comparing is **not** overall quality — it is the crowd.
Words about buildings and roads work; words about people have failed twice, read
both times as a note about clothes. If *"the tourist queue: a few figures on
foot"* also fails and the same people come back in period dress, people genuinely
have to be answered in pixels and the cut-out earns its place for them alone.

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
[looking-glass] standpoint: {"eyeHeightM":45,"tiltDeg":18,"hfovDeg":65,…}
[looking-glass] ruler check — the SAME seed read twice: 45m vs 45m, tilt 18° vs 12° …
[looking-glass] 1943 from 1987: 14 findings (11 absent) · RAW frame + an edit list
[looking-glass] 1943 reference ACCEPTED
[looking-glass] 1943 on x-ai/grok-imagine-image-quality — camera: 22m / tilt 15° / fov 65° vs seed 45m / 18° / 65° — the camera dropped from 45m to 22m
```

| what you see | what it means |
|---|---|
| `1943 from 1987` | which picture went. Near the seed this says the seed; further out it names the neighbour |
| `N findings · RAW frame + an edit list` | the default: nothing erased, the labels became text |
| `attached cut-out + the uncut neighbour` | `__cut` is set; two pictures went |
| `reference REFUSED` | the provider rejected the attachment and the frame was drawn from prose alone. **This one invalidates every other number on the frame** |
| `camera numbers rejected: eyeHeightM=…` | one field out of range, so no grid and no drift check for the whole run |
| `— held` | the camera survived. `— the camera dropped …` is the failure |
| `ruler check` | the noise floor. Any drift smaller than this figure is not evidence of anything |
| a low count on a distant year | distrust it. 1900 should be finding a lot |

### Digging further

Two switches exist for diagnosis and neither is a setting:

```js
window.__sweep[1987].prompt     // what the model was told
window.__cut = true             // put the erasure back; both pictures go
window.__noStanding = true      // drop the edit list entirely
fetch(window.__sweep[1987].cutout).then(r=>r.blob()).then(b=>open(URL.createObjectURL(b)))
```

`__noStanding` is the control for the question the edit list exists to answer: if
a year still collapses with NOTHING describing it, the words were innocent and
the year alone does it.

`open()` on the data URL directly gives a blank page — Chrome blocks top-level
navigation to `data:`. `cutout` is only present when `__cut` was set.

Both exist because every diagnosis in this file's history was an argument about a
prompt nobody could read and an attachment nobody could look at, and twice the
reasoning from screenshots alone was wrong.

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
   is a mistake this codebase has already made once. **It says so now.**
   `renderStill` has always reported this in `anchored`; the sweep destructured
   `{ url }` and passed no handler, so a run whose every frame was drawn from
   prose was indistinguishable from one anchored to a photograph — and the
   cut-outs, the standpoint and every drift figure were read as though the
   picture had been sent. `chained` was the same bug wearing its own
   documentation: it is described as false when the provider refused the image,
   and it was set from whether one had been *offered*, which is always true.

**Silence was the expensive part of all five.** Three separate mechanisms failed
quietly in one session — a rejected camera, a refused attachment, a dropped
reference — and each looked exactly like the healthy path. Every degrade now
prints.

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
- **The sweep is serial.** Each frame waits for the one beside it, so a
  24-station sweep is 24 sequential rounds rather than all at once. That is the
  price of the chain and the only thing it costs.
- **Drift accumulates.** Each link is an interpretation of an interpretation, and
  the standpoint does NOT hold the camera — see below. The chain keeps each step
  small, which only bounds the total if the per-step error is small; measured,
  it is 30–70% in height and monotonically downward, so the chain multiplies it
  rather than containing it. The far end of a long sweep is several generations
  from any real photograph. Cutting every frame from the seed instead would bound
  the error at one step regardless of length, at the cost of a mostly-grey
  attachment for distant years — the trade this design made in the other
  direction, on the assumption that per-step drift was near zero.
- **Two steps decide what is present.** The anachronism pass has coordinates and
  shows its answer in the pixels; the planner's `standing` says it in prose. They
  are separate calls and can disagree — a walkway marked `altered` appears
  blurred but visible while the text says it was never built. The conflict is not
  removed, it is given a deterministic winner: the clause tells the model *"where
  the description and this picture disagree about whether something is present,
  THE PICTURE IS CORRECT."*
- **Aspect is guarded, not reconciled.** The image call hardcodes 16:9 and the
  cut-out keeps the seed's shape. Every seed is an app-generated frame and every
  frame is asked for at 16:9, so they agree today — a mismatch logs a warning
  rather than being corrected. The check lives inside `compositeCutout`, so the
  whole-source path skips it.

- **SOME YEARS HAVE A PHOTOGRAPH THE WORLD ALREADY KNOWS, and those are the ones
  that collapse.** 1943 Rome returned as occupied Rome — troops, sandbags, a
  street-level war photograph — from an aerial reference its neighbour 1987 had
  reproduced almost exactly, through the same pipeline one step earlier. 1700
  held too. The pattern across every run: weak prior, the reference wins; strong
  prior, the prior wins. It is not the step size and not the source; it is how
  famous the target year's image is. The edit list is the answer aimed at it —
  say nothing about the year and there is nothing to summon — and whether that is
  enough is the open question.

- **NOT ALL FRAMES ARE TREATED EQUALLY**, and it is worth being explicit. The
  frame next to the seed is drawn from a real photograph; the one after it is
  drawn from a generated frame, and so on down the chain. Step sizes differ too.
  So the same sweep contains frames one generation from evidence and frames five
  generations from it, and they should not be read as equally trustworthy.

- **FIDELITY AND CONSISTENCY PULL AGAINST EACH OTHER.** What makes a year *that*
  year is a description of it, and a description of it is permission to redraw the
  scene. Everything in this file is an attempt to get both, and the edit list is
  the current one: keep the information, change its grammar, so it edits the
  picture instead of authoring a year.

- **THE COMPOSITION IS THE IMAGE MODEL'S, NOT THE ATTACHMENT'S.** The largest
  thing this design assumes, and the one it does not control. Measured across a
  session on Grok Imagine: with the reference accepted, and in one run entirely
  uncut, the camera moved every time and always the same way. Told 120 m the model produced 45; told
  65 it produced 45; told 110 it produced 65; told 45 it produced 22. On an
  interior seed the camera swung from an off-axis walkway view to the symmetric
  centred axis. On a New York street it swapped the fence from the left of frame
  to the right. `input_references` steers subject and era superbly — 1987 came
  back with checker cabs, the Village Voice and the right clothes — and does not
  carry a camera.

  **Every figure above is Grok Imagine**, which is the model that holds
  composition BEST of the three tried. Nano Banana Pro is visibly worse at it and
  visibly better in pixel quality; FLUX 2 Max is untested for this. So the effect
  is model-dependent in degree and not in kind — the best available option still
  moves the camera by a third to two thirds, and choosing a different model is
  not a fix. Anything that closes this gap has to constrain the generation
  itself.

  **Two constraints the app has never sent, and both are free of new claims.**
  `seed` is in the endpoint's parameter set and is used nowhere in the codebase —
  a value fixed across a sweep is the ordinary way to make a series share
  composition, and it adds no content a model can misread. And a SECOND
  reference: Gemini accepts 14, FLUX 8, Grok 3, and every call sends one. See
  *How abrupt the transitions feel* for what the second one should and should not
  be — the raw seed reintroduces the crowd propagation that removing it fixed,
  because the seed is uncut.

- **The drift measurement is a weak instrument.** It caught a real regression, and
  it also called a visibly different vantage "73%" and a visibly good pair a
  failure. Height came back repeatable on one seed and 22% apart on another; tilt
  disagrees by 6° on an unchanged picture, which is 16% of frame height at 65°
  field of view — so the horizon half cannot detect the 13.4% drift it was built
  for, and the threshold sits above it in acknowledgement. Read the pictures. The
  number is a tripwire, not a target.
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
| `src/lib/promptcraft.ts` | `buildSweepPrompts` — the sweep's own prompt, and the clauses explaining the cut-out and the uncut source |
| `src/portal/lib/render.ts` | `renderStill` — the shared still primitive and its moderation ladder |
| `sweep_experiment/` | the same pipeline from the terminal — imports these modules, writes every intermediate to disk |
