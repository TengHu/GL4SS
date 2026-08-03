/**
 * THE PRODUCTION SWEEP, FROM THE TERMINAL.
 *
 * Not a re-implementation. Every step below is the module the portal itself
 * calls, imported out of ../src — planStandpoint, generateSceneDirection,
 * segmentAnachronisms, compositeCutout, buildSweepPrompts, renderStill. The only
 * things this file supplies are the four browser globals those modules reach for
 * (see dom.ts) and the loop that coreSample.start() would otherwise be running.
 *
 * So a result here is a result about the pipeline, and a change to the pipeline
 * shows up here without being copied across.
 *
 *   npm run sweep -- Colosseum-1.jpg --from 2010 --to 1700
 *   npm run sweep -- Colosseum-1.jpg --from 2010 --to 1700 --stations 1900,1800
 *
 * What is NOT replicated, and why: the archive (there is nothing to restore —
 * the seed is the file you pass), the queue and its concurrency (one station at
 * a time is the point), and the UI. Everything that touches a model is the
 * shipping path.
 */
import './dom.ts';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { planStandpoint, generateSceneDirection, imageModelForMode, DEFAULT_MODEL_SELECTION } from '../src/lib/openrouter.ts';
import type { StandpointCamera } from '../src/lib/openrouter.ts';
import { buildSweepPrompts } from '../src/lib/promptcraft.ts';
import { segmentAnachronisms, compositeCutout } from '../src/portal/lib/timeMask.ts';
import { cameraIsUsable, horizonFraction } from '../src/portal/lib/cameraSkeleton.ts';
import { renderStill } from '../src/portal/lib/render.ts';

// ---------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name: string, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const has = (name: string) => argv.includes(`--${name}`);

const seedFile = argv[0]?.startsWith('--') ? '' : argv[0];
const seedYear = Number(flag('from', '2010'));
const targetYear = Number(flag('to', '1700'));
const place = flag('place', 'the Colosseum, Rome');
const lat = Number(flag('lat', '41.8902'));
const lng = Number(flag('lng', '12.4922'));
const outRoot = flag('out', 'probe-out');
const noCut = has('no-cut');
const stations = flag('stations', '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n !== 0);

const models = {
  ...DEFAULT_MODEL_SELECTION,
  text: flag('text-model', DEFAULT_MODEL_SELECTION.text),
  wideField: flag('model', DEFAULT_MODEL_SELECTION.wideField),
};

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
if (!seedFile) throw new Error('usage: npm run sweep -- <image> --from 2010 --to 1700');

// `window.__noCut` is read by coreSample; the same switch is honoured here so
// the two agree about what the flag means.
(globalThis as unknown as { __noCut?: boolean }).__noCut = noCut;

// -------------------------------------------------------------------- set-up
const dataUrl = (file: string) => {
  const ext = extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};

const outDir = join(outRoot, `${basename(seedFile, extname(seedFile))}-${seedYear}-to-${targetYear}${noCut ? '-raw' : ''}`);
mkdirSync(outDir, { recursive: true });

const coordinates = { lat, lng };
const model = imageModelForMode('wide-field', models);
const years = [seedYear, ...stations, targetYear];

console.log(`seed ${seedYear} -> ${years.slice(1).join(' -> ')}   ${model}`);
console.log(`place "${place}" (${lat}, ${lng})   ${noCut ? 'RAW source' : 'cut-out + uncut neighbour'}\n`);

// ------------------------------------------- ONCE PER SWEEP: the standpoint
const seedUrl = dataUrl(seedFile);
const t0 = Date.now();
const sp = await planStandpoint(
  apiKey, place, coordinates, seedUrl, seedYear,
  { earliest: Math.min(...years), latest: Math.max(...years) },
  models.text,
);
const camera: StandpointCamera | undefined = sp.camera;
console.log(`standpoint  ${sp.camera ? JSON.stringify(sp.camera) : 'no camera numbers'}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (camera && !cameraIsUsable(camera)) console.log('            ^ rejected: no grid, no drift check');
writeFileSync(join(outDir, 'standpoint.json'), JSON.stringify(sp, null, 2));

// --------------------------------------------------- PER STATION: the chain
let sourceUrl = seedUrl;
let sourceYear = seedYear;

for (const year of years.slice(1)) {
  const label = `${year}`;
  console.log(`\n[${label}] from ${sourceYear}`);
  const stamp = (m: string, t: number) => console.log(`  ${m}  ${((Date.now() - t) / 1000).toFixed(1)}s`);

  // 1. the planner — sees the source, knows the date
  let tp = Date.now();
  const direction = await generateSceneDirection(
    apiKey, place, coordinates, year, 'wide-field', models.text, null,
    { reference: sourceUrl, referenceKind: 'sweep', referenceYear: sourceYear },
  );
  stamp(`planner   habitation=${direction.habitation ?? '-'}${direction.isFallback ? '  (FALLBACK)' : ''}`, tp);

  // 2. the anachronism pass + 3. the cut
  let masked: string | null = null;
  let reference: string | null = null;
  if (noCut) {
    reference = sourceUrl;
    console.log('  no-cut    the whole source goes, crowd and all');
  } else {
    tp = Date.now();
    const items = await segmentAnachronisms(apiKey, sourceUrl, sourceYear, year, place, models.text);
    const absent = items.filter((a) => a.change === 'absent').length;
    stamp(`segment   ${items.length} boxes (${absent} absent)`, tp);
    writeFileSync(join(outDir, `${label}-boxes.json`), JSON.stringify(items, null, 2));
    if (items.length) masked = await compositeCutout(sourceUrl, items, camera);
    if (masked) writeFileSync(join(outDir, `${label}-cutout.png`), Buffer.from(masked.split(',')[1]!, 'base64'));
    reference = masked ?? sourceUrl;
  }

  // 4. the prompt — the shipping builder, with the shipping flags
  const opts = {
    location: place,
    year,
    styleSuffix: null,
    periodProcess: false,
    phase: undefined,
    standpoint: reference ? sp.cameraText : sp.text,
    horizonFromTop: cameraIsUsable(camera) ? horizonFraction(camera.hfovDeg, camera.tiltDeg, 16 / 9) : undefined,
    // Exactly what coreSample passes, so the prompt built here is the prompt
    // the portal would have built.
    cutout: Boolean(masked),
    cameraReferenceYear: masked ? sourceYear : undefined,
    cameraGrid: Boolean(masked) && cameraIsUsable(camera),
    wholeSourceYear: !masked ? sourceYear : undefined,
  };
  const prompts = buildSweepPrompts(opts, direction);
  const promptsNoDiagram = reference ? buildSweepPrompts({ ...opts, cutout: false, cameraReferenceYear: undefined, wholeSourceYear: undefined, cameraGrid: false }, direction) : prompts;
  writeFileSync(join(outDir, `${label}-prompt.txt`), prompts[0]!);
  console.log(`  prompt    ${prompts[0]!.split(/\s+/).length} words · ${masked ? 2 : 1} reference(s)`);

  // 5. the image — renderStill, the same primitive the lever uses
  tp = Date.now();
  const { url, anchored } = await renderStill(
    apiKey,
    {
      model,
      prompts,
      references: masked ? [masked, sourceUrl] : reference ? [reference] : undefined,
      unanchoredPrompts: promptsNoDiagram,
    },
    { onDegrade: (note) => console.log(`  degraded  ${note}`) },
  );
  stamp(`image     reference ${anchored ? 'ACCEPTED' : 'REFUSED — drawn from prose'}`, tp);

  const bytes = url.startsWith('data:')
    ? Buffer.from(url.split(',')[1]!, 'base64')
    : Buffer.from(await (await fetch(url)).arrayBuffer());
  const dest = join(outDir, `${label}.png`);
  writeFileSync(dest, bytes);
  console.log(`  saved     ${dest}`);

  // 6. the drift check — measured, same thresholds
  if (cameraIsUsable(camera)) {
    const again = await planStandpoint(apiKey, place, coordinates, url, year, { earliest: year, latest: year }, models.text);
    if (cameraIsUsable(again.camera)) {
      const a = camera, b = again.camera;
      const dH = horizonFraction(b.hfovDeg, b.tiltDeg, 16 / 9) - horizonFraction(a.hfovDeg, a.tiltDeg, 16 / 9);
      const dE = (b.eyeHeightM - a.eyeHeightM) / Math.max(a.eyeHeightM, 0.3);
      console.log(
        `  camera    ${b.eyeHeightM.toFixed(0)}m / tilt ${b.tiltDeg.toFixed(0)}° / fov ${b.hfovDeg.toFixed(0)}°` +
          `  vs seed ${a.eyeHeightM.toFixed(0)}m / ${a.tiltDeg.toFixed(0)}° / ${a.hfovDeg.toFixed(0)}°` +
          `  — horizon ${(dH * 100).toFixed(0)}%, height ${(dE * 100).toFixed(0)}%`,
      );
    }
  }

  // THE CHAIN: the next station cuts from this frame, not from the seed.
  sourceUrl = url.startsWith('data:') ? url : `data:image/png;base64,${bytes.toString('base64')}`;
  sourceYear = year;
}

console.log(`\ndone -> ${outDir}`);
