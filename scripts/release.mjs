/**
 * Invisible Sun — tell Foundry's package listing about a release.
 *
 * Foundry keeps its own record of which versions of a package exist and what
 * each is compatible with. Uploading a GitHub release does not update it; this
 * does, by POSTing to the package API.
 *
 * ── Nothing is typed twice ──
 * Every value it sends is read out of system.json, because a release declared
 * as one version and tagged as another installs as the wrong thing, and the way
 * that happens is somebody retyping a number. The manifest is the specification
 * here exactly as it is for `npm run dist`.
 *
 * ── Two manifest URLs, and they are not the same URL ──
 * The `manifest` field *inside* system.json has to be version-independent —
 * `/releases/latest/download/system.json` — or Foundry can never notice that a
 * newer version exists. `scripts/check.mjs` fails the build if it is not.
 *
 * What the API wants for a release is the opposite: the manifest belonging to
 * *this* version, pinned to its tag. So that one is derived from `download`,
 * which is already pinned, by swapping the filename. Deriving it rather than
 * declaring it is what stops the zip and the manifest ever naming different
 * releases.
 *
 * ── Dry run unless told otherwise ──
 * Publishing is outward-facing and awkward to take back, so `--publish` is
 * required to do it for real. Without it the API is asked to validate and
 * report, which is the same request with `dry-run` set.
 *
 * ── The token ──
 * Read from the environment and never written down. It is a credential for
 * your Foundry account's packages, and a file is a thing that gets committed.
 *
 *   export FOUNDRY_PACKAGE_TOKEN='fvttp_...'
 *
 * Usage:
 *   npm run release                 validate this version, change nothing
 *   npm run release -- --publish    actually publish it
 *   npm run release -- --as 0.1.1   announce a version other than the
 *                                   manifest's, which is almost never right
 *
 * The separator is optional — `npm run release --publish` works too. Node never
 * sees that spelling, so it is read back out of the environment; see `flag`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://foundryvtt.com/_api/packages/release_version/";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A flag, from wherever npm has left it.
 *
 * `npm run release -- --publish` arrives in argv. `npm run release --publish`,
 * without the separator, does not: npm reads it as one of its own options,
 * never passes it on, and quietly sets npm_config_publish instead. Both spell
 * the same intention and only one of them used to work — which for this flag
 * meant asking to publish, getting a dry run, and being told to run again with
 * the flag you had just used.
 */
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) {
    const next = argv[i + 1];
    return (!next || next.startsWith("--")) ? true : next;
  }
  const kept = process.env[`npm_config_${name.replace(/-/g, "_")}`];
  if (kept === undefined || kept === "") return null;
  return kept === "true" ? true : kept;
};

const token = process.env.FOUNDRY_PACKAGE_TOKEN;
if (!token) {
  console.error("\nFOUNDRY_PACKAGE_TOKEN is not set. Export it before running:\n"
    + "  export FOUNDRY_PACKAGE_TOKEN='fvttp_...'\n\n"
    + "Get one from your package's admin page on foundryvtt.com.\n");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8"));
const { id, download, compatibility = {} } = manifest;
// `--as`, not `--version`: npm answers --version itself, so that spelling
// would never reach this script at all.
const version = typeof flag("as") === "string" ? flag("as") : manifest.version;

const problems = [];
if (!id) problems.push("system.json declares no id");
if (!version) problems.push("system.json declares no version");
if (!download) problems.push("system.json declares no download URL");
if (!compatibility.minimum) problems.push("system.json declares no compatibility.minimum");

/* The release's own manifest and notes, derived from the download URL so that
 * all three can only ever name the same GitHub release. */
let releaseManifest = null;
let notes = null;
if (download) {
  if (!download.includes(`/${version}/`) && !download.includes(`/v${version}/`)) {
    problems.push(`the download URL does not name version ${version}:\n    ${download}`);
  }
  releaseManifest = download.replace(/[^/]+$/, "system.json");
  const tag = download.match(/\/releases\/download\/([^/]+)\//)?.[1];
  if (!tag) problems.push(`could not read a tag out of the download URL:\n    ${download}`);
  else notes = download.replace(/\/releases\/download\/.*$/, `/releases/tag/${tag}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  process.exit(1);
}

const publish = flag("publish") === true;
const body = {
  id,
  "dry-run": !publish,
  release: {
    version,
    manifest: releaseManifest,
    notes,
    compatibility: {
      minimum: compatibility.minimum ?? "",
      verified: compatibility.verified ?? "",
      maximum: compatibility.maximum ?? ""
    }
  }
};

console.log(`\n${id} ${version}${publish ? "" : "  (dry run)"}\n`);
console.log(`  manifest  ${releaseManifest}`);
console.log(`  notes     ${notes}`);
console.log(`  compat    minimum ${body.release.compatibility.minimum}, `
  + `verified ${body.release.compatibility.verified || "—"}, `
  + `maximum ${body.release.compatibility.maximum || "—"}`);
console.log(`  token     ${token.slice(0, 8)}… (${token.length} chars)\n`);

/* Asked for before the API is, because the API fetches this itself and reports
 * a failure in its own words. "404 on the manifest you named" is a more useful
 * sentence than whatever comes back second-hand. */
try {
  const head = await fetch(releaseManifest, { redirect: "follow" });
  if (!head.ok) {
    console.error(`  The manifest URL is not reachable (HTTP ${head.status}).\n`
      + `  Upload system.json to the release as its own asset, named exactly\n`
      + `  "system.json", or Foundry has nothing to read.\n`);
    process.exit(1);
  }
  const named = JSON.parse(await head.text());
  if (named.version !== version) {
    console.error(`  The manifest at that URL declares version ${named.version}, `
      + `not ${version}.\n  Upload the built system.json for this release.\n`);
    process.exit(1);
  }
  console.log(`  manifest reachable, and declares ${named.version} ✓\n`);
} catch (err) {
  console.error(`  Could not read the manifest URL: ${err.message}\n`);
  process.exit(1);
}

const response = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify(body)
});

let data;
const text = await response.text();
try { data = JSON.parse(text); } catch { data = text; }

console.log(`  HTTP ${response.status}\n`);
console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
console.log("");

if (!response.ok || data?.status === "error") {
  console.error(publish ? "  Not published.\n" : "  The release would be rejected as it stands.\n");
  process.exit(1);
}
console.log(publish
  ? `  Published. ${id} ${version} is now listed.\n`
  : `  Looks good. Run again with --publish to do it for real.\n`);
