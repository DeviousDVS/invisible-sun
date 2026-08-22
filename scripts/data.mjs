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
 * back from build_quirks.py, and the compiled LevelDB packs come back from
 * packs/_source.
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
 * ISUN_ASSETS finds the card art, matching scripts/build_compendia.js.
 *
 * Requires the `tar` binary, as dist.mjs already requires `zip`.
 */
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
  { name: "packs",       into: "repo/packs/_source",           from: path.join(ROOT, "packs/_source") },
  { name: "card-art",    into: "assets/cards",                 from: ASSETS },
];

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
function backup() {
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
  for (const set of SETS) {
    const print = fingerprint(set.from);
    if (!print) { absent.push(set.name); continue; }
    const dest = path.join(stage, set.into);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(set.from, dest, { recursive: true });
    manifest.sets.push({ ...set, ...print });
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
  say(`\n  This is the only copy that is not in git. Keep one elsewhere.\n`);
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
      summary = `${files} files, v${manifest.system}`
        + (manifest.git ? `, ${manifest.git.commit.slice(0, 8)}${manifest.git.dirty ? "+dirty" : ""}` : "");
    } catch { /* reported as unreadable */ }
    say(`  ${path.basename(archive).padEnd(34)} ${human(statSync(archive).size).padStart(8)}  ${summary}`);
  }
  say();
}

/* ── verify ─────────────────────────────────────────────── */
function verify() {
  const archive = chooseArchive();
  const { scratch, manifest } = open(archive);
  const againstDisk = has("disk");
  say(`\n${archive}`);
  say(`  taken ${manifest.createdAt}, system v${manifest.system}`);
  say(againstDisk ? "  comparing against what is on disk now\n" : "  checking the archive is intact\n");

  let bad = 0;
  for (const set of manifest.sets) {
    const root = againstDisk ? destinationFor(set) : path.join(scratch, set.into);
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
function restore() {
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
COMMANDS[command]();
