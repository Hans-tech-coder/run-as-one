/**
 * Builds src/lib/ph-provinces.json and public/psgc/ — the Province → City/Municipality → Barangay lists the
 * registration wizard's delivery address picks from.
 *
 * Source: the PSA's Philippine Standard Geographic Code, as packaged by
 * `@jobuntux/psgc` (MIT). The package is not a dependency of the app; install it
 * somewhere else and point this script at its data folder:
 *
 *   npm i @jobuntux/psgc   (in a scratch folder)
 *   node scripts/gen-psgc.mjs <scratch>/node_modules/@jobuntux/psgc/data/2025-2Q
 *
 * PSGC lists highly urbanized cities (Cebu City, Baguio…) as provinces of their
 * own. A runner looks for Cebu City under Cebu, so each one is folded into the
 * province it sits in, and the sixteen NCR cities plus Pateros become one
 * "Metro Manila". BARMM's Special Geographic Area has no province, so it gets
 * an entry of its own.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/gen-psgc.mjs <psgc data folder>');
const load = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const provinces = load('provinces.json');
const muncities = load('muncities.json');
const barangays = load('barangays.json');

const clean = (s) => s.replace(/\s+/g, ' ').trim();
// "City of Tarlac" is the official name; "Tarlac City" is what people write.
const cityName = (s) => {
  const name = clean(s);
  if (name === 'City of Manila') return 'Manila';
  const m = /^City of (.+)$/.exec(name);
  return m ? `${m[1]} City` : name;
};

// Highly urbanized cities outside NCR → the province they are geographically in.
const HUC_PROVINCE = {
  'City of Angeles': 'Pampanga',
  'City of Bacolod': 'Negros Occidental',
  'City of Baguio': 'Benguet',
  'City of Butuan': 'Agusan del Norte',
  'City of Cagayan De Oro': 'Misamis Oriental',
  'City of Cebu': 'Cebu',
  'City of Davao': 'Davao del Sur',
  'City of General Santos': 'South Cotabato',
  'City of Iligan': 'Lanao del Norte',
  'City of Iloilo': 'Iloilo',
  'City of Lapu-Lapu': 'Cebu',
  'City of Lucena': 'Quezon',
  'City of Mandaue': 'Cebu',
  'City of Olongapo': 'Zambales',
  'City of Puerto Princesa': 'Palawan',
  'City of Tacloban': 'Leyte',
  'City of Zamboanga': 'Zamboanga del Sur',
};
const NCR = { code: 'ncr', name: 'Metro Manila' };
// BARMM's Special Geographic Area: eight municipalities with no province.
const SGA = { code: 'sga', name: 'Special Geographic Area (BARMM)' };

const byName = new Map(
  provinces.filter((p) => !p.cityClass && p.regCode !== '13').map((p) => [clean(p.provName), p.provCode]),
);
// provCode (as PSGC has it) → the code of the file it lands in.
const target = new Map();
for (const p of provinces) {
  const name = clean(p.provName);
  if (p.regCode === '13') target.set(p.provCode, NCR.code);
  else if (p.cityClass) {
    const home = byName.get(HUC_PROVINCE[name]);
    if (!home) throw new Error(`No home province for ${name}`);
    target.set(p.provCode, home);
  } else target.set(p.provCode, p.provCode);
}

// Cities whose PSGC province code has no row in provinces.json.
target.set('817', NCR.code); // Pateros, the one NCR municipality
target.set('901', byName.get('Basilan')); // Isabela City, an independent component city
target.set('999', SGA.code);

// Manila's barangays sit under fourteen districts (Tondo, Sampaloc…), not
// under Manila itself. A runner looks for Manila, so the districts fold into it
// and each barangay keeps its district as a hint: "Barangay 395 (Sampaloc)".
const MANILA = '80600';
const manilaDistricts = new Map(
  muncities
    .filter((m) => m.provCode === '806' && m.munCityCode !== MANILA)
    .map((m) => [m.munCityCode, clean(m.munCityName)]),
);

const brgyByCity = new Map();
for (const b of barangays) {
  const district = manilaDistricts.get(b.munCityCode);
  const city = district ? MANILA : b.munCityCode;
  const name = district ? `${clean(b.brgyName)} (${district})` : clean(b.brgyName);
  const list = brgyByCity.get(city) ?? [];
  list.push(name);
  brgyByCity.set(city, list);
}

const files = new Map();
for (const m of muncities) {
  if (manilaDistricts.has(m.munCityCode)) continue;
  const code = target.get(m.provCode);
  if (!code) throw new Error(`No province for ${m.munCityName} (${m.provCode})`);
  const cities = files.get(code) ?? [];
  const brgys = [...new Set(brgyByCity.get(m.munCityCode) ?? [])].sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  cities.push({ name: cityName(m.munCityName), barangays: brgys });
  files.set(code, cities);
}

const index = [...files.keys()]
  .map((code) => ({
    code,
    name: code === NCR.code ? NCR.name : code === SGA.code ? SGA.name : clean(provinces.find((p) => p.provCode === code).provName),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const out = join('public', 'psgc');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// The index is small (≈3KB) and needed on first paint by both the wizard and
// the admin's event form, so it is bundled from src/lib; the per-province
// files stay in public/ and are fetched only when a province is chosen.
writeFileSync(join('src', 'lib', 'ph-provinces.json'), JSON.stringify(index, null, 0));
for (const [code, cities] of files) {
  cities.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(out, `${code}.json`), JSON.stringify(cities));
}
console.log(`${index.length} provinces, ${muncities.length} cities/municipalities, ${barangays.length} barangays → ${out}`);
