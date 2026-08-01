/**
 * PICTURES OF THIS SPOT — one now, or many across time.
 *
 * This used to be titled "take a core sample" and shaped to match the film
 * control beside it, on the reasoning that both were explicit opt-in renders.
 * That was the wrong family. Film turns a picture INTO A VIDEO; this makes MORE
 * PICTURES. Identical styling on two blocks with different outputs left the
 * titles to carry the distinction, and "core sample" is a metaphor that names
 * no output at all — so the wrong reading had nothing to correct it.
 *
 * Both fixes are here: the block is named for what comes out, and the LEVER is
 * printed inside it as the one-picture case. The lever itself does not move —
 * it is the app's signature object and belongs where it is — but stating it
 * here is what shows that these are one job at two counts, rather than two
 * different features that happen to be adjacent.
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
        <span className="film-title">Pictures of this spot</span>
        <span className="film-meta">{length} images · {span.blurb}</span>
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
          {/* Reads out what it will produce. "Sample" named the gesture; this
              names the result, which is the thing worth confirming before a
              price dialog opens. */}
          <button className="film-go" onClick={onRun}>
            take {length} images
            <span aria-hidden="true"> ⧗</span>
          </button>
        </div>
      </div>
    </div>
  );
}
