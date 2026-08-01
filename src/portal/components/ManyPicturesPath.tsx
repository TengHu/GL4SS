/**
 * PATH B — MANY PICTURES ACROSS TIME, and the video made across them.
 *
 * The app has two independent paths to a video:
 *
 *   A   one picture   → a clip of that picture      (OnePicturePath)
 *   B   many pictures → a clip across them          (this file)
 *
 * They do not meet, and this block used to imply otherwise twice over: it
 * printed the LEVER inside itself — path A's first step — and the video block
 * beneath it said "then", as though it continued from this one. It does not.
 * Each box is now one whole path.
 *
 * This path's video step happens in the viewer that opens after a run, not in
 * the caption, so the box says so rather than leaving it to be hunted for.
 *
 * WHAT YOU ARE EDITING IS A LIST OF YEARS.
 *
 * It used to be a choice between four canned spans, which could only ever
 * produce evenly spaced years. That answers "show me recorded history" and
 * cannot answer "show me 1989, 1999, 2010 and 2020" — a set, not a span. The
 * runner has always taken an arbitrary `years: number[]`; only this control was
 * narrower than the thing behind it.
 *
 * So the list is the state, and everything else is a way to fill it:
 *
 *   a span preset   replaces the list with N evenly spaced years
 *   + this year     appends whatever the dial is tuned to
 *   a chip's ×      removes one
 *
 * Which means a preset is a starting point rather than a cage: take recorded
 * history, drop the two you do not want, add 79 AD, and go.
 *
 * The block is also named for what comes OUT of it. It was "take a core sample",
 * shaped to match the film control beside it — the wrong family, since film turns
 * a picture into a video and this makes more pictures. And the LEVER is printed
 * inside as the one-picture case: it does not move, it is the app's signature
 * object, but naming it here is what shows one and many to be the same job at
 * two counts.
 */

import { useState } from 'react';
import { formatYear } from '../../lib/format';
import { SAMPLE_LENGTHS, SAMPLE_SPANS } from '../lib/coreSample';

interface Props {
  /** The years queued, ascending. This is the real state. */
  years: number[];
  /**
   * The seed's year — the picture already on the glass.
   *
   * Pinned: it cannot be removed, because the sweep grows out of it and it is
   * the one frame already paid for. A queue that could exclude it would quietly
   * charge for the picture the visitor is looking at.
   */
  seedYear?: number;
  /** The station the dial is tuned to, offered as the next addition. */
  currentYear: number;
  onAddYear: () => void;
  /** Add a typed year. Returns false when it could not be parsed. */
  onAddTypedYear: (raw: string) => boolean;
  onRemoveYear: (year: number) => void;
  /** Replace the list with an evenly spaced fill. */
  onFill: (spanId: string, count: number) => void;
  spanId: string;
  length: number;
  onRun: () => void;
  /** A run already exists in this session — the button reopens it. */
  hasSample: boolean;
  onReopen: () => void;
}

export function ManyPicturesPath({
  years,
  seedYear,
  currentYear,
  onAddYear,
  onAddTypedYear,
  onRemoveYear,
  onFill,
  spanId,
  length,
  onRun,
  hasSample,
  onReopen,
}: Props) {
  const [draft, setDraft] = useState('');
  const [bad, setBad] = useState(false);
  const alreadyQueued = years.includes(currentYear);

  const commitDraft = () => {
    const raw = draft.trim();
    if (!raw) return;
    if (onAddTypedYear(raw)) {
      setDraft('');
      setBad(false);
    } else {
      setBad(true);
    }
  };
  const first = years[0];
  const last = years[years.length - 1];

  return (
    <div className="sample">
      <div className="film-head">
        <span className="film-dot" aria-hidden="true" />
        <span className="film-title">Many pictures, across time</span>
        <span className="film-meta">
          {years.length ? (
            <>
              {years.length} images
              {first !== undefined && last !== undefined && years.length > 1
                ? ` · ${formatYear(first)} → ${formatYear(last)}`
                : ''}
              {seedYear !== undefined && years.includes(seedYear) ? ' · 1 already yours' : ''}
            </>
          ) : (
            'no years picked'
          )}
        </span>
      </div>

      <div className="sample-rows">
        {/* The list itself. Ascending, so it reads as a timeline rather than as
            the order things happened to be clicked in. */}
        <div className="year-chips" role="list" aria-label="Years queued">
          {years.map((y) =>
            y === seedYear ? (
              // The seed. No ×, and marked — it is where the sweep grows from,
              // and it is already yours.
              <span key={y} role="listitem" className="year-chip year-chip--seed">
                {formatYear(y)}
                <span className="year-chip-seed" aria-hidden="true">
                  seed
                </span>
              </span>
            ) : (
              <button
                key={y}
                role="listitem"
                className="year-chip"
                onClick={() => onRemoveYear(y)}
                title={`Remove ${formatYear(y)}`}
              >
                {formatYear(y)}
                <span className="year-chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ),
          )}

          {/* Two ways in, because they suit different intents. The button adds
              wherever the dial is standing — right when you are already looking
              at the year you want. The field adds a year you have in mind,
              without a trip to the dial and back for each one. */}
          <button
            className="year-add"
            onClick={onAddYear}
            disabled={alreadyQueued}
            title={
              alreadyQueued
                ? `${formatYear(currentYear)} is already in the list`
                : `Add ${formatYear(currentYear)} to the list`
            }
          >
            + {formatYear(currentYear)}
          </button>

          <input
            className={`year-input${bad ? ' year-input--bad' : ''}`}
            value={draft}
            placeholder="or type a year"
            aria-label="Add a year — 1999, 500 BC, 66 mya"
            onChange={(e) => {
              setDraft(e.target.value);
              setBad(false);
            }}
            onBlur={commitDraft}
            /* Every key is stopped here. Portal's handler listens on window for
               arrows, Enter and single letters, so without this typing "1999"
               would retune the dial and "f" would go fullscreen mid-word. The
               INPUT/TEXTAREA exemption up there covers it, but Escape and Enter
               still need handling locally. */
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              } else if (e.key === 'Escape') {
                setDraft('');
                setBad(false);
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        {/* Fills, not modes. Clicking one replaces the list; editing it
            afterwards is expected rather than a departure from the preset. */}
        <div className="sample-fill">
          <span className="sample-fill-label">fill with</span>
          <div className="seg seg--wrap">
            {SAMPLE_SPANS.map((s) => (
              <button
                key={s.id}
                className={`seg-option${s.id === spanId ? ' seg-option--on' : ''}`}
                onClick={() => onFill(s.id, length)}
                title={s.blurb}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sample-go-row">
          <div className="seg" role="radiogroup" aria-label="How many to fill with">
            {SAMPLE_LENGTHS.map((n, i) => (
              <button
                key={n}
                role="radio"
                aria-checked={length === n}
                tabIndex={length === n ? 0 : -1}
                className={`seg-option${length === n ? ' seg-option--on' : ''}`}
                onClick={() => onFill(spanId, n)}
                /* Arrows must not reach Portal's global handler, or choosing a
                   count would retune the year instead. Same lesson as
                   FilmControl learned the hard way. */
                onKeyDown={(e) => {
                  const delta =
                    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                    : 0;
                  if (!delta) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const next = SAMPLE_LENGTHS[(i + delta + SAMPLE_LENGTHS.length) % SAMPLE_LENGTHS.length]!;
                  onFill(spanId, next);
                  const group = e.currentTarget.parentElement;
                  const target = group?.children[SAMPLE_LENGTHS.indexOf(next)] as HTMLElement | undefined;
                  target?.focus();
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {hasSample && (
            <button className="ghost-btn sample-reopen" onClick={onReopen}>
              reopen
            </button>
          )}
          {/* Reads out what it will produce. "Sample" named the gesture; this
              names the result, which is the thing worth confirming before a
              price dialog opens. */}
          {/* Counts what will be BILLED, not how many pictures result. Saying
              "take 4" when one is already yours errs in the direction that
              costs money. */}
          <button className="film-go" onClick={onRun} disabled={years.length < 2}>
            take {years.length - (seedYear !== undefined && years.includes(seedYear) ? 1 : 0)} more
            <span aria-hidden="true"> ⧗</span>
          </button>
        </div>

        {/* Named, not hidden. This path's video step lives in the viewer that
            opens after a run — saying where stops it being hunted for in the
            caption, where the only render button belongs to the other path. */}
        <div className="path-then">
          <span className="path-then-title">then film them</span>
          <span className="film-meta">in the viewer that opens</span>
        </div>
      </div>
    </div>
  );
}
