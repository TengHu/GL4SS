# Sweep experiment

**The production sweep, run from the terminal.** Not a re-implementation — every
step is the module the portal itself calls, imported straight out of `../src`:

| step | module |
|---|---|
| the standpoint, once per sweep | `planStandpoint` — `src/lib/openrouter.ts` |
| the planner, per station | `generateSceneDirection` — same |
| the anachronism pass | `segmentAnachronisms` — `src/portal/lib/timeMask.ts` |
| the cut-out | `compositeCutout` — same |
| the prompt | `buildSweepPrompts` — `src/lib/promptcraft.ts` |
| the image | `renderStill` — `src/portal/lib/render.ts` |
| the drift check | `planStandpoint` again, `horizonFraction` |

A change to the pipeline shows up here without being copied across, and a result
here is a result about the pipeline.

## Run

```sh
npm install
export OPENROUTER_API_KEY=sk-or-...

npm run sweep -- Colosseum-1.jpg --from 2010 --to 1700
```

Everything lands in `probe-out/<image>-<from>-to-<to>/`:

```
standpoint.json     the camera read off the seed
1700-boxes.json     what the segmenter said, with its verdicts
1700-cutout.png     the defaced picture actually attached
1700-prompt.txt     the words that went with it
1700.png            what came back
```

## Chain it

The app never jumps straight from 2010 to 1700 — it walks the ladder, each frame
cut from the one beside it. `--stations` does the same:

```sh
npm run sweep -- Colosseum-1.jpg --from 2010 --to 1700 --stations 1900,1800
```

That runs 2010 → 1900 → 1800 → 1700, each station cutting from the frame before
it, which is what `coreSample` does.

**This is the variable that has mattered most.** Every good result in testing was
a short step and every bad one a long jump: 2010 to 1987 came back nearly
identical, 1987 to 1943 came back as a different photograph. The more of the
frame is erased, the freer the model is to compose it — so a 310-year jump in one
call is the hardest thing you can ask for, and chaining is not a nicety.

## Switches

```
--from 2010            year the input photograph was taken
--to 1700              year to render
--stations 1900,1800   intermediate stations, in order
--no-cut               send the source whole (window.__noCut)
--model <id>           image model; default is the app's own
--text-model <id>      planner and segmenter
--place "..."          what the planner and segmenter are told the place is
--lat / --lng          coordinates; default the Colosseum
--out DIR              default probe-out
```

## What is NOT replicated

The archive — there is nothing to restore, the seed is the file you pass. The
queue and its concurrency — one station at a time is the point. The UI. And the
lever: the seed here is your photograph as-is, where the portal would first
generate a frame from it, which is itself a step that moves the camera.

Everything that touches a model is the shipping path.

## The DOM shim

`dom.ts` provides the four browser globals the app's modules reach for, and
nothing else. The canvas is Skia — the engine Chrome draws with — so the grey,
the blur and the perspective grid come out as they do in the browser.

One trap is recorded there: Skia's `Image` decodes dimensions from its `src`
setter but not pixels, and draws black. Only `loadImage()` returns something with
pixels in it, so the shim holds a real image rather than being one, and
`drawImage` is patched to unwrap it.
