/**
 * Invisible Sun — build the distributable.
 *
 * Produces the two files a Foundry release needs, in dist/:
 *
 *   system.json          uploaded as its own release asset, because the
 *                        manifest URL points at it directly
 *   invisible-sun.zip    what Foundry downloads and unpacks
 *
 * ── Why an allowlist ──
 * Nothing is copied unless the manifest asks for it. The esmodules come from
 * following imports out of the declared entry point; the styles, languages,
 * licence and packs are exactly the paths system.json names; templates and
 * fonts ship whole because they are referenced by string rather than imported.
 *
 * That is the opposite of listing what to leave out, and it is deliberate. A
 * denylist is one forgotten entry away from publishing source/data — which is
 * the extracted text of somebody else's books. An allowlist cannot make that
 * mistake, and the script refuses outright if any of it appears in the staged
 * tree anyway. Cheap belt to go with the braces.
 *
 * ── What ships is what is committed ──
 * The working tree must be clean, so the archive is the tagged state rather
 * than whatever happens to be lying around.
 *
 * ── Why the compendia are not in it ──
 * They hold Monte Cook Games' books and cards, read out of PDFs somebody paid
 * for. Shipping them would put that text in a public download, which is the
 * one thing the allowlist above exists to prevent — and the packs were slipping
 * past it, because they are named by the manifest and the manifest is the
 * allowlist. So the archive declares eighteen compendia and carries none of
 * their contents: a table fills them by reading their own copies of the books
 * through the Content Importer.
 *
 * Usage:
 *   npm run dist                 build from the current HEAD
 *   npm run dist -- --tag v0.1.0 also assert the manifest version matches
 *   npm run dist -- --allow-dirty  build anyway; the archive is then unverified
 *
 * Requires the `zip` binary, as the extraction pipeline already requires
 * pdftotext.
 */
import { execFileSync } from "node:child_process";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync,
  cpSync, readdirSync, statSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "staging");

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = argv[i + 1];
  return (!next || next.startsWith("--")) ? true : next;
};

const problems = [];
const fail = (msg) => problems.push(msg);
const say = (msg) => console.log(msg);

/* ── The manifest is the specification ── */
const manifest = JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8"));
const { id, version } = manifest;

/* ── 1. What ships must be what is committed ── */
if (flag("allow-dirty") !== true) {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    console.error(
      `\nThe working tree has uncommitted changes, so the archive would not match any\n`
      + `commit. Commit them, or pass --allow-dirty if you know you want an\n`
      + `unverifiable build.\n\n${dirty.split("\n").map(l => "  " + l).join("\n")}\n`);
    process.exit(1);
  }
}

const tag = flag("tag");
if (typeof tag === "string" && tag !== `v${version}`) {
  fail(`--tag ${tag} does not match the manifest version ${version}. `
     + `A release tagged one thing and declaring another installs as the wrong version.`);
}
if (manifest.download && !manifest.download.includes(`/v${version}/`)) {
  fail(`system.json version is ${version} but download does not name v${version}:\n    ${manifest.download}`);
}

/* ── 2. Follow the imports out of the declared entry point ──
 *
 * Templates cannot be found this way — they are named by string at render time,
 * never imported — so they ship whole. Modules can, and doing so means an
 * orphan that nothing reaches is reported rather than quietly shipped. */
function moduleGraph(entries) {
  const seen = new Set();
  const missing = [];
  const queue = entries.map(e => path.join(ROOT, e));

  while (queue.length) {
    const file = queue.shift();
    const rel = path.relative(ROOT, file);
    if (seen.has(rel)) continue;
    if (!existsSync(file)) { missing.push(rel); continue; }
    seen.add(rel);

    const src = readFileSync(file, "utf8");
    const specifiers = [
      ...src.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)
    ].map(m => m[1]);

    for (const spec of specifiers) {
      // Only our own files. A bare specifier is a Foundry global or a package,
      // and an absolute /systems/... path belongs to the running server.
      if (!spec.startsWith(".")) continue;
      queue.push(path.resolve(path.dirname(file), spec));
    }
  }
  return { files: [...seen].sort(), missing };
}

const { files: moduleFiles, missing } = moduleGraph(manifest.esmodules ?? []);
for (const m of missing) fail(`${m} is imported but does not exist`);

/* Anything under module/ the entry point never reaches is dead weight. Not a
 * failure — it may be deliberate — but it should be said rather than shipped. */
const onDisk = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".mjs")) onDisk.push(path.relative(ROOT, p));
  }
})(path.join(ROOT, "module"));
const orphans = onDisk.filter(f => !moduleFiles.includes(f));

/* ── 3. Everything else the manifest names ── */
const declared = [
  "system.json",
  ...moduleFiles,
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map(l => l.path),
  // A path rather than an SPDX id, so it is a file that has to travel.
  ...(manifest.license && !manifest.license.includes(" ") ? [manifest.license] : []),
];

/* Referenced by string, not by import, so they ship whole. `icons/` is this
 * system's own artwork — the flux mark the magic dice wear — and is named
 * from a stylesheet and from a Dice So Nice label, neither of which the
 * import walk can see. It is not `assets/`, which is refused below because
 * that is where extracted card art lands. */
const wholeDirectories = ["templates", "fonts", "icons"];
/* Read at a glance by anyone who unpacks the archive. */
const courtesy = ["README.md", "CHANGELOG.md"].filter(f => existsSync(path.join(ROOT, f)));

for (const rel of [...declared, ...courtesy]) {
  if (!existsSync(path.join(ROOT, rel))) fail(`system.json declares "${rel}", which does not exist`);
}

/* ── 4. The compendia are declared and left empty ──
 *
 * Nothing to check for freshness, because nothing of theirs is copied. Foundry
 * creates the database the first time a world opens a pack that has none, so an
 * archive with eighteen declarations and no data installs to eighteen empty
 * compendia waiting for an import.
 */
const packDirs = (manifest.packs ?? []).map(p => p.path);

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  process.exit(1);
}

/* ── 5. Stage ── */
rmSync(DIST, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

const copy = (rel) => {
  const dest = path.join(STAGE, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(ROOT, rel), dest, { recursive: true });
};

for (const rel of [...declared.filter(f => f !== "system.json"), ...courtesy]) copy(rel);
for (const rel of wholeDirectories) copy(rel);

/* The shipped manifest is not quite the developed one. hotReload makes a
 * player's client watch files it will never edit; it is a convenience for
 * whoever is writing the system, and shipping it just costs everyone else. */
const shipped = { ...manifest };
if (shipped.flags?.hotReload) {
  shipped.flags = { ...shipped.flags };
  delete shipped.flags.hotReload;
  if (!Object.keys(shipped.flags).length) delete shipped.flags;
}
writeFileSync(path.join(STAGE, "system.json"), JSON.stringify(shipped, null, 2) + "\n");
writeFileSync(path.join(DIST, "system.json"), JSON.stringify(shipped, null, 2) + "\n");

/* ── 6. Refuse to ship what must never ship ──
 *
 * The allowlist should already have made this impossible. It runs anyway: this
 * is the guarantee the fan-use position rests on, and a guarantee that is only
 * true by construction is one nobody can check. */
/* Card faces cut out of the deck PDFs are the same problem as the book text:
 * Monte Cook Games' work, extracted locally, never shipped. They are supposed
 * to live outside the repository entirely, so this is the case where that went
 * wrong and one was copied in.
 *
 * Deliberately not a blanket ban on images — the system may want artwork of
 * its own one day, and a rule that stops legitimate work is a rule somebody
 * deletes. It refuses pictures sitting in a card directory, which is what the
 * extractor produces and nothing else does. */
const FORBIDDEN = [/^source[/\\]/, /^scripts[/\\]/, /^node_modules[/\\]/, /^\.git[/\\]/,
                   /^packs[/\\]/, /\.pdf$/i,
                   /^assets[/\\]/, /(^|[/\\])cards[/\\].*\.(jpe?g|png|webp)$/i];
const staged = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else staged.push(path.relative(STAGE, p));
  }
})(STAGE);

const smuggled = staged.filter(f => FORBIDDEN.some(re => re.test(f)));
if (smuggled.length) {
  console.error(`\nRefusing to build. These must never be distributed:\n`);
  for (const f of smuggled.slice(0, 20)) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
}

/* ── 7. Archive, with the manifest at its root ── */
const zipName = `${id}.zip`;
try {
  execFileSync("zip", ["-r", "-q", path.join(DIST, zipName), "."], { cwd: STAGE });
} catch (err) {
  console.error(`\nCould not run \`zip\`. Install it (apt install zip / brew install zip),\n`
              + `or archive ${STAGE} yourself with system.json at the root.\n`);
  process.exit(1);
}
rmSync(STAGE, { recursive: true, force: true });

/* ── 8. Say what was built ── */
const size = statSync(path.join(DIST, zipName)).size;
const mb = (size / 1024 / 1024).toFixed(1);
say(`\n${id} ${version}\n`);
say(`  ${moduleFiles.length} modules reached from ${manifest.esmodules.join(", ")}`);
say(`  ${(manifest.styles ?? []).length} stylesheets, ${(manifest.languages ?? []).length} language(s), `
  + `${packDirs.length} compendia declared and shipped empty`);
say(`  ${staged.length} files, ${mb} MB`);

if (orphans.length) {
  say(`\n  ${orphans.length} module(s) on disk that nothing imports, left out:`);
  for (const o of orphans) say(`    ${o}`);
}
say(`\n  dist/${zipName}`);
say(`  dist/system.json     — upload this as its own release asset, or the`);
say(`                         manifest URL has nothing to resolve to\n`);
