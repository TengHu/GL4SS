/**
 * PICTURES OF THIS SPOT — one now, or several across time.
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

export function SampleControl({
  years,
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
        <span className="film-title">Pictures of this spot</span>
        <span className="film-meta">
          {years.length ? (
            <>
              {years.length} images
              {first !== undefined && last !== undefined && years.length > 1
                ? ` · ${formatYear(first)} → ${formatYear(last)}`
                : ''}
            </>
          ) : (
            'no years picked'
          )}
        </span>
      </div>

      {/* The one-picture case, named and pointed at rather than duplicated. A
          second button here would be a second way to spend on one frame, and
          the app deliberately has exactly one. */}
      <div className="sample-one">
        one, right now
        <span className="sample-one-rule" aria-hidden="true" />
        <span className="sample-one-target">pull the lever ⟶</span>
      </div>

      <div className="sample-rows">
        <div className="sample-many">many, across time</div>

        {/* The list itself. Ascending, so it reads as a timeline rather than as
            the order things happened to be clicked in. */}
        <div className="year-chips" role="list" aria-label="Years queued">
          {years.map((y) => (
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
          ))}

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
          <button className="film-go" onClick={onRun} disabled={years.length < 2}>
            take {years.length} images
            <span aria-hidden="true"> ⧗</span>
          </button>
        </div>
      </div>
    </div>
  );
}
