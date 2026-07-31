/**
 * Pure formatting helpers + temporal constants. Extracted from the v1 dashboard so
 * library modules (history thumbnails, share-card export) can reuse them.
 */

/**
 * Deep time. The dial used to bottom out at 3000 BC, which is barely a blink —
 * it excluded the entire prehistoric record and, more to the point, the
 * dinosaurs. MIN_YEAR is now the start of the Triassic.
 */
export const MIN_YEAR = -252_000_000;
export const MAX_YEAR = 3050;

/**
 * Human-readable year across nine orders of magnitude.
 *
 * "66000000 BC" is unreadable and, worse, wrong in register: nobody dates the
 * Cretaceous in BC. Deep time switches to "million years ago" / "years ago",
 * which is how the periods are actually spoken about, and the BC/AD convention is
 * kept only where it belongs.
 */
export function formatYear(year: number): string {
  const ago = Math.abs(year);
  if (year < -1_000_000) {
    const millions = ago / 1_000_000;
    const rounded = millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10;
    return `${rounded} million years ago`;
  }
  if (year < -12_000) return `${Math.round(ago).toLocaleString('en-US')} years ago`;
  if (year < 0) return `${Math.round(ago).toLocaleString('en-US')} BC`;
  if (year === 0) return '1 AD';
  return `${year} AD`;
}

export function getEraDescription(year: number): string {
  if (year < -201_000_000) return 'Triassic';
  if (year < -145_000_000) return 'Jurassic';
  if (year < -66_000_000) return 'Cretaceous';
  if (year < -23_000_000) return 'Paleogene';
  if (year < -2_600_000) return 'Neogene';
  if (year < -11_700) return 'Pleistocene';
  if (year < -3000) return 'Neolithic';
  if (year < -2000) return 'Ancient Bronze Age';
  if (year < -500) return 'Classical Antiquity';
  if (year < 500) return 'Roman Era';
  if (year < 1000) return 'Dark Ages';
  if (year < 1400) return 'Medieval Period';
  if (year < 1600) return 'Renaissance';
  if (year < 1800) return 'Age of Enlightenment';
  if (year < 1900) return 'Industrial Revolution';
  if (year < 1950) return 'Early Modern Era';
  if (year < 2000) return 'Late 20th Century';
  if (year < 2030) return 'Early Digital Age';
  if (year < 2100) return 'Near Future';
  if (year < 2500) return 'Advanced Future';
  return 'Far Future';
}

/**
 * Colour for a year.
 *
 * Was a linear fraction of (year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR). Once
 * MIN_YEAR became -252,000,000 that denominator was 252 million, so the two
 * thresholds fell at 176 and 100 million years ago: every year from the
 * Cretaceous through 3050 AD collapsed to the identical gold — 139 of the 146
 * stations, including the whole of recorded history. Reading the band's own
 * colour keeps it meaningful at every scale, and cannot drift when the range
 * changes again.
 */
export function getYearColor(year: number): string {
  return getEraBand(year).color;
}

export interface EraBand {
  id: string;
  start: number;
  end: number; // exclusive upper bound
  label: string;
  color: string;
}

// Era bands matching getEraDescription ranges, colored along a purple→cyan→gold gradient.
export const ERA_BANDS: EraBand[] = [
  { id: 'triassic',     start: MIN_YEAR,       end: -201_000_000, label: 'Triassic',           color: '#7c2d12' },
  { id: 'jurassic',     start: -201_000_000,   end: -145_000_000, label: 'Jurassic',           color: '#166534' },
  { id: 'cretaceous',   start: -145_000_000,   end: -66_000_000,  label: 'Cretaceous',         color: '#15803d' },
  { id: 'paleogene',    start: -66_000_000,    end: -23_000_000,  label: 'Paleogene',          color: '#0f766e' },
  { id: 'neogene',      start: -23_000_000,    end: -2_600_000,   label: 'Neogene',            color: '#0e7490' },
  { id: 'pleistocene',  start: -2_600_000,     end: -11_700,      label: 'Pleistocene',        color: '#64748b' },
  { id: 'neolithic',    start: -11_700,        end: -3000,        label: 'Neolithic',          color: '#7c5e3c' },
  { id: 'bronze',       start: -3000,          end: -2000, label: 'Ancient Bronze Age',    color: '#5b21b6' },
  { id: 'classical',    start: -2000,    end: -500,  label: 'Classical Antiquity',   color: '#7c3aed' },
  { id: 'roman',        start: -500,     end: 500,   label: 'Roman Era',             color: '#9D4EDD' },
  { id: 'dark',         start: 500,      end: 1000,  label: 'Dark Ages',             color: '#a855f7' },
  { id: 'medieval',     start: 1000,     end: 1400,  label: 'Medieval Period',       color: '#c084fc' },
  { id: 'renaissance',  start: 1400,     end: 1600,  label: 'Renaissance',           color: '#22d3ee' },
  { id: 'enlightenment',start: 1600,     end: 1800,  label: 'Age of Enlightenment',  color: '#06b6d4' },
  { id: 'industrial',   start: 1800,     end: 1900,  label: 'Industrial Revolution', color: '#00ffff' },
  { id: 'early-modern', start: 1900,     end: 1950,  label: 'Early Modern Era',      color: '#67e8f9' },
  { id: 'late-20',      start: 1950,     end: 2000,  label: 'Late 20th Century',     color: '#fde047' },
  { id: 'digital',      start: 2000,     end: 2030,  label: 'Early Digital Age',     color: '#FFD700' },
  { id: 'near-future',  start: 2030,     end: 2100,  label: 'Near Future',           color: '#fb923c' },
  { id: 'advanced',     start: 2100,     end: 2500,  label: 'Advanced Future',       color: '#f97316' },
  { id: 'far-future',   start: 2500,     end: MAX_YEAR + 1, label: 'Far Future',     color: '#ea580c' },
];

export function getEraBand(year: number): EraBand {
  return ERA_BANDS.find((b) => year >= b.start && year < b.end) ?? ERA_BANDS[ERA_BANDS.length - 1]!;
}
