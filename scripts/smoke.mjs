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
 * What it does not cover, and why: the challenge flow needs a GM and a player
 * connected at once, and a second set of credentials this script has no way to
 * ask for. Exercise that by hand, or with a two-session script of your own.
 *
 *   export FOUNDRY_PASSWORD='...'        # required; never committed
 *   export FOUNDRY_USER='Claude'         # optional, must be a GM
 *   export FOUNDRY_URL='http://localhost:30000'
 *
 * Usage:  npm run smoke
 */
import { chromium } from "playwright";
import { join } from "./lib/join.mjs";

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

let made = null, aborted = null, savedPath = null, boardMessages = [];
try {
  /* ── 1. The world loads ── */
  await join(page, { user: USER, password: PASSWORD, base: URL_BASE });

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

  /* ── 5. The other two actor sheets, and every item sheet ──
   *
   * Cheap, and it covers what the vislae walk cannot: a template edit that
   * breaks the NPC sheet, or an item type whose sheet throws on open, is
   * otherwise found by a person opening it weeks later. */
  for (const type of ["NPC", "Creature"]) {
    const before = errors.length;
    const one = await page.evaluate(async ({ type }) => {
      const a = await Actor.create({ name: `ZZ ${type}`, type });
      a.sheet.render(true);
      return { id: a.id, sheetId: a.sheet.id };
    }, { type });
    const npcSheet = page.locator(`#${one.sheetId}`);
    const shown = await npcSheet.waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true).catch(() => false);
    await page.waitForTimeout(300);
    ok(`the ${type} sheet opens`, shown && errors.length === before,
       !shown ? "never became visible" : (errors[errors.length - 1] ?? ""));

    /* These two are one scrolling page rather than a set of tabs, so there is
     * no tab walk to find their controls — but they carry the same repeating
     * lists and the same Wound, Anguish and Injury pips the vislae does, and
     * those are exactly the shape of control that has rendered and done nothing
     * four times in this project. Each distinct action gets one click, and the
     * lists are counted before and after rather than merely clicked: a row that
     * does not appear is the failure this is looking for. */
    if (shown) {
      const rows = () => page.evaluate(id => {
        const a = game.actors.get(id);
        return { defenses: a.system.defenses.length, abilities: a.system.abilities.length,
                 injuries: a.system.health.injuries.length };
      }, one.id);
      const rowsBefore = await rows();
      const errsBefore = errors.length;

      /* Keyed on the action *and* the list it targets, not on the action alone.
       * Both add buttons here are `entry-add`; one clicked per name meant the
       * Abilities button was never pressed at all, and the walk reported five
       * actions exercised while covering four. Which is the same shape of miss
       * this whole section exists to catch. */
      const actions = await npcSheet.locator(".window-content [data-action]")
        .evaluateAll(els => [...new Set(els.map(e => `${e.dataset.action}|${e.dataset.path ?? ""}`))]);
      for (const key of actions) {
        const [name, path] = key.split("|");
        if (SKIP.has(name)) continue;
        const selector = path
          ? `.window-content [data-action="${name}"][data-path="${path}"]`
          : `.window-content [data-action="${name}"]`;
        const el = npcSheet.locator(selector).first();
        if (!await el.isVisible().catch(() => false)) continue;
        await el.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(250);
      }
      const rowsAfter = await rows();
      /* An action with no handler is a console warning, not an error — the same
       * thing the vislae walk looks for above, and the reason that check reads
       * the warning list rather than this one. Both are checked here: a handler
       * that throws shows up as an error instead. */
      const unknownHere = warnings.filter(w => /unknown action|not a valid action/i.test(w));
      ok(`every control on the ${type} sheet is one it knows`,
         unknownHere.length === 0 && errors.length === errsBefore,
         unknownHere[0] ?? errors[errors.length - 1] ?? `${actions.length} actions`);
      ok(`the ${type} sheet's add buttons add a row`,
         rowsAfter.defenses > rowsBefore.defenses
         && rowsAfter.abilities > rowsBefore.abilities
         && rowsAfter.injuries > rowsBefore.injuries,
         JSON.stringify(rowsAfter));
    }

    await page.evaluate(async ({ id }) => {
      game.actors.get(id)?.sheet?.close();
      await game.actors.get(id)?.delete();
    }, one);
  }

  {
    const itemTypes = await page.evaluate(() => Object.keys(CONFIG.Item.dataModels));
    const broken = [];
    for (const type of itemTypes) {
      const before = errors.length;
      const one = await page.evaluate(async ({ type }) => {
        const i = await Item.create({ name: `ZZ ${type}`, type });
        i.sheet.render(true);
        return { id: i.id, sheetId: i.sheet.id };
      }, { type });
      const shown = await page.locator(`#${one.sheetId}`)
        .waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(200);
      if (!shown || errors.length > before) broken.push(type);
      await page.evaluate(async ({ id }) => {
        game.items.get(id)?.sheet?.close();
        await game.items.get(id)?.delete();
      }, one);
    }
    ok("every item type's sheet opens", broken.length === 0,
       broken.length ? broken.join(", ") : `${itemTypes.length} types`);
  }

  /* ── 6. The Path of Suns turns, and every control on it works ──
   *
   * The board is the one part of the system that is shared table state rather
   * than a document, so it is the one part where a broken control means the GM
   * cannot play a card at all. The world's own board is put back afterwards. */
  {
    const before = errors.length;
    savedPath = await page.evaluate(() => game.settings.get("invisible-sun", "pathOfSuns"));
    // A card turn is announced in chat, so the log grows: note where it was, to
    // take back out exactly what this test put in.
    const messagesBefore = await page.evaluate(() => game.messages.size);
    await page.evaluate(async () => {
      await game.settings.set("invisible-sun", "pathOfSuns",
        { version: 1, history: [], nightside: false });
      game.invisibleSun.PathOfSuns.open();
    });

    const board = page.locator("#isun-path-of-suns");
    const shown = await board.waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true).catch(() => false);

    // Turned rather than clicked: a card turn is a write to a world setting,
    // and what is being checked is that the whole round trip lands.
    await board.locator('[data-action="turnCard"]').click().catch(() => {});
    await page.waitForTimeout(500);
    const turned = await page.evaluate(() =>
      game.settings.get("invisible-sun", "pathOfSuns").history.length);
    ok("the Path of Suns turns a card", shown && turned > 0 && errors.length === before,
       !shown ? "the board never opened" : (errors[errors.length - 1] ?? `${turned} played`));

    // Every control except the two that need an answer: placeCard opens a
    // dialog, and openCard a sheet, both of which the walk above already
    // exercises the pattern of.
    const boardSkip = new Set([...SKIP, "placeCard", "openCard", "toggleControls"]);
    let boardClicks = 0;
    for (const name of await board.locator("[data-action]")
      .evaluateAll(els => [...new Set(els.map(e => e.dataset.action))])) {
      if (boardSkip.has(name)) continue;
      const el = board.locator(`[data-action="${name}"]`).first();
      if (!await el.isVisible().catch(() => false)) continue;
      await el.click({ timeout: 4000 }).catch(() => {});
      boardClicks++;
      await page.waitForTimeout(300);
    }
    const boardUnknown = warnings.filter(w => /unknown action|not a valid action/i.test(w));
    ok("every control on the board works", boardUnknown.length === 0 && errors.length === before,
       boardUnknown[0] ?? errors[errors.length - 1] ?? `${boardClicks} controls`);
    boardMessages = await page.evaluate(from =>
      game.messages.contents.slice(from).map(m => m.id), messagesBefore);
    await page.evaluate(() =>
      foundry.applications.instances.get("isun-path-of-suns")?.close());
  }

  /* ── 7. A roll reaches chat, and so does its depletion check ── */
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
  if (savedPath) {
    await page.evaluate(async ({ saved, messages }) => {
      if (messages.length) await ChatMessage.deleteDocuments(messages);
      await game.settings.set("invisible-sun", "pathOfSuns", saved);
    }, { saved: savedPath, messages: boardMessages })
      .catch(e => console.error(`  board not restored: ${e.message}`));
  }
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
