/**
 * Invisible Sun — is what is in the compendia a complete, clean import?
 *
 * The books and the decks are the arbiter. Nothing builds a compendium from
 * anything else any more: the in-Foundry importer reads the PDFs and writes the
 * packs, and this reads the packs back and asks whether the result looks like a
 * finished job.
 *
 * ── Why this exists ──
 * There used to be a second way to fill the packs — a Python extraction into
 * `source/data/*.json`, built into `packs/_source` and compiled over the top of
 * whatever was there. It ran from `npm run packs`, it was months out of date,
 * and running it reverted five packs at once: 355 spells and 211 incantations
 * lost their names to the ALL CAPS the cards are printed in, and about 860
 * items lost their card art for a generic rune. Nothing said so. Everything
 * "succeeded".
 *
 * That path is gone. This is what stands in its place — not a build, a
 * question: does each pack hold at least what its decks print, are the names
 * the ones the importer writes, and did the card art arrive? Every failure
 * above would have been caught by one of the three.
 *
 * ── What it cannot tell you ──
 * That the text inside an entry is right. This counts entries, reads names and
 * looks at where images point; it does not re-read the books. A pack that
 * passes here is one worth looking at, not one proven correct.
 *
 * FOUNDRY MUST BE STOPPED. LevelDB permits one reader-writer, so a pack the
 * server holds cannot be opened here — which this reports rather than skips,
 * because a pack silently missing from an audit is worse than no audit.
 *
 * Usage:
 *   npm run packs:audit
 *   npm run packs:audit -- --packs <dir>   audit a copy rather than the live
 *                                          packs: a backup, or the tree
 *                                          another machine is about to ship
 */
import { ClassicLevel } from "classic-level";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "../module/importers/sources.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8"));

/* Where the packs are. The manifest gives each one a path inside the system,
 * and --packs replaces the directory those sit in — so a backup taken before an
 * import can be held against the one after it without either being moved. */
const argv = process.argv.slice(2);
const at = argv.indexOf("--packs");
const PACK_ROOT = at === -1 ? ROOT : path.resolve(argv[at + 1] ?? "");
const dirOf = (pack) => at === -1
  ? path.join(ROOT, pack.path)
  : path.join(PACK_ROOT, path.basename(pack.path));

const problems = [];
const fail = (msg) => problems.push(msg);
const say = (msg) => console.log(msg);

/* Kept apart from the problems. A pack that cannot be opened has not failed the
 * audit — it has not been audited, and eighteen copies of "stop Foundry" is a
 * worse way to say that than one. */
const locked = [];

/* And the same for a pack that holds nothing. Eighteen of these is not
 * eighteen faults, it is a clone nobody has imported into yet. */
const empty = [];

/**
 * What each pack should hold, read out of the importer's own source list.
 *
 * `expected` on a source is how many cards that sheet prints, and it is already
 * what the importer refuses an import over — so the floor here and the check
 * there cannot drift apart. Only the sources that feed exactly one pack count
 * towards it: the Nightside sheet prints forty cards spread across five packs,
 * and there is no per-pack number to take from it.
 *
 * A floor, not a total. The books add to most of these — the Threshold's
 * objects, Van Hauten's secrets, the Key's whole character-creation apparatus —
 * so a pack over its floor is expected and only a pack under it is wrong.
 */
const floors = new Map();
const cardBacked = new Set();
const repeatsAllowed = new Set();

/**
 * Every pack a source writes into, with the flags that apply there.
 *
 * A source fills one pack or several. The deck readers name theirs outright;
 * the Nightside sheet holds five kinds of card and splits them under `kinds`,
 * and a book is read into `buckets` — The Key alone fills nine packs, because
 * character creation, the goods lists and the character arcs are all in it.
 *
 * `alone` is what makes a count usable. A source that feeds one pack can have
 * its `expected` attributed to that pack; one that feeds five cannot, because
 * the forty Nightside cards are forty across all of them and no per-pack
 * number is printed anywhere.
 */
function* targets(source) {
  if (source.pack) {
    yield { pack: source.pack, spec: source, alone: true };
    return;
  }
  for (const spec of Object.values({ ...(source.kinds ?? {}), ...(source.buckets ?? {}) })) {
    if (spec.pack) yield { pack: spec.pack, spec, alone: false };
  }
}

/* The manifest names a pack "spells"; a source names it "invisible-sun.spells". */
const bare = (collection) => collection.replace(/^invisible-sun\./, "");

for (const source of SOURCES) {
  for (const { pack, spec, alone } of targets(source)) {
    const name = bare(pack);

    if (alone && source.expected) floors.set(name, (floors.get(name) ?? 0) + source.expected);

    /* Where the art comes from. A deck's own back stands for the whole deck,
     * the Sooth prints a different face on every card, and the five order marks
     * are cut out of a page of The Key. Everything else wears a Foundry icon
     * and is supposed to. */
    if (source.sharedBack || source.kind === "deck" || spec.cutouts) cardBacked.add(name);

    /* Where two entries may share a name. The books print binoculars twice at
     * two prices, and a forte ability's name is only unique within its forte —
     * so these packs are supposed to hold repeats, and the importer tells the
     * pairs apart by the fields `uniqueBy` names rather than by the name alone. */
    if (spec.uniqueBy) repeatsAllowed.add(name);
  }
}

/**
 * A name the importer would never write.
 *
 * `joinName` in importers/spells.mjs title-cases every card name, and the book
 * readers do the same through `titleCase`. So an entry shouting its own name is
 * not something an import produced — it is the mark of the retired Python
 * pipeline, which stored the name exactly as the card prints it.
 *
 * Short strings are exempt. A name of three characters or fewer is as likely to
 * be an initialism as a fault, and there is nothing to be sure about either way.
 */
const shouting = (name) =>
  name.length > 3 && /[A-Za-z]/.test(name) && name === name.toUpperCase();

/** Art the importer cut out of the decks, as opposed to a Foundry stock icon. */
const ownArt = (img) => /^invisible-sun\/cards\//.test(img ?? "");

/** Only top-level items; sub-documents are stored under compound keys. */
const isItemKey = (key) =>
  (key.startsWith("!items!") || key.startsWith("!cards!")) && key.split("!").length === 3;

async function readPack(dir) {
  const db = new ClassicLevel(dir, { valueEncoding: "json", createIfMissing: false });
  await db.open();
  try {
    const rows = [];
    for await (const [key, value] of db.iterator()) {
      if (isItemKey(key)) rows.push({ name: value.name ?? "", img: value.img ?? "" });
    }
    return rows;
  } finally {
    await db.close();
  }
}

if (at !== -1) say(`\n  reading packs from ${PACK_ROOT}`);

const width = Math.max(...(manifest.packs ?? []).map(p => p.name.length));
say(`\n  ${"pack".padEnd(width)}  ${"items".padStart(6)}  ${"floor".padStart(6)}   art        names`);
say(`  ${"─".repeat(width)}  ${"─".repeat(6)}  ${"─".repeat(6)}   ${"─".repeat(9)}  ${"─".repeat(12)}`);

for (const pack of manifest.packs ?? []) {
  const dir = dirOf(pack);
  const name = pack.name.padEnd(width);

  if (!existsSync(dir) || !readdirSync(dir).length) {
    say(`  ${name}  ${"—".padStart(6)}  ${String(floors.get(pack.name) ?? "").padStart(6)}   empty`);
    empty.push(pack.name);
    continue;
  }

  let rows;
  try {
    rows = await readPack(dir);
  } catch (err) {
    say(`  ${name}  ${"locked".padStart(6)}`);
    locked.push(`${pack.name} (${err.code ?? err.message})`);
    continue;
  }

  const floor = floors.get(pack.name) ?? 0;
  const caps = rows.filter(r => shouting(r.name)).length;
  const art = rows.filter(r => ownArt(r.img)).length;
  const dupes = rows.length - new Set(rows.map(r => r.name)).size;

  const artCell = cardBacked.has(pack.name) ? `${art}/${rows.length}` : "—";
  const nameCell = caps ? `${caps} SHOUTING`
    : (dupes && !repeatsAllowed.has(pack.name)) ? `${dupes} repeated`
    : "ok";
  say(`  ${name}  ${String(rows.length).padStart(6)}  ${String(floor || "—").padStart(6)}`
    + `   ${artCell.padEnd(9)}  ${nameCell}`);

  if (floor && rows.length < floor) {
    fail(`"${pack.name}" holds ${rows.length} where its decks alone print ${floor}. `
       + `Something did not import.`);
  }
  if (caps) {
    fail(`"${pack.name}" has ${caps} entries named in capitals — e.g. `
       + `"${rows.find(r => shouting(r.name)).name}".\n`
       + `    The importer title-cases every name, so these came from somewhere else.`);
  }
  if (cardBacked.has(pack.name) && !art) {
    fail(`"${pack.name}" is filled from a card deck but no entry points at `
       + `invisible-sun/cards/. The art did not arrive, or was overwritten.`);
  }
  if (dupes && !repeatsAllowed.has(pack.name)) {
    fail(`"${pack.name}" holds ${dupes} entries whose names repeat. `
       + `A deck read twice under two different names looks like this.`);
  }
}

const declared = (manifest.packs ?? []).length;

if (empty.length === declared && declared) {
  console.error(`\n  Every compendium is empty — nothing has been imported yet.\n`);
  console.error(`  Open a world, then the Content Importer, and give it your`);
  console.error(`  copies of the books and the card decks.\n`);
  process.exit(1);
}
for (const name of empty) {
  fail(`"${name}" is empty. Import the source that fills it from the Content Importer.`);
}

if (locked.length) {
  console.error(`\n${locked.length === declared
    ? "Every pack is"
    : `${locked.length} of ${declared} packs are`} in use, so nothing could be read.\n`);
  console.error(`  LevelDB permits one reader-writer. Stop Foundry and run again,`);
  console.error(`  or point this at a copy:  npm run packs:audit -- --packs <dir>\n`);
  if (locked.length < declared) {
    console.error(`  locked: ${locked.join(", ")}\n`);
  }
  process.exit(1);
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  process.exit(1);
}

say(`\n  ${declared} packs, nothing to report.\n`);
