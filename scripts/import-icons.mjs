#!/usr/bin/env node
// Copies the curated science icons into src/assets/icons and writes the
// catalogue (src/lib/icons/catalog.ts). Run it only when changing the icon
// list; the app itself never downloads anything.
//
//   npm pack healthicons@3.1.0 @phosphor-icons/core@2.1.1
//   mkdir hi ph && tar xzf healthicons-3.1.0.tgz -C hi && tar xzf phosphor-icons-core-2.1.1.tgz -C ph
//   node scripts/import-icons.mjs hi/package ph/package
//
// Every icon is reduced to plain filled <path> elements on one viewBox:
//   - tone 1 paths are drawn in the icon's colour,
//   - tone 2 paths (Phosphor's duotone shading, opacity 0.2) in the second colour.
// Anything else in a source file makes the script stop, so the app's
// renderer, the PDF exporter and the PowerPoint exporter only ever see paths.
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [healthDir, phosphorDir] = process.argv.slice(2);
if (!healthDir || !phosphorDir) {
  console.error('Usage: node scripts/import-icons.mjs <healthicons package dir> <@phosphor-icons/core package dir>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/assets/icons');

// ------------------------------------------------------------------ the list
// [category, source path or name, optional label override]
const HEALTH = {
  cells: ['body/antibody', 'body/bacteria', 'body/blood-cells', 'body/cell-nuclei', 'conditions/cancerous-cell_nuclei', 'body/dna', 'body/enzyme', 'body/tissue', 'body/tumour', 'body/blood-drop', 'body/nerve'],
  body: [
    'body/heart-organ', 'body/lungs', 'body/neurology', 'body/kidneys', 'body/liver', 'body/stomach', 'body/intestine', 'body/pancreas', 'body/bladder', 'body/thyroid',
    'body/blood-vessel', 'body/lymph-nodes', 'body/bone', 'body/skeleton', 'body/skull', 'body/spine', 'body/joints', 'body/tooth', 'body/eye', 'body/ear', 'body/head', 'body/body',
    'devices/stethoscope', 'devices/blood-pressure_monitor', 'devices/wheelchair', 'medications/pills-3', 'medications/medicines', 'conditions/pain', 'specialties/cardiology',
  ],
  lab: [
    'devices/microscope', 'devices/microscope-with_specimen', 'devices/test-tubes', 'devices/virus-lab_research_test_tube', 'devices/medical-sample', 'devices/syringe',
    'devices/virus-lab_research_syringe', 'devices/medicine-bottle', 'devices/thermometer', 'devices/thermometer-digital', 'devices/xray', 'devices/ultrasound-scanner',
    'devices/sonogram', 'devices/intravenous-bag', 'devices/urine-sample', 'devices/pulse-oximeter', 'devices/defibrillator', 'devices/ventilator', 'devices/weight',
    'devices/cold-chain', 'specialties/biochemistry-laboratory', 'specialties/hematology-laboratory', 'diagnostics/biopsy',
  ],
  nature: ['zoonoses/animal-rat', 'zoonoses/mosquito', 'zoonoses/animal-tick', 'zoonoses/animal-spider', 'zoonoses/animal-bat', 'zoonoses/animal-snake', 'zoonoses/animal-cow', 'zoonoses/animal-pig', 'zoonoses/animal-chicken', 'zoonoses/duck'],
  people: [
    'people/person', 'people/people', 'people/woman', 'people/man', 'people/female-and_male', 'people/elderly', 'people/old-woman', 'people/boy-0105y', 'people/girl-1015y',
    'people/baby-male_0306m', 'people/pregnant', 'people/doctor', 'people/doctor-female', 'people/nurse', 'people/health-worker', 'people/agriculture-worker', 'people/factory-worker',
    'people/group-discussion_meeting', 'people/i-training_class', 'people/young-people',
  ],
  data: ['graphs/chart-bar', 'graphs/chart-bar_stacked', 'graphs/chart-line', 'graphs/chart-line_stacked', 'graphs/chart-pie', 'objects/spreadsheets', 'objects/laptop', 'objects/book', 'objects/calendar', 'objects/award-trophy', 'objects/megaphone', 'objects/i-certificate_paper'],
};

const PHOSPHOR = {
  cells: ['dna', 'virus'],
  body: ['brain', 'heartbeat', 'tooth', 'pill', 'first-aid', 'hospital', 'barbell'],
  lab: ['flask', 'test-tube', 'eyedropper', 'microscope', 'thermometer', 'syringe', 'stethoscope', 'magnifying-glass', 'scales', 'ruler', 'clipboard-text', 'hourglass', 'clock'],
  science: [
    'atom', 'magnet', 'lightning', 'fire', 'drop', 'drop-half', 'waves', 'wave-sine', 'wind', 'snowflake', 'sun', 'moon', 'planet', 'globe-hemisphere-west', 'mountains', 'cloud',
    'rocket', 'radioactive', 'biohazard', 'cube', 'cube-transparent', 'hexagon', 'function', 'sigma', 'calculator', 'cpu', 'robot', 'code', 'gear', 'compass', 'map-pin',
  ],
  nature: ['plant', 'leaf', 'tree', 'flower', 'potted-plant', 'butterfly', 'bug', 'fish', 'bird', 'cat', 'dog', 'cow', 'horse', 'paw-print'],
  people: ['user', 'users', 'users-three', 'person', 'student', 'graduation-cap', 'chalkboard-teacher', 'handshake'],
  data: ['chart-bar', 'chart-line', 'chart-line-up', 'chart-pie', 'chart-pie-slice', 'chart-donut', 'chart-scatter', 'presentation-chart', 'database', 'tree-structure', 'share-network', 'graph', 'funnel', 'book-open', 'article', 'file-text'],
  symbols: ['lightbulb', 'target', 'check-circle', 'x-circle', 'warning', 'question', 'info', 'arrow-right', 'arrows-clockwise', 'star', 'heart', 'sparkle'],
};

// Plainer names than the source's where it helps people find them.
const LABELS = {
  'health/neurology': 'Brain',
  'health/body': 'Human body',
  'health/cell-nuclei': 'Cell',
  'health/cancerous-cell_nuclei': 'Cancer cell',
  'health/animal-rat': 'Rat / mouse',
  'health/i-training_class': 'Classroom',
  'health/group-discussion_meeting': 'Group discussion',
  'health/i-certificate_paper': 'Certificate',
  'health/virus-lab_research_test_tube': 'Virus sample tube',
  'health/virus-lab_research_syringe': 'Virus research syringe',
  'health/baby-male_0306m': 'Baby',
  'health/boy-0105y': 'Child',
  'health/man': 'Man',
  'health/health-worker': 'Health worker',
  'health/girl-1015y': 'Girl',
  'phosphor/globe-hemisphere-west': 'Globe',
  'phosphor/wave-sine': 'Sine wave',
  'phosphor/function': 'Function f(x)',
  'phosphor/users-three': 'Group',
  'phosphor/drop-half': 'Half-filled drop',
  'phosphor/dna': 'DNA',
  'phosphor/cpu': 'Computer chip',
};

// Extra search words for common research terms.
const EXTRA = {
  'health/animal-rat': ['mouse', 'rodent', 'lab animal', 'model organism'],
  'health/cell-nuclei': ['nucleus', 'cell biology'],
  'health/blood-cells': ['red blood cell', 'erythrocyte'],
  'health/dna': ['genetics', 'gene', 'genome'],
  'phosphor/dna': ['genetics', 'gene', 'genome', 'helix'],
  'health/neurology': ['neuroscience', 'neuron'],
  'phosphor/brain': ['neuroscience', 'mind', 'psychology', 'cognition'],
  'phosphor/atom': ['physics', 'chemistry', 'nuclear', 'electron'],
  'phosphor/flask': ['lab', 'beaker', 'chemistry'],
  'phosphor/test-tube': ['lab', 'sample', 'chemistry'],
  'health/test-tubes': ['lab', 'sample'],
  'phosphor/plant': ['botany', 'seedling', 'growth'],
  'phosphor/globe-hemisphere-west': ['earth', 'world', 'geography', 'climate'],
  'phosphor/cpu': ['computer', 'chip', 'computing'],
  'phosphor/database': ['data', 'storage'],
  'phosphor/sigma': ['sum', 'maths', 'statistics'],
  'phosphor/function': ['maths', 'equation', 'model'],
  'phosphor/chart-scatter': ['correlation', 'regression', 'statistics'],
  'health/bacteria': ['microbe', 'microbiology'],
  'phosphor/virus': ['microbe', 'pathogen', 'covid'],
};

const CATEGORY_ORDER = ['cells', 'body', 'lab', 'science', 'nature', 'people', 'data', 'symbols'];

// ------------------------------------------------------------------ helpers
function normalize(svg, file) {
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!vb) throw new Error(`${file}: no viewBox`);
  const body = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  const paths = [];
  const re = /<path\s([^>]*?)\/>/g;
  let rest = body;
  for (const m of body.matchAll(re)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    for (const k of Object.keys(attrs)) if (!['d', 'fill', 'fill-rule', 'clip-rule', 'opacity'].includes(k)) throw new Error(`${file}: unexpected attribute ${k}`);
    if (attrs.fill && attrs.fill !== 'currentColor') throw new Error(`${file}: unexpected fill ${attrs.fill}`);
    if (attrs.opacity && attrs.opacity !== '0.2') throw new Error(`${file}: unexpected opacity ${attrs.opacity}`);
    let p = `<path d="${attrs.d.trim()}"`;
    if (attrs['fill-rule'] === 'evenodd') p += ' fill-rule="evenodd"';
    if (attrs.opacity) p += ' opacity="0.2"';
    paths.push(p + '/>');
    rest = rest.replace(m[0], '');
  }
  if (rest.trim()) throw new Error(`${file}: has something other than paths: ${rest.trim().slice(0, 80)}`);
  if (!paths.length) throw new Error(`${file}: no paths`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="currentColor">${paths.join('')}</svg>\n`;
}

const title = (s) => s.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const uniq = (a) => [...new Set(a.map((s) => s.toLowerCase().trim()).filter(Boolean))];

// ------------------------------------------------------------------ run
// Clear the old copies (this folder's README.md stays).
for (const s of ['health', 'phosphor']) rmSync(join(out, s), { recursive: true, force: true });
mkdirSync(join(out, 'health'), { recursive: true });
mkdirSync(join(out, 'phosphor'), { recursive: true });

const healthMeta = JSON.parse(readFileSync(join(healthDir, 'public/icons/meta-data.json'), 'utf8'));
const phosphorMeta = (await import(join(phosphorDir, 'dist/index.mjs'))).icons;
const entries = [];

for (const [category, list] of Object.entries(HEALTH)) {
  for (const path of list) {
    const name = path.split('/')[1];
    const meta = healthMeta.find((m) => m.path === path);
    if (!meta) throw new Error('No Health Icons entry for ' + path);
    const id = 'health/' + name;
    const src = join(healthDir, 'public/icons/svg/filled', path + '.svg');
    writeFileSync(join(out, 'health', name + '.svg'), normalize(readFileSync(src, 'utf8'), src));
    const tags = meta.tags.filter((t) => !t.includes(':'));
    entries.push({ id, label: LABELS[id] ?? meta.title, category, keywords: uniq([...tags, ...(EXTRA[id] ?? [])]) });
  }
}
for (const [category, list] of Object.entries(PHOSPHOR)) {
  for (const name of list) {
    const meta = phosphorMeta.find((m) => m.name === name);
    if (!meta) throw new Error('No Phosphor entry for ' + name);
    const id = 'phosphor/' + name;
    const src = join(phosphorDir, 'assets/duotone', name + '-duotone.svg');
    writeFileSync(join(out, 'phosphor', name + '.svg'), normalize(readFileSync(src, 'utf8'), src));
    entries.push({ id, label: LABELS[id] ?? title(name), category, keywords: uniq([...meta.tags.filter((t) => !t.startsWith('*')), ...(EXTRA[id] ?? [])]) });
  }
}

// Two sources sometimes share a name (e.g. "Microscope"); the two-tone Phosphor one says so.
const health = new Set(entries.filter((e) => e.id.startsWith('health/')).map((e) => e.label.toLowerCase()));
for (const e of entries) if (e.id.startsWith('phosphor/') && health.has(e.label.toLowerCase())) e.label += ' (two-tone)';

const ids = new Set();
for (const e of entries) {
  if (ids.has(e.id)) throw new Error('Duplicate icon ' + e.id);
  ids.add(e.id);
}
const labels = new Set();
for (const e of entries) {
  if (labels.has(e.label.toLowerCase())) throw new Error('Duplicate label ' + e.label);
  labels.add(e.label.toLowerCase());
}
entries.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

copyFileSync(join(healthDir, 'LICENSE'), join(out, 'health', 'LICENSE'));
copyFileSync(join(phosphorDir, 'LICENSE'), join(out, 'phosphor', 'LICENSE'));

const lines = entries.map((e) => `  { id: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label)}, category: ${JSON.stringify(e.category)}, keywords: ${JSON.stringify(e.keywords)} },`);
writeFileSync(
  join(root, 'src/lib/icons/catalog.ts'),
  `// Generated by scripts/import-icons.mjs from Health Icons (CC0) and Phosphor (MIT). Do not edit by hand.\n` +
    `import type { IconInfo } from './types';\n\n` +
    `export const ICONS: IconInfo[] = [\n${lines.join('\n')}\n];\n`,
);
console.log(`Wrote ${entries.length} icons.`);
