/**
 * Invisible Sun — back up, restore and verify the extracted game data.
 *
 * The data this captures is Monte Cook Games' text and artwork, pulled out of
 * books you own. It is deliberately not in git and never will be, which means
 * git is not the safety net for it — this is. If the only copy is the working
 * tree, then a bad rebuild, a wrong path or a tired `rm` loses months of
 * extraction with nothing to fall back on.
 *
 * ── Why this is also test equipment ──
 * Extraction is moving out of these Python scripts and into Foundry itself. A
 * rewrite of a parser is only safe if you can prove the new one produces what
 * the old one did, so a backup taken now is the reference to check the port
 * against: run the new importer, compare against the archive, and any drift
 * shows up as a checksum that moved. That is what `verify --disk` is for, and
 * why `restore --to` can put a fixture somewhere harmless rather than over the
 * top of live data.
 *
 * ── What is captured ──
 * Sources of truth and the reference output built from them. Not the book and
 * deck PDFs: they are large, they are yours already, and backing up something
 * you bought is your affair rather than this script's. Not anything derived
 * cheaply and deterministically from what is here either — quirks.mjs comes
 * back from build_quirks.py.
 *
 * ── The compendia, and why Foundry has to be stopped ──
 * The compendia are captured too, as JSON rather than as the LevelDB they live
 * in. They have to be: they are the only copy there is. The importer reads the
 * books and writes the packs, and nothing else builds them — so a compendium
 * lost is a re-import, and anything a GM edited there by hand is simply gone.
 *
 * LevelDB permits one writer, so this cannot read them while a world is open.
 * A backup taken with Foundry running captures everything else and says, in
 * as many words, that it did not capture the compendia. It does not fail: the
 * rest is still worth having, and a backup that refuses to run is a backup
 * nobody takes.
 *
 * Usage:
 *   npm run data:backup                  write a new archive
 *   npm run data:list                    what has been kept, newest first
 *   npm run data:verify                  check the newest archive is intact
 *   npm run data:verify -- --disk        compare the newest archive to disk
 *   npm run data:restore                 restore the newest archive in place
 *   npm run data:restore -- --to /tmp/x  restore beside the real data instead
 *
 * Any subcommand takes an explicit archive path as its last argument.
 *
 * ISUN_BACKUP_DIR chooses where archives live (default ~/invisible-sun-backups).
 * ISUN_ASSETS finds the card art, matching where the importer writes it.
 *
 * Requires the `tar` binary, as dist.mjs already requires `zip`.
 */
import { ClassicLevel } from "classic-level";
import { extractPack, compilePack } from "@foundryvtt/foundryvtt-cli";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync,
  cpSync, readdirSync, statSync
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKS_DIR = path.join(ROOT, "packs");
const ASSETS = process.env.ISUN_ASSETS || path.resolve(ROOT, "../../invisible-sun/cards");
const BACKUP_DIR = process.env.ISUN_BACKUP_DIR
  || path.join(os.homedir(), "invisible-sun-backups");

/**
 * What a backup holds, and where each part goes back to.
 *
 * `into` is the path inside the archive. The two prefixes matter: `repo/` is
 * relative to this checkout, `assets/` is not — the card art lives outside the
 * repository on purpose, and where it lives can be moved with ISUN_ASSETS. An
 * archive that recorded only absolute paths could not be restored on another
 * machine; one that recorded only relative paths could not tell the two roots
 * apart. So it records the shape, and the destination is resolved at restore.
 */
const SETS = [
  { name: "data",        into: "repo/source/data",             from: path.join(ROOT, "source/data") },
  { name: "forte-trees", into: "repo/source/forte-trees",      from: path.join(ROOT, "source/forte-trees") },
  { name: "isdata",      into: "repo/source/isdata_2026.json", from: path.join(ROOT, "source/isdata_2026.json") },
  { name: "card-art",    into: "assets/cards",                 from: ASSETS },
  /* The compendia themselves, which are not a directory to be copied — see
   * extractCompendia. `from` is here only so that restore can name what it
   * would replace. */
  { name: "compendia",   into: "compendia",                    from: PACKS_DIR,
    extract: extractCompendia, install: installCompendia },
];

/* ── the compendia ───────────────────────────────────────
 *
 * Everything else here is a directory that can be copied. The compendia are
 * not: they are LevelDB, which cannot be copied while it is open and would be
 * useless to checksum if it could. LevelDB rewrites and compacts its own files
 * as it pleases, so byte-identical content produces different files from one
 * day to the next — and `verify --disk`, whose whole job is to say what moved,
 * would report every pack as changed every time.
 *
 * So they are extracted to JSON, one file per document. That is stable,
 * diffable, restorable, and readable by anything.
 *
 * This used to sit beside a second copy — packs/_source, what the retired
 * Python build produced out of source/data. Keeping both invited the question
 * of which was authoritative, and answering it wrongly is what reverted five
 * packs to a months-old extraction. There is one copy now, and it is this one.
 */

/** The packs this system declares, by name and directory. */
function declaredPacks() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8"));
  return manifest.packs
    .map(pack => ({ name: pack.name, dir: path.join(ROOT, pack.path) }))
    .filter(pack => existsSync(pack.dir));
}

/**
 * Which packs something else has open.
 *
 * The lock is the authority, not the process list: Foundry can be running
 * under any name, and an absent process is no proof that nothing holds the
 * files — whereas LevelDB permits exactly one writer. If a pack opens here,
 * nothing else has it. `scripts/audit_packs.mjs` leans on the same fact.
 */
async function packsHeldOpen(packs) {
  const held = [];
  for (const pack of packs) {
    const db = new ClassicLevel(pack.dir, { createIfMissing: false });
    try {
      await db.open();
      await db.close();
    } catch {
      held.push(pack.name);
    }
  }
  return held;
}

const LOCKED_NOTE = "Foundry (or whatever else holds them) has to be stopped.";

/** Write every compendium out as JSON under `dest`, a directory per pack. */
async function extractCompendia(dest) {
  const packs = declaredPacks();
  if (!packs.length) return { skipped: "there are no compiled packs yet" };

  const held = await packsHeldOpen(packs);
  if (held.length) {
    return { skipped: `${held.length} of ${packs.length} pack(s) are open — ${LOCKED_NOTE}` };
  }

  for (const pack of packs) {
    const into = path.join(dest, pack.name);
    mkdirSync(into, { recursive: true });
    // Volatile fields are kept. This is a backup: a restore should put back
    // what was there, not a tidied version of it.
    await extractPack(pack.dir, into, { yaml: false, log: false });
  }
  return { packs: packs.length };
}

/**
 * Compile the JSON back into the packs Foundry reads.
 *
 * Written into a scratch directory first and moved into place only once every
 * pack has built. Moving deletes the live pack before it writes the new one, so
 * a restore that failed halfway would leave nothing where a compendium was —
 * and since the packs are the only copy of an import, nothing is what it would
 * stay.
 */
async function installCompendia(source) {
  const names = readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name);

  const held = await packsHeldOpen(declaredPacks());
  if (held.length) {
    die(`Cannot restore the compendia: ${held.join(", ")} are open.\n  ${LOCKED_NOTE}\n`
      + `  Nothing has been changed.`);
  }

  const scratch = path.join(ROOT, "packs_restore_temp");
  rmSync(scratch, { recursive: true, force: true });
  try {
    for (const name of names) {
      const into = path.join(scratch, name);
      mkdirSync(into, { recursive: true });
      await compilePack(path.join(source, name), into, { yaml: false, log: false });
    }
    for (const name of names) {
      const dest = path.join(PACKS_DIR, name);
      rmSync(dest, { recursive: true, force: true });
      cpSync(path.join(scratch, name), dest, { recursive: true });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return names.length;
}

const argv = process.argv.slice(2);
const command = argv.find(a => !a.startsWith("--")) ?? "backup";
const has = (flag) => argv.includes(`--${flag}`);
const valueOf = (flag) => {
  const i = argv.indexOf(`--${flag}`);
  return i === -1 ? null : argv[i + 1];
};

const say = (msg = "") => console.log(msg);
const die = (msg) => { console.error(`\n${msg}\n`); process.exit(1); };

/** Files under a target, relative to it. An empty string means the target is
 *  itself a file. Sorted, so a manifest is stable and two runs can be diffed. */
function filesUnder(target) {
  if (!existsSync(target)) return null;
  if (statSync(target).isFile()) return [""];
  const out = [];
  (function walk(dir, prefix) {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  })(target, "");
  return out;
}

const at = (root, rel) => (rel === "" ? root : path.join(root, rel));
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Checksum every file under a root. The unit of trust is the file, not the
 *  archive: a whole-archive hash tells you something broke, this tells you
 *  what. */
function fingerprint(root) {
  const files = filesUnder(root);
  if (!files) return null;
  const checksums = {};
  let bytes = 0;
  for (const rel of files) {
    const file = at(root, rel);
    checksums[rel] = sha256(file);
    bytes += statSync(file).size;
  }
  return { files: files.length, bytes, checksums };
}

function gitState() {
  try {
    const run = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
    return {
      commit: run("rev-parse", "HEAD"),
      branch: run("rev-parse", "--abbrev-ref", "HEAD"),
      dirty: run("status", "--porcelain").length > 0,
    };
  } catch {
    return null;   // not a checkout, or no git; the archive is still valid
  }
}

const human = (bytes) => bytes > 1048576
  ? `${(bytes / 1048576).toFixed(1)} MB`
  : `${(bytes / 1024).toFixed(0)} KB`;

function archives() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith(".tar.gz"))
    .map(f => path.join(BACKUP_DIR, f))
    .sort()
    .reverse();
}

/** The archive to act on: the one named, or the newest there is. */
function chooseArchive() {
  const named = argv.slice(1).find(a => a.endsWith(".tar.gz"));
  if (named) {
    if (!existsSync(named)) die(`No such archive: ${named}`);
    return named;
  }
  const [newest] = archives();
  if (!newest) {
    die(`No backups in ${BACKUP_DIR}.\n  Make one with: npm run data:backup`);
  }
  return newest;
}

/** Unpack to a scratch directory and read the manifest. */
function open(archive) {
  const scratch = path.join(os.tmpdir(), `isun-restore-${process.pid}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", scratch]);
  const manifestFile = path.join(scratch, "manifest.json");
  if (!existsSync(manifestFile)) {
    rmSync(scratch, { recursive: true, force: true });
    die(`${archive} has no manifest.json — it was not written by this script.`);
  }
  return { scratch, manifest: JSON.parse(readFileSync(manifestFile, "utf8")) };
}

/** Compare a recorded fingerprint against what is at `root` now. */
function compare(recorded, root) {
  const missing = [], changed = [], extra = [];
  const now = filesUnder(root);
  if (!now) return { absent: true, missing: [], changed: [], extra: [] };
  const seen = new Set(now);
  for (const [rel, sum] of Object.entries(recorded.checksums)) {
    if (!seen.has(rel)) { missing.push(rel); continue; }
    if (sha256(at(root, rel)) !== sum) changed.push(rel);
  }
  for (const rel of now) if (!(rel in recorded.checksums)) extra.push(rel);
  return { absent: false, missing, changed, extra };
}

/* ── backup ─────────────────────────────────────────────── */
async function backup() {
  const stage = path.join(os.tmpdir(), `isun-backup-${process.pid}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    system: JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8")).version,
    git: gitState(),
    sets: [],
  };

  const absent = [];
  const skipped = [];
  for (const set of SETS) {
    const dest = path.join(stage, set.into);
    mkdirSync(path.dirname(dest), { recursive: true });

    if (set.extract) {
      mkdirSync(dest, { recursive: true });
      const result = await set.extract(dest);
      if (result.skipped) {
        rmSync(dest, { recursive: true, force: true });
        skipped.push({ name: set.name, why: result.skipped });
        continue;
      }
    } else {
      if (!fingerprint(set.from)) { absent.push(set.name); continue; }
      cpSync(set.from, dest, { recursive: true });
    }

    manifest.sets.push({ ...set, ...fingerprint(dest), extract: undefined, install: undefined });
  }

  if (!manifest.sets.length) {
    rmSync(stage, { recursive: true, force: true });
    die("Nothing to back up — none of the data directories exist.");
  }

  writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = manifest.createdAt.replace(/[:T]/g, "-").slice(0, 19);
  const archive = path.join(BACKUP_DIR, `isun-data-${stamp}.tar.gz`);
  execFileSync("tar", ["-czf", archive, "-C", stage, "."]);
  rmSync(stage, { recursive: true, force: true });

  const files = manifest.sets.reduce((n, s) => n + s.files, 0);
  const bytes = manifest.sets.reduce((n, s) => n + s.bytes, 0);
  say(`\n${archive}`);
  say(`  ${files} files, ${human(bytes)} captured, ${human(statSync(archive).size)} compressed`);
  for (const set of manifest.sets) {
    say(`    ${set.name.padEnd(12)} ${String(set.files).padStart(5)} files  ${set.into}`);
  }
  if (absent.length) say(`  not present, so not captured: ${absent.join(", ")}`);
  if (manifest.git?.dirty) {
    say(`\n  note: the working tree has uncommitted changes, so this archive`);
    say(`        does not correspond to commit ${manifest.git.commit.slice(0, 8)} exactly.`);
  }
  say(`\n  This is the only copy that is not in git. Keep one elsewhere.`);

  /* Last, so that it is what the reader is left looking at. A backup that
   * quietly left out the compendia and still said "ok" would be believed. */
  for (const { name, why } of skipped) {
    say(`\n  ⚠ NOT CAPTURED: ${name} — ${why}`);
  }
  say();
}

/* ── list ───────────────────────────────────────────────── */
function list() {
  const found = archives();
  if (!found.length) return say(`No backups in ${BACKUP_DIR}.`);
  say(`\n${BACKUP_DIR}  — newest first\n`);
  for (const archive of found) {
    let summary = "unreadable";
    try {
      const header = execFileSync("tar", ["-xzOf", archive, "./manifest.json"], { encoding: "utf8" });
      const manifest = JSON.parse(header);
      const files = manifest.sets.reduce((n, s) => n + s.files, 0);
      /* Called out, because restore and verify default to the newest archive
       * and an archive taken while Foundry was running has no compendia in it.
       * Reaching for the newest and finding it partial is a thing to learn
       * from a list, not from a restore. */
      const partial = manifest.sets.some(set => set.name === "compendia")
        ? "" : ", NO COMPENDIA";
      summary = `${files} files, v${manifest.system}`
        + (manifest.git ? `, ${manifest.git.commit.slice(0, 8)}${manifest.git.dirty ? "+dirty" : ""}` : "")
        + partial;
    } catch { /* reported as unreadable */ }
    say(`  ${path.basename(archive).padEnd(34)} ${human(statSync(archive).size).padStart(8)}  ${summary}`);
  }
  say();
}

/* ── verify ─────────────────────────────────────────────── */
async function verify() {
  const archive = chooseArchive();
  const { scratch, manifest } = open(archive);
  const againstDisk = has("disk");
  say(`\n${archive}`);
  say(`  taken ${manifest.createdAt}, system v${manifest.system}`);
  say(againstDisk ? "  comparing against what is on disk now\n" : "  checking the archive is intact\n");

  let bad = 0;
  for (const set of manifest.sets) {
    const known = SETS.find(s => s.name === set.name);

    /* Compared against a fresh extraction rather than against the pack
     * directories, which hold LevelDB and not the JSON this recorded. This is
     * the comparison that matters most: what the compendia hold now against
     * what they held when the archive was taken. */
    let root = againstDisk ? destinationFor(set) : path.join(scratch, set.into);
    if (againstDisk && known?.extract) {
      root = path.join(scratch, `${set.name}-now`);
      mkdirSync(root, { recursive: true });
      const result = await known.extract(root);
      if (result.skipped) {
        say(`  ${set.name.padEnd(12)} UNREADABLE  ${result.skipped}`);
        bad++;
        continue;
      }
    }

    const result = compare(set, root);
    if (result.absent) {
      say(`  ${set.name.padEnd(12)} MISSING   ${root}`);
      bad++;
      continue;
    }
    const { missing, changed, extra } = result;
    const ok = !missing.length && !changed.length && !extra.length;
    say(`  ${set.name.padEnd(12)} ${ok ? "ok" : "DIFFERS"}   ${set.files} files`
      + (ok ? "" : `  (${missing.length} missing, ${changed.length} changed, ${extra.length} extra)`));
    if (!ok) {
      bad++;
      for (const rel of [...missing.slice(0, 3)]) say(`      missing  ${rel}`);
      for (const rel of [...changed.slice(0, 3)]) say(`      changed  ${rel}`);
      for (const rel of [...extra.slice(0, 3)]) say(`      extra    ${rel}`);
      const shown = Math.min(3, missing.length) + Math.min(3, changed.length) + Math.min(3, extra.length);
      const total = missing.length + changed.length + extra.length;
      if (total > shown) say(`      ... and ${total - shown} more`);
    }
  }
  rmSync(scratch, { recursive: true, force: true });
  say();
  if (bad) {
    say(againstDisk
      ? `  ${bad} set(s) differ from the archive. That is a finding, not a fault:\n`
      + `  it is what this compares for.\n`
      : `  ${bad} set(s) failed. This archive is damaged — use another.\n`);
    process.exitCode = 1;
  } else {
    say(againstDisk ? "  Disk matches the archive exactly.\n" : "  Archive is intact.\n");
  }
}

/** Where a set goes back to. `--to` relocates everything under one directory,
 *  which is how a fixture is put somewhere it cannot overwrite live data. */
function destinationFor(set) {
  const to = valueOf("to");
  if (to) return path.resolve(to, set.into);

  // Normally a set goes back exactly where it came from, resolved from the
  // table above rather than from the archive — so that moving the card art
  // with ISUN_ASSETS is honoured by a restore rather than quietly undone.
  const known = SETS.find(s => s.name === set.name);
  if (known) return known.from;

  // An archive written before this set existed, or after it was renamed. The
  // recorded shape is all there is to go on, so it is used and said out loud.
  console.warn(`  note: "${set.name}" is not a set this version knows; `
             + `restoring it by its recorded path.`);
  return set.into.startsWith("assets/")
    ? path.resolve(ASSETS, "..", set.into.replace(/^assets\//, ""))
    : path.join(ROOT, set.into.replace(/^repo\//, ""));
}

/* ── restore ────────────────────────────────────────────── */
async function restore() {
  const archive = chooseArchive();
  const { scratch, manifest } = open(archive);
  const to = valueOf("to");

  // Restoring over live data is the operation that loses work, so it has to be
  // asked for. Naming what would be replaced is the point — "are you sure?"
  // with no list is a question nobody can answer.
  if (!to && !has("force")) {
    const occupied = manifest.sets.filter(s => existsSync(destinationFor(s)));
    if (occupied.length) {
      rmSync(scratch, { recursive: true, force: true });
      die(`This would replace data that is already there:\n\n`
        + occupied.map(s => `  ${s.name.padEnd(12)} ${destinationFor(s)}`).join("\n")
        + `\n\n  --force      replace it\n`
        + `  --to <dir>   restore somewhere else, leaving this alone\n\n`
        + `  Take a backup first: npm run data:backup`);
    }
  }

  say(`\nRestoring ${path.basename(archive)}  (taken ${manifest.createdAt})\n`);
  for (const set of manifest.sets) {
    const source = path.join(scratch, set.into);
    const known = SETS.find(s => s.name === set.name);

    /* Into the live packs, this has to be compiled rather than copied. Under
     * --to it must not be: the point of --to is a fixture that cannot touch
     * live data, and a compile writes to packs/ wherever it was asked to go. */
    if (known?.install && !to) {
      const count = await known.install(source);
      say(`  ${set.name.padEnd(12)} ok      ${set.files} files -> ${count} packs in ${PACKS_DIR}`);
      continue;
    }

    const dest = destinationFor(set);
    mkdirSync(path.dirname(dest), { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    cpSync(source, dest, { recursive: true });

    // Restoring and then trusting it is how a corrupt archive becomes a
    // corrupt working tree, so what landed is checked against the manifest.
    const { missing, changed } = compare(set, dest);
    const ok = !missing.length && !changed.length;
    say(`  ${set.name.padEnd(12)} ${ok ? "ok" : "FAILED"}  ${set.files} files -> ${dest}`);
    if (!ok) process.exitCode = 1;
  }
  rmSync(scratch, { recursive: true, force: true });
  say(to ? `\n  Restored under ${path.resolve(to)}; live data untouched.\n` : "\n");
}

const COMMANDS = { backup, list, verify, restore };
if (!COMMANDS[command]) die(`Unknown command "${command}". One of: ${Object.keys(COMMANDS).join(", ")}`);
await COMMANDS[command]();
