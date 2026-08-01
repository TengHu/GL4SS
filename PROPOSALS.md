# PROPOSALS — what to build on top of The Looking Glass

Seven candidate applications built on the existing portal, using models available
through OpenRouter. Each entry states what already exists in this repo, what is
genuinely new work, which models it needs, and what could go wrong.

Written against the tree at `ab49845`. Model ids follow the catalog in
`src/lib/openrouter.ts`, probed live 2026-07-30.

Proposal 2 is the one this document is really about. Proposal 1 is the one to
build first.

---

## 0. The assets worth building on

Four things in this codebase are worth more than the app they currently serve.
Every proposal below is a different way of cashing one of them in.

**`SceneDirection`** — `src/lib/promptcraft.ts:66`

A structured scene graph for any point in spacetime: `habitation` (five levels
from `uninhabited` to `dense`), `biome`, `periodMarkers`, `atmosphere`,
`cameraNotes`, and three distinct subject anchors. This is a machine-readable
model of *what was standing here*. The three panels are one renderer of it —
prose, dialogue, video, and audio are all equally valid renderers, and none of
them are built yet.

**The station ladder** — `src/portal/lib/stations.ts`

284 quantized time points from −252 Myr to 3050 AD, spaced by how much actually
changes per year. Because the ladder is *finite and enumerable*, three things
become possible that a continuous slider forecloses: the cache genuinely hits,
neighbours can be prefetched, and the whole of time can be swept in a bounded
number of calls. Several proposals below exist only because of this property,
which was originally a caching decision.

**`sceneKey()` = place + year + hour + style** — `src/portal/lib/engine.ts:136`

A deterministic coordinate system for spacetime. `placeKey()`
(`src/portal/lib/frameStore.ts:44`) already indexes the orthogonal query — *this
place across all years* — which is the axis proposal 1 rides on.

> **Note the gap.** The model is *not* in the key. `modelUsed` is recorded on the
> stored frame but forms no part of its identity, so switching models and
> revisiting a place returns the other model's cached frame. Harmless while the
> model is a preference. Fatal the moment it becomes a universe — see 2.

**The multi-provider parser** — `src/lib/openrouter.ts`

Six response shapes normalized behind one interface, a `modalities` whitelist
for models that reject `text` output, classified failures, and moderation-rescue
fallbacks. Roughly thirty commits of pain, already paid for. It also already
does image→video with a source frame (`openrouter.ts:944`), which proposal 1
depends on.

**Also present:** `wrangler.jsonc`, so a Cloudflare deploy target is already
half-declared — relevant to proposal 7.

---

## 1. The Core Sample — deep-time timelapse of a single point

**⭐ Build this first**

### What it is

Pick one coordinate. Sweep N stations. Render each frame *conditioned on the
previous frame* so the pixels stay registered, then interpolate between stills
with a video model. The output is thirty seconds of one hillside moving from
Jurassic floodplain through ice sheet, forest, farmland, suburb, and whatever
2400 turns out to be — all from the same camera position.

This is the deep-time equivalent of a geological core sample, and it is the most
visually arresting thing this codebase could produce. It is also the only
proposal here whose appeal requires no argument, which is a good sign.

### What already exists

- `placeKey()` indexes exactly this query — every frame taken at one spot.
- Hold-and-compare already registers two eras on the same pixels, so the
  registration concept is proven in the UI.
- Image→video with a source frame works today (`openrouter.ts:944`,
  `params.source_image.url`).
- The station ladder gives a principled, finite frame sequence rather than an
  arbitrary sampling.

### What is new

- Chaining a rendered frame back in as reference input to the *next* still.
  This is the core technical unknown: how well identity of place survives a
  50-frame chain, and whether drift needs periodic re-anchoring to frame 0.
- Sequence assembly and export.
- A cost-estimating confirmation step (see risk below).

### Models

- Stills with strong edit-consistency: `google/gemini-3-pro-image-preview`
  (Nano Banana Pro, blurbed "best identity preservation") or
  `black-forest-labs/flux.2-max`.
- Interpolation: any of the eight in `VIDEO_MODELS`; `bytedance/seedance-2.0`
  for cinematic quality, `x-ai/grok-imagine-video` for speed.

### Effort

Medium. Most of it is plumbing this repo already owns; the risk concentrates in
frame-to-frame drift.

### Risk

**Cost, and it is a real one.** The README is explicit that browsing is free and
only the lever spends. A timelapse button quietly spends thirty lever pulls at
once. This needs its own confirmation dialog with an estimated cost in dollars,
or it breaks the app's central promise to its user. Do not ship it as just
another button on the dial.

Secondary: drift. If frame 40 no longer looks like the same hillside as frame 1,
the whole effect collapses. Mitigation is periodic re-anchoring to the original
frame rather than pure chain conditioning.

### Relationship to 2

Orthogonal, and they compose. The core sample travels the *time* axis inside one
world; the multiverse travels the *world* axis at one moment. Together they
describe a plane rather than two features.

---

## 2. The Multiverse — every model is a parallel world

**⭐ The idea this document exists for**

### What it is

One lever pull returns five frames instead of one — same place, same year, same
hour, same scene plan, five different image models.

They are not five attempts at one truth. **They are five worlds.** You pick one
and you are *in* it: every subsequent jump renders in that universe, so you can
walk all 284 stations inside a single coherent branch of history.

The glass does not show you *the* past. It shows you *a* past, and it stops
pretending otherwise.

### The framing this replaces, and why

This was first proposed as an accuracy instrument: fan out across five models,
measure how much they agree, display the agreement as a confidence meter — tight
consensus means the record is well attested, scatter means the models are
inventing.

That version does not survive contact with two problems, and it is written down
here so nobody re-proposes it.

**One — style variance swamps the signal.** Image models differ in composition,
crop, palette, and lens on *every* prompt, a bowl of fruit as much as a Roman
harbour. That baseline variance is large and constant, and separating "these
differ because the record is thin" from "these differ because FLUX and Gemini
simply look different" is the entire measurement problem. Five images in a grid
does not do it. Doing it properly means stripping style out and comparing only
semantic claims, at which point the feature is a text table rather than a
picture, and much of the appeal has evaporated.

**Two — it would measure the wrong thing anyway.** Even done cleanly, model
divergence tracks *how often a thing has been illustrated on the internet*, not
how well scholarship understands it. Cahokia is reasonably well understood
archaeologically — Monks Mound, the palisade, the plaza — and rarely drawn. The
meter would report it as uncertain when the uncertainty lives in the training
data, not the record. A confidence display that is really an image-density
display, presented as epistemics, is worse than no display: it misleads
confidently, which is the exact failure mode `isFallback` exists to prevent
elsewhere in this codebase.

**The multiverse framing dissolves both.** Style variance is no longer a
confound — it is what makes the worlds distinct. Image-density is no longer a
mismeasurement, because nothing is being measured. There is no truth claim left
to be wrong about, and the register fits an app that already opens in Latin.

### The move that makes it work: sticky universes

A grid you glance at once is the weak version wearing better copy. What makes
this a product is **persistence**.

Choose a world and you stay in it. The universe is part of app state, part of
the URL, part of the cache key, and part of the archive. Stepping the dial keeps
you in the branch you chose. That turns model identity into *somewhere you are*
rather than *a setting you picked*, and it is the whole difference between five
disconnected images and an alternate history you can travel through.

### The axis changes meaning at 2030

The same mechanic covers speculative future stations, and works better there.

| stations | what varies between worlds | status |
| --- | --- | --- |
| −252 Myr → 2030 | the image model | **fiction** — a way of admitting nobody knows |
| 2030 → 3050 | the emissions pathway | **fact** — these branches genuinely exist |

In the past the multiverse is a conceit: there was one actual past and five
models are pretending otherwise. In the future it stops being a metaphor. SSP1-2.6
and SSP5-8.5 are not stylistic variants; they are different worlds, and nobody
knows which one arrives. A fan of possible futures is precisely what a scenario
set is.

So future universes are **grounded**: real projections for the selected
coordinates — sea level, temperature band, fire regime, habitability — fed into
prompt assembly for stations ≥ 2030. This absorbs what was previously a separate
proposal ("future mode, grounded in real projections"); it is not a separate
feature, it is the content of the future half of this axis.

### The shape: the multiverse pinches at the present

The best thing to fall out of this. The worlds should be **wide in deep time,
narrow at living memory, wide again in the future**:

```
  -100,000 BC          1969              2300
  ╱╱╱╱╱╱╱╱╱╱  ────────► ││ ◄────────  ╲╲╲╲╲╲╲╲╲╲
  nobody knows      photographs        nobody knows yet
   worlds diverge    worlds converge     worlds fan out
```

The present is the branch point, and the dial can *draw* it — a ribbon of
universes narrowing toward living memory and blooming either side. Emergent
rather than authored, and it lands exactly on the ladder's densest rung
(`1900 → 2030, step 1`).

It also gives crossing 2030 a meaning rather than an awkward seam: that is where
history stops being one world and becomes several.

**This is a hypothesis, not a finding.** It assumes models converge on
photographed decades because the visual record is dense. Plausible, unverified,
and cheap to test — see the probe below. If the pinch is real it is the spine of
the feature. If it is not, that is a more interesting result than the feature
was.

### What it reuses

Unusually much, which is the argument for it.

- **The wormhole shader.** Palette is already set by *direction* — cold electric
  blue forward, molten amber back. A lateral jump (same place, same year,
  different world) is an unused axis of a visual grammar that already ships.
- **Hold-and-compare.** Already drags a seam between two frames registered on
  the same pixels, and blink-compares on `space`. Point it at two universes
  instead of two eras and the deep comparison is built.
- **The multi-provider client.** Already normalizes all five providers behind
  one call signature; `WIDE_FIELD_MODELS` already enumerates them.
- **The planner call.** One `SceneDirection` feeds all five renders. It must be
  shared, not per-model — otherwise the worlds differ by plan as well as by
  renderer, and nothing is isolated.

### Disagreement becomes lore

The measurement discarded above returns, with no epistemic burden attached.
Where the worlds agree, those are the **fixed points** — the things true in
every branch. Where they split, the timeline forks.

"Rome is Rome in every world. Nobody agrees on Cahokia — it is a place where
history comes loose." Same underlying data as the rejected meter, no claim about
the historical record, and a better line.

### Naming the worlds

Do not label them `black-forest-labs/flux.2-max`. Have the text model name each
universe from the frame it actually produced. Over several jumps the worlds
acquire character — one consistently darker, one consistently more crowded —
emerging from real model bias rather than being authored.

### The first commit

`sceneKey()` gains a universe axis, and `frameStore` goes to `DB_VERSION = 3`.

Small, and unavoidable: today the model is absent from the key (see §0), so two
universes would silently serve each other's cached frames and the branches would
bleed together. Everything else in this proposal is additive; this one is a
schema change and should land first.

Make the axis **generic** — a list of world descriptors, each carrying a model id
and optional prompt overrides — rather than a list of model ids. The future half
of the axis varies by scenario, not by model, and hardcoding "model" forces a
refactor the moment stations ≥ 2030 arrive.

### Models

All five of `WIDE_FIELD_MODELS` as the past-side worlds.
`google/gemini-3-flash-preview` for naming. No new model families required.

### Effort

Medium. The schema change is small, the fan-out is small, the UI is a grid and a
hotkey (`C` alongside the existing `W` / `P` / `J` / `F`). The future-side
grounding is dominated by sourcing and licensing a projections dataset.

### Risk

**Cost.** Five renders per pull. Must be its own control with its own price
confirmation — never the default lever pull, for the same reason as proposal 1.

**Novelty is unproven.** Whether five models produce *interestingly* different
worlds, or merely five similar pictures with different colour grading, is an
empirical question nobody here has answered. See the probe.

**Precision theater on the future side.** Regional downscaling carries wide
error bars, and a photorealistic frame implies confidence the data does not
have. The multiverse framing helps — showing a fan of futures is inherently more
honest than showing one — but the scenario label has to be visible on the frame,
not buried in a settings panel.

### The probe, before any of this

One place, five models, no UI, about a dollar:

1. Render 1969 in all five. Do they converge?
2. Render 100,000 BC in all five. Do they diverge?
3. Render Cahokia 1100 AD in all five. Are the differences *interesting*, or
   just stylistic?

That answers the pinch hypothesis and the novelty risk together. If (3) does not
produce five worlds you would actually want to visit, this proposal is a mood
and not a product, and proposal 1 is where the effort should go.

---

## 3. Receipts — a grounding and citation layer

### What it is

Historical fidelity in this app is, at present, entirely a model prior.
`periodMarkers` asks the model for details that date the scene "to within
roughly a lifetime" — and nothing verifies a single one of them.

Add a research pass ahead of the planner: a text model with web access produces
*sourced* period markers, and the UI grows a receipts drawer. This rig, this
pottery, this roofline, this crop — and where each claim came from. Where
sources conflict, say so.

### Why it matters more than it sounds

The codebase already understands this failure mode. `promptcraft.ts:114` notes
that the fallback path is dangerous *precisely because it is legitimate* — it
returns a valid `SceneDirection`, so a broken prompt surfaces as a merely
mediocre picture instead of an error, and that went unnoticed until someone
spotted the tell-tale phrasing by eye. A confidently wrong historical detail is
invisible to the person who most needs to see it.

### Relationship to 2

Complementary, and the pairing is sharper than either alone. The multiverse
deliberately abandons all truth claims; receipts is where truth claims go. One
world can be the **documented** one — sourced, cited, conservative — sitting
alongside four that are frankly speculative and labelled as such.

That also resolves the multiverse's only real ethical exposure: an app that
generates five plausible pasts with no anchor is a machine for manufacturing
history. One anchored world fixes that.

### What is new

- A research call before scene direction, with web grounding.
- A citations field on `SceneDirection`, persisted in `StoredFrame.direction`.
- Receipts UI.

### Models

- `anthropic/claude-sonnet-4-6` for the research pass — already in
  `TEXT_MODELS`, and this is reasoning-heavy work where the cheap default is the
  wrong economy.
- OpenRouter's web plugin / `:online` suffix for retrieval. **Verify current
  syntax and pricing against OpenRouter docs before building** — this is the one
  external dependency in this document that has not been probed from this repo.

### Effort

Medium. One extra API call, one schema extension, one drawer.

### Risk

Latency and cost per jump both rise. Should be an opt-in mode, not the default,
so casual browsing stays fast and cheap.

---

## 4. Talk to whoever is in the frame

### What it is

Feed the rendered image plus its `SceneDirection` into a vision-capable text
model as a persona: someone standing at that exact spot, in that year, at that
hour.

`habitation` gates this naturally:

| level | who you get |
| --- | --- |
| `uninhabited` | a narrator, or the land itself |
| `traces-only` | an archaeologist reading what was left |
| `sparse` / `settled` / `dense` | a person who lives there |

Under proposal 2 this gets better: each universe has its own inhabitant, and
they disagree about what happened.

### What already exists

`SceneDirection` carries everything the persona needs. Claude Sonnet 4.6 is
already in `TEXT_MODELS`, blurbed "most evocative prose."

### What is new

A chat surface, and a system prompt built from the scene direction.

### Effort

Low.

### Risk

Invented specifics are *more* persuasive in dialogue and *less* checkable than
in an image. Pairs naturally with 3 — or frame it explicitly as imaginative
rather than documentary.

---

## 5. LLM-authored journeys

### What it is

`Journey` (`src/portal/lib/journeys.ts:23`) is a small struct: title, blurb,
location, lat/lng, year, phase id. Have a text model generate journeys on a
theme — "the Silk Road in eight stops," "my city across five centuries," "every
mass extinction" — validated against `STATIONS` and `DAY_PHASES` membership.

### What already exists

The struct, the gallery UI, and the validation: `journeys.ts:632` already checks
phase ids against the `DAY_PHASES` set.

### Effort

Low.

### Risk

Factual drift, and this repo has already measured it. The comment above
`JOURNEYS` records that hand-fact-checking caught a Great Zimbabwe entry a
century before its walls were built, a Teotihuacan "at its height" two hundred
years early, and four standing points that were *on top of* the thing the card
claimed you were looking at. A model generating these unchecked reproduces that
error class at volume. Generated journeys need verification, or visible
separation from the curated set.

---

## 6. A historical-fidelity benchmark for image models

### What it is

Publish a real eval: *does this image model actually know what 1200 AD looked
like?* Generate the matrix of fact-checked ground-truth space-times × image
providers, judge each frame with a vision model against documented specifics,
and score per model.

### Why this repo specifically

A **fixed, finite, enumerable** time axis (284 stations), a set of
**hand-fact-checked** ground-truth space-times (55 journeys), and a **normalized
multi-provider client**. All three exist here for unrelated reasons; together
they are a benchmark harness.

### Note

This is the honest home for the measurement rejected in 2. As a *product
feature* it misleads; as an *offline eval* with a documented rubric, a
transparent methodology and no pretence of live confidence scoring, it is
legitimate. Same computation, different epistemic contract.

### Effort

High. This is a project, not a feature. Wants proposal 7's storage.

### Risk

Judge bias — a model judging its own family's output is a conflict worth
designing around; use a panel. Rubric design is the hard part: "historically
accurate" must decompose into checkable claims or the scores mean nothing.

---

## 7. The backend the code keeps asking for

### What it is

`frameStore.ts:16` states the limitation outright: IndexedDB is per-browser, so
a shared link "cannot make a link resolve to the same image for someone else —
that needs a backend and is a separate decision."

A small Cloudflare Worker plus R2 gives permanent, shareable frames, and from
there an accreting public atlas becomes possible.

### What already exists

`wrangler.jsonc` in the repo root. `sceneKey()` is a natural content address.
`StoredFrame` is already split into small metadata and large blobs, which is
exactly the shape a remote store wants.

### Effort

Medium.

### Risk

This is the proposal that changes what the project *is*. The README's third
badge is `backend: NONE`, and "no backend, no telemetry, no account" is repeated
three times as a value rather than a fact. A server means owning uploaded
content, moderation, abuse, and cost. Worth doing only if 1, 2, or 6 demand it,
and worth doing as *optional* sync rather than a required dependency.

---

## Recommendation

**Run the probe in §2 first.** One dollar, no code, and it decides whether the
multiverse is a product or a mood. Everything below assumes it passes.

**Build 1.** The core sample needs no argument to justify it, reuses the most
existing machinery, and is the thing that makes people stop scrolling.

**Then 2.** The multiverse is the more original idea and the one with the
longest tail — sticky worlds, lateral wormhole travel, fixed points as lore, and
a future half where the branches are real rather than imagined. Start with the
`sceneKey` schema change; everything after it is additive.

**Then 3** if this should be taken seriously rather than merely enjoyed, and
because one documented world is what keeps the other four honest.

**Defer 7** until something above demands it. It is the only proposal that costs
the project something it currently advertises.

### Ranked by ratio

| # | proposal | effort | novelty | reuses existing |
| --- | --- | --- | --- | --- |
| 1 | The Core Sample | medium | high | high |
| 2 | The Multiverse | medium | very high | very high |
| 4 | Talk to the frame | low | medium | high |
| 5 | LLM-authored journeys | low | low | very high |
| 3 | Receipts | medium | high | medium |
| 7 | Backend | medium | low | medium |
| 6 | Fidelity benchmark | high | very high | medium |

### One discipline that applies to 1, 2, and 6

All three multiply spend per interaction. The app's contract is that browsing
history is free and only the lever costs money — stated in the README and
enforced by the decision to stop generating on a scrub timeout. Any feature that
fans out across models, worlds, or stations must show an estimated cost and ask,
or it silently breaks the one promise the instrument makes to the person holding
it.
