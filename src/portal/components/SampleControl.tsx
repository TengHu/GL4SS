/**
 * THE CORE SAMPLE CONTROL.
 *
 * Sits with the film control and is deliberately shaped like it, because it is
 * the same kind of thing: an explicit, expensive, opt-in render that is not part
 * of moving the dial. Two segmented choices — how far, how many — and one button
 * that opens the price dialog.
 *
 * The span pills carry a blurb rather than a year range. "3000 BC to now" means
 * something; "-3000 → 2030" is the same fact in a form nobody reads.
 */

import { SAMPLE_LENGTHS, SAMPLE_SPANS } from '../lib/coreSample';

interface Props {
  spanId: string;
  onSpanChange: (id: string) => void;
  length: number;
  onLengthChange: (n: number) => void;
  onRun: () => void;
  /** A sample already exists in this session — the button reopens it. */
  hasSample: boolean;
  onReopen: () => void;
}

export function SampleControl({
  spanId,
  onSpanChange,
  length,
  onLengthChange,
  onRun,
  hasSample,
  onReopen,
}: Props) {
  const span = SAMPLE_SPANS.find((s) => s.id === spanId) ?? SAMPLE_SPANS[0]!;

  return (
    <div className="sample">
      <div className="film-head">
        <span className="film-dot" aria-hidden="true" />
        <span className="film-title">Take a core sample</span>
        <span className="film-meta">this spot, {length} frames · {span.blurb}</span>
      </div>

      <div className="sample-rows">
        <div className="seg seg--wrap" role="radiogroup" aria-label="Span of time">
          {SAMPLE_SPANS.map((s, i) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={s.id === spanId}
              tabIndex={s.id === spanId ? 0 : -1}
              className={`seg-option${s.id === spanId ? ' seg-option--on' : ''}`}
              onClick={() => onSpanChange(s.id)}
              /* Arrows must not reach Portal's global handler, or choosing a span
                 would retune the year instead. Same lesson as FilmControl. */
              onKeyDown={(e) => {
                const delta =
                  e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                  : 0;
                if (!delta) return;
                e.preventDefault();
                e.stopPropagation();
                const next = SAMPLE_SPANS[(i + delta + SAMPLE_SPANS.length) % SAMPLE_SPANS.length]!;
                onSpanChange(next.id);
                const group = e.currentTarget.parentElement;
                const target = group?.children[SAMPLE_SPANS.indexOf(next)] as HTMLElement | undefined;
                target?.focus();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="sample-go-row">
          <div className="seg" role="radiogroup" aria-label="Number of frames">
            {SAMPLE_LENGTHS.map((n, i) => (
              <button
                key={n}
                role="radio"
                aria-checked={length === n}
                tabIndex={length === n ? 0 : -1}
                className={`seg-option${length === n ? ' seg-option--on' : ''}`}
                onClick={() => onLengthChange(n)}
                onKeyDown={(e) => {
                  const delta =
                    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
                    : 0;
                  if (!delta) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const next = SAMPLE_LENGTHS[(i + delta + SAMPLE_LENGTHS.length) % SAMPLE_LENGTHS.length]!;
                  onLengthChange(next);
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
          <button className="film-go" onClick={onRun}>
            sample
            <span aria-hidden="true"> ⧗</span>
          </button>
        </div>
      </div>
    </div>
  );
}
