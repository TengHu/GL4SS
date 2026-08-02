# PLAN — one instrument, not two

How to fold the multi-picture feature into the single-picture app so that **one
picture is simply a selection of one**, rather than a separate mode with its own
button, its own vocabulary and its own viewer.

Design only. No implementation.

---

## 1. What is wrong now

The core sample was built alongside the portal rather than inside it, so the app
currently has two of almost everything:

| | one picture | several pictures |
| --- | --- | --- |
| choose WHERE | map + pin | inherited from the map |
| choose WHEN | **the dial** | **span pills** (All of time / Since the ice / …) |
| how many | implicit, one | **count pills** (2 / 4 / 8 / 16 / 24) |
| start it | **the lever** | **`S` → a button in the caption** |
| price consent | none (one image) | a dialog |
| look at result | the portal, full-bleed | **a modal that covers the portal** |
| move between results | the dial | **a filmstrip inside the modal** |
| play through | — | **a transport inside the modal** |
| name for it | a jump | **"core sample"** |

The right-hand column is all new furniture. Most of it duplicates something the
left-hand column already has, in different words, in a different place on
screen. Two symptoms confirm the diagnosis:

- **The span pills are a second time control.** The app already has a superb one
  — 284 stations, four orders of graduation, typed year entry. The pills throw
  that away and offer four canned ranges instead.
- **The filmstrip is a second dial.** `TimeDial` already receives
  `statusByYear: Map<number, SceneStatus>` and already draws every station as
  ready / pending / error / pinned / active. It is a filmstrip. The modal
  contains a worse one.

## 2. The idea

**Selection replaces mode.**

The dial gains a *selection*, which is one or more stations. The lever renders
the selection. One station selected is exactly today's behaviour; more than one
is what "core sample" was.

```
  today          needle at one station  →  lever  →  one picture
  proposed       a selection on the dial →  lever  →  one picture per station
                 (default: a selection of one)
```

Nothing new appears on screen for someone who never widens a selection. The
second mode stops being a mode and becomes a quantity.

Consequences, in order of how much they simplify things:

1. **No span pills.** You choose when, and how much of when, on the instrument
   built for choosing when.
2. **No separate viewer.** Results appear where results have always appeared —
   full-bleed in the portal.
3. **No filmstrip.** The dial already is one. Frames from a sweep light their
   own stations; `←` `→` walks them; the era strip gives them context the
   modal's strip never could.
4. **No `S`, no second button, no "core sample".** The lever is still the only
   thing that spends.
5. **No transport widget.** "Play" becomes *auto-advance the dial*, which is a
   property of the dial, not of a modal.

## 3. Surface by surface

### The dial — gains a range

A selection is drawn as a lit span between two stations, with the live needle at
one end. A selection of one is a needle with no span, i.e. what is there today.

**Gesture — decision needed, see §5.** Preference: drag along the **era strip**,
the band beneath the ticks that is currently non-interactive decoration. A
distinct surface for a distinct gesture, discoverable by hovering, and it cannot
be triggered by accident while scrubbing.

The existing pin/ghost-needle machinery is the closest thing already built — it
draws a second marker and measures the gap to scale — but the pin means *hold
this frame to compare*, and overloading it with *spend money from here to here*
would make an existing free gesture expensive. Keep them separate.

### The lever — scales, and says what it will cost

The lever stays the single spending gesture and gains a readout of what it is
about to do: `1 frame` or `8 frames`. Its existing "PULL TO JUMP" affordance is
unchanged for a selection of one.

**Consent scales with the selection.** One frame behaves exactly as today, with
no dialog. More than one gets the price dialog that already exists. This is the
one hard rule in the plan: the lever must never silently become a twenty-four
image spend, because "browsing is free and only the lever spends" is the app's
central promise and a wider selection is precisely where it would break.

### How many frames — the one genuinely new control

Given a range, the app needs a count. Options in §5; the smallest is a compact
readout next to the lever that cycles `2 · 4 · 8 · 16 · 24`, defaulting to a
sensible density for the selected width.

Distribution stays as implemented — targets chosen in time, snapped to distinct
stations (linear in years, log across deep time).

### The results — the portal, always

A finished frame fills the screen as it does today. A sweep leaves N frames on N
stations. Then:

- `←` `→` walks them, exactly as it walks any stations
- their stations light on the dial, as owned stations already do
- hold-and-compare works across them for free, because it works across stations
- a new **play** affordance auto-advances the dial through the selection

The last item is the only new control, and it belongs next to the dial rather
than inside a viewer.

**Distinction to preserve:** swept frames are *chained* — conditioned on their
predecessor — and are deliberately not written to the archive. The dial
therefore needs two lit states: **owned** (on disk, free forever) and **swept**
(this session only). A third mark, in a place that already has five.

### Film — already unified underneath

`render.ts` already renders one clip or many from the same primitive, and
`FilmWarning` already takes a clip count. So filming needs no new concept: it
films *the selection*. One frame selected → one clip with sound. A range → N−1
pinned clips, silent. The control can sit in one place for both.

### Vocabulary — delete the metaphor

"Core sample" is imported jargon; the app's own words are stations, journeys,
the lever, widen, hold. The strongest version of this plan needs **no new noun at
all** — you widen the selection and pull the lever. Where a phrase is
unavoidable, prefer plain description over metaphor: *"8 frames, 3000 BC to
2030 AD."*

Same for the transport labels: `1.5 fps / 3 fps / 6 fps` should read
`slow / steady / fast`. Anyone who wants the exact rate is not who the control
is for.

## 4. What gets deleted

- `SampleControl.tsx` — span and count pills
- `SamplePlayer.tsx` — modal, filmstrip, transport, close button
- `SampleWarning.tsx` — folds into the lever's scaled consent
- `SAMPLE_SPANS` — four canned ranges, replaced by the dial
- the `S` hotkey and its hint row
- roughly the whole `.sampler-*` CSS block

`coreSample.ts` **survives largely intact.** Its planning (`planSample`,
`sampleTargets`) and its sequential chained runner are the substance; only the
span presets and the state shape that fed the modal go. This is a UI plan, not a
rewrite of the generation layer.

## 5. Decisions needed

1. **Range gesture.** (a) drag on the era strip *(preferred)*; (b) shift-drag on
   the dial; (c) an explicit "from…to" chip near the lever. (a) is the most
   native and the least discoverable — (c) could exist alongside it as the
   visible affordance.
2. **Count control.** (a) a cycling readout by the lever *(preferred)*;
   (b) derived automatically from the range width, no control at all;
   (c) a density notch on the dial. (b) is the simplest and removes the last
   piece of new furniture, at the cost of predictability.
3. **Does a selection persist across a place change?** A range means nothing at
   a new coordinate — the frames were of the old place. Recommend: clear on
   place change, like the pin already does.
4. **Do swept frames become archivable?** They are chained, so no — except
   frame 0, which has no predecessor and is prompt-identical to a lever pull.
   Keeping it would make the anchor free on a second visit.
5. **Play speed at all?** If the dial auto-advances, one fixed comfortable rate
   may be better than any control.

## 6. Risks

- **Cost safety is the whole ballgame.** The lever gaining a multiplier is the
  single dangerous idea in this plan. Consent must scale, the readout must be
  unmissable, and a selection must never widen by accident.
- **Discoverability.** Removing the button removes the thing that advertised the
  feature. Without an affordance on the dial, nobody finds it. This is the main
  argument for keeping one visible control (§5.1c).
- **Losing the modal loses focus.** A full-screen player is a good way to look
  at a sequence; the portal with chrome is a worse one. Mitigation: the existing
  `F` immersive mode already hides the chrome.
- **The dial gets crowded.** It carries needle, ghost needle, era bands, four
  graduation orders and three station states. Selection plus a swept state is
  two more marks on an instrument that is already dense.
- **Scope.** This touches the app's primary control and its primary action. It
  should not ship in the same branch as the feature it is unifying.

## 7. Phasing

Each step is independently shippable and independently revertable.

1. **Vocabulary and labels only.** Rename "core sample", fix the transport
   labels. No structural change. Removes most of the confusion for the cost of
   an afternoon.
2. **Results move into the portal.** Swept frames light their stations; `←` `→`
   walks them; the modal becomes optional, then unnecessary. Biggest win, no
   change to how a sweep is started.
3. **Selection replaces the pills.** The dial gains a range; the lever gains a
   count and scaled consent; `SampleControl` and `S` are deleted.
4. **Tidy up.** Delete the modal, its CSS, and the span presets.

Stopping after 1 and 2 already removes most of the two-worlds feeling. Step 3 is
where the real design risk lives, and it is worth doing only once 2 has proved
the dial can carry the results.
