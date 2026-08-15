/**
 * Invisible Sun — manifest and source smoke check.
 *
 * Not a test suite. It is what `npm test` can honestly do today: confirm the
 * shipped sources parse, and that the manifest does not contradict the tree it
 * describes. It needs neither Foundry nor a compiled pack, so it is safe to run
 * at any time — unlike verify_packs.js, which opens the LevelDB and therefore
 * requires Foundry to be stopped.
 *
 * The version check is the one that earns its place. system.json's `download`
 * URL names a release tag, and `version` names the release. If they drift,
 * Foundry offers an update that installs the version the user already has, and
 * nothing anywhere reports a problem.
 *
 * Usage:  npm test
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (msg) => problems.push(msg);

/* ── Every shipped .mjs parses ──
 * Only what ships. scripts/ is developer tooling and old_char_sheet/ is a
 * superseded system kept for reference; neither reaches a player. */
const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".mjs")) sources.push(full);
  }
})(path.join(ROOT, "module"));
sources.push(path.join(ROOT, "invisible-sun.mjs"));

for (const file of sources) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    fail(`${path.relative(ROOT, file)} does not parse:\n    ${String(err.stderr).trim().split("\n")[0]}`);
  }
}

/* ── The JSON the system loads at runtime is valid ── */
const json = {};
for (const file of ["system.json", "package.json", "lang/en.json"]) {
  try {
    json[file] = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  } catch (err) {
    fail(`${file} is not valid JSON: ${err.message}`);
  }
}

const manifest = json["system.json"];
const pkg = json["package.json"];

if (manifest) {
  /* ── Everything the manifest declares is actually there ── */
  const declared = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(l => l.path),
    ...(manifest.license && !manifest.license.includes(" ") ? [manifest.license] : []),
  ];
  for (const rel of declared) {
    if (!existsSync(path.join(ROOT, rel))) fail(`system.json declares "${rel}", which does not exist`);
  }

  /* Compiled packs are a build artifact and are gitignored, so a clean checkout
   * has none. The source each is built from is what must be present. */
  for (const pack of manifest.packs ?? []) {
    const source = path.join(ROOT, "packs", "_source", pack.name);
    if (!existsSync(source)) {
      fail(`pack "${pack.name}" has no source at packs/_source/${pack.name}`);
    }
  }

  /* ── The release URLs agree with the version they describe ── */
  if (manifest.download) {
    const tag = `/v${manifest.version}/`;
    if (!manifest.download.includes(tag)) {
      fail(`system.json version is ${manifest.version} but download does not name v${manifest.version}:\n    ${manifest.download}`);
    }
  }
  if (manifest.manifest && !manifest.manifest.includes("/releases/latest/download/")) {
    fail(`system.json manifest must be version-independent, or Foundry can never detect an update:\n    ${manifest.manifest}`);
  }
  if (pkg && pkg.version !== manifest.version) {
    fail(`package.json version (${pkg.version}) and system.json version (${manifest.version}) disagree`);
  }
}

/* ── Report ── */
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`ok — ${sources.length} modules parse, manifest agrees with the tree `
  + `(v${manifest?.version}, ${manifest?.packs?.length ?? 0} packs)`);
