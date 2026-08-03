# Sweep experiment

One station of the sweep, run from the terminal instead of the UI.

Every finding in this pipeline so far cost a round trip: open the portal, pull the
lever, wait, screenshot, paste, argue about it. This runs the same three calls the
sweep makes for one frame and writes every intermediate to disk — the boxes, the
cut-out that was sent, the prompt that went with it, the picture that came back.

```sh
export OPENROUTER_API_KEY=sk-or-...
python3 -m venv venv && ./venv/bin/pip install pillow

./venv/bin/python sweep-probe.py Colosseum-1.jpg --from 2010 --to 1700
```

Output lands in `probe-out/<image>-<from>-to-<to>-<mode>/`:

```
boxes.json    what the segmenter said, with its verdicts
cutout.png    the defaced picture actually attached
prompt.txt    the words that went with it
output.png    what came back
```

## The three modes

| `--mode` | what is attached | tests |
|---|---|---|
| `both` *(default)* | cut-out **+** uncut original | the cut-out says what is present, the original says where the camera is |
| `cut` | cut-out only | temporal correctness; the crowd cannot cross |
| `raw` | the original, untouched | composition; nothing to push the model into inventing |

`raw` holds a vantage and carries its crowd into the next century re-costumed.
`cut` removes the crowd and takes the structure that was stating the camera with
it. `both` exists because those are only in tension while one attachment has to
do both jobs.

## Other switches

```
--place "the Colosseum, Rome"   what the segmenter and planner are told the place is
--model google/gemini-3.1-flash-lite-image
--no-planner                    drop the "what is different this year" paragraph
--out DIR                       default probe-out
```

## Notes

**A separate implementation, on purpose.** The app composites on a browser canvas;
this uses PIL. Keeping them apart means this file can be edited freely to try
something without touching what ships — and a result here is a result about the
METHOD rather than about our code. The constants and wording are copied from
`timeMask.ts` and `promptcraft.ts` and marked where they came from; when the two
drift apart, this one is wrong.

**Step size matters more than anything else here.** Every good result in testing
was a short step and every bad one a long jump: 2010 to 1987 came back nearly
identical, 1987 to 1943 came back as a different photograph. The more of the frame
is erased, the freer the model is to compose it, so a 300-year jump in one call is
the hardest thing you can ask for. Chain it — 2010, 1900, 1800, 1700 — to see what
the app does across a real sweep.
