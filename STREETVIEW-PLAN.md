# PLAN — seed a frame from street-level imagery

Click a point on the map, see what real 360° imagery exists there, pick one, and
use it as the reference photograph for the seed.

Design only. No implementation.

Reads against `demo/street-probe.html`, which already proves the hard half.

---

## 1. What the probe establishes

The demo is not a sketch — it settles four things that would otherwise be
guesswork, and one of them decides the whole feature.

**There is no "panoramas near here" endpoint in Street View.** Metadata returns
exactly one, the nearest. The probe walks the panorama graph instead — every
panorama carries `links` to its neighbours, and `StreetViewService` is unbilled —
so it enumerates every camera on every road inside a radius for nothing.

**Panoramas sit on the road; the subject is off to one side.** The probe computes
the bearing from each camera back to the clicked point, which is what turns "a
dozen photos of a street" into "a dozen angles on one subject". That bearing is
the heading this app has never had.

**Both sources carry a capture date.** Street View gives a year, Mapillary a
month.

**And the one that decides everything: Google will not give us pixels for free.**
The probe says so in its own copy — the pano walk, the metadata checks and the
Embed viewer are all unmetered, while *"the one billable call in Street View —
the Static image endpoint — is never requested, which is why Google results show
a year rather than a thumbnail."* Mapillary hands back `thumb_1024_url` and is
free at any volume.

## 2. The decision that follows

**Mapillary is the provider for the reference image. Street View is at best a
viewer.**

Not a preference — an asymmetry in what each can supply:

| | enumerate | view in 360 | **hand us image bytes** |
| --- | --- | --- | --- |
| Street View | free (graph walk) | free (Embed iframe) | **billable, and the URL carries the API key** |
| Mapillary | free (radius search) | free (equirect JPEG) | **free** |

The key point is not only the billing. A Static API URL has the key in its query
string, so handing that URL to OpenRouter as a reference would post a Google
credential to a third party — the exact thing `toPlayableUrl` already has a long
comment guarding against. Fetching the bytes ourselves instead means widening
`connect-src`, which `public/_headers` calls "the load-bearing line".

Street View can still earn its place as the **browsing** surface — its coverage
is far better, and the Embed viewer is free — with the honest limitation that a
Street View panorama can be looked at but not used. Whether that is a useful
half-feature or a confusing one is §6.

## 3. The technical core: a panorama is not a photograph

Mapillary panoramas are **equirectangular** — a whole sphere flattened into a
2:1 strip. Handing one to an image model as "stand where this camera stood" is
meaningless: it is not a view, it is every view at once, distorted.

So the feature's real work is **projecting a rectilinear view out of the sphere
at a chosen heading** — which is precisely what Street View's Static endpoint
sells and what we would be doing ourselves.

Three things make that cheap here:

- **three.js already ships** in this app, for the wormhole and the globe. An
  equirect on a sphere with a perspective camera is its standard trick.
- **The heading is already computed** — the probe's `bearing(camera, clicked)`.
- **The output size is already fixed** — 16:9, and `seedImage.ts` already
  downscales and encodes whatever it is handed.

So the pipeline is: equirect JPEG → sphere → camera at the bearing → render to a
16:9 canvas → the exact same `SeedImage` the file picker produces. Everything
downstream is untouched, because from that point on it *is* an uploaded photo.

## 4. What the visitor does

```
  ┌ REAL IMAGERY HERE ─────────────────────────────────┐
  │  click the map to look                             │
  │                                                     │
  │  ▣ 2019-06   18 m   ↖ facing your point            │
  │  ▣ 2021-04   24 m   ↑                              │
  │  ▢ 2016-09   41 m   ↗                              │
  │                                                     │
  │  [ use this one ]                                   │
  └─────────────────────────────────────────────────────┘
```

Sits with the seed, above both path boxes, beside "use my own photo" — it is the
same thing arriving by a different route. Choosing one renders the projection and
hands it to the existing photograph flow, which then behaves exactly as if the
visitor had pasted it.

## 5. The year comes with the picture

The reference flow was just rebuilt on the visitor's promise that their
photograph matches the place **and the year**. Street-level imagery cannot honour
that promise by accident: it is from 2019, or 2021, or whenever the car drove
past.

So **selecting a panorama should set the dial to its capture year.** The image
carries its own date, so the contract holds without anyone having to think about
it, and the seed lands on a station that is genuinely what the picture shows.

This is a nicer answer than it first looks. A 2019 seed is not a limitation — it
is the anchor a sweep is supposed to grow out of. Real 2019, then chain back to
1900.

## 6. Decisions needed

1. **Does Street View appear at all?** It cannot supply a reference, only a view.
   Showing panoramas you can look at but not use is either honest breadth or a
   trap. Recommend: **Mapillary only at first**, and add Street View as a
   labelled "view only" tier if coverage turns out to be the blocker.
2. **A second credential.** Mapillary needs a client token. The app's whole pitch
   is one key that is yours; this is a second, weaker one (read-only, free), and
   it needs the same "stays in your browser" treatment as the OpenRouter key.
   Optional and absent by default seems right — the box says what it needs.
3. **CSP.** `connect-src` gains `graph.mapillary.com` and the image CDN.
   `public/_headers` calls that line load-bearing, so this is a deliberate
   widening to be written down rather than slipped in.
4. **Coverage.** Mapillary is thin outside cities and roads, and this app's range
   includes open ocean and Antarctica. The box has to be comfortable saying
   "nothing here" most of the time, and must not look broken when it does.
5. **Heading, pitch and field of view.** Bearing gives heading. Pitch and FOV are
   free choices — recommend level and ~75°, close to what an ordinary photograph
   looks like, and both worth exposing later rather than now.
6. **Does the heading become a seed axis?** Right now it is consumed by the
   projection and forgotten. Keeping it would let the sweep re-render every frame
   from the same bearing, which is a real improvement — and a larger change than
   this feature.

## 7. Risks

- **The projection has to look like a photograph.** An equirect crop at too wide
  an FOV bulges; too narrow and it reads as a telephoto compression no walking
  camera would produce. This is the one part with no fallback: get it wrong and
  every seed built from it inherits the distortion.
- **Licensing.** Mapillary imagery is CC-BY-SA. Using it as a conditioning input
  is not obviously either fair use or a derivative work, and the app is AGPL and
  public. Worth a real answer before shipping, not after — this is the risk I
  would resolve first.
- **Quality.** Street-level captures are frequently blown out, rain-streaked, or
  half-blocked by a parked van. A bad reference is worse than none, and the
  visitor cannot tell before spending. The thumbnail has to be big enough to
  judge.
- **Faces and plates.** Both providers blur them; the blur will be faithfully
  reproduced as a smear by whatever the image model draws.
- **It undercuts "no backend, no accounts".** Two credentials and two third
  parties is a different product from one key and a CSP that names one host.

## 8. Phasing

1. **The box, Mapillary only, viewer only.** Click the map, list what exists,
   show thumbnails. No projection, no seeding. Proves coverage and quality are
   good enough to bother with — which is the assumption everything else rests on.
2. **The projection.** Equirect → three.js sphere → 16:9 render → `SeedImage`.
   Drop it into the existing photograph flow and it seeds a frame with no other
   changes.
3. **The date binding.** Selecting a panorama moves the dial to its capture year.
4. **Street View as a view-only tier**, if and only if coverage demands it.

Step 1 is a day and answers the question the rest depends on. Step 2 is where the
actual engineering is.
