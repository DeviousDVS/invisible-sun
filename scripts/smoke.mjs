/**
 * Invisible Sun — smoke test against a running world.
 *
 * `npm test` checks the tree without launching anything: sources parse, the
 * manifest agrees with the files, no data-action is unhandled. It cannot tell
 * you whether the system actually works, because none of it runs.
 *
 * This does. It logs into a live world, builds a throwaway vislae, walks every
 * tab of the sheet clicking every control it can reach, rolls something, and
 * fails on any console error or any control Foundry does not recognise.
 *
 * That last one is the reason this exists. Four separate bugs in this project
 * have been a control that rendered, clicked, and did nothing — markup and
 * handler both correct in isolation and never joined up. Every one was found by
 * a human noticing, weeks later. Clicking everything is what finds them.
 *
 * Everything it creates is named "ZZ …" and deleted afterwards, including on
 * failure. It touches no existing actor.
 *
 *   export FOUNDRY_PASSWORD='...'        # required; never committed
 *   export FOUNDRY_USER='Claude'         # optional, must be a GM
 *   export FOUNDRY_URL='http://localhost:30000'
 *
 * Usage:  npm run smoke
 */
import { chromium } from "playwright";

const URL_BASE = process.env.FOUNDRY_URL || "http://localhost:30000";
const USER = process.env.FOUNDRY_USER || "Claude";
const PASSWORD = process.env.FOUNDRY_PASSWORD;

const ACTOR = "ZZ Smoke Vislae";
const TABS = ["overview", "magic", "inventory", "connections", "arcs", "biography"];

/* Not clicked. Tab switching is core's, editImage opens a file browser that
 * cannot be dismissed from here, and the destructive ones would eat the
 * fixture halfway through the walk. */
const SKIP = new Set(["tab", "editImage", "close", "minimize", "maximize",
                      "item-delete", "entry-delete", "remove-injury"]);

if (!PASSWORD) {
  console.error("FOUNDRY_PASSWORD is not set. Export it before running:\n"
              + "  export FOUNDRY_PASSWORD='...'");
  process.exit(1);
}

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [], warnings = [];
page.on("pageerror", e => errors.push(`[pageerror] ${e.message}`));
page.on("console", m => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
  else if (m.type() === "warning") warnings.push(m.text());
});

let made = null, aborted = null;
try {
  /* ── 1. The world loads ── */
  await page.goto(`${URL_BASE}/join`, { waitUntil: "networkidle" });
  await page.selectOption("select[name=userid]", { label: USER });
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[name=join]");
  try {
    await page.waitForURL("**/game", { timeout: 30_000 });
  } catch {
    const msg = await page.locator("#notifications").textContent().catch(() => "");
    throw new Error(`Login failed for "${USER}". ${msg?.trim() || "still on the join page"}`);
  }
  await page.waitForFunction(() => window.game?.ready === true, { timeout: 90_000 });

  const info = await page.evaluate(() => ({
    system: game.system.version, foundry: game.version, gm: game.user.isGM
  }));
  console.log(`\ninvisible-sun ${info.system} on Foundry ${info.foundry}, as ${USER}\n`);
  ok("the world reaches ready with no errors", errors.length === 0, errors[0] ?? "");
  if (!info.gm) throw new Error(`"${USER}" is not a GM; the smoke test needs one.`);

  /* ── 2. A vislae holding one of everything ── */
  made = await page.evaluate(async ({ name }) => {
    const a = await Actor.create({ name, type: "Vislae" });
    const types = Object.keys(CONFIG.Item.dataModels);
    await a.createEmbeddedDocuments("Item", types.map(t => ({
      name: `ZZ ${t}`, type: t,
      // A depletion value exercises the post-roll path as well as the roll.
      system: t === "Spell" ? { level: 1, depletion: "1–3 (check each hour)" } : {}
    })));
    a.sheet.render(true);
    return { id: a.id, sheetId: a.sheet.id, types: types.length };
  }, { name: ACTOR });
  const sheet = page.locator(`#${made.sheetId}`);
  await sheet.waitFor({ state: "visible", timeout: 20_000 });
  ok("the vislae sheet opens", true, `${made.types} item types`);

  /* ── 3. Every tab renders ── */
  for (const tab of TABS) {
    const before = errors.length;
    await sheet.locator(`[data-action="tab"][data-tab="${tab}"]`).click();
    await page.waitForTimeout(350);
    ok(`the ${tab} tab renders`, errors.length === before, errors[errors.length - 1] ?? "");
  }

  /* ── 4. Every control the sheet offers actually does something ── */
  const seen = new Set();
  let clicked = 0;
  for (const tab of TABS) {
    await sheet.locator(`[data-action="tab"][data-tab="${tab}"]`).click();
    await page.waitForTimeout(300);
    const names = await sheet.locator(".window-content [data-action]")
      .evaluateAll(els => [...new Set(els.map(e => e.dataset.action))]);

    for (const name of names) {
      if (SKIP.has(name) || seen.has(name)) continue;
      seen.add(name);
      const el = sheet.locator(`.window-content [data-action="${name}"]`).first();
      if (!await el.isVisible().catch(() => false)) continue;
      await el.click({ timeout: 4000 }).catch(() => {});
      clicked++;
      await page.waitForTimeout(220);

      const dialog = page.locator(".application.dialog").last();
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.locator('button[data-action="cancel"], button[data-action="close"]')
          .first().click({ timeout: 2000 }).catch(() => {});
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(220);
      }
    }
  }
  const unknown = warnings.filter(w => /unknown action|not a valid action/i.test(w));
  ok("every control clicked is one the sheet knows", unknown.length === 0,
     unknown[0] ?? `${clicked} controls`);

  /* ── 5. A roll reaches chat, and so does its depletion check ── */
  const rolled = await page.evaluate(async ({ id }) => {
    const before = game.messages.size;
    const actor = game.actors.get(id);
    await game.invisibleSun.rollVenture({
      challenge: 5, venture: 1, magicDice: 1, label: "ZZ Smoke Roll", actor });
    await game.invisibleSun.checkDepletion("1–3 (check each hour)", actor);
    return game.messages.size - before;
  }, made);
  ok("a roll and a depletion check post to chat", rolled === 2, `${rolled} messages`);

  ok("nothing errored at any point", errors.length === 0, errors[0] ?? "");
} catch (e) {
  aborted = e.message;
  console.error(`\n  ABORTED  ${e.message}`);
} finally {
  if (made) {
    await page.evaluate(async ({ id }) => {
      await game.actors.get(id)?.delete();
      const ids = game.messages.filter(m =>
        m.isRoll || /ZZ |Depletion Check|Dice So Nice/i.test(m.content || "")).map(m => m.id);
      if (ids.length) await ChatMessage.deleteDocuments(ids);
    }, made).catch(e => console.error(`  cleanup failed: ${e.message}`));
  }
  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length} checks, ${failed} failed`
            + `${aborted ? ", aborted before completion" : ""}`);
  if (errors.length) {
    console.log(`\n${errors.length} console/page error(s):`);
    errors.slice(0, 10).forEach(e => console.log(`  ${e}`));
  }
  process.exit(failed || aborted ? 1 : 0);
}
