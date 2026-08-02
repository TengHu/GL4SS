/**
 * Aesthetic style presets — chips the user picks to override the look of
 * generated imagery & video without writing prompts by hand.
 */

export interface StylePreset {
  id: string;
  label: string;
  /** Color used for the chip when selected. */
  color: string;
  /** Suffix appended to every image / video prompt. `null` = no override. */
  suffix: string | null;
  /**
   * True when this style still describes a PHOTOGRAPH.
   *
   * `styled` was doing two jobs at once — "authors its own colour" and "is not a
   * photograph" — and four presets here are photographic PROCESSES: infrared is
   * Aerochrome film, tilt-shift is a lens movement, dashcam is found footage,
   * noir is black-and-white film. All four were handed "Composed with ...",
   * throwing away the capture register the style is asking for.
   *
   * An explicit flag beats sniffing the suffix text: the regex fallback (kept
   * only for the custom free-text slot) misread infrared's own "foliage RENDERED
   * in vivid magenta" as a 3D render — the flagship case of the bug it exists to
   * fix. Set `photographic: true` on noir, dashcam, infrared and tiltshift;
   * leave it unset on cyberpunk, vaporwave, oil, anime, impressionist, inkwash,
   * graphicnovel and custom.
   */
  photographic?: boolean;
  /**
   * Render as the photographic process that actually existed in the year.
   *
   * The only style whose text cannot be a fixed suffix — a daguerreotype and a
   * digital sensor are different sentences — so it is a flag, and the year to
   * process table lives in promptcraft next to the other era logic. The `suffix`
   * below still carries the general claim, which is what makes the era palette
   * stand aside as it does for every other style.
   */
  periodProcess?: boolean;
  /** The free-text slot: its suffix is whatever the user typed in settings. */
  isCustom?: boolean;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'none', label: 'None', color: '#9ca3af', suffix: null },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    color: '#ff00aa',
    suffix:
      'Neon-drenched cyberpunk aesthetic, holographic signs, rain-slick streets, vivid magenta and cyan glow, blade-runner cinematography.',
  },
  {
    id: 'noir',
    label: 'Noir Film',
    color: '#f1f5f9',
    suffix:
      'Black and white film noir aesthetic, deep chiaroscuro shadows, venetian-blind light, smoke, 1940s detective cinematography.',
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave',
    color: '#f0abfc',
    suffix:
      'Vaporwave aesthetic, pastel pink and cyan, retro 80s synthwave, glitch artifacts, sunset gradients, marble statues.',
  },
  {
    id: 'oil',
    label: 'Oil Painting',
    color: '#fb923c',
    suffix:
      'Classical oil painting, visible brush strokes, dramatic chiaroscuro lighting, Caravaggio influence, museum-quality.',
  },
  {
    id: 'dashcam',
    label: 'Dashcam',
    color: '#facc15',
    suffix:
      'Grainy dashcam footage aesthetic, slight motion blur, timestamp overlay in corner, low-light auto-iris artifacts, found-footage realism.',
  },
  {
    id: 'anime',
    label: 'Anime',
    color: '#fda4af',
    suffix:
      'Modern anime cinematic style, vibrant cel shading, dramatic lighting, expressive composition, Makoto Shinkai influence.',
  },
  {
    id: 'impressionist',
    label: 'Impressionist',
    color: '#a8d8b9',
    suffix:
      'Impressionist oil painting, broken brushwork in short thick strokes, colour mixed on the canvas rather than the palette, light and weather as the true subject, soft edges throughout.',
  },
  {
    id: 'inkwash',
    label: 'Ink Wash',
    color: '#cbd5e1',
    suffix:
      'Ink wash painting, monochrome black ink on absorbent paper, confident single-stroke linework, large areas of untouched paper as negative space, mist suggested rather than drawn.',
  },
  {
    id: 'graphicnovel',
    label: 'Graphic Novel',
    color: '#fca5a5',
    suffix:
      'Graphic novel illustration, heavy inked contours, cross-hatched shadows, flat spot colour over line art, dramatic high-contrast panel composition.',
  },
  {
    id: 'infrared',
    label: 'Infrared',
    color: '#f0abfc',
    suffix:
      'Aerochrome false-colour infrared photography, foliage rendered in vivid magenta and crimson, skies deep cyan, surreal but photographic, fine grain.',
  },
  {
    id: 'tiltshift',
    label: 'Tilt-shift',
    color: '#fcd34d',
    suffix:
      'Tilt-shift photography, extremely shallow plane of focus with strong blur above and below, saturated colour, the scene reading as a meticulously built miniature.',
  },
  {
    id: 'period',
    label: 'Period Process',
    color: '#b8a894',
    suffix:
      'Photographed by the process that actually existed in this year, with its real limitations rather than a modern camera made to look old.',
    photographic: true,
    periodProcess: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    color: '#93c5fd',
    // Filled from the user's own text in settings; null until they write one.
    suffix: null,
    isCustom: true,
  },
];

export const CUSTOM_STYLE_ID = 'custom';
export const DEFAULT_STYLE_ID = 'none';

export function findStyle(id: string | null | undefined): StylePreset {
  const found = STYLE_PRESETS.find((s) => s.id === id);
  return found ?? STYLE_PRESETS[0]!;
}
