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
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (msg) => problems.push(msg);

/* ── Every shipped .mjs parses ──
 * Only what ships: scripts/ is developer tooling and never reaches a player. */
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

/* ── Generated files still match what generated them ──
 *
 * quirks.mjs is written from quirks.json by scripts/build_quirks.py, and says
 * so in its header. A header cannot stop anyone editing the module directly and
 * losing the change at the next build; this can. The generator preserves
 * everything before `export const`, so the two only ever disagree when someone
 * has edited the list itself. */
try {
  const mod = await import(pathToFileURL(path.join(ROOT, "module/helpers/quirks.mjs")).href);
  const source = JSON.parse(readFileSync(path.join(ROOT, "source/data/quirks.json"), "utf8"));
  const built = mod.QUIRKS ?? [];
  const at = built.findIndex((q, i) => q !== source[i]);
  if (built.length !== source.length || at !== -1) {
    /* Name where they diverge. "50 entries vs 50" is no help when the counts
     * agree and a line was reworded, which is the likeliest way this happens. */
    const where = built.length !== source.length
      ? `${built.length} entries vs ${source.length}`
      : `first difference at entry ${at}:\n`
        + `      built:  ${JSON.stringify(built[at]?.slice(0, 60))}\n`
        + `      source: ${JSON.stringify(source[at]?.slice(0, 60))}`;
    fail(`module/helpers/quirks.mjs is out of step with source/data/quirks.json — ${where}\n`
       + `    Edit the JSON, then run: python3 scripts/build_quirks.py`);
  }
} catch (err) {
  fail(`could not compare quirks.mjs against quirks.json: ${err.message}`);
}

/* ── Every data-action in a sheet template has a handler ──
 *
 * This is the check the project actually needed. Four separate incidents came
 * from markup naming a control that nothing was listening for, each failing in
 * silence: a button that rendered, clicked, and did nothing. ApplicationV2
 * warns at runtime now, but only if someone happens to click it — this refuses
 * before the commit.
 *
 * Parsed rather than imported: the sheets reach for `foundry`, `game` and
 * `CONFIG` at module scope, none of which exist outside a browser. */
{
  const CORE_ACTIONS = new Set([
    // Provided by ApplicationV2 / DocumentSheetV2 / ActorSheetV2.
    "tab", "attach", "detach", "close", "submit",
    "configureSheet", "configureOwnership", "copyUuid", "editImage", "importDocument",
    "configurePrototypeToken", "configureToken", "showPortraitArtwork", "showTokenArtwork"
  ]);
  // Chat cards bind their own listeners; they are not Application parts.
  const CHAT_TEMPLATES = /templates[\\/]chat[\\/]/;

  const declared = new Set(CORE_ACTIONS);
  for (const file of sources) {
    const src = readFileSync(file, "utf8");
    const block = src.match(/actions:\s*\{([\s\S]*?)\n\s{4}\}/);
    if (!block) continue;
    for (const m of block[1].matchAll(/["']?([\w-]+)["']?\s*:/g)) declared.add(m[1]);
  }

  const templates = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".hbs")) templates.push(full);
    }
  })(path.join(ROOT, "templates"));

  const orphans = new Map();
  for (const file of templates) {
    if (CHAT_TEMPLATES.test(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/data-action="([^"{}]+)"/g)) {
      if (!declared.has(m[1])) {
        const line = src.slice(0, m.index).split("\n").length;
        orphans.set(`${m[1]}`, `${path.relative(ROOT, file)}:${line}`);
      }
    }
  }
  for (const [action, where] of orphans) {
    fail(`data-action="${action}" at ${where} has no handler.\n`
       + `    Add it to a sheet's DEFAULT_OPTIONS.actions, or remove it from the markup.`);
  }
}

/* ── Every registered item type is accounted for on the vislae sheet ──
 *
 * The sheet collects embedded items into named buckets. A type registered in
 * the system but missing from that map is not an error Foundry can see: the
 * item exists, the sheet just never shows it. So the sheet declares which types
 * it deliberately does not collect, and this holds every registered type to
 * appearing in one list or the other. */
{
  const entry = readFileSync(path.join(ROOT, "invisible-sun.mjs"), "utf8");
  const sheet = readFileSync(path.join(ROOT, "module/sheets/ISUNVislaeSheet.mjs"), "utf8");

  const block = entry.match(/CONFIG\.Item\.dataModels,\s*\{([\s\S]*?)\}\)/);
  const buckets = sheet.match(/static ITEM_BUCKETS\s*=\s*\{([\s\S]*?)\n\s{2}\}/);
  const skipped = sheet.match(/static UNBUCKETED_ITEM_TYPES\s*=\s*\[([\s\S]*?)\]/);

  if (!block || !buckets || !skipped) {
    fail("could not read the item type registration or the sheet's bucket map "
       + "— one of them has been renamed or reformatted, and this check is now blind");
  } else {
    const registered = [...block[1].matchAll(/(\w+):\s*\w+Model/g)].map(m => m[1]);
    const covered = new Set([
      ...[...buckets[1].matchAll(/(\w+):\s*"/g)].map(m => m[1]),
      ...[...skipped[1].matchAll(/"(\w+)"/g)].map(m => m[1])
    ]);
    for (const type of registered) {
      if (!covered.has(type)) {
        fail(`item type "${type}" is registered but the vislae sheet neither collects\n`
           + `    it nor lists it in UNBUCKETED_ITEM_TYPES — items of that type would be\n`
           + `    silently invisible on the sheet.`);
      }
    }
  }
}

/* ── Localisation keys ──
 *
 * Two questions, and only one of them is an error.
 *
 * A key referenced but not defined is a real fault: game.i18n returns the key
 * itself, so the player reads "ISUN.Whatever" on their sheet. That fails.
 *
 * A key defined but not referenced is only ever information. Item 11 is the
 * reason: ISUN.AutoSuccess, ISUN.MundaneDie, ISUN.MagicDie and the three Flux
 * keys all sat unreferenced for months — not because they were dead, but
 * because dice-result.hbs had hardcoded English where it should have used them.
 * A checker that deleted its orphans would have deleted the fix. So these are
 * counted, and listed on request, and never fatal.
 */
{
  const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return (v && typeof v === "object") ? flatten(v, key) : [key];
  });
  const defined = new Set(flatten(json["lang/en.json"] ?? {}));

  const config = readFileSync(path.join(ROOT, "module/helpers/config.mjs"), "utf8");
  const declared = config.match(/DYNAMIC_KEY_PREFIXES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  const prefixes = declared
    ? [...declared[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
    : [];
  if (!prefixes.length) fail("could not read DYNAMIC_KEY_PREFIXES from module/helpers/config.mjs");

  // Files that can reference a key: shipped modules and every template.
  const referencing = [...sources];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".hbs")) referencing.push(full);
    }
  })(path.join(ROOT, "templates"));

  const referenced = new Set();
  for (const file of referencing) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/["'`](ISUN\.[A-Za-z0-9_.]+)["'`]/g)) {
      // A literal that *is* a declared prefix is the stem of a composed key,
      // not a key: "ISUN.Arc" only ever appears inside (concat "ISUN.Arc" …).
      if (!prefixes.includes(m[1])) referenced.add(m[1]);
    }
  }

  for (const key of referenced) {
    if (!defined.has(key)) {
      const where = referencing.find(f => readFileSync(f, "utf8").includes(key));
      fail(`"${key}" is used but not defined in lang/en.json — it will render as `
         + `its own key.\n    First seen in ${path.relative(ROOT, where ?? "?")}`);
    }
  }

  for (const prefix of prefixes) {
    if (![...defined].some(k => k.startsWith(prefix) && k !== prefix)) {
      fail(`DYNAMIC_KEY_PREFIXES declares "${prefix}", but no key in lang/en.json `
         + `begins with it.\n    The composition it describes is stale, or the prefix is misspelled.`);
    }
  }

  const unreferenced = [...defined].filter(k =>
    !referenced.has(k) && !prefixes.some(p => k.startsWith(p)));
  if (unreferenced.length) {
    const listed = process.argv.includes("--unused");
    console.log(`note: ${unreferenced.length} of ${defined.size} localisation keys are not `
      + `referenced anywhere.${listed ? "" : " Run `npm test -- --unused` to list them."}`);
    if (listed) for (const k of unreferenced.sort()) console.log(`  ${k}`);
    console.log("  Not an error: a key can be unused because something forgot to use it.");
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
