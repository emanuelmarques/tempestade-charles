// Valida public/data/*.json (ou a pasta indicada) com o mesmo contrato usado pelo site.
import fs from 'node:fs';
import path from 'node:path';
import { DATASETS, validateDataset } from '../src/data/curated.js';

const dir = process.argv[2] ?? 'public/data';
let bad = 0;
for (const name of DATASETS) {
  const file = path.join(dir, `${name}.json`);
  let errs;
  try { errs = validateDataset(name, JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) { errs = [String(e.message)]; }
  errs.forEach((e) => { console.error(`${file}: ${e}`); bad++; });
}
if (bad) { console.error(`${bad} erro(s)`); process.exit(1); }
console.log('OK: dados válidos');
