# PLAN — bring your own picture

Let the visitor supply a photograph where the app would otherwise generate one.

Design only. No implementation.

---

## 1. The idea that makes it intuitive

**Every seed is a `(time, picture)` pair, and today every seed is generated FROM
its time.** You supply a year; the app supplies the picture. That is the only
direction the machine currently runs.

Upload is the **orthogonal** move: supply the picture instead, and let the time
come from where you already are.

```
  generate     you give TIME      →  app makes PICTURE     (every seed today)
  upload       you give PICTURE   →  time is where you stand
```

The two axes are independent, which is what makes this a change to *how a seed is
obtained* rather than a feature of either path. Neither box needs to know. Both
consume seeds and cannot tell the difference.

One sentence:

> **Uploading replaces a seed's picture and keeps its time.**

You are standing at Koto, 1915 AD, dawn. Drop a photograph in and that is still
Koto, 1915 AD, dawn — only the picture changed.

### Two consequences worth stating

**The affordance cannot live in either box.** It belongs to the seed, which means
it belongs to the frame on screen — beside WIDEN THE VIEW, or on the picture
itself. Putting it inside ONE PICTURE would tie it to path A and re-create
exactly the crossing that putting the lever inside MANY PICTURES did.

**Replacement is non-destructive.** The generated picture is still in memory and,
if it was paid for, still in the archive. So "use the generated one again" costs
nothing and is always available — this is a swap, not an overwrite.

## 2. Your two questions

**"Go with ONE PICTURE — the video is generated from my image?"**

Yes. Path A films the picture on the glass, and after an upload that picture is
yours. `renderClip` already takes a `first` frame and does not care where it came
from. Nothing about the path changes.

**"Go with MANY PICTURES — my image has to be keyed with a time?"**

Yes, necessarily — the sweep is a chronological chain, so every frame in it must
sit at a year. But **no new control is needed to supply one**, because you did
not create a picture, you replaced a seed's picture. The time was already there.

That is the payoff of §1. Ask "which year is this photo?" as a separate question
and you have invented a form; replace a seed that already has a time and the
question cannot arise.

## 3. What each path does with it

| | picture step | video step |
| --- | --- | --- |
| **A — one picture** | your upload replaces the frame at this station | films your picture directly |
| **B — many pictures** | your upload is one of the queued years, and the anchor | clips chain from your picture outward |

In B the uploaded year behaves like any other chip — `+ 1915 AD` adds it, `×`
removes it. It just happens to be a station whose picture already exists and is
free.

## 4. The chain has to run outward, not forward

This is the one real change to the runner.

The sweep currently renders **ascending**, each frame conditioned on the one
before it, anchored at frame 0. That works when the upload is the *oldest* frame
— an 1890 archive photograph, swept forward to today.

But the most natural use is the opposite: a photo of your street **now**, swept
*backward*. And the interesting case is neither — a 1915 photograph with 1800 and
2020 both wanted, where the anchor sits in the middle.

So the chain should run **outward from the anchor in both directions**:

```
   1800      1850      1915(yours)      1960      2020
     ◀─────────◀───────────●───────────▶─────────▶
        backward chain            forward chain
```

Two chains, one anchor. Today's behaviour is the special case where the anchor
happens to be first and the backward chain is empty — so this generalises what
exists rather than replacing it.

Consequence worth noting: frames are no longer produced in display order, so the
player's "follow the newest frame" behaviour needs to follow the *cursor*, not
the end of the list.

## 5. What an upload cannot supply

A generated frame arrives with a `SceneDirection` — habitation, biome, period
markers, subjects, atmosphere. It is what the prompts are built from, what
`widen()` needs, and what the film prompt is written from. **An uploaded picture
has none of it.**

Three options, in increasing quality:

1. **Generate one for the station anyway.** Cheap, already built — but it
   describes the scene the app *would* have invented, not the photograph in front
   of it, so every prompt derived from it is subtly about the wrong picture.
2. **Read the upload with a vision model.** One extra call; returns a
   `SceneDirection` describing what is actually in the photograph. Correct, and
   the models are already in the catalog.
3. **Ask the visitor to describe it.** Accurate, and nobody will do it.

Recommend **2**, falling back to **1** if the call fails. It is the only option
where a chained frame is conditioned on a description that matches the image it
is chained to.

## 6. Decisions needed

1. **Does an uploaded frame reach the archive?** Recommend **no** — it is the
   visitor's file, not something the app generated, and `frameStore` is an
   archive of what was paid for. But it should survive tuning away and back
   within the session, keyed like any other frame.
2. **One upload or many?** The model in §1 supports many for free — one per
   station. Worth allowing; a sweep anchored at both ends by two real
   photographs is a better product than one anchored at one end.
3. **Can you upload before generating anything?** Today both boxes require a
   frame on the glass. An upload *is* a frame, so it could be the visitor's first
   action — arriving with a photo and no key, and only paying when they sweep
   from it. Attractive, and it changes the first-run experience, so it is a
   product decision rather than a technical one.
4. **Where does the affordance live?** Settled by §1: with the SEED, not with
   either path. Recommend drag-and-drop onto the frame plus a line beside WIDEN
   THE VIEW — both act on the picture on screen, which is the thing being
   replaced. Explicitly NOT inside ONE PICTURE, which would tie a seed-level
   operation to one path.
5. **Does an uploaded frame count as `chained`?** No. It has no predecessor and
   was not conditioned on anything — same category as the anchor already is, and
   the strip should mark it as the visitor's rather than as a seam.

## 7. Risks

- **Provider moderation.** Uploaded photographs contain people, and providers
  moderate input frames separately from prompts. The degrade ladder in
  `render.ts` already handles refusal — anchor dropped, seam marked — so this
  fails visibly rather than silently. But a visitor who uploads a family photo
  and gets "the previous frame was refused" deserves wording that says the
  provider refused *their picture*, not a generic frame.
- **Privacy.** The README's loudest claim is no backend, no telemetry. An upload
  never leaves the browser except as a reference frame to OpenRouter, on the
  visitor's own key — which is exactly the existing contract, but it must be said
  plainly at the point of upload, because "upload" is a word that implies a
  server.
- **Size.** Frames are held in memory and passed as data URLs. A 12-megapixel
  phone photo is not a 1MP generated frame; it should be downscaled on the way in
  to the same order of size the models return, or the chain will carry it into
  every subsequent request.
- **Expectation.** A real photograph next to generated ones sets a bar the
  generated frames will not meet. The sweep will look like one real picture and
  N imitations of it — which may be the point, or may be disappointing. Worth
  seeing before building far on top of it.

## 8. Phasing

1. **Upload lands on the glass, path A films it.** No chain changes, no
   direction problem, no vision call — the film prompt can come from the
   station's own scene direction for a first cut. Smallest thing that proves the
   idea.
2. **Vision-read the upload** into a `SceneDirection`, so prompts describe the
   actual photograph.
3. **Anchor-outward chaining**, which unlocks path B properly and is the real
   engineering.
4. **Multiple uploads**, once one works.

Step 1 alone is a complete feature — "film my photograph" — and it answers the
expectation risk in §7 before any of the harder work.
