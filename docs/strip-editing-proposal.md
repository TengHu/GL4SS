# Proposal: edit the strip

*Re-roll, re-time, remove and insert a single station — without re-running the sweep.*

---

## The problem

A sweep is all-or-nothing. One bad frame — a drifted camera, a hallucinated
building, a year the model reinvented — and the options are keep it or pay for
the whole ladder again. The strip already knows which frames are suspect: it
marks drift in amber and seams in cyan. It just cannot act on what it knows.

The frame is also the unit that matters to the film. A single bad station breaks
two clips, because every clip is pinned to the stations either side of it.

---

## The UI

The strip stays as it is. Selecting a cell reveals one row beneath it:

```
┌──────┬──────┬──────┬──────┬──────┐
│ 1900 │ 1943 │ 1970 │[1995]│ 2020 │      the strip, unchanged
└──────┴──────┴──────┴──────┴──────┘
                        ▲ selected

  1995 AD   ⟳ re-roll   ⇢ year [1995]   ✕ remove   + add station

  ⚠ 1970 and 2020 were cut from this frame
```

Four actions, and each says what it costs before it runs:

| | does | costs |
|---|---|---|
| **⟳ re-roll** | renders this year again, same everything | 1 image + 2 text |
| **⇢ year** | retype the year, render at the new one | 1 image + 2 text |
| **✕ remove** | drops the station from the sweep | nothing |
| **+ add station** | type a year, render it into place | 1 image + 2 text |

**Remove is free and instant**, which makes it the first thing to reach for. A
frame that is wrong and cannot be fixed is better gone than kept: the chain
re-links around it — `cutSource` already walks outward to the first station that
landed — and the film simply spans the gap.

### What the warning line is for

Regenerating a station does NOT regenerate the stations drawn from it. Those were
cut from the old frame and are now inconsistent with the new one, so they are
marked stale rather than silently re-run: re-rendering them is more money, and
whether it is worth spending is not a decision to take on someone's behalf.

A stale marker is a third cell state alongside drift and seam.

---

## What it needs underneath

**The per-station render has to be callable on its own.** It is currently 370
lines inlined in `start()`'s loop — segment, plan, prompt, render, measure — and
nothing can invoke it for one index. Extracting it to `renderStation(i)` is the
bulk of this work and is worth doing regardless: it is also what would let a
failed station be retried, which today requires re-running the sweep.

**Four runner methods**, all thin once the extraction is done:

```
reroll(i)          renderStation(i)
retime(i, year)    set the year, renderStation(i)
drop(i)            splice the frame; no calls
insert(year)       splice a pending frame into ladder order, renderStation(i)
```

**Insert has one wrinkle.** A new station's source is the nearest finished frame
toward the seed, which `cutSource` already computes — so inserting between two
finished frames cuts from the one nearer the seed, exactly as it would have in
the original run. Nothing special is needed; it falls out of the existing rule.

---

## Scope

**In:** the four actions, the cost labels, the stale marker, and the extraction
that makes them possible.

**Out:** re-rolling a range, undo, or automatically re-running stale neighbours.
All reasonable, none needed to make the strip editable, and each is another way
to spend money by accident.

**Deliberately not automatic:** nothing regenerates without being asked. Every
action that spends is a button with a price on it.

---

## Why this is worth more than it looks

Today a sweep is judged as a whole and re-run as a whole, so improving one frame
costs the price of all of them. Per-station editing turns that into the price of
one — which also makes the drift marker actionable rather than merely
informative, and makes it reasonable to run long sweeps knowing the bad frames
can be picked off individually afterwards.
