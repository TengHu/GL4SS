/**
 * OpenRouter client for The Looking Glass.
 *
 * Image responses arrive in half a dozen shapes depending on the upstream
 * provider (Gemini native, Anthropic-style content blocks, OpenAI-style
 * image_url, OpenRouter's own `message.images` field, or raw strings). The
 * 30-commit history of fix attempts on this app was almost entirely about
 * chasing these variants. We consolidate them into one parser here with
 * each branch named and a clear failure mode.
 */

import type { ViewMode } from '../types';
import { formatYear, getEraDescription } from './format';
import type { HabitationLevel, SceneDirection } from './promptcraft';
import {
  HABITATION_LEVELS,
  buildFallbackDirection,
  getEraAtmosphere,
  getEraPhase,
} from './promptcraft';

// ============================================================================
// MODEL DEFAULTS  (catalog as of May 2026 — see README)
// ============================================================================

export const DEFAULT_TEXT_MODEL = 'google/gemini-3-flash-preview';
export const DEFAULT_WIDE_FIELD_MODEL = 'black-forest-labs/flux.2-max';
export const DEFAULT_CHRONO_SELFIE_MODEL = 'google/gemini-3-pro-image-preview';
export const DEFAULT_CINEMATIC_VIDEO_MODEL = 'x-ai/grok-imagine-video';
export const DEFAULT_ANIMATE_VIDEO_MODEL = 'x-ai/grok-imagine-video';

export interface ModelOption {
  id: string;
  label: string;
  blurb: string;
}

// Probed live against OpenRouter 2026-07-30. `google/gemini-3-pro-preview` was
// listed here but 404s with "No endpoints found" — it was selectable in the UI
// and broke every generation for anyone who picked it. Removed rather than left
// as a trap; re-add if it comes back.
export const TEXT_MODELS: ModelOption[] = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', blurb: 'Default — fast + cheap (~4s)' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', blurb: 'Most evocative prose' },
];

export const WIDE_FIELD_MODELS: ModelOption[] = [
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX 2 Max', blurb: 'Default — frontier photoreal' },
  { id: 'google/gemini-3-pro-image-preview', label: 'Nano Banana Pro', blurb: 'Best long-prompt grounding' },
  { id: 'black-forest-labs/flux.2-flex', label: 'FLUX 2 Flex', blurb: 'Faster, slightly looser' },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image', blurb: 'Fastest Google option' },
  { id: 'x-ai/grok-imagine-image-quality', label: 'Grok Imagine HQ', blurb: 'Natural physics + lighting' },
];

export const CHRONO_SELFIE_MODELS: ModelOption[] = [
  { id: 'google/gemini-3-pro-image-preview', label: 'Nano Banana Pro', blurb: 'Default — best identity preservation' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX 2 Max', blurb: 'Strongest photoreal' },
  { id: 'openai/gpt-5-image', label: 'GPT-5 Image', blurb: 'Best instruction following' },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image', blurb: 'Faster Google option' },
];

export const VIDEO_MODELS: ModelOption[] = [
  // Confirmed live against /videos — it accepts a job and returns an id.
  // Grok Imagine shipped with native audio as a headline feature, so clips are
  // expected to have sound. Noting only that neither OpenRouter's model page nor
  // its /models endpoint says so either way — /models lists no video models at
  // all — so this is on xAI's word rather than the provider's.
  { id: 'x-ai/grok-imagine-video', label: 'Grok Imagine Video', blurb: 'Default — xAI, fast, with audio' },
  { id: 'bytedance/seedance-2.0', label: 'Seedance 2.0', blurb: 'Cinematic, with audio' },
  { id: 'bytedance/seedance-2.0-fast', label: 'Seedance 2.0 Fast', blurb: 'Faster, same family' },
  { id: 'google/veo-3.1-fast', label: 'Veo 3.1 Fast', blurb: 'Google flagship, native audio' },
  { id: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', blurb: 'Cheaper Veo tier' },
  { id: 'kwaivgi/kling-v3.0-pro', label: 'Kling 3.0 Pro', blurb: 'Kuaishou flagship' },
  { id: 'minimax/hailuo-2.3', label: 'Hailuo 2.3', blurb: 'MiniMax option' },
  { id: 'alibaba/wan-2.7', label: 'Wan 2.7', blurb: 'Alibaba option' },
];

export interface ModelSelection {
  text: string;
  wideField: string;
  chronoSelfie: string;
  cinematic: string;
  animate: string;
}

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  text: DEFAULT_TEXT_MODEL,
  wideField: DEFAULT_WIDE_FIELD_MODEL,
  chronoSelfie: DEFAULT_CHRONO_SELFIE_MODEL,
  cinematic: DEFAULT_CINEMATIC_VIDEO_MODEL,
  animate: DEFAULT_ANIMATE_VIDEO_MODEL,
};

export function imageModelForMode(mode: ViewMode, selection: ModelSelection): string {
  if (mode === 'chrono-selfie') return selection.chronoSelfie;
  return selection.wideField;
}

/**
 * Image-gen models on OpenRouter use the chat-completions endpoint with a
 * `modalities` array. Gemini image variants want `['image', 'text']` because
 * they can also stream a text caption alongside; dedicated image models
 * (FLUX 2, GPT-5 Image, Grok Imagine, etc) error with 404 "No endpoints found
 * that support the requested output modalities" if `text` is included.
 *
 * Whitelist of Gemini-family image models that DO support text output:
 */
const GEMINI_IMAGE_TEXT_MODELS = new Set<string>([
  'google/gemini-2.5-flash-image',
  'google/gemini-3-pro-image-preview',
  'google/gemini-3.1-flash-image-preview',
]);

export function modalitiesForImageModel(modelId: string): ('image' | 'text')[] {
  return GEMINI_IMAGE_TEXT_MODELS.has(modelId) ? ['image', 'text'] : ['image'];
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/** The one origin the user's key is ever attached to. See toPlayableUrl. */
const OPENROUTER_ORIGIN = 'https://openrouter.ai';

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/**
 * The DEDICATED image endpoint.
 *
 * Distinct from chat-completions, and the only place a reference image can be
 * given. `/chat/completions` with an `image_url` content block is the VISION
 * shape — image in, TEXT out — so an image-output model accepts the request,
 * generates from the prompt alone, and silently drops the attachment. No error,
 * no warning, just a picture that ignored the photograph you handed it.
 *
 * Here the reference goes in `input_references`, which every image model in the
 * app's catalog advertises in `supported_parameters` (probed 2026-08-01: FLUX 2
 * takes up to 8, Gemini 14, Grok 3, GPT-5 Image 16).
 */
const IMAGES_ENDPOINT = 'https://openrouter.ai/api/v1/images';
const VIDEOS_ENDPOINT = 'https://openrouter.ai/api/v1/videos';
/** Capability table for video models. Public — no key, no charge. */
const VIDEO_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/videos/models';
const KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key';

interface AnthropicLikeBlock {
  type?: string;
  source?: { data?: string; media_type?: string };
}
interface GeminiInlineBlock {
  inline_data?: { data?: string; mime_type?: string };
}
interface OpenAiImageBlock {
  type?: string;
  image_url?: { url?: string };
}
interface RawDataBlock {
  data?: string;
  mimeType?: string;
}
interface TextBlock {
  type?: string;
  text?: string;
}

type ContentBlock = AnthropicLikeBlock & GeminiInlineBlock & OpenAiImageBlock & RawDataBlock & TextBlock;

interface ImagesField {
  type?: string;
  image_url?: { url?: string };
}

interface OpenRouterMessage {
  content?: string | ContentBlock[];
  images?: ImagesField[];
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

function commonHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://lookingglass.local',
    'X-Title': 'The Looking Glass - Temporal Navigator',
  };
}

export interface KeyStatus {
  label?: string;
  /** Dollars spent on this key so far. */
  usage: number;
  /** Credit limit, or null when the key is uncapped. */
  limit: number | null;
  /** Dollars left, when OpenRouter reports it. Undefined on an uncapped key. */
  remaining?: number;
  /** How often the limit resets, e.g. "weekly". Absent on a lifetime cap. */
  resets?: string;
  freeTier: boolean;
}

/**
 * Ask OpenRouter whether this key is real, before the user spends anything on
 * finding out.
 *
 * Every other path in this app discovers a bad key the expensive way: the user
 * chooses a place, chooses a year, throws the lever, waits through the tunnel,
 * and *then* gets told the credential was wrong. This endpoint costs nothing,
 * answers in well under a second, and additionally reports the balance — which
 * turns "insufficient credits" from a surprise at the worst possible moment
 * into a number visible at the moment the key is saved.
 *
 * Throws OpenRouterError on rejection so it classifies through the same
 * explainFailure() path as everything else.
 */
export async function verifyKey(apiKey: string, signal?: AbortSignal): Promise<KeyStatus> {
  const response = await fetch(KEY_ENDPOINT, {
    method: 'GET',
    headers: commonHeaders(apiKey),
    signal,
  });
  if (!response.ok) {
    throw new OpenRouterError(response.status, await response.text());
  }
  const json = (await response.json()) as {
    data?: {
      label?: string;
      usage?: number;
      limit?: number | null;
      limit_remaining?: number | null;
      limit_reset?: string | null;
      is_free_tier?: boolean;
    };
  };
  const d = json.data ?? {};
  const usage = typeof d.usage === 'number' ? d.usage : 0;
  const limit = typeof d.limit === 'number' ? d.limit : null;
  /*
   * ONLY OpenRouter's own figure. There was a `limit - usage` fallback here and
   * it was wrong in a way that mattered: `limit` is frequently a WEEKLY cap
   * (limit_reset: "weekly") while `usage` is LIFETIME spend, so on a real key —
   * limit 5000, lifetime usage 6146, actually 4831 remaining — the subtraction
   * went negative, clamped to zero, and told someone with $4.8k of headroom
   * that they had $0.00 left. Reporting nothing is strictly better than
   * reporting a confidently wrong balance.
   */
  const remaining = typeof d.limit_remaining === 'number' ? d.limit_remaining : undefined;
  return {
    label: d.label,
    usage,
    limit,
    remaining,
    resets: d.limit_reset ?? undefined,
    freeTier: Boolean(d.is_free_tier),
  };
}

export class OpenRouterError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`OpenRouter API error (${status}): ${body}`);
    this.name = 'OpenRouterError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Extract an image URL or data URL from an OpenRouter chat completion message.
 * Returns `null` if no recognized image shape is present — callers decide
 * whether that's an error.
 *
 * Exported (not just internal) so tests / debugging can target it directly.
 */
export function extractImageFromMessage(message: OpenRouterMessage | undefined): string | null {
  if (!message) return null;

  // 1) `message.images[]` (OpenRouter-native image generation field)
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      if (img.image_url?.url) return img.image_url.url;
    }
  }

  const content = message.content;

  // 2) String content: data URL, http URL, or raw base64
  if (typeof content === 'string' && content.length > 0) {
    if (content.startsWith('data:image')) return content;
    if (content.startsWith('http')) return content;
    if (BASE64_RE.test(content)) return `data:image/png;base64,${content}`;
    return null;
  }

  // 3) Array content: a handful of provider-specific shapes
  if (Array.isArray(content)) {
    for (const item of content) {
      // Anthropic-style: { type: 'image', source: { data, media_type } }
      if (item.type === 'image' && item.source?.data) {
        const mime = item.source.media_type ?? 'image/png';
        return `data:${mime};base64,${item.source.data}`;
      }
      // Gemini-native: { inline_data: { data, mime_type } }
      if (item.inline_data?.data) {
        const mime = item.inline_data.mime_type ?? 'image/png';
        return `data:${mime};base64,${item.inline_data.data}`;
      }
      // OpenAI-style: { type: 'image_url', image_url: { url } }
      if (item.type === 'image_url' && item.image_url?.url) {
        return item.image_url.url;
      }
      // Loose camelCase variant: { data, mimeType }
      if (item.data && item.mimeType) {
        return `data:${item.mimeType};base64,${item.data}`;
      }
    }
  }

  return null;
}

/**
 * Extract the narrative text from an OpenRouter chat completion message.
 * Falls back to a placeholder if no text shape is present.
 */
export function extractTextFromMessage(message: OpenRouterMessage | undefined): string {
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b.type === 'text' && typeof b.text === 'string');
    if (textBlock?.text) return textBlock.text;
  }
  return '';
}

/**
 * Timeouts, deliberately not one shared constant.
 *
 * Measured 2026-07-30: scene direction runs 3.2–4.6s, hero images 5.4–33.2s
 * with the slow tail above that. A single constant would either abort
 * legitimate image renders or let a hung text call sit for a minute. `fetch`
 * has no default timeout at all, so without these a stalled connection occupies
 * a worker slot forever — with a small concurrency cap that is a silent deadlock,
 * not just a slow request.
 */
export const MAX_POLL_FAILURES = 3;

const TEXT_TIMEOUT_MS = 45_000;
export const IMAGE_TIMEOUT_MS = 120_000;

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Caller cancellation and the timeout both need to abort the same request. */
function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function postChat(
  apiKey: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<OpenRouterResponse> {
  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: commonHeaders(apiKey),
    body: JSON.stringify(body),
    signal: combineSignals(options.signal, options.timeoutMs ?? TEXT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(response.status, text);
  }
  return (await response.json()) as OpenRouterResponse;
}

export async function generateNarrative(
  apiKey: string,
  location: string,
  year: number,
  model: string = DEFAULT_TEXT_MODEL,
): Promise<string> {
  const formattedYear = formatYear(year);
  const era = getEraDescription(year);
  const prompt = `You are a time travel historian. Describe what a time traveler would see at ${location} in ${formattedYear} (${era}).
Be vivid, historically accurate for past dates, or imaginatively plausible for future dates.
Include sensory details: sights, sounds, atmosphere. Keep it to 2-3 sentences. Do not use markdown.`;

  const data = await postChat(apiKey, {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  });

  const text = extractTextFromMessage(data.choices?.[0]?.message);
  return text || 'A moment frozen in time awaits your observation.';
}

// ============================================================================
// SCENE DIRECTION — single LLM call returns structured JSON used to build
// per-panel image prompts that share atmosphere but have distinct subjects.
// ============================================================================

function buildSceneDirectionPrompt(
  location: string,
  coordinates: { lat: number; lng: number },
  year: number,
  mode: ViewMode,
  styleSuffix?: string | null,
  /** The stations either side on the dial — what this frame must not resemble. */
  neighbours?: { earlier: number; later: number },
  /**
   * The user's chosen time of day. The planner does NOT get to pick this.
   * Named dayPhase, not phase: `phase` in this function is already the position
   * WITHIN THE ERA BAND (getEraPhase), and the two are entirely different axes.
   */
  dayPhase?: string,
  /** What kind of image is attached, if any. See generateSceneDirection. */
  referenceKind?: 'photograph' | 'sweep',
  /** The year the attached image was taken, for 'sweep'. */
  referenceYear?: number,
): string {
  const formattedYear = formatYear(year);
  const era = getEraDescription(year);
  const atm = getEraAtmosphere(year);
  const modeNote =
    mode === 'chrono-selfie'
      ? `OUTPUT MODE: chrono-selfie. The center panel will be a portrait of a time traveler; left and right panels are environment.`
      : mode === 'cinematic'
        ? `OUTPUT MODE: cinematic. There will be one 8-second video clip.`
        : `OUTPUT MODE: wide-field. Three panels form a panorama. Each panel needs a DISTINCT focal subject; do not repeat the same scene three times.`;

  const phase = getEraPhase(year);

  // Contrast against the ADJACENT STATIONS, not a quarter of the era's span.
  // Era spans are wildly uneven once deep time exists — the Neogene is 20.4M
  // years, so a quarter of it is 5.1M — and the old arithmetic pushed 17
  // prehistoric stations into a POSITIVE year: station -20,000 was being told not
  // to resemble "627075 AD". The thing a frame must actually differ from is the
  // frame one click away.
  const fallbackStep = Math.max(1, Math.round(phase.spanYears / 8));
  const earlier = neighbours?.earlier ?? year - fallbackStep;
  const later = neighbours?.later ?? year + fallbackStep;
  const neighbourEarlier = formatYear(earlier);
  const neighbourLater = formatYear(later);

  /**
   * `const prehistoric = year < -12_000` used to live here and was the app's
   * ENTIRE habitation model. Its false branch hard-required "an INHABITED scene
   * with visible people" for every station after 12,000 BC at every coordinate on
   * Earth, so Antarctica in 1200, the mid-Pacific in 1500 and Everest before the
   * first ascent were all ordered to contain a populated scene, while
   * `coordinates` was interpolated once as a label and never consulted again. It
   * ALSO gated periodMarkers, which is the half nobody had named: above 12,000 BC
   * the only concrete-detail field in the schema demanded "garments, tools ... or
   * signage", and those land at the second-highest weight in the image prompt, so
   * fixing centerSubject alone still asked Antarctic ice for signage.
   *
   * Habitation now moves to the planner as a field it fills in FIRST, because the
   * question is one only a model with world knowledge can answer: it depends on
   * whether the Sahara was green in this year, whether Iceland was settled yet,
   * and whether Pripyat had been evacuated. No threshold over `year` — and no
   * threshold over latitude either — holds all three. The two things the old
   * branch got right survive as rules inside the rubric below: nobody exists
   * anywhere before ~300 kya, and garments and signage must not be demanded of a
   * frame with no one in it to wear or read them.
   */

  return [
    `You are a historian and a stills photographer planning what a single photograph taken at this place in this year would show.`,
    /**
     * THE ATTACHED PHOTOGRAPH NARROWS THE PLACE, and that is the job it does
     * here — not style, not period, not mood.
     *
     * A pin is a borough. Given "Brooklyn" and 2016 the planner reasonably
     * reaches for the Brooklyn Bridge, and the drawing request was then handed a
     * bridge to render from the viewpoint of a residential stoop. Those are two
     * LOCATIONS, and no reference image can reconcile them — which is why
     * attaching the photograph only to the drawing request looked like it did
     * nothing at all.
     *
     * TREATED AS GROUND TRUTH FOR BOTH AXES. An earlier version told the
     * planner the photograph was modern and evidence about WHERE only — which
     * set it against itself the moment the visitor supplied a photograph of the
     * year they had dialled, since the planner was then instructed to overrule
     * the very thing it was being shown. Matching the photograph to the place
     * AND the year is the visitor's responsibility; this side simply respects
     * it, and asks the planner only for what a photograph cannot settle.
     */
    referenceKind === 'photograph'
      ? `A PHOTOGRAPH OF THIS PLACE AT THIS TIME IS ATTACHED, supplied by the visitor. Treat it as ground truth for BOTH where and when: it is this location, and it is ${formattedYear}. Describe the scene it actually shows — that street or ground, that vantage and direction of view, those buildings and surfaces, that light and season, the period detail visible in it. Do not substitute the district's famous landmark for what is in the frame, and do not date the scene from your own expectations of ${formattedYear} where the photograph disagrees. Your remaining job is what the photograph does not settle: who is present and what they are doing, what lies just outside the frame, and the concrete details too small to read in it.`
      : referenceKind === 'sweep'
        /**
         * THE REASONING STEP THIS WHOLE FILE WAS MISSING.
         *
         * A photograph of one year is attached and another year is asked for.
         * Whether a given building is in the frame is a question about history,
         * and only something that can SEE the photograph and KNOWS the date can
         * answer it. Nothing did: the planner never saw the picture, and the
         * image prompt guessed by category — land survives, built things do not
         * — which removed the White House from a view of the White House.
         *
         * So the planner is asked to work through the frame object by object
         * and commit the answer to `standing`, which then reaches the image
         * prompt as a fact rather than a rule of thumb.
         */
        ? `A PHOTOGRAPH OF THIS EXACT SPOT IS ATTACHED, taken in ${formatYear(referenceYear ?? year)}. You are planning THE SAME VIEW in ${formattedYear} — same camera position, same direction, same framing. It is evidence about WHERE and about WHAT STANDS HERE; the year is the thing you are reasoning about.\n\nWork through the photograph before you write anything: for each building, structure, road, bridge, wall and planting visible in it, decide whether it existed at this spot in ${formattedYear}. Something already standing in ${formattedYear} IS STILL IN THE FRAME — same position, same scale — and you say how it looked then, which may differ in colour, wear, extension or surroundings. Something not yet built, or already demolished, is absent, and you say what was actually on that ground instead. Do not relocate the view to a more typical scene of ${formattedYear}: this is this spot.`
        : '',
    // QUOTED, so the planner reads this as a NAME and not as prose it might
    // obey. The string comes from the URL query and from Nominatim (which anyone
    // with an OpenStreetMap account can edit), and it lands in a prompt billed to
    // whoever opened the link. A quoted literal is a far smaller target than a
    // bare clause sitting in the middle of an instruction list.
    `LOCATION: ${JSON.stringify(location)}  (lat ${coordinates.lat.toFixed(2)}, lng ${coordinates.lng.toFixed(2)})`,
    `YEAR: ${formattedYear} — THIS EXACT YEAR IS THE POINT.`,
    // The era label alone spans up to a thousand years. Naming the position in
    // the arc is what stops "Roman Era" collapsing 500 BC and 400 AD into the
    // same picture.
    `ERA: ${era} (${formatYear(phase.startYear)} to ${formatYear(phase.endYear)}). You are standing at ${phase.label} it.`,
    `ERA ATMOSPHERE HINT: ${atm.era} — ${atm.palette}; ${atm.lighting}; ${atm.texture}.`,
    `This hint describes the WHOLE era as it was lived in the crowded parts of the world. It is a floor, not the answer: where it does not fit this place — a polar plateau, an open ocean, a hyper-arid desert, a forest with nobody in it — say what is actually here in "atmosphere" and "biome", which outrank it. ${formattedYear} must not look interchangeable with ${neighbourEarlier} or ${neighbourLater}.`,
    modeNote,
    ``,
    `DECIDE WHO IS IN FRAME BEFORE YOU WRITE ANYTHING ELSE — it governs every other field.`,
    `If a camera stood at exactly lat ${coordinates.lat.toFixed(2)}, lng ${coordinates.lng.toFixed(2)} on an ordinary day in ${formattedYear}, how many people would be inside the frame? Not whether the region was known, claimed, mapped or reachable — how many are in THIS frame. Choose one level:`,
    `  uninhabited — nobody, and nothing anyone has made, anywhere in the frame.`,
    `  traces-only — made things are here and legible, but no living person is in frame: abandoned, seasonal, unmanned, evacuated, wrecked, or simply left behind.`,
    `  sparse — a handful of people, small in the frame and far apart, the land dominant.`,
    `  settled — a working community at its ordinary business, buildings maintained and in use.`,
    `  dense — a crowd: people at every distance, overlapping, the built surroundings continuous.`,
    `Judge it this way:`,
    `- If you can name a people who were AT these coordinates in ${formattedYear}, the level is at least sparse; if these coordinates fall inside a town, city or village occupied in ${formattedYear}, at least settled, and a great city of its day is dense. Rainforest, steppe, desert, tundra and coast have all held people — wild is not the same as empty. Do NOT lower the level out of caution: thinning out a place that was genuinely crowded is exactly as wrong as populating an ice sheet.`,
    `- If you cannot name anyone here in ${formattedYear}, take the lower level. Open ocean, the interior of an ice sheet, ground above the permanent snowline and the sterile core of a hyper-arid desert have nobody standing on them in any year, including the present.`,
    `- The date moves the answer in BOTH directions. Settlement, colonisation, station-building and construction put people where there were none; abandonment, evacuation, collapse, epidemic and exclusion zones take them away and often leave the buildings standing. If this place has such a date, check which side of it ${formattedYear} falls on.`,
    `- Being discovered, claimed, mapped, named, sailed past or flown over by outsiders puts nobody in the frame. Presence is not permanence either: seasonal camps, hunting and herding range, portage routes, pilgrim roads, trade paths and sea lanes are sparse, not settled.`,
    `- Before roughly 300,000 years ago there are no people anywhere on Earth. Permanent villages and towns appear only in the last ~12,000 years and only in some regions; before that sparse is the ceiling almost everywhere.`,
    ``,
    `Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:`,
    `{`,
    `  "habitation": "one of: uninhabited | traces-only | sparse | settled | dense — then a dash and at most eight words of evidence naming this place and this date",`,
    `  "narrative": "vivid 2–3 sentence prose for the user with sensory detail",`,
    // The user sets the hour on the sundial, so asking the planner for it too is
    // asking two authorities for one fact — and the FIXED line below would then
    // be contradicting a field this schema had just requested.
    dayPhase
      ? `  "atmosphere": "one phrase: weather and what is hanging in it — haze, dust, humidity, smoke, sea spray, still cold. Do NOT name a time of day: it is fixed below, and anything you write here must be true at that hour.",`
      : `  "atmosphere": "one phrase: time of day, weather, and what is hanging in it — haze, dust, humidity, smoke, sea spray, still cold",`,
    /**
     * ON A SWEEP THE STANDPOINT OWNS THE CAMERA, so this field asks only about
     * the light.
     *
     * Every frame's planner was inventing its own camera height, distance and
     * angle independently — a second source of drift, quieter than the one
     * everybody was watching, and directly contradicting a standpoint paragraph
     * that says the spot is fixed. The light genuinely does belong to the year.
     */
    referenceKind === 'sweep'
      ? `  "cameraNotes": "ONLY what the light is doing in this year: its direction, its hardness, and the weather carrying it. One short phrase. Say NOTHING about where the photographer stands, the camera height, the distance or the angle — the standpoint is fixed for this whole series and is not yours to choose. Do NOT name a lens, focal length, aperture, film stock or camera body.",`
      : `  "cameraNotes": "where the photographer is standing and what the light is doing: camera height, distance from the subject, angle, and the direction and hardness of the light. One short phrase, plain photographic description. Do NOT name a lens, focal length, aperture, film stock or camera body — the camera is already chosen — and do not describe camera movement, lighting equipment or colour grading. This is ONE still photograph. (cinematicCameraMove, where requested below, is exempt and should name a move.)",`,
    `  "biome": "ONE OR TWO SENTENCES of physical ground truth for this frame: the terrain and ground surface, the vegetation actually growing here, the state of water, ice and sky, and the animals genuinely present at lat ${coordinates.lat.toFixed(2)}, lng ${coordinates.lng.toFixed(2)} in ${formattedYear} — name each one EXACTLY ('emperor penguin', not 'penguins'; 'woolly mammoth', not 'megafauna'), at most four, and NAME NONE where none live: naming no animal is the correct and expected answer for the interior of an ice sheet, a hyper-arid core, ground above the permanent snowline, and open ocean far from land. Where people live here, include the built ground underfoot and the animals that live alongside them. Describe ONLY what IS present: this text is pasted into an image model that cannot process negation and renders any noun it is shown, so write 'unbroken wind-carved snow' rather than 'no vegetation', and do not mention the coast, the trees or the animals that are somewhere ELSE.",`,
    // Branches on the habitation level the model just chose, not on the year. The
    // old year-branch was the SECOND, unnoticed forcing function for the same
    // bug: after 12,000 BC it demanded "garments, tools ... or signage", and
    // those land at the second-highest weight in the image prompt.
    `  "periodMarkers": "2-4 comma-separated CONCRETE VISIBLE things that date this frame to ${formattedYear} rather than to ${neighbourEarlier} or ${neighbourLater}. Draw them from what this place actually offers in this year: the state of ice, snow, water, soil, rock and plant cover, the species present and what they are doing, the sky and the season — and, at sparse, settled or dense ONLY, garments, tools, building techniques, goods, weapons, vehicles, materials and signage. At uninhabited and traces-only every marker is a natural one and that is a complete answer; at traces-only add the condition of the made things and what has moved into them.",`,
    referenceKind === 'sweep'
      // The trailing sentence covers PORTABLE things. `standing` reads as a
      // question about structures and was answered as one, which left the frame's
      // moveable contents — vehicles, and above all whatever the photograph shows
      // in people's hands — with no verdict from the only step that can see both
      // the picture and the date. A Rushmore sweep came back with a 1943 crowd
      // holding present-day phones for exactly that reason.
      // LEADS WITH ABSENCE, because that is the half the image model resists.
      // Asked to lead with "what is still standing", the field was answered as a
      // survival list and the not-yet-built case trailed off the end of it — a
      // 2019-seeded sweep planned 1920 at Mount Rushmore with the carving intact,
      // seven years before the first charge was set. Naming the date the work
      // started is what makes the answer checkable rather than impressionistic.
      ? `  "referenceHolds": "REQUIRED HERE. Exactly one word, yes or no. Does the dominant BUILT subject of the attached photograph — the main structure, monument, building or roadway it is a picture of — already exist at this spot in ${formattedYear}? Answer yes only if a photographer standing here in ${formattedYear} would see that thing, complete or under construction. If it was built later, or was already demolished by ${formattedYear}, or the photograph has no built subject at all and is a picture of open land, answer no.",
  "standing": "REQUIRED HERE. Work through the attached photograph object by object. FIRST, absence: name anything visible in it that did not exist yet at this spot in ${formattedYear} — give the year that thing was built, begun or installed, and say what occupied that ground in ${formattedYear} instead. If it was under construction in ${formattedYear}, say exactly what stage it had reached that year. Name anything that was already gone by ${formattedYear} too. SECOND, survival: what is still standing here in ${formattedYear} and how it looked then — if the photograph's main structure predates ${formattedYear}, say so explicitly and describe its ${formattedYear} appearance, because it must not vanish. Name the things, do not generalise. THIRD, if the photograph shows vehicles, or people carrying or holding or using anything, name what stands in for each of those in ${formattedYear}: what a visitor here carries and wears and takes pictures with in ${formattedYear}, and what is parked or moving on that road in ${formattedYear}.",`
      : '',
    `  "leftSubject": "specific concrete subject in the LEFT panel (one short phrase, distinct from center and right)",`,
    `  "centerSubject": "specific concrete focal subject in the CENTER panel",`,
    // The four mode keys used to be requested on EVERY call with "Empty string if
    // not X", so a wide-field render paid tokens for three video fields and a
    // costume it discards — which is part of what pays for habitation and biome.
    // `rightSubject` carries its comma only when something actually follows it,
    // so the JSON stays valid in all three modes.
    mode === 'chrono-selfie'
      ? `  "rightSubject": "specific concrete subject in the RIGHT panel (distinct from left)",\n  "travelerLook": "period-accurate clothing and pose for the time traveler portrait"`
      : mode === 'cinematic'
        ? `  "rightSubject": "specific concrete subject in the RIGHT panel (distinct from left)",\n  "cinematicSubject": "the single focal subject of the video",\n  "cinematicCameraMove": "camera move, e.g. 'slow dolly push-in' or 'crane reveal'",\n  "cinematicSoundCue": "the sound this place actually makes at this date — wind, water, ice, weather and the specific animals named in biome; human sound only where people are present"`
        : `  "rightSubject": "specific concrete subject in the RIGHT panel (distinct from left)"`,
    `}`,
    ``,
    // Style has to be established HERE, not only in the image prompt. Live probe
    // 2026-07-30: with style applied only downstream, a "cyberpunk" Colosseum came
    // back as a neon grade over the bottom third of an otherwise sunlit golden-hour
    // frame — because this call had authored "mid-afternoon golden hour, oppressive
    // imperial grandeur" and the image model believed the atmosphere over the
    // appended style tokens. Authoring atmosphere in-style removes the conflict.
    styleSuffix
      ? `VISUAL STYLE (author atmosphere, lighting and camera IN this style — it is not a post-effect): ${styleSuffix}`
      : ``,
    // Set by the user on the sundial, so it is a fact about the frame rather than
    // something for the planner to invent. cameraNotes has to agree with it too:
    // "golden hour backlight" authored under a midnight phase produced a scene
    // lit two different ways at once.
    dayPhase
      ? `TIME OF DAY (FIXED BY THE USER — every field must agree with this, including cameraNotes and the lighting direction): ${dayPhase}`
      : ``,
    ``,
    `Constraints:`,
    `- Be HISTORICALLY ACCURATE for recorded history, PALAEONTOLOGICALLY PLAUSIBLE for prehistoric dates, and PLAUSIBLY EXTRAPOLATED for future dates. A landscape with the right wildlife and weather beats an invented observer at EVERY date on the dial — deep time is not the only place where nobody is home, and a recent year is no reason to add a person.`,
    // The failure this is aimed at: a live probe found 500 BC rendering as
    // generic Hollywood-Roman with Imperial iconography six centuries early,
    // indistinguishable from 100 AD. Genericism is the specific enemy.
    `- DATE THE SCENE. periodMarkers and centerSubject must make ${formattedYear} identifiable. Reject anything merely "ancient" or "futuristic" — if a detail would be equally true across the whole era, it is the wrong detail. ONE exception: where this exact spot genuinely changes on no scale ${neighbourEarlier} and ${neighbourLater} can see, date it by season, weather, light and the precise state of ice, water and growth, and do not invent an object to manufacture a difference. That exception is for places where nothing happened, not for centuries you cannot recall — if a settlement, an eruption, an arrival or an abandonment falls between those years, it is visible and it counts.`,
    `- Do NOT import the era's most famous imagery unless it genuinely exists in ${formattedYear}. Buildings not yet built, empires not yet risen and technologies not yet invented must be absent, even where they are what the era is known for.`,
    `- THE PLACE NAME IS NOT EVIDENCE. "${location}" is only today's label for these coordinates, and the name may post-date ${formattedYear} entirely — a city not yet founded, a nation not yet formed, a summit named centuries later by outsiders, a town named for a disaster that has not happened. Before writing any subject, ask what this spot is famous for — the tower, the skyline, the reactor, the temple, the trail, the harbour, the station — and whether it exists in ${formattedYear}. If it does not, it is absent, and so is any scenery the name implies.`,
    `- THE LAND IS DATED TOO, and how this spot looks today is often itself a later human artifact. Iceland was birch-wooded before grazing stripped it; the Sahara held lakes, grassland and rivers in its humid periods; at low sea level the coastline, the river mouths and the ice margin stood somewhere else; hillsides were unterraced, marshes undrained and forests uncut before anyone worked them. Decide what the ground, water, ice and plant cover looked like HERE in ${formattedYear}, not what a photograph of this spot shows now.`,
    `- Name only what lives at this latitude and longitude, on this continent and hemisphere and at this elevation, in THIS year. The famous animal of a place today can be on the wrong pole, the wrong continent or the wrong epoch, and species arrive and go extinct on dates. This dial reaches 252 million years back: present-day biogeography does not apply below the Holocene, and a place that is barren now may have been forested then.`,
    `- Remoteness does not set abundance — water, warmth and productivity do. A remote rainforest teems. Never stock a frame with charismatic animals to keep it from feeling empty.`,
    `- The three panel subjects must be visually DIFFERENT (different people / objects / framings) while sharing the same atmosphere.`,
    `- Subjects should be concrete nouns and verbs, not abstract concepts.`,
    `- Do NOT include any text the image model should not render literally (no quote marks, no instructions).`,
    // centerSubject is the only subject that becomes the hero frame, so it must
    // carry the premise. Probe found a 1890 Colosseum rendered as a steam-engine
    // portrait with no people in it at all — technically on-prompt, but it is not
    // "what a traveler would see".
    mode === 'chrono-selfie'
      ? `- The habitation level governs leftSubject and rightSubject. The centre panel is the traveler's own portrait and is the ONE exception: the traveler is the only person permitted at uninhabited or traces-only, and you must NOT raise the level to make room for them.`
      : `- The habitation level governs leftSubject, centerSubject, rightSubject and cinematicSubject — all of them. Do not put a person in a side panel the level does not allow.`,
    `- At settled or dense, centerSubject MUST be an INHABITED scene with visible people going about the moment. Never a bare object, machine or empty architecture portrait. At dense, place people at several distances at once and let their activity overlap — a great city of ${formattedYear} should be hard to see past.`,
    `- At sparse, a few people far apart and small in the frame, each at one specific task that belongs to this place in ${formattedYear}. The environment keeps most of the picture.`,
    `- At traces-only, the subject is a made thing and what this place is doing to it: say plainly what it is, what condition it is in, and what has moved in — growth, drift, dust, rust, animals using it. Its abandonment is the story of the picture.`,
    `- At uninhabited, every subject is drawn from "biome" and is something HAPPENING right now: an animal at a particular behaviour, weather crossing the terrain, water, ice, dust or rock in motion. Where no large animal genuinely lives here, do NOT invent one — the subject is then the ground, ice, water and sky at a specific hour in specific weather: the swell and the structure of the cloud above it, wind-carved ridges in snow, salt crust, a rockfall, a sun halo, and whatever small life is truly there. Give the frame an event, not a vista.`,
    // The image stage refuses gore. The text stage was cheerfully authoring "a
    // gladiator over a fallen opponent on blood-flecked sand", which returned
    // 400 Request Moderated / ["Violence"] and cost the user the whole frame.
    // Anticipation reads better anyway.
    `- Depict conflict as ANTICIPATION or aftermath-free tension: no blood, no wounds, no corpses, no killing blows. A crowd waiting is stronger than a body on the sand.`,
    // Every model's prior for a famous landmark is its present-day ruined state.
    /**
     * The camera's own vantage is a period claim, and nothing downstream checks
     * it. Live A/B, Patagonia at 20,000 BC: the planner authored "eye level on a
     * lateral moraine" looking at "a glacier lobe" and "wind-scoured boulders" —
     * a modern valley-glacier composition, at a date when the Patagonian Ice
     * Sheet buried that landscape under a kilometre of ice. There is no moraine
     * to stand on and no boulder field. Fifteen of sixteen frames rendered the
     * moraine foreground, across eight different image templates, because every
     * one of them was handed the same wrong standing point.
     */
    `- THE CAMERA'S OWN STANDING POINT MUST EXIST IN ${formattedYear}. Before writing cameraNotes, ask what is physically under the photographer's feet in this year and shoot from somewhere that is actually there. A vantage that exists only in another era — a moraine beside a glacier that in this year lies buried under an ice sheet, a beach at a sea level this year does not have, an embankment or terrace built centuries later, a clearing in a forest that has not grown yet — dates the whole frame wrongly however correct its contents are. If the honest answer is that the photographer is standing on ice, or in water, or on a roof, say so.`,
    `- Anything built at this spot is in the state ${formattedYear} actually found it in, and there are four possibilities; choose one deliberately. NOT YET BUILT: bare ground, water or ice, or whatever stood here before. UNDER CONSTRUCTION: scaffolding, cut stone, spoil, the work of that exact year. STANDING AND IN USE — structures at this location must appear CONTEMPORARY AND IN USE for that year, newly built and intact if that is what the year implies; do not depict them as modern ruins, because every model's prior for a famous landmark is its present-day ruined state and that prior has to be beaten. ALREADY ABANDONED OR RUINED: ${formattedYear} falls after its end and decay has had exactly that long to work — this is the state that goes with traces-only. A famous ruin stood intact for most of its life; a famous building is bare ground for most of history; a place abandoned before ${formattedYear} is still abandoned in ${formattedYear}, however recent that date is.`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/**
 * Pull a level out of the planner's habitation string.
 *
 * The field is written as "level — up to eight words of evidence" rather than a
 * bare enum: an enum emitted cold gets a vibes answer, while one clause of
 * justification forces the model to actually look at the place and the date
 * ("traces-only — Pripyat, evacuated 1986"). We keep only the level; the reason
 * has done its work by having been written.
 *
 * Unrecognised text yields undefined, which means "make no claim" downstream — a
 * wrong level is worse than none.
 */
export function parseHabitation(value: string): HabitationLevel | undefined {
  const head = value.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const exact = HABITATION_LEVELS.find((level) => head.startsWith(level));
  if (exact) return exact;
  // Tolerate "traces", "traces only", "uninhabited." and similar near-misses.
  if (head.startsWith('traces')) return 'traces-only';
  if (head.startsWith('uninhabit')) return 'uninhabited';
  return undefined;
}

const SCENE_FIELDS: (keyof SceneDirection)[] = [
  'habitation',
  'narrative',
  'atmosphere',
  'cameraNotes',
  'periodMarkers',
  'biome',
  'standing',
  'referenceHolds',
  'leftSubject',
  'centerSubject',
  'rightSubject',
  'travelerLook',
  'cinematicSubject',
  'cinematicCameraMove',
  'cinematicSoundCue',
];

/**
 * The verdict, read strictly and defaulting to 'no'.
 *
 * Only a clear yes is a yes. Anything else — absent, empty, hedged, a sentence
 * where an enum was asked for — means the runner attaches nothing, and the
 * asymmetry is on purpose: an unattached frame drifts a little, an attached one
 * renders the finished monument seven years before the first charge was set.
 * The cheap failure is the default.
 */
function parseReferenceHolds(raw: string): 'yes' | 'no' | undefined {
  if (!raw) return undefined;
  return /^\s*yes\b/i.test(raw) ? 'yes' : 'no';
}

function parseSceneDirection(raw: string): SceneDirection | null {
  if (!raw) return null;
  // Some models wrap JSON in ```json fences despite instructions — strip.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const get = (k: string): string => (typeof obj[k] === 'string' ? (obj[k] as string).trim() : '');
    const rawHabitation = get('habitation');
    const habitation = parseHabitation(rawHabitation);
    // The governing field failing silently is exactly the class of bug
    // promptcraft.ts:56-62 forbids: a model that consistently emits a synonym
    // ('unpopulated', 'none', 'wilderness') would drop the clause from EVERY
    // frame and the app would merely look mediocre, with no error anywhere.
    if (rawHabitation && !habitation) {
      console.warn(
        `[looking-glass] unrecognised habitation level ${JSON.stringify(rawHabitation)} — ` +
          `this frame makes no habitation claim and the image model's own prior decides.`,
      );
    }
    const direction: SceneDirection = {
      // Deliberately NOT part of the validity check below. A response that is
      // otherwise perfect must not be thrown away to the generic fallback
      // because one enum came back unrecognised — undefined simply means the
      // prompt makes no habitation claim, which is the pre-existing behaviour.
      habitation,
      narrative: get('narrative'),
      atmosphere: get('atmosphere'),
      cameraNotes: get('cameraNotes'),
      periodMarkers: get('periodMarkers'),
      // Trailing period stripped once, here: buildCinematicPromptFromDirection
      // joins its array by hand and never passes through fillTemplate, so it has
      // none of the `\.{2,}` cleanup that rescues the panel path, and every biome
      // sentence would otherwise land as "... on the horizon.. The air is".
      /**
       * `standing` WAS BEING DROPPED ON THE FLOOR.
       *
       * It is declared on SceneDirection, listed in SCENE_FIELDS, requested in
       * the planner prompt at length, and read by buildCoreSamplePrompts — and
       * it was never extracted here, so `direction.standing` was undefined on
       * every frame the app has ever rendered. Two commits of work on the
       * planner's per-object historical verdict, and not one word of it reached
       * an image prompt.
       *
       * This is the failure mode the fallback warning above exists for, except
       * quieter: no parse error, no fallback, no console line. The object was
       * valid. It was just missing the field that carried the answer.
       */
      standing: get('standing') || undefined,
      referenceHolds: parseReferenceHolds(get('referenceHolds')),
      biome: get('biome').replace(/\.\s*$/, ''),
      leftSubject: get('leftSubject'),
      centerSubject: get('centerSubject'),
      rightSubject: get('rightSubject'),
      travelerLook: get('travelerLook') || undefined,
      cinematicSubject: get('cinematicSubject') || undefined,
      cinematicCameraMove: get('cinematicCameraMove') || undefined,
      cinematicSoundCue: get('cinematicSoundCue') || undefined,
    };
    // Require the core fields to feel valid.
    if (!direction.narrative || !direction.leftSubject || !direction.centerSubject || !direction.rightSubject) {
      return null;
    }
    return direction;
  } catch {
    return null;
  }
}

/**
 * THE STANDPOINT — dispatch orders for a whole sweep, written once.
 *
 * The product is a time machine sending observers to one fixed position in many
 * different years to report what they see. Observers do not hand each other
 * photographs; what they share is where to stand. That is a specification, and
 * a specification is words.
 *
 * This replaces the seed-as-permanent-second-reference. That mechanism was
 * solving a real problem — viewpoint drift down a long chain of copies — with
 * an instrument that carried the whole picture along with the viewpoint, so a
 * sweep across 109 years returned the same bird in the same patch of sky four
 * times. A paragraph cannot do that, and it does not decay through
 * copy-of-a-copy either: it is injected identically into every frame.
 *
 * WHAT MAKES IT WORK IS THE EXCLUSION RULE, not the description. The span is
 * named in the prompt and everything year-specific is refused entry — trees
 * grow, weather turns, buildings go up and come down. What survives the filter
 * is bedrock, terrain and the shape of the horizon, which is exactly the set of
 * things that are true for every observer in the series. Without that rule this
 * degrades into the seed photograph transcribed into prose, which would be the
 * same bug with extra steps.
 *
 * Returns '' rather than throwing. A sweep with no standpoint is the behaviour
 * that shipped before this existed, and losing one optional text call is not a
 * reason to fail a run the visitor is about to be billed for.
 */
export async function planStandpoint(
  apiKey: string,
  location: string,
  coordinates: Coordinates,
  /** The seed frame. Read once, here, and never attached to a drawing request. */
  seedImage: string,
  seedYear: number,
  span: { earliest: number; latest: number },
  model: string = DEFAULT_TEXT_MODEL,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const earliest = formatYear(span.earliest);
  const latest = formatYear(span.latest);
  const prompt = [
    `You are writing standing orders for a series of photographers. Each will stand at exactly one spot on Earth — ${JSON.stringify(location)}, latitude ${coordinates.lat.toFixed(5)}, longitude ${coordinates.lng.toFixed(5)} — and each will be there in a different year, somewhere between ${earliest} and ${latest}. None of them will ever see a photograph. Your paragraph is the only thing they share, and their pictures must line up.`,
    ``,
    `A photograph taken from that spot in ${formatYear(seedYear)} is attached. Read the geometry out of it.`,
    ``,
    `Describe, in plain prose: the height of the camera above the ground and what the photographer is standing on; which way they are facing; how wide the view is; where the horizon falls in the frame; what occupies the left edge, the centre and the right edge; and the profile of the permanent landform — ridge lines, summit shapes, cliff faces, the run of a valley, coast or watercourse — in enough detail that someone could draw it without ever seeing the picture.`,
    ``,
    `THE RULE THAT MATTERS: include ONLY what is true in EVERY year from ${earliest} to ${latest}. Trees grow, fall and are cleared. Weather, snow, season and time of day change. Buildings, roads, monuments and machines are built and demolished — if the attached photograph's main subject was made after ${earliest}, it does not belong in your paragraph either, however dominant it looks. What survives that filter is bedrock, terrain and the shape of the horizon. Write that, and nothing else.`,
    ``,
    `One paragraph of plain prose. No headings, no lists, no preamble, and no mention of the attached photograph or of any year.`,
  ].join('\n');

  try {
    const data = await postChat(
      apiKey,
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: seedImage } },
            ],
          },
        ],
        max_tokens: 900,
      },
      { signal: options.signal, timeoutMs: TEXT_TIMEOUT_MS },
    );
    const text = extractTextFromMessage(data.choices?.[0]?.message).trim();
    if (!text) {
      console.warn('[looking-glass] standpoint came back empty — the sweep will run without one.');
    }
    return text;
  } catch (err) {
    if (options.signal?.aborted) return '';
    console.warn(
      `[looking-glass] standpoint call failed — the sweep runs without it, and frames ` +
        `rendered without a reference will not hold the viewpoint as tightly. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return '';
  }
}

export async function generateSceneDirection(
  apiKey: string,
  location: string,
  coordinates: { lat: number; lng: number },
  year: number,
  mode: ViewMode,
  model: string = DEFAULT_TEXT_MODEL,
  /** Pass the selected style so atmosphere is authored in-style, not patched on later. */
  styleSuffix?: string | null,
  options: {
    signal?: AbortSignal;
    neighbours?: { earlier: number; later: number };
    /** The user's chosen time of day, as a sentence about the light present. */
    phase?: string;
    /**
     * A photograph of the spot, shown to the PLANNER.
     *
     * This was the missing half. A pin is a place name and a coordinate —
     * "Brooklyn" — and the planner, given only that, picks the most photogenic
     * thing in the borough. It chose the Brooklyn Bridge while the visitor's
     * photograph showed a residential side street, and then the image model was
     * asked to draw the bridge from a brownstone stoop's viewpoint. No reference
     * can reconcile that: the two describe different LOCATIONS, not different
     * framings of one.
     *
     * So the planner sees it too, and plans the scene that is actually there.
     * This IS the vision shape — image in, text out — which is what
     * chat-completions does correctly and what the drawing request had to leave
     * for /images.
     */
    reference?: string;
    /**
     * What the attached image IS, which changes the question entirely.
     *
     *   'photograph'  the visitor's own, of this place AT THIS YEAR. Ground
     *                 truth on both axes; describe what it shows.
     *   'sweep'       a frame from elsewhere in this run, taken in a DIFFERENT
     *                 year. Ground truth about the PLACE and the viewpoint only
     *                 — the year is the thing being reasoned about.
     */
    referenceKind?: 'photograph' | 'sweep';
    /** The year the attached frame is from. Only meaningful for 'sweep'. */
    referenceYear?: number;
  } = {},
): Promise<SceneDirection> {
  const prompt = buildSceneDirectionPrompt(
    location,
    coordinates,
    year,
    mode,
    styleSuffix,
    options.neighbours,
    options.phase,
    options.reference ? (options.referenceKind ?? 'photograph') : undefined,
    options.referenceYear,
  );
  const content = options.reference
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: options.reference } },
      ]
    : prompt;
  const data = await postChat(
    apiKey,
    {
      model,
      messages: [{ role: 'user', content }],
      // Hint to OpenAI-compatible JSON-mode capable providers — harmlessly ignored elsewhere.
      response_format: { type: 'json_object' },
      // Raised from 800 when periodMarkers was added. At 800 the object was
      // being truncated mid-JSON, JSON.parse threw, and the code fell back to a
      // synthesized direction — silently, because the fallback is a legitimate
      // shape. The symptom was empty periodMarkers and a generic centerSubject,
      // i.e. exactly the genericism the field was added to fix.
      max_tokens: 1600,
    },
    { signal: options.signal, timeoutMs: TEXT_TIMEOUT_MS },
  );
  const text = extractTextFromMessage(data.choices?.[0]?.message);
  const parsed = parseSceneDirection(text);
  if (parsed) return parsed;

  // Fallback: treat the response as plain narrative and synthesize subjects.
  //
  // Announce it. This branch degrades every frame it touches to generic imagery
  // while still returning a perfectly valid object, so without a signal here a
  // prompt change that breaks JSON output looks like the models simply got
  // worse. The two things that actually diagnose it — whether the response was
  // truncated, and what it starts with — go in the message.
  const truncated = !text.trimEnd().endsWith('}');

  // Salvage the one field that matters most before giving up on the response.
  //
  // `habitation` is emitted FIRST, and the documented way this call fails is
  // truncation at max_tokens — which destroys the END of the object. So the level
  // is very often still sitting in plain sight in text that JSON.parse cannot
  // touch, and one regex recovers the difference between an Antarctic frame that
  // is genuinely empty and one the image model quietly populates.
  const salvagedMatch = /"habitation"\s*:\s*"\s*([a-z][a-z_ -]*)/i.exec(text);
  const salvagedHabitation = salvagedMatch ? parseHabitation(salvagedMatch[1]!) : undefined;

  console.warn(
    `[looking-glass] scene direction did not parse — falling back to a synthesized ` +
      `direction, imagery will be generic. model=${model} chars=${text.length} ` +
      `looksTruncated=${truncated}${truncated ? ' (raise max_tokens?)' : ''} ` +
      `habitationSalvaged=${salvagedHabitation ?? 'none'}\n` +
      `response head: ${text.slice(0, 220)}`,
  );

  /*
   * NEVER hand the raw response through as prose.
   *
   * This branch used to pass `text` straight in as the narrative. When the
   * failure is malformed or truncated JSON — which is the documented way this
   * call fails — that means the user is shown the model's raw output as if it
   * were writing: `{ "habitation": "` sitting in the caption where two
   * sentences of scene-setting belong. A parse failure is an internal problem
   * and should never surface as content.
   *
   * Same salvage trick as habitation above: the narrative is usually still
   * there in plain text even when JSON.parse cannot touch the object, so pull
   * it out with a regex and unescape it. Only if that fails too do we fall back
   * to a written sentence — and the raw text is discarded either way.
   */
  const narrativeMatch = /"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  let salvagedNarrative: string | undefined;
  if (narrativeMatch) {
    try {
      salvagedNarrative = JSON.parse(`"${narrativeMatch[1]!}"`) as string;
    } catch {
      salvagedNarrative = narrativeMatch[1];
    }
  }

  const looksStructured = /^\s*[{[]/.test(text) || /"(habitation|narrative|centerSubject)"\s*:/.test(text);
  const prose =
    salvagedNarrative?.trim() ||
    (looksStructured || !text.trim()
      ? 'A moment frozen in time awaits your observation.'
      : text.trim());

  return buildFallbackDirection(prose, location, salvagedHabitation);
}

// (export the field list mainly to silence "unused" if needed; might surface in UI later)
export { SCENE_FIELDS };

interface ImagesResponse {
  data?: { b64_json?: string; media_type?: string; url?: string }[];
}

/**
 * Render one image from a prompt AND a reference photograph.
 *
 * Uses the dedicated /images endpoint, because that is the only one that takes
 * `input_references` — see IMAGES_ENDPOINT for why the chat endpoint cannot do
 * this. `aspect_ratio` is a real parameter here rather than a sentence begged
 * into the prompt, which is a small mercy given the note in promptcraft about
 * providers disagreeing wildly on default aspect.
 *
 * Providers moderate an input image separately from the prompt (the lesson
 * filmize() already learned), so a caller must be prepared for refusal — see
 * `isImageInputRejection` and `renderStill`, which drops the anchor and says so.
 */
async function generateImageWithReference(
  apiKey: string,
  prompt: string,
  model: string,
  references: string[],
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await fetch(IMAGES_ENDPOINT, {
      method: 'POST',
      headers: commonHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        aspect_ratio: '16:9',
        /**
         * MORE THAN ONE, when the caller has more than one to give.
         *
         * A sweep sends the NEIGHBOUR — for continuity with the frame beside it
         * — and the SEED, so fidelity to the original viewpoint does not decay
         * with distance down the chain. Every model in the catalog advertises
         * room for several (FLUX 2 takes 8, Gemini 14); we sent exactly one for
         * as long as this function existed.
         */
        input_references: references.map((url) => ({
          type: 'image_url',
          image_url: { url },
        })),
      }),
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    throw new OpenRouterError(response.status, await response.text());
  }

  const data = (await response.json()) as ImagesResponse;
  const first = data.data?.[0];
  if (first?.b64_json) {
    return `data:${first.media_type || 'image/png'};base64,${first.b64_json}`;
  }
  if (first?.url) return first.url;
  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 400)}`);
}

/**
 * Render one image.
 *
 * WITH a reference, this is an EDIT and goes to the dedicated /images endpoint.
 * WITHOUT one it stays on chat-completions, which is the path the app has always
 * used and the one every response-shape workaround in this file was written for
 * — there is no reason to move working generation onto a second endpoint just
 * because editing needs one.
 */
export async function generateImage(
  apiKey: string,
  prompt: string,
  model: string = DEFAULT_WIDE_FIELD_MODEL,
  options: { signal?: AbortSignal; references?: string[] } = {},
): Promise<string> {
  if (options.references?.length) {
    return generateImageWithReference(apiKey, prompt, model, options.references, {
      signal: options.signal,
    });
  }

  const data = await postChat(
    apiKey,
    {
      model,
      modalities: modalitiesForImageModel(model),
      messages: [{ role: 'user', content: prompt }],
    },
    { signal: options.signal, timeoutMs: IMAGE_TIMEOUT_MS },
  );

  const url = extractImageFromMessage(data.choices?.[0]?.message);
  if (!url) {
    throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return url;
}

/**
 * Provider-side content moderation, distinguished from ordinary failures.
 *
 * Found by live probe 2026-07-30: the scene-direction LLM, asked to describe the
 * Colosseum, quite reasonably proposed "a trident gladiator standing over a
 * fallen opponent" as the focal subject — and FLUX 2 Max's provider rejected the
 * request with HTTP 400 `"status":"Request Moderated"`,
 * `"Moderation Reasons":["Violence"]`. Historically accurate scenes trip this
 * routinely (arenas, battles, executions), so it needs to be a recoverable
 * condition rather than a dead end the user sees as "signal lost".
 */
export function isModerationError(err: unknown): boolean {
  if (!(err instanceof OpenRouterError)) return false;
  if (err.status !== 400 && err.status !== 403) return false;
  return /request moderated|moderation reason|content policy|flagged/i.test(err.body);
}

/**
 * Model to retry on when the selected model moderates every candidate prompt.
 *
 * Chosen by controlled A/B on 2026-07-30: one identical retiarius-over-fallen-
 * opponent prompt was rejected by `flux.2-max` (400, Violence) in 2.0s but
 * rendered by `gemini-3.1-flash-image-preview` in 8.4s and `grok-imagine` in
 * 5.6s. Gemini is the fallback rather than the faster Grok because it rendered
 * the same scene far less graphically — the point of the rescue is to return a
 * usable frame, not the most explicit one available.
 */
export const MODERATION_FALLBACK_MODEL = 'google/gemini-3.1-flash-image-preview';

/**
 * Try each prompt in turn, advancing only when the provider *moderates* the
 * request. Any other error propagates immediately — a 401 or a dead model ID
 * should fail loudly instead of silently burning through alternates.
 *
 * Callers pass the focal prompt first and calmer alternates after it, so a
 * blocked frame degrades to a different subject in the same scene rather than
 * to nothing. If every prompt is blocked, the whole set is retried once on
 * MODERATION_FALLBACK_MODEL, because moderation is a property of the *provider*
 * as much as the prompt: this is what keeps FLUX 2 Max — visibly the best
 * composition of the five, but with the strictest filter — usable as the
 * quality option instead of a model that dead-ends on arenas and battlefields.
 * Pass `fallbackModel: null` to opt out.
 */
export async function generateImageWithFallback(
  apiKey: string,
  prompts: string[],
  model: string = DEFAULT_WIDE_FIELD_MODEL,
  options: { fallbackModel?: string | null; signal?: AbortSignal; references?: string[] } = {},
): Promise<{ url: string; promptIndex: number; moderatedCount: number; modelUsed: string }> {
  let moderatedCount = 0;
  let lastModeration: unknown = null;

  const fallbackModel =
    options.fallbackModel === undefined ? MODERATION_FALLBACK_MODEL : options.fallbackModel;
  // Only fall through to a second model if it is actually a different one.
  const models = fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model];

  for (const candidateModel of models) {
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      if (!prompt) continue;
      try {
        const url = await generateImage(apiKey, prompt, candidateModel, {
          signal: options.signal,
          references: options.references,
        });
        return { url, promptIndex: i, moderatedCount, modelUsed: candidateModel };
      } catch (err) {
        if (!isModerationError(err)) throw err;
        moderatedCount++;
        lastModeration = err;
      }
    }
  }

  throw lastModeration instanceof Error
    ? lastModeration
    : new Error('every candidate prompt was moderated on every candidate model');
}

// ============================================================================
// VIDEO GENERATION (async — submit job, poll until ready)
// ============================================================================

export type VideoJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  polling_url?: string;
  output_path?: string;
  unsigned_urls?: string[];
  bytes?: number;
  error?: string;
}

/**
 * Providers moderate the SOURCE frame separately from the prompt. Seedance
 * rejected a Colosseum crowd shot with
 * `InputImageSensitiveContentDetected.PrivacyInformation` — our frames contain
 * people, so this is the common case rather than an edge one.
 */
export function isSourceFrameRejection(err: unknown): boolean {
  if (!(err instanceof OpenRouterError)) return false;
  return /InputImageSensitiveContent|source_image|frame_images|image.*(rejected|sensitive)/i.test(
    err.body,
  );
}

/**
 * The STILL path's equivalent: this model or provider will not take an input
 * image on the chat endpoint at all.
 *
 * Distinct from `isSourceFrameRejection`, which is about a specific frame being
 * refused on content grounds. This one is structural — the model has no image
 * input, or the provider rejects the multimodal content block outright — and the
 * correct response is to give up on chaining for that frame and render it
 * unchained rather than to fail the whole sweep. Moderation is deliberately NOT
 * matched here: `generateImageWithFallback` already handles that, and treating a
 * moderated prompt as an input-image problem would silently drop continuity
 * every time a frame contained a gladiator.
 */
export function isImageInputRejection(err: unknown): boolean {
  if (!(err instanceof OpenRouterError)) return false;
  if (isModerationError(err)) return false;
  return /image_url|multimodal|does not support image|no endpoints found|unsupported.*(input|modality)|invalid.*content/i.test(
    err.body,
  );
}

export type FrameType = 'first_frame' | 'last_frame';

export interface VideoFrame {
  url: string;
  frame_type: FrameType;
}

export interface CreateVideoParams {
  model: string;
  prompt: string;
  duration?: number;       // seconds, model-dependent
  resolution?: '480p' | '720p' | '1080p' | '2K' | '4K';
  aspect_ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  generate_audio?: boolean;
  /**
   * Frames pinning the clip.
   *
   * ONE entry is ordinary image-to-video: the clip starts here and goes wherever
   * the model likes. TWO entries — a first_frame and a last_frame — pin both
   * ends, so the clip is an interpolation between two pictures we already have.
   * That is what makes a run of clips join seamlessly: clip N ends on the exact
   * image clip N+1 begins on, so there is no cut to conceal.
   *
   * Not every model accepts `last_frame`; `supported_frame_images` on
   * /videos/models says which do, and sending an unsupported value is a 400.
   * Check before spending — see `videoModelSupports`.
   */
  frames?: VideoFrame[];
}

// ============================================================================
// VIDEO MODEL CAPABILITIES
// ============================================================================

export interface VideoModelCapability {
  id: string;
  supported_frame_images?: FrameType[];
  supported_durations?: number[];
  supported_resolutions?: string[];
}

/**
 * The per-model capability table.
 *
 * A separate endpoint from /models, which lists no video models at all — every
 * "video" entry there is a model that READS video and writes text. Public, so
 * this can be consulted before a key exists and without spending anything.
 */
export async function fetchVideoModels(signal?: AbortSignal): Promise<VideoModelCapability[]> {
  const res = await fetch(VIDEO_MODELS_ENDPOINT, { signal });
  if (!res.ok) throw new OpenRouterError(res.status, await res.text());
  const data = (await res.json()) as { data?: VideoModelCapability[] };
  return data.data ?? [];
}

/**
 * Whether `modelId` accepts this frame type.
 *
 * Returns undefined when the table could not be read, which is deliberately
 * NOT the same as false: a capability lookup that failed for network reasons
 * must not be reported to the user as "this model cannot do it". The caller
 * decides whether to proceed on an unknown.
 */
export function videoModelSupports(
  models: VideoModelCapability[] | null,
  modelId: string,
  frameType: FrameType,
): boolean | undefined {
  if (!models) return undefined;
  const entry = models.find((m) => m.id === modelId);
  if (!entry?.supported_frame_images) return undefined;
  return entry.supported_frame_images.includes(frameType);
}

export async function createVideoJob(apiKey: string, params: CreateVideoParams): Promise<VideoJob> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    duration: params.duration ?? 8,
    resolution: params.resolution ?? '720p',
    aspect_ratio: params.aspect_ratio ?? '16:9',
    generate_audio: params.generate_audio ?? true,
  };
  if (params.frames?.length) {
    body.frame_images = params.frames.map((f) => ({
      type: 'image_url',
      image_url: { url: f.url },
      frame_type: f.frame_type,
    }));
  }

  const response = await fetch(VIDEOS_ENDPOINT, {
    method: 'POST',
    headers: commonHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(response.status, text);
  }
  return (await response.json()) as VideoJob;
}

export async function getVideoJob(apiKey: string, jobId: string): Promise<VideoJob> {
  const response = await fetch(`${VIDEOS_ENDPOINT}/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: commonHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(response.status, text);
  }
  return (await response.json()) as VideoJob;
}

const TERMINAL_FAIL: VideoJobStatus[] = ['failed', 'cancelled', 'expired'];

/**
 * Turn a finished job into a URL a <video> element can actually play.
 *
 * Live run 2026-07-30: a completed Seedance job came back with NO `unsigned_urls`,
 * so the old code returned OpenRouter's `/videos/{id}/content` endpoint directly.
 * That endpoint requires an Authorization header, and a <video src> cannot send
 * one — the browser got `401 {"message":"No cookie auth credentials found"}` and
 * would have rendered a broken player. The job reported success, so nothing in the
 * app would have known.
 *
 * So when there is no directly-playable URL we fetch the bytes ourselves, with
 * credentials, and hand back a blob: URL. media-src already permits blob:.
 */
async function toPlayableUrl(apiKey: string, job: VideoJob): Promise<string> {
  // Fetch the bytes with our API key FIRST rather than trusting a URL.
  //
  // Measured twice on 2026-07-30: a completed job's `unsigned_urls[0]` is NOT
  // publicly fetchable — it answers `401 {"message":"No cookie auth credentials
  // found"}`, i.e. it expects a browser session, not a bearer token. Handing that
  // URL to a <video> element produced a silently broken player while the job
  // reported success. Downloading it ourselves is the only path that works with
  // the credential we actually hold.
  const candidates = [
    `${VIDEOS_ENDPOINT}/${encodeURIComponent(job.id)}/content?index=0`,
    ...(job.unsigned_urls ?? []),
  ];

  let res: Response | null = null;
  let lastBody = '';
  for (const candidate of candidates) {
    /**
     * THE KEY GOES TO OPENROUTER AND NOWHERE ELSE.
     *
     * `unsigned_urls` is arbitrary data out of a JSON response body — provider
     * CDN links today, whatever the response says tomorrow. Sending
     * `Authorization: Bearer <the user's key>` to every one of them handed the
     * credential to any host the response happened to name. The shipped CSP's
     * connect-src blocks those requests in production, so nothing leaked, but
     * that made a header file the ONLY control on a credential — and neither
     * `vite dev` nor `vite preview` applies it, so a developer's real key did go
     * out to whatever host was named. The origin check belongs in the code.
     *
     * It is also just correct: a cross-origin Authorization header forces a CORS
     * preflight that object storage rejects anyway.
     */
    let sameOrigin = false;
    try {
      sameOrigin = new URL(candidate, OPENROUTER_ORIGIN).origin === OPENROUTER_ORIGIN;
    } catch {
      // An unparseable candidate is not somewhere we send anything.
      lastBody = `unparseable candidate url`;
      continue;
    }

    /**
     * Each attempt is isolated. A CSP-blocked fetch REJECTS rather than
     * returning a non-ok Response, so one blocked CDN candidate used to throw
     * straight out of this function — skipping the remaining candidates and the
     * 502 below, and surfacing a bare "Failed to fetch" to someone who had just
     * waited several paid minutes for a render.
     */
    let attempt: Response;
    try {
      attempt = await fetch(candidate, sameOrigin ? { headers: commonHeaders(apiKey) } : undefined);
    } catch (err) {
      lastBody = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (attempt.ok) {
      const peek = attempt.clone();
      // A 200 carrying an error JSON is not a video; treat it as a failure
      // rather than storing 67 bytes of JSON as an mp4.
      const type = attempt.headers.get('content-type') ?? '';
      if (!/json/i.test(type)) {
        res = attempt;
        break;
      }
      lastBody = (await peek.text()).slice(0, 300);
      continue;
    }
    lastBody = (await attempt.text()).slice(0, 300);
  }
  if (!res) throw new OpenRouterError(502, `video content unavailable: ${lastBody}`);
  const blob = await res.blob();

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  // Non-browser callers (probes, tests) have no object URLs. Chunked so a
  // multi-megabyte clip cannot blow the argument limit of String.fromCharCode.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'video/mp4'};base64,${btoa(binary)}`;
}

/**
 * Submit a video job and poll until it completes. Calls `onStatus` whenever
 * the polling response status changes (useful for live UI feedback).
 */
export async function generateVideoBlocking(
  apiKey: string,
  params: CreateVideoParams,
  options: {
    onStatus?: (job: VideoJob) => void;
    pollIntervalMs?: number;
    maxWaitMs?: number;
  } = {},
): Promise<string> {
  const pollInterval = options.pollIntervalMs ?? 4000;
  const maxWait = options.maxWaitMs ?? 5 * 60 * 1000; // 5 min
  const deadline = Date.now() + maxWait;

  let job = await createVideoJob(apiKey, params);
  options.onStatus?.(job);

  if (job.status === 'completed') return toPlayableUrl(apiKey, job);

  let lastStatus: VideoJobStatus = job.status;
  let pollFailures = 0;
  while (Date.now() < deadline) {
    if (job.status === 'completed') return toPlayableUrl(apiKey, job);
    if (TERMINAL_FAIL.includes(job.status)) {
      throw new Error(`Video job ${job.status}${job.error ? `: ${job.error}` : ''}`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
    /**
     * A POLL FAILURE IS NOT A LOST FILM.
     *
     * This was `job = await getVideoJob(...)` bare, so a single transient
     * network blip — one dropped connection during a render the provider was
     * still working on — threw out of the whole function and discarded a clip
     * the user had already paid several minutes for. The job keeps rendering on
     * the provider's side regardless; only our handle on it was being dropped.
     *
     * Three consecutive failures are tolerated, with the interval backing off,
     * before we give up. A single success resets the counter.
     */
    try {
      job = await getVideoJob(apiKey, job.id);
      pollFailures = 0;
    } catch (err) {
      pollFailures++;
      if (pollFailures > MAX_POLL_FAILURES) {
        throw new Error(
          `lost contact with video job ${job.id} after ${pollFailures} failed polls: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
      continue;
    }
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      options.onStatus?.(job);
    }
  }

  // One last look before giving up. The loop condition is checked BEFORE the
  // status is re-read, so a job that finished during the final sleep was
  // reported as a timeout and its fully-paid render thrown away.
  job = await getVideoJob(apiKey, job.id);
  if (job.status === 'completed') return toPlayableUrl(apiKey, job);

  throw new Error(`Video job timed out after ${Math.round(maxWait / 1000)}s (last status: ${job.status})`);
}
