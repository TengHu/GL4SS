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

## 2. Street View, and it is the easier of the two

The probe avoids the Static endpoint because a free diagnostic page should stay
free. That is a property of the probe, not a constraint on the app — and once
the app is allowed to spend $0.007, Street View is not merely usable, it is
**simpler than Mapillary by a wide margin.**

Three things I verified against the live API rather than the docs:

**The Static endpoint sends `access-control-allow-origin: *`.** So the browser
can fetch the bytes itself and turn them into a data URL. The key stays in the
page, exactly as the OpenRouter key already does, and **only the bytes go to
OpenRouter — never the URL.** That was the objection that killed Street View
earlier, and it does not survive contact with the response headers.

**The metadata endpoint is free, and also `access-control-allow-origin: *`.** It
answers "is there imagery here, which panorama, and when was it taken" for
nothing.

**`pano` + `heading` + `pitch` + `fov` compose.** Which means Google performs the
projection server-side.

That last one deletes the hardest part of this feature. Mapillary hands back an
**equirectangular** sphere — every view at once, distorted — so using it would
mean building an equirect-to-rectilinear renderer in three.js and getting the
field of view convincing enough that no seed inherits a bulge. Street View's
Static endpoint *is* that renderer, already written, for less than a cent.

| | enumerate | image bytes | projection | coverage |
| --- | --- | --- | --- | --- |
| **Street View** | free | **$0.007, CORS-open** | **server-side** | very good |
| Mapillary | free | free | **we build it** | thin outside cities |

Cost in the app's own terms: a reference is **$0.007 against roughly $0.04 for
the frame it seeds** — about a seventh of one picture, and 10,000 free events a
month before any of it bills. It still gets said out loud, because "browsing is
free and only the lever spends" is a promise this app keeps.

## 3. The simplest version needs no Maps JS at all

The probe loads the Maps JavaScript API to walk the panorama graph, which is the
right tool for *enumerating* every camera in a radius. Choosing among several
panoramas is a refinement, though — and the nearest one is what a visitor almost
always wants.

So v1 is three plain HTTPS calls and no SDK:

```
  1  GET /maps/api/streetview/metadata?location=LAT,LNG   free   → pano id, date, exact camera position
  2  bearing(cameraPosition → clickedPoint)               local  → which way to face
  3  GET /maps/api/streetview?pano=…&heading=…&size=640x360&fov=90&return_error_code=true
                                                          $0.007 → the reference image
```

Then `seedImage.ts` takes those bytes and produces the same `SeedImage` the file
picker does. Everything downstream is untouched, because from that point on it
**is** an uploaded photograph.

`return_error_code=true` matters more than it looks: without it Google returns a
grey placeholder image with HTTP 200 for a location with no coverage, and we
would cheerfully seed a frame from a grey rectangle.

The graph walk earns its place only when someone wants to *pick* an angle rather
than accept the nearest — see §8.

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

1. **A second credential.** A Google Maps key, alongside the OpenRouter one. The
   app's pitch is one key that is yours; this is a second, and it needs the same
   treatment — stored in this browser, sent to Google and nowhere else, and
   absent by default so the box simply says what it needs.
2. **CSP.** `connect-src` gains `https://maps.googleapis.com`. `public/_headers`
   calls that line load-bearing, so this is a deliberate widening to be written
   down rather than slipped in. Note it does NOT need `script-src` widening in
   v1, because v1 loads no SDK.
3. **640×640 is the ceiling.** So 640×360 for 16:9 — smaller than the 1280 long
   edge `seedImage.ts` normally keeps. Fine for a reference, which guides
   composition rather than being displayed, but it is a real limit and worth
   confirming by eye before building on it.
4. **Coverage.** Street View follows roads. This app's range includes open ocean
   and interior Antarctica, so the box must be comfortable saying "nothing here"
   most of the time and must not look broken when it does.
5. **Pitch and field of view.** Heading comes from the bearing. Pitch level and
   fov 90 (the default; 120 is the maximum) are close to an ordinary photograph.
   Worth exposing later, not now.
6. **Does the heading become a seed axis?** Right now it is consumed and
   forgotten. Keeping it would let the sweep re-render every frame from the same
   bearing — a real improvement, and a larger change than this feature.

## 7. Risks

- **Grey placeholders.** Without `return_error_code=true`, a location with no
  coverage returns a grey image and HTTP 200. Seeding a frame from that would be
  the quietest failure in the app.
- **Terms of service.** Google's Maps Platform terms govern what may be done
  with Street View imagery, and using it as a conditioning input to an image
  model is not a use they had in mind. This is the risk I would resolve first —
  it is the only one that cannot be fixed after shipping.
- **Quality.** Street-level captures are frequently blown out, rain-streaked, or
  half-blocked by a parked van. A bad reference is worse than none, and the
  visitor cannot tell before spending. The thumbnail has to be big enough to
  judge.
- **Faces and plates.** Both providers blur them; the blur will be faithfully
  reproduced as a smear by whatever the image model draws.
- **It undercuts "no backend, no accounts".** Two credentials and two third
  parties is a different product from one key and a CSP that names one host.

## 8. Phasing

1. **Metadata only.** Click the map; the box reports whether imagery exists here
   and when it was taken. Free, no image, no spending. Proves coverage where the
   visitor actually goes.
2. **The reference.** One Static call at the computed bearing, into
   `seedImage.ts`, into the photograph flow that already exists. This is the
   whole feature, and it is small — Google does the projection.
3. **The date binding.** Selecting imagery moves the dial to its capture year.
4. **The graph walk**, if choosing among angles turns out to matter. This is
   where the Maps JS SDK and the probe's breadth-first search come in, and it is
   the only step that widens `script-src`.

Steps 1–3 are the feature. Step 4 is a refinement, and the probe is already the
prototype for it.
