/**
 * Invisible Sun — headless sheet screenshotter.
 *
 * Logs into the running Foundry world with Playwright, opens a sheet, and
 * writes a PNG plus any console/page errors. Intended for verifying CSS and
 * template changes without a human having to eyeball every one.
 *
 * Credentials come from the environment so they never land in the repo:
 *   export FOUNDRY_PASSWORD='...'          # required
 *   export FOUNDRY_USER='Claude'           # optional, defaults to Claude
 *   export FOUNDRY_URL='http://localhost:30000'   # optional
 *
 * Usage — call node directly; `npm run shot` swallows flags unless you add the
 * `--` separator (`npm run shot -- actor "Long" --tab magic`).
 *   node scripts/shoot.mjs actor "Long"
 *   node scripts/shoot.mjs actor "Long" --tab magic
 *   node scripts/shoot.mjs item  "Sleep of Ages"
 *   node scripts/shoot.mjs type  Vislae        # first actor of that type
 *   node scripts/shoot.mjs list                # what's available
 *
 * Options:
 *   --out <path>    where to write the PNG
 *   --tab <id>      switch to a tab before shooting (overview, stats, magic, ...)
 *   --full          capture the whole viewport instead of just the sheet
 *   --headed        run with a visible browser (needs a display)
 */

import { chromium } from "playwright";
import { join } from "./lib/join.mjs";
import path from "node:path";

const URL_BASE = process.env.FOUNDRY_URL || "http://localhost:30000";
const USER = process.env.FOUNDRY_USER || "Claude";
const PASSWORD = process.env.FOUNDRY_PASSWORD;

const OUT_DIR = process.env.ISUN_SHOT_DIR
  || "/tmp/claude-1001/-home-ubuntu-foundrydata-Data-systems-invisible-sun/d48e703b-c616-47ce-b634-75591ba6ae20/scratchpad";

/* ── Parse argv ─────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return (!next || next.startsWith("--")) ? true : next;
};
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && flag(argv[i - 1].slice(2)) !== true));

const mode = positional[0] || "list";
const target = positional[1];

if (!PASSWORD) {
  console.error("FOUNDRY_PASSWORD is not set. Export it before running:\n" +
                "  export FOUNDRY_PASSWORD='...'");
  process.exit(1);
}

/* ── Drive the browser ──────────────────────────────────── */
const browser = await chromium.launch({ headless: flag("headed") !== true });
// Foundry refuses to run below 1366x768.
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

/* Warnings are collected as well as errors. A deprecation warning is the only
 * notice Foundry gives that an API is going away, and it costs nothing to see
 * it now rather than when the version lands and the sheet stops rendering.
 * Kept separate so a run that is merely noisy is not mistaken for one that
 * broke. */
const problems = [];
const warnings = [];
page.on("pageerror", e => problems.push(`[pageerror] ${e.message}`));
page.on("console", m => {
  const text = m.text();
  if (m.type() === "error") problems.push(`[console] ${text}`);
  else if (m.type() === "warning") warnings.push(`[warn] ${text}`);
});

try {
  await join(page, { user: USER, password: PASSWORD, base: URL_BASE });

  /* ── list ── */
  if (mode === "list") {
    const inventory = await page.evaluate(() => ({
      actors: game.actors.map(a => `${a.name}  (${a.type})`),
      itemsByType: game.items.reduce((acc, i) => {
        (acc[i.type] ??= []).push(i.name);
        return acc;
      }, {})
    }));
    console.log("Actors:");
    inventory.actors.forEach(a => console.log("  " + a));
    console.log("\nWorld items by type:");
    for (const [type, names] of Object.entries(inventory.itemsByType)) {
      console.log(`  ${type}: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` … (+${names.length - 6})` : ""}`);
    }
  }

  /* ── render a sheet ── */
  else {
    const opened = await page.evaluate(async ({ mode, target }) => {
      let doc;
      if (mode === "actor") doc = game.actors.getName(target);
      else if (mode === "item") doc = game.items.getName(target);
      else if (mode === "type") doc = game.actors.find(a => a.type === target);
      if (!doc) return null;
      doc.sheet.render(true);
      return { name: doc.name, type: doc.type, cls: doc.sheet.constructor.name, id: doc.sheet.id };
    }, { mode, target });

    if (!opened) throw new Error(`No ${mode} matching "${target}". Run \`node scripts/shoot.mjs list\` to see options.`);

    const sheet = page.locator(`#${opened.id}`);
    await sheet.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(700);   // let fonts settle so text isn't captured mid-swap

    const tab = flag("tab");
    if (tab && tab !== true) {
      await sheet.locator(`[data-action="tab"][data-tab="${tab}"]`).click();
      await page.waitForTimeout(400);
    }

    const safe = `${opened.name}-${tab && tab !== true ? tab : "sheet"}`
      .replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const out = flag("out") !== null && flag("out") !== true
      ? flag("out")
      : path.join(OUT_DIR, `${safe}.png`);

    if (flag("full") === true) await page.screenshot({ path: out });
    else await sheet.screenshot({ path: out });

    console.log(`${opened.type} "${opened.name}" via ${opened.cls}`);
    console.log(`wrote ${out}`);
  }

  console.log(`\nconsole/page errors: ${problems.length}`);
  problems.slice(0, 25).forEach(p => console.log("  " + p));

  // Deduplicated: one render can repeat the same warning once per row.
  const seen = new Map();
  for (const w of warnings) seen.set(w, (seen.get(w) ?? 0) + 1);
  console.log(`console warnings: ${warnings.length} (${seen.size} distinct)`);
  for (const [w, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`  ${n > 1 ? `×${n} ` : ""}${w}`);
  }

} finally {
  await browser.close();
}
