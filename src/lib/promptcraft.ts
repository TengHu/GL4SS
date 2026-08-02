/**
 * Prompt craft for The Looking Glass.
 *
 * The old pipeline pasted the same narrative into 3 panels and asked for
 * "cinematic photorealistic" — predictable result: 3 nearly identical images.
 *
 * Prompts are NATURAL LANGUAGE, assembled from an editable template (see
 * promptTemplate.ts). They used to be comma-and-period separated fragment stacks
 * ending in "photorealistic, 8K detail" — the SDXL idiom. Black Forest Labs'
 * FLUX.2 guide and Google's Nano Banana guide, which between them cover both of
 * this app's default image models, independently say that is an anti-pattern:
 * write sentences, put the most important thing first, drop quality tags, and do
 * not use negatives at all (FLUX.2 ignores them outright).
 *
 * Each panel still gets a distinct subject anchor from the scene-direction call
 * so left/center/right differ while sharing atmosphere.
 *
 * Per-era atmosphere descriptors give Bronze Age 1500 BC a sun-bleached ochre
 * palette and Far Future 2700 a post-singular iridescent sheen — the old
 * "cinematic 8k" treatment was era-agnostic and that's why every jump looked
 * the same regardless of when.
 */

import type { Coordinates, ViewMode } from '../types';
import { formatYear, getEraBand, getEraDescription } from './format';
import { DEFAULT_IMAGE_TEMPLATE, fillTemplate } from './promptTemplate';
import type { PromptFields } from './promptTemplate';

// ============================================================================
// SCENE DIRECTION (returned by the planner LLM, fed into prompts)
// ============================================================================

/**
 * Who is in this frame — decided by the planner from PLACE and YEAR TOGETHER,
 * never from the year alone.
 *
 * The rule this replaces was `const prehistoric = year < -12_000` in
 * openrouter.ts, whose false branch hard-required "an INHABITED scene with
 * visible people" for every date after 12,000 BC at every coordinate on Earth,
 * while `coordinates` was interpolated once as a label and never consulted
 * again. Interior Antarctica in 1200, the mid-Pacific in 1500 and Everest
 * before the first ascent were all ordered to contain a populated scene.
 * Habitation is a property of a POINT ON THE SURFACE at a DATE; most of that
 * surface has nobody standing on it in any year, including this one.
 *
 * Five levels because three is not enough. 'traces-only' is what makes Pripyat
 * in 2020 and an abandoned whaling station work at all; without 'sparse' the
 * Amazon in 3000 BC must choose between empty wilderness and a city.
 */
export type HabitationLevel =
  | 'uninhabited'   // nobody, and nothing anyone made, anywhere in frame
  | 'traces-only'   // made things present and legible, no living person in frame
  | 'sparse'        // a few people, small in frame, the land dominant
  | 'settled'       // a working community at ordinary business
  | 'dense';        // a crowd — people at every distance, surroundings continuous

/** Order matters: `parseHabitation` prefix-matches against this list. */
export const HABITATION_LEVELS: HabitationLevel[] = [
  'uninhabited',
  'traces-only',
  'sparse',
  'settled',
  'dense',
];

export interface SceneDirection {
  /**
   * Who is here. Emitted FIRST in the planner's JSON, on purpose: committed
   * before the subjects are authored, the field truncation cannot reach, and
   * regex-recoverable from a response JSON.parse cannot touch.
   *
   * OPTIONAL, and undefined is meaningful: it means "make no claim", which
   * leaves the image model's own prior in charge — the pre-existing behaviour,
   * so this cannot regress. It is also the honest type for engine.ts:347, which
   * casts persisted scenes `as SceneDirection` unchecked.
   */
  habitation?: HabitationLevel;
  narrative: string;        // 2–3 sentences for the user
  atmosphere: string;       // palette / weather / time of day / mood
  cameraNotes: string;      // lens, angle, lighting direction
  /**
   * Concrete visual details that DATE the scene to within roughly a lifetime.
   *
   * The band tables give a whole era one palette, which verifiably reaches the
   * pixels but cannot separate 500 BC from 100 AD — both are "Roman Era", both
   * get vermilion and travertine, and a live probe confirmed the two frames were
   * materially indistinguishable. Hand-authoring forty more bands would only
   * move the seam; the model already knows what a specific half-century looked
   * like, so this asks it for the datable specifics instead of guessing them in
   * a lookup table.
   */
  periodMarkers: string;
  /**
   * The living ground truth of this frame: terrain and ground surface, the
   * vegetation actually growing here, the state of water/ice/sky, and the
   * specific animals genuinely present at this latitude in this period — or an
   * explicit statement that almost nothing lives here.
   *
   * Exists because the non-prehistoric `periodMarkers` arm asked for "garments,
   * tools, building techniques, goods, weapons, vehicles, materials or signage":
   * eight categories of human artifact, zero categories of living thing. Above
   * 12,000 BC the app's only concrete-detail field was a request for human
   * manufacture, so even a correctly de-peopled Antarctic frame had nothing
   * ecological to render.
   *
   * Also the replacement for ERA_ATMOSPHERES on uninhabited and traces-only
   * frames — see the `wild` gate in buildPanelPrompt. Empty on the fallback
   * path, which is exactly when the era table should still win.
   */
  biome?: string;
  /**
   * WHAT IN THE REFERENCE PHOTOGRAPH IS STILL HERE IN THIS YEAR, and how it
   * looked then — plus what is missing and what stands in its place.
   *
   * Only ever filled when a reference image was shown to the planner. It exists
   * because the question "is that building here in 1900?" is a question about
   * history, and the image model has no way to ask it: handed a photograph and a
   * year, it will either keep everything or replace everything, and the prompt
   * that used to guess for it guessed by category — landforms survive, built
   * things do not — which deleted the White House from a view of the White
   * House.
   *
   * The planner can see the picture and knows the date, so it answers per
   * object, and that answer goes into the image prompt at the weight a fact
   * deserves.
   */
  standing?: string;
  /**
   * DOES THE ATTACHED PHOTOGRAPH'S DOMINANT BUILT SUBJECT EXIST HERE IN THIS
   * YEAR — the one question that decides whether the frame gets a photograph at
   * all.
   *
   * The same reasoning `standing` does, in a form the runner can branch on.
   * Prose cannot gate an API call: `standing` could say "the carved heads do not
   * exist, Borglum did not begin until 1927" and the runner would still attach
   * two photographs of the finished monument, because nothing in the pipeline
   * could read it.
   *
   * 'no' is the safe default when the field is missing or unparseable. An
   * unattached frame drifts a little; an attached one renders a monument seven
   * years before the first charge was set.
   */
  referenceHolds?: 'yes' | 'no';
  leftSubject: string;      // distinct main subject of the left panel
  centerSubject: string;    // focal/main subject of the center panel
  rightSubject: string;     // distinct main subject of the right panel
  /**
   * True when the scene-direction JSON could not be parsed and this object was
   * synthesized instead.
   *
   * This path is dangerous precisely because it is *legitimate*: the fallback
   * returns a valid SceneDirection, so a broken prompt surfaces as a merely
   * mediocre picture rather than an error. Adding `periodMarkers` silently blew
   * the token budget and every frame quietly degraded to generic until the
   * fallback's tell-tale phrasing was spotted by eye. Anything that can degrade
   * every frame in the app without raising a single error has to announce itself.
   */
  isFallback?: boolean;
  travelerLook?: string;    // for chrono-selfie portrait
  cinematicSubject?: string;     // for cinematic
  cinematicCameraMove?: string;  // for cinematic
  cinematicSoundCue?: string;    // for cinematic
}

// ============================================================================
// ERA ATMOSPHERE
// ============================================================================

export interface EraAtmosphere {
  era: string;
  palette: string;
  lighting: string;
  texture: string;
}

/**
 * Atmosphere per era, keyed by the band id in format.ts.
 *
 * This used to be its own independent minYear ladder that "roughly mirrored"
 * getEraDescription(). It did not mirror it: the two tables disagreed on 40 of
 * the dial's 96 stations, so buildPanelPrompt emitted BOTH names into the same
 * prompt — e.g. 2000 BC arrived at the image model as "Ancient Bronze Age,
 * sun-bleached ochre ... at X in 2000 BC (Classical Antiquity)". Nearly half the
 * timeline was asking for two different periods at once.
 *
 * Keying off format.ts's ERA_BANDS makes the era the user sees on the dial, the
 * era in the prompt, and the colour field in eraField.ts structurally the same
 * thing. Adding a band to format.ts without adding it here degrades to FALLBACK
 * rather than silently contradicting itself.
 */
const ERA_ATMOSPHERES: Record<string, Omit<EraAtmosphere, 'era'>> = {
  triassic: {
    palette: 'rust reds, dry ochre, pale green scrub',
    lighting: 'hard high sun through thin dry air, hazy horizon',
    texture: 'cracked hardpan, scaled hide, horsetail and cycad',
  },
  jurassic: {
    palette: 'deep fern greens, humid blue-grey, wet bark',
    lighting: 'diffuse light under a towering conifer canopy, heavy humidity',
    texture: 'tree-fern fronds, mossed trunks, mud churned by enormous feet',
  },
  cretaceous: {
    palette: 'warm greens with the first flowering colour, volcanic dusk orange',
    lighting: 'low golden sun through steam and ash haze',
    texture: 'magnolia and fig leaves, feathered hide, braided river silt',
  },
  paleogene: {
    palette: 'lush emerald, swamp brown, thick pollen gold',
    lighting: 'greenhouse warmth, soft saturated light, permanent humidity',
    texture: 'palm and laurel forest, peat, small mammal fur',
  },
  neogene: {
    palette: 'dry savanna gold, acacia green, dust',
    lighting: 'wide open sun, long grassland shadows',
    texture: 'tall grass, cracked earth, coarse pelt',
  },
  pleistocene: {
    palette: 'glacial blue-white, tundra ochre, cold slate',
    lighting: 'flat low arctic sun, breath fogging in still air',
    texture: 'wind-packed snow, shaggy fur, scoured granite',
  },
  neolithic: {
    palette: 'wood smoke grey, wheat gold, river clay',
    lighting: 'open sky and hearth-fire glow at dusk',
    texture: 'thatch, knapped flint, hide tents, fresh-turned earth',
  },
  bronze: {
    palette: 'sun-bleached ochre, terracotta, and dust',
    lighting: 'harsh equatorial sun, deep cast shadows',
    texture: 'rough limestone, packed earth, woven flax',
  },
  classical: {
    palette: 'warm marble whites, Aegean blues, faded olive',
    lighting: 'Mediterranean golden hour, soft sea haze',
    texture: 'polished marble, hammered bronze, draped linen',
  },
  roman: {
    palette: 'imperial vermilion, travertine cream, ochre',
    lighting: 'colonnade light shafts through dust',
    texture: 'mosaic tessellation, painted plaster, wool toga',
  },
  dark: {
    palette: 'peat browns, moss greens, smoke gray',
    lighting: 'thick fog, smoldering torch, low slanting sun',
    texture: 'rough-hewn wood, oxidized iron, damp lichen-stone',
  },
  medieval: {
    palette: 'tapestry crimson, forest green, parchment',
    lighting: 'candle gloom and stained-glass shafts',
    texture: 'coarse wool, hammered iron, lichen-mossed stone',
  },
  renaissance: {
    palette: 'umber, ochre, Florentine gold',
    // Was 'oil-painting chiaroscuro, single source' — an instruction to a
    // photorealistic frame to produce an oil painting, reaching BOTH stages at
    // once (here via {light}, and via ERA ATMOSPHERE HINT in openrouter.ts).
    // Named as light rather than as a medium, and deliberately WITHOUT naming a
    // window or a room: this string also fires on Manhattan 1400, the open
    // Pacific and the Atacama, where an interior geometry would be absurd.
    lighting: 'strong directional daylight from one side, deep shadow where it does not reach',
    texture: 'velvet, polished walnut, frescoed plaster',
  },
  enlightenment: {
    palette: 'powder blue, ivory, dove gray',
    lighting: 'candelabra warmth and gray morning daylight',
    texture: 'silk damask, mahogany, gilded carving',
  },
  industrial: {
    palette: 'soot black, oxidized brass, factory red',
    lighting: 'gas-lamp glow piercing coal smog',
    texture: 'wrought iron, oiled wood, sooty brick',
  },
  'early-modern': {
    palette: 'sepia and faded olive',
    lighting: 'pre-electric daylight, slight haze',
    texture: 'wool suiting, plate glass, lacquered wood',
  },
  'late-20': {
    palette: 'Kodachrome saturation, neon signage tones',
    lighting: 'tungsten warm-glow and fluorescent buzz',
    texture: 'chrome, vinyl, poured concrete',
  },
  digital: {
    // 'HDR contrast' is a tonemapping artifact, not a colour. It produces the
    // processed-urbex look — flat, haloed, everything equally bright — which is
    // the opposite of a photograph and exactly what Pripyat-style frames come
    // back looking like.
    palette: 'cool LED whites, overcast grey-blue, sky-cyan',
    lighting: 'phone-screen reflections and overcast diffuse',
    texture: 'brushed aluminum, smartphone glass, synthetic textiles',
  },
  'near-future': {
    palette: 'matte navy with magenta and cyan neon accents',
    lighting: 'emissive surfaces, holographic signage, light rain sheen',
    texture: 'carbon weave, electrochromic glass, bioplastic',
  },
  advanced: {
    palette: 'iridescent silver, bioluminescent green, deep indigo',
    // 'volumetric' is a VFX term, not a light. Named as a real sky and a real
    // specular behaviour it stays exotic and starts casting believable shadows.
    lighting: 'soft overcast daylight through engineered haze, hard glints off polished surfaces',
    texture: 'self-healing alloy, woven nanotube, engineered flora',
  },
  'far-future': {
    palette: 'prismatic chromatics over deep black',
    // 'sourceless illumination' is the literal definition of an unlit CG render,
    // and it was being handed to the models as an instruction. Emissive surfaces
    // are just as strange and still obey physics, which is what makes them
    // photographable rather than concept art.
    lighting: 'light coming from the surfaces themselves, with a real shadow under every object',
    texture: 'crystalline computronium, programmable matter, structured light',
  },
};

const FALLBACK_ATMOSPHERE: Omit<EraAtmosphere, 'era'> = {
  palette: 'natural period-appropriate colour',
  lighting: 'natural ambient light',
  texture: 'period-appropriate materials',
};

export function getEraAtmosphere(year: number): EraAtmosphere {
  const band = getEraBand(year);
  // `era` comes from the band itself, so the name in the prompt is by
  // construction the name on the dial — they cannot drift apart again.
  return { era: band.label, ...(ERA_ATMOSPHERES[band.id] ?? FALLBACK_ATMOSPHERE) };
}

/**
 * Where this year sits inside its era, and how wide that era is.
 *
 * The Roman band alone spans a thousand years — 500 BC is early Republic, 100 AD
 * is the imperial peak, 400 AD is the Western collapse. Telling the planner
 * which end of the arc it is standing on is what turns "Roman Era" from a label
 * into a position, and it costs nothing: it is arithmetic over data the band
 * table already carries.
 */
export interface EraPhase {
  /** 0 at the start of the band, 1 at the end. */
  position: number;
  label: 'the opening of' | 'the early' | 'the height of' | 'the late' | 'the closing of';
  spanYears: number;
  startYear: number;
  endYear: number;
}

export function getEraPhase(year: number): EraPhase {
  const band = getEraBand(year);
  const spanYears = band.end - band.start;
  const position = spanYears > 0 ? Math.min(1, Math.max(0, (year - band.start) / spanYears)) : 0;
  const label: EraPhase['label'] =
    position < 0.15 ? 'the opening of'
    : position < 0.35 ? 'the early'
    : position < 0.65 ? 'the height of'
    : position < 0.85 ? 'the late'
    : 'the closing of';
  return { position, label, spanYears, startYear: band.start, endYear: band.end };
}

// ============================================================================
// NEGATIVES — DELETED. Remove getNegatives, TEXT_NEGATIVES and
// getAnachronismNegatives entirely (current promptcraft.ts lines 248-281).
//
// They were exported from here and called from NOWHERE in the repo — verified by
// grep across src/, only self-references. They are a stack of "no X" strings,
// the one construction promptTemplate.ts's binding research forbids outright:
// FLUX.2 does not support negation at all and reads the noun, so "no power
// lines" is a request for power lines. Dead code that looks ready to use is
// worse than dead code that does not — the next person chasing a stray
// anachronism would wire this back in and summon exactly what it names. The
// anachronism guard now lives in the positive {period} sentence and in the
// planner's periodMarkers.
// ============================================================================

export function getNegatives(
  year: number,
  options: { styleSuffix?: string | null } = {},
): string {
  // The 'dashcam' preset asks for "timestamp overlay in corner" while the base
  // negatives forbid text overlays and date stamps — the same prompt demanding
  // and banning the same thing. When a style explicitly wants on-frame text,
  // drop the text negatives and keep only the era's anachronism guards.
  const styleWantsText = /timestamp|overlay|signage|poster|subtitle/i.test(options.styleSuffix ?? '');
  if (styleWantsText) return getAnachronismNegatives(year);
  return `${TEXT_NEGATIVES}${getAnachronismNegatives(year) ? ', ' + getAnachronismNegatives(year) : ''}`;
}

/**
 * Text/lettering guards. Split out from the era guards so a style that
 * legitimately wants on-frame text can opt out of these alone.
 */
const TEXT_NEGATIVES =
  'no text overlays, no captions, no watermark, no logo, no date stamps, no rendered numerals, no invented or garbled lettering';

function getAnachronismNegatives(year: number): string {
  if (year < 0) return 'no modern artifacts, no metal alloys beyond bronze, no plastic, no power lines, no asphalt, no modern signage';
  if (year < 1400) return 'no modern artifacts, no electricity, no plastic, no asphalt, no power lines, no modern fonts';
  if (year < 1800) return 'no electric lighting, no plastic, no modern vehicles, no power lines, no modern fonts';
  if (year < 1900) return 'no smartphones, no flat screens, no LEDs, no modern cars, no modern signage';
  if (year < 1950) return 'no smartphones, no flat-panel displays, no LED lighting, no modern UI';
  if (year < 2000) return 'no anachronistic technology, no future tech';
  return '';
}

// ============================================================================
// CAMERA + QUALITY TAGS
// ============================================================================

// ============================================================================
// HABITATION -> what the IMAGE prompt actually says
// ============================================================================

/**
 * Positive-only phrasing of each level.
 *
 * FLUX.2 supports no negative prompt and naming a thing can summon it, so the
 * `uninhabited` and `traces-only` sentences contain no person, people, human,
 * figure, building or empty. `sparse` and `dense` name people DELIBERATELY —
 * that is the invariant, not "no sentence names anyone".
 *
 * Emptiness is stated as what IS there. Note what is absent by design: no
 * "unbroken horizon". That phrase does the anti-architecture work "no buildings"
 * would have done, but it is also a geometric assertion, and it is FALSE inside
 * rainforest, gorge, canyon and closed canopy — it would render the Amazon as
 * open plain, a wrong biome produced by the sentence added to fix habitation.
 *
 * The `dense` sentence is the most forceful of the five on purpose. A rule
 * written to empty Antarctica will drain Rome unless the crowded end of the
 * scale pushes back at least as hard as the empty end.
 */
const HABITATION_CLAUSE: Record<HabitationLevel, string> = {
  uninhabited:
    'Wilderness fills the frame. Every surface in view was shaped by weather, water, ice, rock and wild living things alone, and the ground carries only animal tracks and the marks of the wind.',
  'traces-only':
    'The place has the frame to itself, and the few made things standing in it are weathered, drifted over and half reclaimed by whatever grows and blows here.',
  sparse:
    'A few small figures are scattered far apart across the view, each absorbed in one task, dwarfed by the land, which keeps most of the picture.',
  settled:
    'This is a lived-in working place: dwellings in use, work under way in the open, and people going about ordinary business through the near and middle distance.',
  dense:
    'The frame is crowded. People fill it at every distance, the near ones large and sharp, others overlapping behind them into the far background, all busy at once, and the built surroundings run continuously to the edges.',
};

/**
 * Background-only variants for the chrono-selfie portrait, where a person is in
 * frame by construction and the level describes the world behind them. The full
 * `uninhabited` clause would fight the portrait it is attached to.
 */
const HABITATION_BACKDROP: Record<HabitationLevel, string> = {
  uninhabited: 'Behind them the wilderness runs on, marked only by weather and wild animals.',
  'traces-only': 'Behind them stand weathered made things that the growing world is taking back.',
  sparse: 'Behind them the land opens out wide, with one or two distant figures at their own work.',
  settled: 'Behind them a working settlement goes about its ordinary business.',
  dense: 'Behind them a crowd carries on at every distance, thick and busy to the edges of the frame.',
};

/** Empty string when the level is unknown — see buildFallbackDirection. */
export function getHabitationClause(
  habitation: HabitationLevel | undefined,
  opts: { isPortrait?: boolean } = {},
): string {
  if (!habitation) return '';
  return opts.isPortrait ? HABITATION_BACKDROP[habitation] : HABITATION_CLAUSE[habitation];
}

// ============================================================================
// THE RIG (body, glass, stock, aperture) and THE VIEWPOINT (where you stand)
// ============================================================================

/**
 * The old default was '35mm wide-angle, shallow depth of field, anamorphic
 * flare' and every clause of it fought realism. Anamorphic flare is a
 * cinema-lens artifact and pulls the frame onto the film-still manifold.
 * Shallow depth of field on an environmental wide is the phone-portrait-mode
 * look and is the loudest CGI tell in forest, rock and ocean frames. And a bare
 * focal length names no body, no glass and no stock — the three things
 * promptTemplate.ts's binding research says to name, because "Kodak Portra 400"
 * carries fine grain and forgiving highlights in the caption data while
 * "photorealistic, 8K" carries render aesthetics.
 *
 * DEPTH OF FIELD IS STATED HERE AND NOWHERE ELSE. It used to be implied in two
 * places that disagreed, and the planner is now explicitly forbidden to name an
 * aperture, so the aperture has to live somewhere that always fires.
 *
 * TWO STOCKS, chosen by the same `wild` flag everything else uses. Portra is
 * justified by skin rendition and its caption corpus is overwhelmingly people —
 * a mild people-ward pull applied to precisely the frames that must be empty.
 * Ektar is the landscape-weighted sibling. One boolean, no new JSON field.
 */
const WIDE_RIG_PEOPLED = 'a Leica M6 with a 35mm Summicron at f/8, on Kodak Portra 400 film';
const WIDE_RIG_WILD = 'a Leica M6 with a 35mm Summicron at f/8, on Kodak Ektar 100 film';
const PORTRAIT_RIG = 'a Leica M6 with a 50mm Summilux wide open at f/1.4, on Kodak Portra 400 film';

/**
 * THE FIRST LINE OF EVERY PROMPT USED TO NAME A CAMERA THAT DID NOT EXIST.
 *
 * "Shot on a Leica M6 ... on Kodak Portra 400 film" was emitted for 40,000 BC as
 * readily as for 1987 — a 1954 body and a stock introduced in 1998 — four lines
 * above the sentence that says "nothing from a later age has arrived yet". The
 * prompt contradicted itself, in the position FLUX.2's own guide (quoted in this
 * file's header) says is weighted most.
 *
 * The look is still wanted; the hardware claim is what has to go when the year
 * cannot support it. Before photography the frame is asked to LOOK like a
 * photograph without being told it was taken on anything.
 *
 * 1839 is the daguerreotype, and the earliest date at which naming a camera is
 * not an anachronism. Colour film is later still, but a stock name at 1900 is a
 * far smaller lie than one at 40,000 BC, and the single threshold is the part
 * worth being sure of.
 */
const PHOTOGRAPHY_BEGINS = 1839;

/** Fills {capture}'s hardware half, or nothing when the year cannot carry it. */
function rigForYear(year: number, rig: string): string | null {
  return year >= PHOTOGRAPHY_BEGINS ? rig : null;
}

/**
 * THE PROCESS THAT ACTUALLY EXISTED, for the Period Process style.
 *
 * A far stronger era signal than any palette word, because it changes how the
 * image is FORMED rather than what colours are in it: a wet-collodion plate is
 * blind to red, so the sky blows to white and lips go dark, and no amount of
 * "colours run to sepia" produces that.
 *
 * Deliberately opt-in. Applied always it would wreck the sweep — the whole point
 * of a core sample is one camera that never moved, and stepping from an
 * orthochromatic plate to Kodachrome to digital puts a rendering discontinuity
 * at every join. Off by default, the sweep keeps its continuity.
 *
 * Descending, matched on the first `from` at or below the year. Below 1839 there
 * is no entry and none is wanted: photography does not exist, so the style has
 * nothing to say and the frame falls back to looking like a photograph without
 * being told what took it.
 */
const PERIOD_PROCESSES: { from: number; capture: string }[] = [
  { from: 2005, capture: 'a digital sensor — clean, sharp corner to corner, no grain at all, colour neutral and even' },
  { from: 1970, capture: 'colour negative film — fine grain, soft highlight roll-off, faithful but warm colour' },
  { from: 1935, capture: 'early colour transparency film — dense saturated colour, deep shadows, reds and blues strongest' },
  { from: 1900, capture: 'orthochromatic roll film — insensitive to red, so skies blow out to bare white and lips and skin go dark, edges soft, grain visible' },
  { from: 1880, capture: 'a gelatin dry plate — exposures now short enough for people to hold still, greys long and delicate, corners falling off into softness' },
  { from: 1855, capture: 'a wet collodion glass plate — blind to red, skies bare white, dark lips and skin, the plate edges and pour marks visible, fine detail at the centre' },
  { from: PHOTOGRAPHY_BEGINS, capture: 'a daguerreotype — a mirror-bright silvered plate, no true blacks, tones sliding between positive and negative with the angle, exquisite fine detail' },
];

/**
 * Before this, exposures ran to seconds or minutes, so ANYTHING THAT MOVED
 * simply is not on the plate.
 *
 * This is the one place the style has to override a field rather than add to
 * the prompt: the planner may have said `dense`, and the prompt would then
 * insist people fill the frame at every distance, which in 1850 cannot be true
 * of a photograph. The historically correct picture — an avenue empty but for
 * the one person who happened to stand still — is also the more striking one.
 */
const EXPOSURES_SHORTEN = 1880;

function periodProcessFor(year: number): string | null {
  return PERIOD_PROCESSES.find((p) => year >= p.from)?.capture ?? null;
}

/** Fills {camera} — the planner now owns viewpoint, not glass and not aperture. */
const DEFAULT_VIEWPOINT = 'eye level, a short walk back from the subject';
const PORTRAIT_VIEWPOINT = 'eye level, about two metres away';

/**
 * Does this style still describe a PHOTOGRAPH?
 *
 * `styled` was quietly doing two jobs — "authors its own colour" and "is not a
 * photograph". Four shipped presets are photographic PROCESSES (infrared is
 * Aerochrome film, tilt-shift is a lens movement, dashcam is found footage, noir
 * is black-and-white film) and all four were handed "Composed with ...",
 * throwing away the capture register the style is asking for.
 *
 * The FLAG on StylePreset is authoritative; the regex is only for the custom
 * free-text slot, and the photographic-process list is tested FIRST. A regex
 * alone misclassified the flagship case: the infrared suffix contains "foliage
 * RENDERED in vivid magenta", and a bare `render` substring in a
 * drawn-media-first guard resolved it to drawn.
 */
export function styleIsPhotographic(
  suffix: string | null | undefined,
  flag?: boolean,
): boolean {
  if (!suffix) return false;
  if (flag !== undefined) return flag;
  return /photograph|photo|film stock|footage|camera|lens|exposure|polaroid|kodachrome|ektachrome|daguerreotype|tintype|autochrome|infrared|aerochrome|tilt-shift|dashcam|super ?8|grain/i.test(
    suffix,
  );
}

// QUALITY_TAGS removed. Black Forest Labs' FLUX.2 guide calls quality tags
// "unnecessary legacy behavior from older models" — the model already biases to
// quality — and the same stack contradicted every painterly and animated style
// preset by demanding photorealism alongside them.

// ============================================================================
// TRAVELER LOOK (chrono-selfie default — overridden by SceneDirection when LLM gives a richer one)
// ============================================================================

export function getDefaultTravelerLook(year: number): string {
  if (year < -2000) return 'time traveler in period-accurate Bronze Age tunic, sun-darkened skin, leather sandals, weathered satchel';
  if (year < -500)  return 'time traveler in classical Greek chiton with bronze fibula, leather sandals, scroll case at belt';
  if (year < 500)   return 'time traveler in Roman tunic with woolen cloak, leather caligae, plain dignified pose';
  if (year < 1000)  return 'time traveler in dark-ages tunic and woolen mantle, hood up, calm watchful expression';
  if (year < 1400)  return 'time traveler in medieval traveler\'s cloak over rough linen tunic, leather belt with a pouch';
  if (year < 1600)  return 'time traveler in Renaissance scholar\'s robe, soft cap, neutral expression';
  if (year < 1800)  return 'time traveler in modest 18th-century coat, cravat, period riding boots';
  if (year < 1900)  return 'time traveler in Victorian-era waistcoat and overcoat, pocket watch chain visible';
  if (year < 1950)  return 'time traveler in 1920s wool suit and trilby hat, briefcase in hand';
  if (year < 2000)  return 'time traveler in 1980s denim jacket and faded jeans, casual stance';
  if (year < 2030)  return 'time traveler in contemporary technical jacket, neutral tones, observant';
  if (year < 2100)  return 'time traveler in near-future utility coat with subtle electroluminescent piping, urban explorer vibe';
  if (year < 2500)  return 'time traveler in advanced-future garment of smart fabric with shifting iridescent patterns, calm presence';
  return 'time traveler wearing programmable-matter robes that shimmer prismatic, otherworldly composure';
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function capitalise(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

interface BuildPromptOpts {
  /** The user's chosen time of day, as a sentence about the light present. */
  phase?: string;
  location: string;
  coordinates: Coordinates;
  year: number;
  styleSuffix?: string | null;
  /**
   * Whether the active style still describes a photograph. Authoritative when
   * present; `styleIsPhotographic` falls back to sniffing the suffix text only
   * for the custom free-text slot, and that fallback is what misread infrared's
   * own "foliage RENDERED in vivid magenta" as a 3D render.
   */
  stylePhotographic?: boolean;
  /**
   * A photograph supplied by the visitor is attached to this request.
   *
   * It authors its own colour and light, exactly as a style does, so the era
   * tables step aside for the same reason: the photograph shows this place at
   * this hour in this year, and telling the model on top of that which colours
   * the century runs to is a second opinion about something already settled.
   *
   * Only the reference path sets this. A chained sweep frame does NOT — its
   * attachment is a picture we generated, not evidence, and the era tables are
   * what keep neighbouring centuries from looking alike.
   */
  photographAnchored?: boolean;
  /**
   * The Period Process style is active — render as the process that existed in
   * this year. See PERIOD_PROCESSES.
   */
  periodProcess?: boolean;
  aspect?: string;
  /** User-editable meta-prompt. Falls back to DEFAULT_IMAGE_TEMPLATE. */
  template?: string;
}

interface BuildPanelPromptArgs extends BuildPromptOpts {
  subject: string;
  isPortrait?: boolean;
  panelHint?: 'left' | 'center' | 'right';
}

function buildPanelPrompt(args: BuildPanelPromptArgs, direction: SceneDirection): string {
  const era = getEraDescription(args.year);
  const atm = getEraAtmosphere(args.year);
  const formattedYear = formatYear(args.year);
  /**
   * THE GATE. Everything keyed to "is anyone here" reads this one flag: the
   * era's material wash, the era's palette and lighting, the anachronism
   * sentence, and the film stock. Undefined means "no claim" and falls to the
   * peopled branch — i.e. exactly today's behaviour, so no path regresses.
   */
  const wild = direction.habitation === 'uninhabited' || direction.habitation === 'traces-only';
  const camera = args.isPortrait
    ? PORTRAIT_VIEWPOINT
    : (direction.cameraNotes || DEFAULT_VIEWPOINT);
  const rig = args.isPortrait ? PORTRAIT_RIG : wild ? WIDE_RIG_WILD : WIDE_RIG_PEOPLED;
  const periodProcess = args.periodProcess ? periodProcessFor(args.year) : null;
  // The style's process outranks the house rig — that is what choosing it means.
  const datedRig = periodProcess ?? rigForYear(args.year, rig);
  const sideHint =
    args.panelHint === 'left'  ? 'left edge of a wider panorama, scene extends offscreen right' :
    args.panelHint === 'right' ? 'right edge of a wider panorama, scene extends offscreen left' :
    /**
     * Was 'focal center of the scene, balanced composition'. Two problems: it is
     * exactly the legacy quality-tag idiom this file argues against everywhere
     * else, and it directly contradicts the capture block's "framing sits a
     * little loose and slightly off centre, nothing arranged" — which now runs
     * FIRST and therefore wins. Every A/B frame carried both instructions at
     * once; the control's own Uruk frame answered by arranging a tidy still-life
     * of bowls in the foreground.
     */
    args.panelHint === 'center' ? 'the centre of the scene' :
    '';
  // Style suffix is woven as a natural style phrase — no "STYLE OVERRIDE:" tag.
  const styleClause = args.styleSuffix ? args.styleSuffix : '';

  // A style override dictates its own palette and lighting, so emitting the era's
  // as well asks for two looks at once — "soot black, gas-lamp glow" alongside
  // "pastel pink and cyan, retro synthwave". Under a style, the era keeps what it
  // is FOR (period, materials, subject matter) and yields colour and light.
  const styled = Boolean(args.styleSuffix);
  const photographic = !styled || styleIsPhotographic(args.styleSuffix, args.stylePhotographic);

  // "landscape" is ambiguous to a language-model text encoder: an orientation
  // here, but a GENRE in every photography caption it trained on, competing with
  // the subject whenever the subject is a person or a building. Say the shape,
  // and say which medium — this is the LAST line of every portal prompt, so
  // calling an oil painting a photograph here is the loudest contradiction
  // available.
  const aspectClause = args.aspect
    ? `A single wide ${args.aspect} ${photographic ? 'photograph' : 'image'}, filling the frame edge to edge.`
    : '';

  // Placed immediately after the subject. Position matters: FLUX.2's own guide
  // says the model weights what comes first, and the datable specifics need to
  // outrank the era wash that made every century in a band look the same.
  const periodClause = direction.periodMarkers ? `${direction.periodMarkers}.` : '';

  // Who is in the frame. Second position, directly behind the subject.
  const stillsOnly =
    Boolean(args.periodProcess) &&
    args.year >= PHOTOGRAPHY_BEGINS &&
    args.year < EXPOSURES_SHORTEN;

  const habitationClause = stillsOnly
    ? `The exposure runs for minutes, so nothing that moved is on the plate: the street reads as empty of traffic and of crowds, and only what held still is here — a figure resting against a wall, a horse at a post, the buildings themselves, sharp and unpeopled.`
    : getHabitationClause(direction.habitation, {
        isPortrait: args.isPortrait,
      });

  /**
   * THE ANACHRONISM GUARD, branched on presence rather than asserted everywhere.
   *
   * The peopled wording is the old sentence VERBATIM — promptTemplate.ts calls it
   * "the only thing keeping a 500 BC frame free of imperial marble" and it stays
   * exactly as it was where it was right. Its "nothing from a later age" clause is
   * a negation, but it contains no summonable noun and the file's own research
   * defends it, so it keeps the branch where it earned its place.
   *
   * What was wrong was firing it EVERYWHERE: on an ice sheet and an open ocean it
   * demanded clothing and construction, and it flatly cancelled traces-only by
   * telling Pripyat's blocks their construction was that of the Early Digital Age
   * with nothing later arrived. Fixing the text stage while leaving this — the
   * stronger copy, because it reaches FLUX directly — would have been a half fix.
   * The two wild variants name no human noun at all.
   */
  const periodSentence =
    direction.habitation === 'uninhabited'
      ? `The ground, the water, the ice, the weather and every living thing in frame are exactly as they were here in ${formattedYear}.`
      : direction.habitation === 'traces-only'
        ? `Whatever stands here was built before ${formattedYear} and has been weathering ever since; the ground, the water and the growth around it are as they were here in ${formattedYear}.`
        /**
         * THE YEAR LEADS, AND THE BAND IS A HINT.
         *
         * This read "the materials, clothing, tools and construction are those
         * of ${era} in ${formattedYear}" — naming the BAND first, and bands are
         * wide. `early-modern` runs 1900-1950, so a frame set in 1900 was told
         * its construction was that of an era whose most iconic content is the
         * 1940s, and duly came back with War Bonds posters and steel helmets.
         * The band cannot separate years inside itself; that is the whole reason
         * periodMarkers exists. So the year is the claim and the band is context
         * for it, in that order.
         */
        : `Everything visible belongs to ${formattedYear} EXACTLY — not to the decades either side of it, and not to the ${era} in general. The materials, clothing, tools and construction are those of that single year, and nothing from a later age has arrived yet.`;

  /**
   * THE ERA WASH YIELDS ON WILD FRAMES.
   *
   * ERA_ATMOSPHERES is keyed by era band ALONE and from `neolithic` upward its
   * rows describe European material culture. Asserted here as unhedged fact on
   * 100% of frames, styled or not, what actually reached the image model was:
   *   interior Antarctica 1200   -> "candle gloom and stained-glass shafts ...
   *                                 coarse wool, hammered iron, lichen-mossed stone"
   *   Everest summit 1800        -> "gas-lamp glow piercing coal smog ... sooty brick"
   *   mid-Pacific / Atacama 1500 -> "velvet, polished walnut, frescoed plaster"
   *   Pripyat 2020               -> "phone-screen reflections ... smartphone glass",
   *                                 in a town with no electricity since 1986
   * No era band can know a latitude, and keying the table by latitude too means
   * 21 bands x every biome on Earth, hand-maintained, wrong by construction and
   * moving underneath itself as the climate changes.
   *
   * So the table is GATED, not deleted, and gated on PRESENCE rather than on
   * `biome` being non-empty: Rome keeps its full wash, including the palette and
   * lighting that verifiably reach the pixels and are the reason 1500 BC does not
   * look like 2700 AD. A conditional in PROSE ("anything built here is worked in
   * the way of the Medieval Period: coarse wool, hammered iron") would not work —
   * a diffusion text encoder can no more evaluate a conditional than a negation,
   * and the summoning nouns would still be in the prompt. Gating in CODE means
   * the nouns are never written.
   */
  /**
   * THE HOUR OWNS THE LIGHT.
   *
   * When the user has set a time of day, the era's `lighting` yields to it — the
   * same trade the era already makes to a style, and for the same reason. The
   * table is keyed on era alone, so it happily supplies "colonnade light shafts
   * through dust" for a scene the user has explicitly placed at midnight, and a
   * prompt that asks for two different light sources gets a frame lit two
   * different ways. The era keeps what it is FOR — palette, materials, period —
   * and gives up only the direction and quality of the light.
   *
   * The hour goes FIRST in this sentence, ahead of the era's palette, because
   * order is weight for the text encoder and the hour is the fact the user chose.
   */
  /**
   * {biome} IS ITS OWN SLOT NOW. It used to be the first sentence of {light},
   * which meant a template that dropped {light} silently dropped the entire
   * biome — the A/B's "terse" variant lost the green Sahara's lake, elephants
   * and aurochs and rendered a red-rock wadi, and that was read as evidence
   * about prompt LENGTH when it was really evidence about a bundled slot. Five
   * concerns in one placeholder is also why the era palette kept getting lost.
   */
  const biomeSentence = direction.biome
    ? `The ground and everything living on it: ${direction.biome}.`
    : '';

  // A supplied photograph yields the era's colour and texture for the same
  // reason a style does — see photographAnchored. Both keep the era's SUBSTANCE:
  // the period, the materials, what is standing here.
  const authored = styled || Boolean(args.photographAnchored);
  const lightSentence = [
    args.phase ? `${capitalise(args.phase)}.` : '',
    wild || authored
      ? `The air is ${direction.atmosphere}.`
      : args.phase
        ? `The air is ${direction.atmosphere}. Colours run to ${atm.palette}.`
        : `The air is ${direction.atmosphere}, lit by ${atm.lighting}. Colours run to ${atm.palette}.`,
    wild || authored ? '' : `Surfaces are ${atm.texture}.`,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Templates are user-editable and stored in localStorage. One saved before
   * {habitation} and {period} existed would silently drop both — and silently
   * dropping them IS the bug. LEGACY_IMAGE_TEMPLATES plus the migration in
   * Portal.tsx covers the un-edited majority; for a genuinely hand-edited
   * template the clauses are appended to the FILLED prompt instead.
   *
   * They used to ride inside {subject}, which produced malformed text every
   * time: the default sentence is "{subject}, at {location} in {year}.", so a
   * clause appended to the subject landed between the noun phrase and its own
   * location clause. The A/B harness caught the real output — "...nothing from a
   * later age has arrived yet., at Tassili n'Ajjer, Algeria in 6,000 BC" and
   * "the centre of the scene A few small figures are scattered..." with no
   * sentence break at all. Appending after the fill keeps the guarantee (the
   * clauses are never silently dropped) without splicing a sentence into the
   * middle of another one.
   */
  const activeTemplate = args.template ?? DEFAULT_IMAGE_TEMPLATE;
  const carriesHabitation = activeTemplate.includes('{habitation}');
  const carriesPeriod = activeTemplate.includes('{period}');
  const subjectPhrase = [args.subject, sideHint].filter(Boolean).join(', ');
  const orphaned = [
    carriesHabitation ? '' : habitationClause,
    carriesPeriod ? '' : periodSentence,
  ].filter(Boolean);

  const fields: PromptFields = {
    subject: subjectPhrase,
    habitation: carriesHabitation ? habitationClause : '',
    period: carriesPeriod ? periodSentence : '',
    periodMarkers: periodClause,
    biome: biomeSentence,
    location: args.location,
    year: formattedYear,
    era,
    atmosphere: direction.atmosphere,
    lighting: atm.lighting,
    palette: atm.palette,
    texture: atm.texture,
    camera,
    // Under a style, the era yields colour and light to it — emitting both asks
    // for "soot black, gas-lamp glow" and "pastel pink synthwave" at once. The
    // whole clause drops rather than being filled with apologetic filler.
    light: lightSentence,
    /**
     * "sharp and cleanly exposed" asked for the opposite of a photograph:
     * uniform micro-contrast with nothing clipping and nothing falling off IS
     * the render look, and on the bright cases — snow, open ocean, desert
     * hardpan — it blows the frame to featureless white. What a real photograph
     * has instead is grain, highlight rolloff and imperfect framing, all named
     * as things that ARE present.
     *
     * No human agent in this sentence. "the framing of someone who had a second
     * to raise the camera" names a person and a camera-in-hand in every frame,
     * including the four that must contain nobody — by the same
     * naming-summons-it rule this whole fix is built on.
     *
     * A photographic STYLE keeps the rig, because noir, dashcam, tilt-shift and
     * infrared name no stock of their own. Only a drawn style yields the camera,
     * and it yields it grammatically: "Composed with eye level, a short walk
     * back from the subject" is broken English handed to a text encoder that
     * parses it as language.
     */
    capture: photographic
      ? datedRig
        ? `Shot on ${datedRig} — ${camera}. It carries the evidence of film: grain sitting in the shadows, the brightest highlights rolling off softly rather than clipping flat, and framing that sits a little loose and slightly off centre, nothing arranged.`
        : `${capitalise(camera)}. It carries the evidence of film: grain sitting in the shadows, the brightest highlights rolling off softly rather than clipping flat, and framing that sits a little loose and slightly off centre, nothing arranged.`
      : `Seen from ${camera}.`,
    /**
     * The two halves of {capture}, exposed separately.
     *
     * {capture} welds the hardware nouns to the viewpoint, the light direction
     * and the framing cue, which made the A/B's "does naming a Leica actually
     * help" question untestable — deleting the block deleted all four at once,
     * and every loss traced to the last three. Splitting them costs nothing (the
     * default template still uses {capture}) and makes the hardware claim
     * answerable instead of folklore.
     */
    viewpoint: camera,
    filmLook: photographic
      ? 'It carries the evidence of film: grain sitting in the shadows, the brightest highlights rolling off softly rather than clipping flat, and framing that sits a little loose and slightly off centre, nothing arranged.'
      : '',
    style: styleClause ? `${styleClause}\n\n` : '',
    aspect: aspectClause,
  };

  // The template was already resolved above to test for its tokens; resolving it
  // twice would let the two copies drift.
  const filled = fillTemplate(activeTemplate, fields);
  // Trailing, and as their own sentences. A hand-edited template that omits
  // these still gets them; it just gets them as grammar rather than as debris.
  return orphaned.length ? `${filled}\n\n${orphaned.join(' ')}` : filled;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface BuildPanelsOpts {
  /** The user's chosen time of day, as a sentence about the light present. */
  phase?: string;
  location: string;
  coordinates: Coordinates;
  year: number;
  mode: ViewMode;
  styleSuffix?: string | null;
  /**
   * Framing hint, e.g. '16:9'. OpenRouter's chat-completions image path has no
   * portable aspect-ratio parameter, and left alone the providers disagree
   * wildly: probed 2026-07-30, FLUX 2 returns 1:1, Grok Imagine returns
   * portrait, Nano Banana Pro returns ultra-wide. A full-bleed consumer crops
   * square and portrait frames badly, so the aspect has to be asked for in
   * words. Omitted by default so the v1 three-panel layout is unaffected.
   */
  aspect?: string;
  /** User-editable meta-prompt. Falls back to DEFAULT_IMAGE_TEMPLATE. */
  template?: string;
  /** Set only by the reference path — see BuildPromptOpts.photographAnchored. */
  photographAnchored?: boolean;
  /** See BuildPromptOpts.periodProcess. */
  periodProcess?: boolean;
  /**
   * THE STANDPOINT — one paragraph, written once per sweep, identical in every
   * frame of it. See planStandpoint().
   *
   * This is what makes a sweep one camera. It used to be the seed photograph,
   * re-attached to every frame; that carried the viewpoint and everything else
   * in the picture with it — the same bird in the same place across 109 years.
   * Geometry describes well, so it moves to words. Words cannot carry a bird.
   *
   * Only ever set on the sweep path, and only when the standpoint call
   * succeeded — a sweep without one behaves as it did before, minus the drift
   * protection.
   */
  standpoint?: string;
}

export function buildImagePromptsFromDirection(
  opts: BuildPanelsOpts,
  direction: SceneDirection,
): string[] {
  if (opts.mode === 'chrono-selfie') {
    const travelerLook = direction.travelerLook && direction.travelerLook.length > 8
      ? direction.travelerLook
      : getDefaultTravelerLook(opts.year);
    return [
      buildPanelPrompt({ ...opts, subject: direction.leftSubject,  panelHint: 'left'  }, direction),
      buildPanelPrompt({ ...opts, subject: `portrait of a ${travelerLook}, standing at ${opts.location}`, isPortrait: true, panelHint: 'center' }, direction),
      buildPanelPrompt({ ...opts, subject: direction.rightSubject, panelHint: 'right' }, direction),
    ];
  }
  return [
    buildPanelPrompt({ ...opts, subject: direction.leftSubject,   panelHint: 'left'   }, direction),
    buildPanelPrompt({ ...opts, subject: direction.centerSubject, panelHint: 'center' }, direction),
    buildPanelPrompt({ ...opts, subject: direction.rightSubject,  panelHint: 'right'  }, direction),
  ];
}

/**
 * Prompts for one frame of a core sample — the same spot, rendered again at a
 * different station.
 *
 * Returns the same candidate list shape the hero path uses: focal subject first,
 * peripherals behind it as moderation fallbacks, so one blocked subject degrades
 * to a different subject in the same moment instead of punching a hole in the
 * middle of a sweep the user has already paid for.
 *
 * When `chained` is set, the caller is also sending the previous frame as an
 * input image, and the prompt has to say what to do with it. The instruction is
 * deliberately about the CAMERA and the LAND rather than about the picture:
 * "keep this composition" reads to an image model as "change as little as
 * possible", which on a jump from the Pleistocene to a car park is the one
 * outcome that makes the sweep pointless. What must persist is the vantage; what
 * must change is everything standing in it.
 */
/**
 * What the attached image IS, which decides everything the prompt says about it.
 *
 *   'none'        no attachment
 *   'chained'     the previous frame of this same sweep, a neighbouring year.
 *                 Close in time, generated by us, and known only to share a
 *                 camera position — so the clause preserves the vantage and
 *                 invites the period to change.
 *   'photograph'  a photograph the visitor supplied, of this place AT THIS YEAR.
 *                 They own that claim. It is not a hint about framing, it is the
 *                 scene — so the clause asks for fidelity, not for change.
 *
 * These cannot share wording. The chained clause tells the model that whatever
 * is built here "may and should change completely", which is right for a jump
 * between eras and exactly wrong for a photograph that already shows the year.
 */
export type ReferenceKind = 'none' | 'chained' | 'photograph';

export function buildCoreSamplePrompts(
  opts: BuildPanelsOpts,
  direction: SceneDirection,
  kind: ReferenceKind,
  /**
   * The years the attached frames were taken, in the order they are attached.
   * Only meaningful for 'chained' — a supplied photograph IS this year, which is
   * the whole difference between the two clauses.
   */
  referenceYears?: number[],
): string[] {
  const base = buildImagePromptsFromDirection(
    kind === 'photograph' ? { ...opts, photographAnchored: true } : opts,
    direction,
  );
  // Centre first — it is the focal subject, and this is a single-frame path.
  const ordered = [base[1] ?? base[0]!, base[0]!, base[2]!].filter(Boolean);

  /**
   * THE STANDPOINT LEADS, AND IT LEADS ON EVERY FRAME — anchored or not.
   *
   * The unanchored frames are the ones that need it most: they are the years
   * where nothing built survives to be photographed, so this paragraph is the
   * only thing holding them to the same camera as the rest of the sweep. Gating
   * it behind an attachment would have put the continuity mechanism on exactly
   * the frames that already had one.
   */
  const withStandpoint = (p: string): string =>
    opts.standpoint?.trim()
      ? `Every photograph in this series is made from one fixed spot, framed the same way. ` +
        `THE STANDPOINT: ${opts.standpoint.trim()}\n\n${p}`
      : p;

  if (kind === 'none') return ordered.map(withStandpoint);

  if (kind === 'photograph') {
    /**
     * FIRST, not appended.
     *
     * promptcraft's own guidance — from FLUX.2's guide — is to put the most
     * important thing first, which is why periodMarkers was moved up. The
     * anchor was nonetheless being appended after eight blocks of scene
     * description, so the one instruction governing what the picture IS sat in
     * the weakest position in the prompt.
     *
     * Says nothing about preserving "the skyline behind" or about the period
     * being free to change. Both belong to the chained case. Here the
     * photograph is the year, and the only licence taken is the frame shape:
     * the portal is full-bleed 16:9 and everything downstream — the panorama,
     * the film's clips — assumes it, so recomposing is stated openly instead of
     * being contradicted by a claim of an identical lens.
     */
    const clause =
      `The attached photograph shows this exact place at this exact time. It is the ` +
      `subject: reproduce what it shows — the same street or ground, the same buildings ` +
      `and structures, the same vantage and direction of view, the same light and season, ` +
      `the same period in every visible detail. Do not relocate it, do not modernise it, ` +
      `do not age it, and do not substitute a more famous view of the same district. ` +
      `Where the photograph is unclear or cut off, extend it plausibly rather than ` +
      `inventing something else. Recompose to a wide 16:9 frame from that same standpoint.`;
    return ordered.map((p) => withStandpoint(`${clause}\n\n${p}`));
  }

  /**
   * WHAT SURVIVES IS NOT A PROPERTY OF BEING A LANDFORM.
   *
   * This clause used to protect "the landforms that outlive centuries ... the
   * line of the hills, the run of the coast or river, the shape of the skyline
   * behind", and then license everything else: "whatever is built here ... may
   * and should change completely."
   *
   * In a city the skyline IS what is built, so the two halves contradicted each
   * other — and the second half won. Seeded on the White House in 2019 and asked
   * for 1900, the model removed the building, which had stood there since 1800.
   * It was doing what it was told.
   *
   * The rule is not landform versus structure. It is WHETHER THE THING EXISTED
   * IN THE TARGET YEAR, which is a question about history and therefore the
   * planner's to answer — see `standing` in SceneDirection. This clause now
   * defers to that answer instead of guessing from the category of the object.
   */
  /**
   * The planner's per-object verdict, appended to the anchor clause.
   *
   * The clause states the RULE — what stood here still stands. This states the
   * ANSWER for this particular frame, which only something that could see the
   * photograph and knew the date could produce. Rule without answer is what
   * removed the White House; answer without rule would leave the image model
   * free to treat it as description rather than instruction.
   */
  const standing = direction.standing?.trim()
    ? ` What is here in this year, specifically: ${direction.standing.trim()}`
    : '';

  /**
   * WHEN THE ATTACHMENT WAS TAKEN — stated, because the clause below hands the
   * model a picture and tells it to keep things from it.
   *
   * Without a date the attached frame reads as ground truth about the scene
   * entire, period included, and there is nothing in the prompt to say
   * otherwise. Named plainly rather than hinted at: this is the same thing the
   * planner is already told ("taken in <year>"), and that path reasons correctly
   * about it. Two attachments of different years both get named — a sweep sends
   * the neighbour AND the seed, and calling either one "the attached image" in
   * the singular was already loose.
   */
  const years = (referenceYears ?? []).filter((y) => Number.isFinite(y));
  const dated =
    years.length === 0
      ? `The attached image is the same place photographed from the same spot, in a different year from this one. `
      : years.length === 1
        ? `The attached image is the same place photographed from the same spot, in ${formatYear(years[0]!)}. `
        : `The attached images are the same place photographed from the same spot, in ${years
            .map((y) => formatYear(y))
            .join(' and ')}. `;

  /**
   * WHICH WAY THIS FRAME IS LOOKING, said before the rule that depends on it.
   *
   * A sweep runs outward from the seed in both directions and the clause was
   * written as if it only ran one way — it names both the not-yet-built case and
   * the already-gone case, but leaves the model to work out which one the
   * attachments call for. That is the entire question when the attachment shows
   * a thing the target year predates, and it is answerable from the dates alone.
   */
  const earlierThanAll = years.length > 0 && years.every((y) => opts.year < y);
  const laterThanAll = years.length > 0 && years.every((y) => opts.year > y);
  const travel = earlierThanAll
    ? `This year comes BEFORE the year they were taken, so some of what they show had not been made yet. `
    : laterThanAll
      ? `This year comes AFTER the year they were taken, so some of what they show had not arrived yet, and some of it stands here changed or worn. `
      : '';

  const anchor =
    dated +
    `They are evidence about WHERE — where the camera stood, what occupies the ground — and ` +
    `the year they were taken is not this year. ` +
    travel +
    /**
     * NO LONGER ASKS FOR AN IDENTICAL FRAME.
     *
     * This used to read "identical viewpoint, identical direction, identical
     * lens and horizon line". With one dominant reference attached and no
     * strength parameter on any model in the catalog (probed 2026-08-02: the
     * only knobs are aspect_ratio, n, resolution, seed, output_format, quality,
     * background), that is a request to copy the frame — and the model obliged,
     * bird included. The near-copy was half the endpoint's default behaviour and
     * half us asking for it.
     *
     * The standpoint paragraph carries the geometry now, in every frame,
     * anchored or not. So this can say where the observer is without demanding
     * a pixel match.
     */
    `Stand where that photographer stood and look the same way, and keep the land itself where ` +
    `it is: the ground, the slope, the line of the hills, the run of the coast or river. ` +
    `ANYTHING ALREADY STANDING HERE IN THIS YEAR IS STILL STANDING, in the same place and ` +
    `at the same scale, shown as it looked then. ` +
    /**
     * THE ABSENCE HALF, RAISED TO THE WEIGHT OF THE PRESENCE HALF.
     *
     * The two halves of this rule were never equal. Presence got capitals, a
     * clause of its own and two qualifiers; absence got a subordinate "Only what
     * had not been built yet ... is absent" tucked behind it. That asymmetry
     * lands on top of the image model's own bias — with a reference attached the
     * default behaviour is to preserve, and deleting the dominant subject of the
     * attachment is the hardest edit there is.
     *
     * It shows: a Rushmore sweep seeded in 2019 rendered 1920 with all four
     * heads finished. Carving began in 1927. The frame is not a little early, it
     * is a monument seven years before the first charge was set.
     *
     * Phrased as what the ground DOES show rather than as a deletion, for the
     * usual reason — "no faces on the mountain" is a request for faces on the
     * mountain.
     */
    `AND ANYTHING NOT YET MADE IN THIS YEAR IS NOT HERE IN ANY FORM: where it will one day ` +
    `stand, this frame shows the bare ground, rock, water or growth that occupied that space ` +
    `in this year, finished and complete as its own subject. A thing under construction in ` +
    `this year appears at exactly the stage it had reached in this year and no further. ` +
    `What was already gone by this year is likewise absent, and what is missing is replaced ` +
    `by whatever was actually on that ground at the time. ` +
    `The vegetation, the water and ice, the weather, the light and ` +
    `whoever is present all belong to this year. ` +
    /**
     * PORTABLE MANUFACTURE — the category the clause used to have no sentence for.
     *
     * Everything above is about ground, structures and weather. A sweep of Mount
     * Rushmore seeded in the present and asked for 1943 came back with the crowd
     * correctly dressed in 1940s cotton and carrying 1940s folding cameras on
     * neck straps — the planner had done its job — while the same people held
     * phones up at arm's length, copied out of the seed frame along with the
     * gesture. Held objects were licensed by nothing and protected by nothing,
     * so the strongest instruction in the clause ("IS STILL STANDING") reached
     * them by default.
     *
     * Phrased as what things ARE, never as a list of what to omit: this file's
     * negatives were deleted precisely because naming an absent object summons
     * it, and "no smartphones" is the fastest way to fill a 1943 frame with them.
     */
    `Everything made by hand or machine that is not the ground and not a building belongs to ` +
    `this year as well, and to this year only: what the people are wearing, and what they are ` +
    `carrying, holding and using in their hands, and the vehicles, the road surface, the signs ` +
    `and the lighting are all of this year's manufacture and this year's design. People hold ` +
    `and use the objects of this year the way this year's people held and used them, in the ` +
    `postures those objects call for. ` +
    `This is the same view at a different time, not the same photograph adjusted.` +
    standing;

  /**
   * FIRST, not appended — the same move the photograph path made, for the same
   * reason, finally applied to the path that needs it more.
   *
   * The note above the photograph clause says it plainly: promptcraft's guidance
   * is that the most important thing goes first, and appending the one
   * instruction that governs what the picture IS after eight blocks of scene
   * description puts it in the weakest position in the prompt. That was fixed
   * there and left alone here, so the chained anchor — which carries the
   * standing/absent rule AND the planner's per-frame historical verdict — was
   * the literal last thing the image model read, behind the style suffix.
   *
   * It is worse here than it was there, because this clause is fighting an
   * attached image rather than agreeing with one.
   */
  return ordered.map((p) => withStandpoint(`${anchor}\n\n${p}`));
}

export function buildCinematicPromptFromDirection(
  opts: BuildPanelsOpts & { seconds?: number },
  direction: SceneDirection,
): string {
  const atm = getEraAtmosphere(opts.year);
  const formattedYear = formatYear(opts.year);
  const era = getEraDescription(opts.year);
  const subject = direction.cinematicSubject || direction.centerSubject;
  const move = direction.cinematicCameraMove || 'a slow dolly push-in with subtle parallax';
  const sound = direction.cinematicSoundCue || 'the ambient sound this place would actually make';
  const styled = Boolean(opts.styleSuffix);

  // Prose, like the image path, and for the same reason: this is read by a
  // language model. The old version was a tag stack ending in "8K, smooth
  // motion" and carrying a list of negatives, which video models handle no
  // better than image models do.
  // Cinematic mode assembles its prompt by hand and never touches fillTemplate,
  // so it receives no placeholder and inherits nothing automatically. Left alone
  // it carried every defect verbatim: no habitation control at all, plus the
  // frescoed-plaster Pacific and the clothing-and-construction ice sheet. Same
  // gate, same sentences, so the still and the clip cannot drift apart.
  const wild = direction.habitation === 'uninhabited' || direction.habitation === 'traces-only';

  return [
    `${subject}, at ${opts.location} in ${formattedYear}.`,
    getHabitationClause(direction.habitation),
    direction.periodMarkers ? `${direction.periodMarkers}.` : '',
    direction.habitation === 'uninhabited'
      ? `The ground, the water, the ice, the weather and every living thing in frame are exactly as they were here in ${formattedYear}.`
      : direction.habitation === 'traces-only'
        ? `Whatever stands here was built before ${formattedYear} and has been weathering ever since.`
        : `Everything visible belongs to this exact moment: the materials, clothing and construction are those of ${era} in ${formattedYear}.`,
    [
      direction.biome ? `The ground and everything living on it: ${direction.biome}.` : '',
      wild || styled
        ? `The air is ${direction.atmosphere}.`
        : `The air is ${direction.atmosphere}, lit by ${atm.lighting}. Colours run to ${atm.palette}.`,
      wild ? '' : `Surfaces are ${atm.texture}.`,
    ]
      .filter(Boolean)
      .join(' '),
    `The camera makes ${move}, and the shot holds steady enough to read.`,
    `Sound: ${sound}. No music, no narration — only what is actually there.`,
    opts.styleSuffix ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
}


// ============================================================================
// LEGACY FALLBACK — used when scene direction JSON parse fails
// ============================================================================

export function buildFallbackDirection(
  narrative: string,
  location: string,
  /**
   * Salvaged from an unparseable response where possible.
   *
   * UNDEFINED IS THE DEFAULT AND THAT IS DELIBERATE. With no level,
   * buildPanelPrompt emits no habitation sentence, keeps the full era wash and
   * keeps the old anachronism sentence — precisely what happens today, so this
   * path cannot regress. Every concrete default is a guess applied to the whole
   * planet: 'sparse' is wrong everywhere, 'uninhabited' empties Rome, 'settled'
   * is the bug being fixed.
   *
   * Note what the OLD default really was. `${location} as a time traveler would
   * first see it` reads neutral and is not: it hands habitation to a generative
   * prior trained on captioned photographs, which are overwhelmingly of people
   * and structures. The subjects below stop reinforcing that when we do know.
   */
  habitation?: HabitationLevel,
): SceneDirection {
  const wild = habitation === 'uninhabited' || habitation === 'traces-only';
  const peopled = habitation === 'settled' || habitation === 'dense';
  return {
    isFallback: true,
    habitation,
    narrative,
    atmosphere: 'natural ambient atmosphere, period-appropriate light',
    cameraNotes: DEFAULT_VIEWPOINT,
    // Empty rather than invented: a fabricated marker would date the scene
    // wrongly, which is worse than not dating it at all. The same reasoning
    // applies doubly to biome — a guessed species is a checkable falsehood — and
    // an empty biome is also what routes this path back to the era table, which
    // is the right floor here.
    periodMarkers: '',
    biome: '',
    leftSubject: wild
      ? `the open ground, water and sky at ${location}, seen wide`
      : `wide establishing view of ${location}, peripheral details and environment`,
    centerSubject: wild
      ? `${location} under its own weather, the land and its wild life holding the whole view`
      : peopled
        ? `the people of ${location} at their ordinary business, the main focal scene`
        : `${location} as a time traveler would first see it, main focal scene`,
    rightSubject: wild
      ? `the same country at ${location} from a second angle, weather moving across it`
      : `continuation of the panorama at ${location}, complementary angle`,
  };
}
