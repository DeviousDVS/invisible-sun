/**
 * Compare every compiled pack against the JSON it was built from.
 *
 * compile_packs.js reports success a pack at a time, which says the write did
 * not throw — not that what came out matches what went in. An item dropped, a
 * field silently coerced or a stale entry left behind from a previous build all
 * look like success. Reading the LevelDB back and diffing it against
 * packs/_source is what actually establishes the compile was faithful.
 *
 * Three things are checked per pack: every source item is present, no compiled
 * item lacks a source file (which is how a renamed entry leaves its old self
 * behind), and each item's name, type, img and entire system object are byte
 * for byte what the source holds.
 *
 * Run it after compile_packs.js. Foundry must be stopped for both — LevelDB
 * permits one reader-writer, and this opens every pack.
 *
 * Usage:  node scripts/verify_packs.js
 */
const { ClassicLevel } = require('classic-level');
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../packs/_source');
const PACKS_DIR = path.join(__dirname, '../packs');

/** Sub-documents are stored under compound keys; only top-level items count. */
function isItemKey(key) {
  return key.startsWith('!items!') && !key.slice('!items!'.length).includes('.');
}

async function main() {
  const packs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let compared = 0, differing = 0, missing = 0, extra = 0;
  const report = [];

  for (const pack of packs) {
    const want = new Map();
    for (const file of fs.readdirSync(path.join(SOURCE_DIR, pack))) {
      const doc = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, pack, file), 'utf8'));
      want.set(doc._id, doc);
    }

    const dir = path.join(PACKS_DIR, pack);
    if (!fs.existsSync(dir)) {
      report.push(`${pack}: never compiled — no ${dir}`);
      missing += want.size;
      continue;
    }

    const db = new ClassicLevel(dir, { valueEncoding: 'json', createIfMissing: false });
    const got = new Map();
    try {
      await db.open();
      for await (const [key, value] of db.iterator()) {
        if (isItemKey(key)) got.set(value._id, value);
      }
    } finally {
      await db.close();
    }

    for (const [id, source] of want) {
      const built = got.get(id);
      if (!built) {
        missing++;
        report.push(`${pack}: ${source.name} is missing from the compiled pack`);
        continue;
      }
      compared++;
      for (const key of ['name', 'type', 'img']) {
        if (built[key] !== source[key]) {
          differing++;
          report.push(`${pack}/${source.name}: ${key} `
            + `${JSON.stringify(source[key])} -> ${JSON.stringify(built[key])}`);
        }
      }
      const a = JSON.stringify(source.system);
      const b = JSON.stringify(built.system);
      if (a !== b) {
        differing++;
        report.push(`${pack}/${source.name}: system differs`
          + `\n      source:   ${a.slice(0, 220)}`
          + `\n      compiled: ${b.slice(0, 220)}`);
      }
    }
    for (const id of got.keys()) {
      if (!want.has(id)) {
        extra++;
        report.push(`${pack}: compiled item ${id} (${got.get(id).name}) has no source file`);
      }
    }

    console.log(`${pack.padEnd(18)} ${String(want.size).padStart(4)} source  `
      + `${String(got.size).padStart(4)} compiled`);
  }

  console.log(`\n${compared} items compared field by field across ${packs.length} packs`);
  console.log(`  ${differing} differing, ${missing} missing, ${extra} with no source`);
  for (const line of report.slice(0, 25)) console.log(`  ${line}`);
  if (report.length > 25) console.log(`  ...and ${report.length - 25} more`);

  process.exit(differing || missing || extra ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
