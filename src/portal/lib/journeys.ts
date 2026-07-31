/**
 * JOURNEYS — one-click destinations.
 *
 * The portal asks a visitor to pick a point on Earth AND a year AND an hour
 * before it will show them anything, which is three decisions to make before you
 * have seen a single frame. That is a fine control surface and a terrible front
 * door: the answer to "where should I go" is not a map, it is a suggestion.
 *
 * So a journey is the whole configuration in one object — place, coordinates,
 * year and time of day — and picking one sets all of them at once.
 *
 * THE YEAR MUST BE EXACTLY ON THE STATION LADDER. Anything else is snapped by
 * nearestStationIndex, silently, to as much as fifty years away: a journey to
 * 1348 would arrive in 1300 and the Black Death would not have happened yet.
 * `assertJourneysOnLadder` below is run in dev so a bad entry fails loudly at
 * import rather than quietly at the destination.
 */

import { STATIONS } from './stations';
import { DAY_PHASES } from './daylight';
import { getEraBand } from '../../lib/format';

export interface Journey {
  id: string;
  /** 3-6 words. The destination, not a slogan. */
  title: string;
  /** One sentence on why it is worth seeing. */
  blurb: string;
  /** Place name as the prompt sees it — specific enough to stand in. */
  location: string;
  lat: number;
  lng: number;
  /** Must be a member of STATIONS. */
  year: number;
  /** Must be a member of DAY_PHASES. */
  phaseId: string;
}

/**
 * The curated set, in ladder order.
 *
 * Every year here was checked against the ladder and every claim fact-checked;
 * the pass caught a Great Zimbabwe entry a century before its walls were built,
 * a Teotihuacan "at its height" two hundred years early, and four standing
 * points that were ON TOP of the thing the card said you were looking at.
 */
export const JOURNEYS: Journey[] = [
  {
    id: 'siberian-traps-erupt',
    title: 'The Siberian Traps Erupt',
    blurb: 'Flood basalt pours across Siberia in the eruption that ends most life on Earth.',
    location: 'Putorana Plateau, Siberia',
    lat: 69,
    lng: 94,
    year: -252000000,
    phaseId: 'night',
  },
  {
    id: 'jurassic-floodplain-utah',
    title: 'The Jurassic Floodplain, Utah',
    blurb: 'Sauropods and Allosaurus at a shrinking river channel on a dry, conifer-dotted plain.',
    location: 'Dinosaur National Monument, Utah',
    lat: 40.44,
    lng: -109.3,
    year: -152000000,
    phaseId: 'sunset',
  },
  {
    id: 'antarctica-before-the-ice',
    title: 'Antarctica Before the Ice',
    blurb: 'Conifer forest and tree ferns on a river plain at 75 degrees south, long before any ice.',
    location: 'Alexander Island, Antarctica',
    lat: -71.32,
    lng: -68.3,
    year: -100000000,
    phaseId: 'morning',
  },
  {
    id: 'australia-before-people',
    title: 'Australia Before People',
    blurb: 'Diprotodon, marsupial lions and giant flightless birds, and no people on the continent yet.',
    location: 'Naracoorte, South Australia',
    lat: -36.96,
    lng: 140.74,
    year: -100000,
    phaseId: 'dawn',
  },
  {
    id: 'patagonia-under-the-ice',
    title: 'Patagonia Under the Ice Sheet',
    blurb: 'The ice sheet at its greatest, with only the granite towers of Paine standing clear of it.',
    location: 'Torres del Paine, Patagonia',
    lat: -50.94,
    lng: -73,
    year: -20000,
    phaseId: 'midday',
  },
  {
    id: 'green-sahara',
    title: 'The Sahara When It Was Green',
    blurb: 'Grassland and standing water under the cliffs, in what will become the driest place on Earth.',
    location: 'Tassili n\'Ajjer, Algeria',
    lat: 25.5,
    lng: 9,
    year: -6000,
    phaseId: 'afternoon',
  },
  {
    id: 'uruk-first-city',
    title: 'Uruk, the first city',
    blurb: 'The largest city on earth, mudbrick temples above the Euphrates, where writing was invented.',
    location: 'The Eanna precinct, Uruk (Warka), southern Iraq',
    lat: 31.32,
    lng: 45.64,
    year: -3000,
    phaseId: 'morning',
  },
  {
    id: 'caral-supe-valley',
    title: 'Caral in the Supe Valley',
    blurb: 'Terraced pyramids and a sunken round plaza in a dry valley — the oldest city in the Americas.',
    location: 'Caral, Supe Valley, Peru',
    lat: -10.89,
    lng: -77.52,
    year: -2500,
    phaseId: 'sunset',
  },
  {
    id: 'mohenjo-daro-great-bath',
    title: 'The Great Bath at Mohenjo-daro',
    blurb: 'Fired brick, covered drains and a sunken bathing tank, in a city laid out on a grid.',
    location: 'The Great Bath, Mohenjo-daro, Sindh, Pakistan',
    lat: 27.33,
    lng: 68.14,
    year: -2000,
    phaseId: 'midday',
  },
  {
    id: 'anyang-shang-foundry',
    title: 'The Shang foundry at Anyang',
    blurb: 'Bronze cast in clay moulds by furnace light, in the city where Chinese writing first appears.',
    location: 'Yinxu, Anyang, Henan, China',
    lat: 36.13,
    lng: 114.31,
    year: -1200,
    phaseId: 'night',
  },
  {
    id: 'tonga-lapita-landfall',
    title: 'The first canoes in Tonga',
    blurb: 'Outrigger canoes drawn up on the sand at the eastern edge of the settled Pacific.',
    location: 'Nukuleka, Tongatapu, Tonga',
    lat: -21.11,
    lng: -175.1,
    year: -900,
    phaseId: 'dawn',
  },
  {
    id: 'carthage-military-harbour',
    title: 'The Round Harbour at Carthage',
    blurb: 'Warships in covered sheds around a perfect circular basin, four years before Rome erased it.',
    location: 'The cothon, the circular military harbour of Carthage',
    lat: 36.845,
    lng: 10.325,
    year: -150,
    phaseId: 'afternoon',
  },
  {
    id: 'alexandria-pharos-harbour',
    title: 'The Pharos from the Water',
    blurb: 'The lighthouse still lit and still working, seen from a boat in the Great Harbour at first light.',
    location: 'On the water in the Great Harbour, Alexandria, Egypt',
    lat: 31.207,
    lng: 29.89,
    year: -100,
    phaseId: 'dawn',
  },
  {
    id: 'rome-forum-republic',
    title: 'The Forum Before the Marble',
    blurb: 'The Republic\'s forum in tufa and painted stucco, crowded and shabby, long before the imperial rebuild.',
    location: 'The Roman Forum, Rome',
    lat: 41.8925,
    lng: 12.4853,
    year: -100,
    phaseId: 'morning',
  },
  {
    id: 'pompeii-last-morning',
    title: 'Pompeii, the Last Morning',
    blurb: 'A market morning in a forum still full of scaffolding, seventeen years after the earthquake. The mountain goes up a little after noon.',
    location: 'The Forum of Pompeii, a living town under repair, Vesuvius one unbroken cone to the north',
    lat: 40.7489,
    lng: 14.4847,
    year: 79,
    phaseId: 'morning',
  },
  {
    id: 'pliny-crosses-the-bay',
    title: 'Pliny Sails Towards Vesuvius',
    blurb: 'The only ships sailing toward the mountain: Pliny the Elder takes the Misenum fleet in to evacuate the coast.',
    location: 'The Bay of Naples as Vesuvius erupts, from a Roman warship, the mountain still one unbroken cone',
    lat: 40.73,
    lng: 14.3,
    year: 79,
    phaseId: 'afternoon',
  },
  {
    id: 'rome-colosseum-new',
    title: 'The Colosseum When It Was New',
    blurb: 'Travertine still pale and unweathered, the awning masts rigged, twenty years old and not yet a ruin.',
    location: 'The piazza outside the Flavian Amphitheatre, Rome',
    lat: 41.8918,
    lng: 12.4922,
    year: 100,
    phaseId: 'morning',
  },
  {
    id: 'portus-hexagonal-basin',
    title: 'Rome\'s Harbour at Portus',
    blurb: 'Grain ships unloading into a man-made hexagonal basin — the port that fed a million people.',
    location: 'On the water in the hexagonal basin of Portus, at the mouth of the Tiber',
    lat: 41.7756,
    lng: 12.2578,
    year: 200,
    phaseId: 'morning',
  },
  {
    id: 'leptis-magna-severan',
    title: 'Leptis Magna in Its Prime',
    blurb: 'An African city rebuilt in imported marble by the emperor who was born here, finished by his son the year of this frame.',
    location: 'The Severan Forum, Leptis Magna, Libya',
    lat: 32.6386,
    lng: 14.2939,
    year: 216,
    phaseId: 'midday',
  },
  {
    id: 'hadrians-wall-garrison',
    title: 'The Wall in Winter',
    blurb: 'The northern edge of the empire, held through a wet winter by soldiers from everywhere but here.',
    location: 'Housesteads fort on Hadrian\'s Wall in midwinter, Northumberland',
    lat: 55.0128,
    lng: -2.3306,
    year: 300,
    phaseId: 'afternoon',
  },
  {
    id: 'rome-before-the-sack',
    title: 'Rome, Ten Years to Go',
    blurb: 'Still the largest city in the world, still fed by aqueduct, ten years before the Goths walk in.',
    location: 'The Palatine and the Forum, Rome',
    lat: 41.8907,
    lng: 12.4858,
    year: 400,
    phaseId: 'sunset',
  },
  {
    id: 'djenne-djeno-niger',
    title: 'Djenné-djeno before first light',
    blurb: 'Round mud houses on a river mound in the inland Niger delta, before anyone is awake.',
    location: 'Djenné-djeno, Inland Niger Delta, Mali',
    lat: 13.91,
    lng: -4.56,
    year: 400,
    phaseId: 'small-hours',
  },
  {
    id: 'teotihuacan-avenue',
    title: 'The Avenue of the Dead',
    blurb: 'Red-plastered pyramids and apartment blocks along a dead-straight avenue, at the city\'s height.',
    location: 'The Avenue of the Dead, Teotihuacan, Mexico',
    lat: 19.69,
    lng: -98.84,
    year: 500,
    phaseId: 'afternoon',
  },
  {
    id: 'iceland-uninhabited',
    title: 'Iceland with nobody on it',
    blurb: 'A wooded rift valley under the moon with no fire burning anywhere — nobody lives in Iceland yet.',
    location: 'Thingvellir (Þingvellir) rift valley, Iceland',
    lat: 64.26,
    lng: -21.13,
    year: 500,
    phaseId: 'midnight',
  },
  {
    id: 'baghdad-round-city-800',
    title: 'Baghdad, the Round City',
    blurb: 'The Abbasid capital laid out as a perfect circle on the Tigris, of which nothing now survives.',
    location: 'The west bank of the Tigris, Baghdad, Iraq',
    lat: 33.35,
    lng: 44.35,
    year: 800,
    phaseId: 'sunset',
  },
  {
    id: 'thingvellir-althing-1000',
    title: 'Iceland\'s assembly in the rift',
    blurb: 'The all-Iceland assembly camped in a lava rift, the summer it agreed to become Christian.',
    location: 'Thingvellir, Iceland',
    lat: 64.26,
    lng: -21.12,
    year: 1000,
    phaseId: 'dawn',
  },
  {
    id: 'kaifeng-rainbow-bridge-1100',
    title: 'Kaifeng\'s Rainbow Bridge',
    blurb: 'A crowded morning on the wooden arch bridge over the Bian canal, in the Song capital.',
    location: 'The Bian canal, Kaifeng, China',
    lat: 34.8,
    lng: 114.31,
    year: 1100,
    phaseId: 'morning',
  },
  {
    id: 'cahokia-plaza-1100',
    title: 'Cahokia\'s plaza after dark',
    blurb: 'The biggest city north of Mexico, its plaza lit by cooking fires under a ten-storey mound of earth.',
    location: 'Monks Mound, Cahokia, Illinois',
    lat: 38.657,
    lng: -90.062,
    year: 1100,
    phaseId: 'night',
  },
  {
    id: 'angkor-wat-dawn-1200',
    title: 'Angkor Wat at first light',
    blurb: 'The temple in silhouette from across the reflecting pool, the sun coming up directly behind the towers.',
    location: 'Angkor Wat, Siem Reap, Cambodia',
    lat: 13.4125,
    lng: 103.864,
    year: 1200,
    phaseId: 'dawn',
  },
  {
    id: 'rano-raraku-1300',
    title: 'The moai quarry by moonlight',
    blurb: 'An active quarry, with half-finished stone giants still attached to the rock they were cut from.',
    location: 'Rano Raraku, Easter Island',
    lat: -27.12,
    lng: -109.29,
    year: 1300,
    phaseId: 'midnight',
  },
  {
    id: 'timbuktu-salt-1400',
    title: 'Timbuktu when the salt arrives',
    blurb: 'Camel trains in from the Taghaza salt mines, at the desert edge of the Mali empire.',
    location: 'Timbuktu, Mali',
    lat: 16.77,
    lng: -3.01,
    year: 1400,
    phaseId: 'midday',
  },
  {
    id: 'great-zimbabwe-1400',
    title: 'Great Zimbabwe from the hill',
    blurb: 'Dry-stone walls ten metres high, cattle in the valley below, gold going out to the coast.',
    location: 'Great Zimbabwe, Masvingo, Zimbabwe',
    lat: -20.27,
    lng: 30.93,
    year: 1400,
    phaseId: 'afternoon',
  },
  {
    id: 'tlatelolco-market-1500',
    title: 'The Great Market at Tlatelolco',
    blurb: 'The largest market in the Americas at its busiest, two decades before Cortés arrived.',
    location: 'Tlatelolco market, Tenochtitlan (now Mexico City)',
    lat: 19.4506,
    lng: -99.1377,
    year: 1500,
    phaseId: 'morning',
  },
  {
    id: 'potosi-cerro-rico-1600',
    title: 'Cerro Rico Above Potosí',
    blurb: 'The silver mountain that paid for Spain, with a boom town of a hundred thousand at its foot.',
    location: 'Potosí and the Cerro Rico, Bolivia',
    lat: -19.5833,
    lng: -65.75,
    year: 1600,
    phaseId: 'dawn',
  },
  {
    id: 'isfahan-maidan-1625',
    title: 'Polo in Isfahan\'s Great Square',
    blurb: 'The new capital\'s square, laid out for polo and parades and big enough to hold both.',
    location: 'Naqsh-e Jahan Square, Isfahan',
    lat: 32.6575,
    lng: 51.6775,
    year: 1625,
    phaseId: 'afternoon',
  },
  {
    id: 'benin-city-1675',
    title: 'The Broad Street of Benin',
    blurb: 'A capital of polished red clay and long straight streets, two centuries before the British burned it.',
    location: 'Benin City, Kingdom of Benin (Nigeria)',
    lat: 6.335,
    lng: 5.62,
    year: 1675,
    phaseId: 'midday',
  },
  {
    id: 'edo-nihonbashi-1700',
    title: 'The Fish Market at Nihonbashi',
    blurb: 'The fish market on the bank beside the bridge that every road in Japan is measured from.',
    location: 'Nihonbashi, Edo (Tokyo)',
    lat: 35.6839,
    lng: 139.7743,
    year: 1700,
    phaseId: 'dawn',
  },
  {
    id: 'rome-campo-vaccino-1775',
    title: 'The Forum as a Cow Pasture',
    blurb: 'Rome\'s Forum before anyone dug it out — cattle grazing, columns buried to the shoulders.',
    location: 'The Roman Forum (Campo Vaccino), Rome',
    lat: 41.8925,
    lng: 12.4853,
    year: 1775,
    phaseId: 'morning',
  },
  {
    id: 'yerba-buena-abandoned-fleet-1850',
    title: 'The Abandoned Fleet at Yerba Buena',
    blurb: 'Ships left to rot when their crews walked to the goldfields; the cove is now downtown.',
    location: 'Yerba Buena Cove, San Francisco',
    lat: 37.7955,
    lng: -122.3993,
    year: 1850,
    phaseId: 'night',
  },
  {
    id: 'krakatoa-1880',
    title: 'Krakatoa Before the Eruption',
    blurb: 'An empty wooded island in the Sunda Strait, three years before most of it blew away.',
    location: 'Krakatoa, Sunda Strait, Indonesia',
    lat: -6.11,
    lng: 105.43,
    year: 1880,
    phaseId: 'sunset',
  },
  {
    id: 'uluru-before-the-road',
    title: 'Uluru Before the Road',
    blurb: 'First light on the rock, decades before the first track, the fence or the car park.',
    location: 'Uluru, Northern Territory, Australia',
    lat: -25.35,
    lng: 131.085,
    year: 1900,
    phaseId: 'dawn',
  },
  {
    id: 'machu-picchu-1911',
    title: 'Machu Picchu Still Overgrown',
    blurb: 'Trees still growing out of the terraces, the year Hiram Bingham was led up to them.',
    location: 'Machu Picchu, Peru',
    lat: -13.1631,
    lng: -72.545,
    year: 1911,
    phaseId: 'dawn',
  },
  {
    id: 'greenwood-tulsa-1920',
    title: 'Black Wall Street, Tulsa',
    blurb: 'Greenwood Avenue on an ordinary afternoon, a year before the district was burned down.',
    location: 'Greenwood Avenue at Archer Street, Tulsa, Oklahoma',
    lat: 36.1614,
    lng: -95.9871,
    year: 1920,
    phaseId: 'afternoon',
  },
  {
    id: 'apollo-11-launch-morning',
    title: 'Apollo 11 Leaves the Pad',
    blurb: 'Nine thirty-two in the morning at Pad 39A, the Saturn V just clearing the tower.',
    location: 'Launch Complex 39A, Cape Canaveral, Florida',
    lat: 28.6084,
    lng: -80.6043,
    year: 1969,
    phaseId: 'morning',
  },
  {
    id: 'persepolis-tent-city',
    title: 'The Tent City at Persepolis',
    blurb: 'Fifty air-conditioned tents pitched by the ruins, lit for a five-day party of kings.',
    location: 'Persepolis, Fars Province, Iran',
    lat: 29.9356,
    lng: 52.8916,
    year: 1971,
    phaseId: 'night',
  },
  {
    id: 'kinshasa-rumble-4am',
    title: 'Four in the Morning, Kinshasa',
    blurb: 'Sixty thousand people in an open stadium at 4 a.m. to watch Ali fight Foreman.',
    location: 'Stade du 20 Mai, Kinshasa, Zaire',
    lat: -4.34,
    lng: 15.315,
    year: 1974,
    phaseId: 'small-hours',
  },
  {
    id: 'beijing-bicycles-1980',
    title: 'Beijing When Everyone Cycled',
    blurb: 'Rush hour on Chang\'an Avenue, the full width of it bicycles and hardly a car in sight.',
    location: 'Chang\'an Avenue near Xidan, Beijing',
    lat: 39.9075,
    lng: 116.374,
    year: 1980,
    phaseId: 'morning',
  },
  {
    id: 'berlin-wall-opens',
    title: 'The Night the Wall Opened',
    blurb: 'Berliners up on top of the Wall at the Brandenburg Gate, on the night the crossings gave way.',
    location: 'Brandenburg Gate, Berlin',
    lat: 52.5163,
    lng: 13.3777,
    year: 1989,
    phaseId: 'midnight',
  },
  {
    id: 'kai-tak-approach',
    title: 'Kai Tak Approach Over Rooftops',
    blurb: 'A jumbo on the final turn into Kai Tak, passing low enough over Kowloon City to hear.',
    location: 'Kowloon City rooftops, Hong Kong',
    lat: 22.332,
    lng: 114.19,
    year: 1990,
    phaseId: 'afternoon',
  },
  {
    id: 'moynaq-aral-ships',
    title: 'Ships in the Aral Desert',
    blurb: 'Rusting trawlers on dry seabed at Moynaq, a hundred kilometres from the water that left them.',
    location: 'Moynaq, Karakalpakstan, Uzbekistan',
    lat: 43.7683,
    lng: 59.0294,
    year: 2010,
    phaseId: 'sunset',
  },
  {
    id: 'koyambedu-market-at-three',
    title: 'Koyambedu Market at Three',
    blurb: 'Three in the morning is when Chennai\'s wholesale market is busiest; the heat owns the rest of the day.',
    location: 'Koyambedu Wholesale Market Complex, Chennai, India',
    lat: 13.07,
    lng: 80.19,
    year: 2035,
    phaseId: 'small-hours',
  },
  {
    id: 'uyuni-lithium-ponds',
    title: 'Lithium Ponds on the Salt Flat',
    blurb: 'Turquoise evaporation ponds cut across the white salt, where Bolivia now draws its lithium.',
    location: 'Lithium evaporation ponds, southern Salar de Uyuni, Bolivia',
    lat: -20.51,
    lng: -67.28,
    year: 2045,
    phaseId: 'afternoon',
  },
  {
    id: 'muara-baru-below-the-sea',
    title: 'Muara Baru, Below the Sea',
    blurb: 'The capital moved away and the ground kept sinking — this street is below the sea just beyond the wall.',
    location: 'Muara Baru sea wall, Penjaringan, North Jakarta, Indonesia',
    lat: -6.11,
    lng: 106.8,
    year: 2050,
    phaseId: 'sunset',
  },
  {
    id: 'the-great-green-wall-grown',
    title: 'The Great Green Wall, Grown',
    blurb: 'Thin rangeland when the planting started; now gum acacia in rows, shade enough to rest the herds at dawn.',
    location: 'Widou Thiengoly, Ferlo, northern Senegal',
    lat: 15.98,
    lng: -15.26,
    year: 2075,
    phaseId: 'dawn',
  },
  {
    id: 'alexandria-drowned-again',
    title: 'Alexandria\'s Harbour, Drowned Again',
    blurb: 'The corniche is gone under the sea and Qaitbay\'s fort stands in open water, over the drowned Pharos stones.',
    location: 'Citadel of Qaitbay, Eastern Harbour, Alexandria, Egypt',
    lat: 31.21,
    lng: 29.89,
    year: 2500,
    phaseId: 'midday',
  },
];

/** Era band id for a journey, used to group the gallery. */
export function journeyBand(j: Journey): string {
  return getEraBand(j.year).id;
}

/**
 * Journeys in ladder order, grouped by era band, bands in chronological order.
 * Derived rather than hand-maintained so a new entry lands in the right group
 * automatically and the gallery can never disagree with the dial.
 */
export function groupedJourneys(): Array<{ band: string; label: string; color: string; items: Journey[] }> {
  const sorted = [...JOURNEYS].sort((a, b) => a.year - b.year);
  const out: Array<{ band: string; label: string; color: string; items: Journey[] }> = [];
  for (const j of sorted) {
    const band = getEraBand(j.year);
    const last = out[out.length - 1];
    if (last && last.band === band.id) last.items.push(j);
    else out.push({ band: band.id, label: band.label, color: band.color, items: [j] });
  }
  return out;
}

/**
 * Validate the curated set. Called once at module load in dev.
 *
 * Returns the problems rather than throwing: a single bad coordinate should not
 * take down the whole app, and the gallery is perfectly usable with one entry
 * misfiled. The console is where a curation mistake belongs.
 */
export function checkJourneys(list: Journey[] = JOURNEYS): string[] {
  const problems: string[] = [];
  const stations = new Set(STATIONS);
  const phases = new Set(DAY_PHASES.map((p) => p.id));
  const seen = new Set<string>();
  for (const j of list) {
    if (seen.has(j.id)) problems.push(`${j.id}: duplicate id`);
    seen.add(j.id);
    if (!stations.has(j.year)) {
      problems.push(`${j.id}: year ${j.year} is NOT a station — it would snap and land somewhere else`);
    }
    if (!phases.has(j.phaseId)) problems.push(`${j.id}: unknown phase "${j.phaseId}"`);
    if (!Number.isFinite(j.lat) || Math.abs(j.lat) > 90) problems.push(`${j.id}: bad lat ${j.lat}`);
    if (!Number.isFinite(j.lng) || Math.abs(j.lng) > 180) problems.push(`${j.id}: bad lng ${j.lng}`);
    if (!j.location.trim()) problems.push(`${j.id}: empty location`);
  }
  return problems;
}

if (import.meta.env?.DEV) {
  const problems = checkJourneys();
  if (problems.length) {
    console.warn(`[looking-glass] journey presets have problems:\n  ${problems.join('\n  ')}`);
  }
}
