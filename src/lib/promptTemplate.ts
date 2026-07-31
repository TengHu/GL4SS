/**
 * THE IMAGE META-PROMPT, as editable data rather than hard-coded string joins.
 *
 * Two reasons this is a template:
 *
 * 1. It is the highest-leverage text in the app — it decides what every frame
 *    looks like — and it was buried in an array join inside promptcraft.ts where
 *    nobody but the author could reach it. It now belongs to the user.
 *
 * 2. The default was wrong. It was built in the SDXL idiom: comma-and-full-stop
 *    separated fragments, a stack of "no X" negatives, and a trailing
 *    "photorealistic, cinematic composition, high dynamic range, 8K detail".
 *    Black Forest Labs' own FLUX.2 guide and Google's Nano Banana guide
 *    independently say the opposite, and those are our two default families:
 *
 *      - Write NATURAL LANGUAGE. Tag lists are an anti-pattern; FLUX.2's text
 *        encoder is a language model and reads sentences.
 *      - Order matters. FLUX.2 "pays more attention to what comes first", so the
 *        structure is Subject -> Action -> Style -> Context.
 *      - FLUX.2 does not support negative prompts AT ALL. "Focus on describing
 *        what you want, not what you don't want." Naming a thing to exclude can
 *        summon it.
 *      - Quality tags are legacy noise; the model already biases to quality.
 *      - For photorealism, name a real camera, lens and film stock rather than
 *        saying "professional photo".
 *
 *        MEASURED, AND THIS ONE IS WRONG AS STATED. A live A/B ran the shipped
 *        template against an arm identical in every byte except that the
 *        "Shot on a Leica M6 with a 35mm Summicron at f/8, on Kodak Portra 400
 *        film" clause was replaced by "Photographed at" — 8 variants x 3
 *        destinations x 2 repeats, 48 frames. The two arms are statistically
 *        indistinguishable. Eight of ten objective measures (grain, highlight
 *        rolloff, clipping, crushed blacks, dynamic range, depth-of-field proxy)
 *        REVERSE SIGN between destinations, and the two that hold sign have
 *        effect sizes at or below the spread you get from running the SAME
 *        prompt twice. Four of five judges reached the null independently.
 *
 *        Scope it precisely, because the useful version is narrower than the
 *        refutation: GIVEN an explicit film-behaviour sentence ({filmLook}) and
 *        a stated viewpoint and light direction ({viewpoint}), the brand and
 *        hardware nouns buy nothing measurable. Those two placeholders are doing
 *        the work. The rig strings are kept because removing them is equally
 *        zero-risk and churn is not free — but nobody should "improve" this app
 *        by tuning them, and nobody should add hardware nouns anywhere else
 *        expecting realism. If {filmLook} is ever dropped, this is untested
 *        again.
 *
 * So the default below is prose, subject-first, positively framed, with the
 * anachronism guard expressed as a statement about what IS present. That guard
 * carries real weight: it is the only thing keeping a 500 BC frame free of
 * imperial marble.
 */

export interface PromptFields {
  /** The focal subject, from the scene-direction call. */
  subject: string;
  /**
   * Who is in the frame, as one positively-phrased sentence chosen by the
   * planner's habitation level. Empty when the level is unknown.
   *
   * Sits second by design. The uninhabited and traces-only wordings contain none
   * of the words people, person, human, figure, building or empty, because
   * FLUX.2 takes no negative prompt and naming a thing can summon it — an
   * unpopulated frame has to be described by what fills it, not by what is
   * absent from it. The sparse and dense wordings name people deliberately.
   */
  habitation: string;
  /**
   * The anachronism guard, phrased for whether anyone is here. At settled,
   * dense, sparse and unknown it is the original sentence verbatim; at
   * uninhabited and traces-only it names no human noun at all, because the old
   * text demanded "materials, clothing, tools and construction" of an open ocean
   * and told an evacuated town its construction was current and intact.
   */
  period: string;
  /** Concrete datable details for this exact year. */
  periodMarkers: string;
  /**
   * The living ground truth: terrain, vegetation and the species actually
   * present here in this year. Empty when the planner supplied none, in which
   * case the era-atmosphere fields below are still the floor. Already carried
   * inside {light}; exposed separately for custom templates.
   */
  biome: string;
  location: string;
  /** Formatted, e.g. "120 AD". */
  year: string;
  /** Era label, e.g. "Roman Era". */
  era: string;
  atmosphere: string;
  lighting: string;
  palette: string;
  texture: string;
  camera: string;
  /**
   * Pre-composed sentences. They exist because a placeholder that can be empty
   * leaves broken grammar behind ("lit by ." when a style owns the lighting), and
   * the raw parts are still exposed below for anyone writing their own wording.
   */
  light: string;
  capture: string;
  /** Camera position and light direction, without the hardware nouns. */
  viewpoint: string;
  /** The film-behaviour prose, without the hardware nouns. Empty for drawn styles. */
  filmLook: string;
  /** Style-preset sentence, or empty when no override is active. */
  style: string;
  /** Framing sentence, or empty. */
  aspect: string;
}

export const PROMPT_PLACEHOLDERS: Array<{ key: keyof PromptFields; blurb: string }> = [
  { key: 'subject', blurb: 'the focal subject the planner chose for this frame' },
  { key: 'habitation', blurb: 'who is in the frame — a crowd, a few figures, abandoned traces, or wilderness alone' },
  { key: 'period', blurb: 'the sentence that keeps everything in frame belonging to this exact year' },
  { key: 'periodMarkers', blurb: 'concrete details that date the scene to this exact year' },
  { key: 'biome', blurb: 'the terrain, plants and animals actually present here in this year' },
  { key: 'location', blurb: 'the place you are standing' },
  { key: 'year', blurb: 'formatted year, e.g. 120 AD' },
  { key: 'era', blurb: 'era label, e.g. Roman Era' },
  { key: 'atmosphere', blurb: 'time of day, weather and mood' },
  { key: 'lighting', blurb: "the era's characteristic light" },
  { key: 'palette', blurb: "the era's colour palette" },
  { key: 'texture', blurb: "the era's materials and surfaces" },
  { key: 'camera', blurb: 'where the photographer stands and what the light does — the body, lens, aperture and film stock are fixed' },
  { key: 'light', blurb: 'ready-made sentence covering the ground, air, light, colour and surfaces' },
  { key: 'capture', blurb: 'ready-made sentence: the camera, the film, and the imperfections that make it read as a photograph rather than a render' },
  { key: 'viewpoint', blurb: 'camera position and light direction, without the camera hardware' },
  { key: 'filmLook', blurb: 'how film behaves — grain, highlight rolloff, loose framing — without the hardware' },
  { key: 'style', blurb: 'active style preset, empty when none' },
  { key: 'aspect', blurb: 'framing/aspect instruction, empty when none' },
];

/**
 * The default meta-prompt.
 *
 * Written as sentences, most important first. Anything that would be a negative
 * ("no modern artifacts") is instead stated positively as what the frame does
 * contain, because the models we route to either ignore negations or act on the
 * noun inside them.
 */
/**
 * THE CAPTURE BLOCK GOES FIRST, and this is the single best-evidenced line in
 * this file.
 *
 * A live A/B — 8 template variants x 4 destinations x 32 real frames, one shared
 * scene direction per destination so the template was the only variable — found
 * that moving this one sentence from last to first is the largest effect in the
 * experiment, and it is a pure reordering: the A and C prompts for Uruk are the
 * same word multiset, verified by diff.
 *
 * A-with-capture-last rendered a flat, shadowless, waxy elevated diorama with a
 * tidy still-life of bowls in the foreground. C-with-capture-first rendered hard
 * raking backlight, long cast shadows across the paving, veiling flare, airborne
 * dust, specular skin and a crowd receding into haze through the gate. Same
 * words. The file already asserted that FLUX-class encoders weight what comes
 * first; it had simply never applied that rule to the photographic instruction.
 *
 * The predicted cost — losing the subject by demoting it — did NOT appear on
 * three of four destinations. It appeared on exactly one, the Saturn V, where
 * the subject is a specific piece of hardware. Watch that case.
 *
 * The shipped template placed sixth of eight. Do not restore it from memory.
 */
export const DEFAULT_IMAGE_TEMPLATE = `{capture}

{subject}, at {location} in {year}.

{habitation}

{periodMarkers}

{period}

{biome}

{light}

{style}{aspect}`;

/**
 * Every default this app has ever shipped, verbatim, newest last.
 *
 * Portal.tsx persists the template to localStorage in an effect that runs on
 * MOUNT, so the default live at a user's first ever load is written to storage
 * even if they never open Settings. Read back naively, that pins 100% of
 * returning users to an old default forever and a change to
 * DEFAULT_IMAGE_TEMPLATE reaches nobody — including {habitation} and {period},
 * without which this whole fix stops at the planner. That is not a rare edge;
 * it is the entire installed base.
 *
 * A stored string byte-equal to a previous default was never edited by a human,
 * so it is safe to replace with the current default. Anything else is the user's
 * own text and is left alone. APPEND the old string here whenever this default
 * changes; never rewrite an entry.
 */
export const LEGACY_IMAGE_TEMPLATES: string[] = [
  `{subject}, at {location} in {year}.

{habitation}

{periodMarkers}

{period}

{light}

{capture}

{style}{aspect}`,
  `{subject}, at {location} in {year}.

{periodMarkers}

Everything visible belongs to this exact moment: the materials, clothing, tools and construction are those of {era} in {year}, and nothing from a later age has arrived yet.

{light}

{capture}

{style}{aspect}`,
];

const TOKEN = /\{(\w+)\}/g;

/** Fill a template. Unknown placeholders are left visible rather than silently
 *  dropped, so a typo in a user-edited template is diagnosable. */
export function fillTemplate(template: string, fields: Partial<PromptFields>): string {
  const filled = template.replace(TOKEN, (match, key: string) => {
    const value = (fields as Record<string, string | undefined>)[key];
    if (value === undefined) return match;
    return value;
  });

  return (
    filled
      // Blank placeholders leave holes; collapse the resulting whitespace so the
      // model is not handed ragged punctuation.
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+([.,])/g, '$1')
      .replace(/\.{2,}/g, '.')
      .trim()
  );
}

/** Cheap sanity check for the settings editor. */
export function validateTemplate(template: string): string | null {
  if (!template.trim()) return 'The template cannot be empty.';
  if (!template.includes('{subject}')) {
    return 'The template must include {subject} — without it the frame has no focal subject.';
  }
  const known = new Set(PROMPT_PLACEHOLDERS.map((p) => p.key as string));
  const unknown = [...template.matchAll(TOKEN)]
    .map((m) => m[1]!)
    .filter((k) => !known.has(k));
  if (unknown.length) {
    return `Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${[...new Set(unknown)]
      .map((u) => `{${u}}`)
      .join(', ')}`;
  }
  return null;
}

export const PROMPT_TEMPLATE_STORAGE_KEY = 'looking-glass-image-template';
