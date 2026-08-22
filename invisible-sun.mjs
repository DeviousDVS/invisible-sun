/**
 * Invisible Sun — System Entry Point for Foundry VTT v14
 *
 * Registers all DataModels, custom document classes, actor/item sheets,
 * Handlebars helpers, and system configuration.
 */

// ── Data Models ──────────────────────────────────────────
import { 
  VislaeModel, NPCModel, CreatureModel,
  HeartModel, FoundationModel, SoulModel, OrderModel,
  ForteModel, ForteAbilityModel, SpellModel, IncantationModel,
  SecretModel, SkillModel, CharacterArcModel, SoothCardModel,
  EphemeraModel, ObjectOfPowerModel,
  ThreadModel, MinorMagicModel, ConnectionModel
} from "./module/data-models/index.mjs";

// ── Custom Documents ─────────────────────────────────────
import { ISUNActor } from "./module/documents/ISUNActor.mjs";
import { ISUNItem } from "./module/documents/ISUNItem.mjs";

// ── Sheets ───────────────────────────────────────────────
import { ISUNVislaeSheet } from "./module/sheets/ISUNVislaeSheet.mjs";
import { ISUNNPCSheet } from "./module/sheets/ISUNNPCSheet.mjs";
import { ISUNCreatureSheet } from "./module/sheets/ISUNCreatureSheet.mjs";
import { ISUNItemSheet } from "./module/sheets/items/ISUNItemSheet.mjs";
import { ISUNSpellSheet } from "./module/sheets/items/ISUNSpellSheet.mjs";
import { ISUNCharacterArcSheet } from "./module/sheets/items/ISUNCharacterArcSheet.mjs";
import { ISUNForteSheet } from "./module/sheets/items/ISUNForteSheet.mjs";

// ── Challenges ───────────────────────────────────────────
import { ChallengeCard } from "./module/apps/ChallengeCard.mjs";
import { ChallengeDeclaration } from "./module/apps/ChallengeDeclaration.mjs";

// ── Helpers ──────────────────────────────────────────────
import { ISUN } from "./module/helpers/config.mjs";
import { registerHandlebarsHelpers, preloadHandlebarsTemplates } from "./module/helpers/templates.mjs";
import { rollVenture, checkDepletion } from "./module/helpers/dice.mjs";
import { ExperimentalDie } from "./module/dice/ExperimentalDie.mjs";
import { registerDiceSoNice } from "./module/helpers/dice-so-nice.mjs";
import { CompendiumBrowser } from "./module/apps/CompendiumBrowser.mjs";
import { ContentImporter } from "./module/apps/ContentImporter.mjs";

// ── Migrations ───────────────────────────────────────────
import { registerMigrationSetting, runMigrations } from "./module/migrations/index.mjs";

/* ═══════════════════════════════════════════════════════════
 * INIT HOOK — Register everything
 * ═══════════════════════════════════════════════════════════ */
Hooks.once("init", () => {
  console.log("invisible-sun | Initialising the Invisible Sun system");

  // Store config on the global CONFIG object
  CONFIG.ISUN = ISUN;

  /* The quirks list is Monte Cook Games' text, so the module that ships is an
   * empty stub and the real list is generated from your own copy into
   * quirks.local.mjs, which is gitignored. Fill it with:
   *
   *     python3 scripts/build_quirks.py
   *
   * ISUN is frozen, but the array it holds is not — so the entries are pushed
   * into the existing list rather than the property being reassigned.
   *
   * Absent, this logs one 404 and the quirk field simply offers no
   * suggestions, which is what a fresh install looks like until content is
   * imported. It is deliberately not awaited: nothing needs quirks before the
   * first character sheet opens. */
  import("./module/helpers/quirks.local.mjs")
    .then(({ QUIRKS: generated = [] }) => {
      CONFIG.ISUN.quirks.push(...generated);
      console.log(`invisible-sun | ${generated.length} quirks loaded`);
    })
    .catch(() => { /* not generated on this install; the field still works */ });

  // Make the bundled Duvall faces available in Foundry's font pickers
  // (journals, drawings, text tiles) alongside the sheet CSS.
  Object.assign(CONFIG.fontDefinitions, {
    Duvall: {
      editor: true,
      fonts: [
        { urls: ["systems/invisible-sun/fonts/duvall-regular.woff2"] },
        { urls: ["systems/invisible-sun/fonts/duvall-bold.woff2"], weight: "700" }
      ]
    },
    "Duvall Small Caps": {
      editor: true,
      fonts: [
        { urls: ["systems/invisible-sun/fonts/duvall-smallcaps.woff2"] }
      ]
    }
  });

  // System namespace for shared state
  game.invisibleSun = {
    ISUNActor,
    ISUNItem,
    rollVenture,
    checkDepletion,
    ExperimentalDie,
    CompendiumBrowser,
    ContentImporter,
    ChallengeCard,
    ChallengeDeclaration
  };

  // The stylesheet draws the flux mark too — on the chat card and on Foundry's
  // own roll tooltip — and would otherwise need its own copy of the codepoint,
  // which is a thing to forget when the icon changes. Publishing it as a custom
  // property keeps ISUN.fluxGlyph the only place it is written down.
  document.documentElement.style.setProperty("--isun-flux-glyph", `"${ISUN.fluxGlyph}"`);

  // ── Custom Dice ──────────────────────────────────────
  // Dice So Nice resolves a preset whose denomination is not numeric through
  // CONFIG.Dice.terms, so "de" must be registered before its preset loads.
  CONFIG.Dice.terms[ExperimentalDie.DENOMINATION] = ExperimentalDie;

  // Dice So Nice is optional; this only arms a hook, which never fires if the
  // module is absent.
  registerDiceSoNice();

  /* The browser goes where these tools are usually looked for: the foot of the
   * compendium tab, beside Foundry's own controls. */
  Hooks.on("renderCompendiumDirectory", (app, element) => {
    const root = element instanceof HTMLElement ? element : element?.[0];
    const footer = root?.querySelector(".directory-footer");
    if (!footer || footer.querySelector(".isun-browser-btn")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "isun-browser-btn";
    button.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> `
      + game.i18n.localize("ISUN.BrowserButton");
    button.addEventListener("click", () => new CompendiumBrowser().render(true));
    footer.appendChild(button);

    /* The importer sits beside it, because "my compendia are empty" and "how do
     * I search them" are the same question asked at two different moments, and
     * this is where both get looked for. GM only: it writes to world packs. */
    if (!game.user.isGM || footer.querySelector(".isun-import-btn")) return;
    const importer = document.createElement("button");
    importer.type = "button";
    importer.className = "isun-import-btn";
    importer.innerHTML = `<i class="fa-solid fa-file-import"></i> `
      + game.i18n.localize("ISUN.ImportButton");
    importer.addEventListener("click", () => new ContentImporter().render(true));
    footer.appendChild(importer);
  });

  /* Declaring a challenge belongs with chat, because the card is a chat
   * message and the declaration is the first thing the table sees of it.
   * GM only: only the GM declares, and only players roll. */
  Hooks.on("renderChatLog", (app, element) => {
    if (!game.user.isGM) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    // v14 has no #chat-controls. The chat form is where core puts its own
    // control (the jump-to-bottom button), so the declaration sits beside it.
    const form = root?.querySelector(".chat-form");
    if (!form || form.querySelector(".isun-challenge-btn")) return;

    const button = document.createElement("button");
    button.type = "button";
    // Core styles a chat control by putting the icon classes on the button
    // itself rather than nesting an <i>, so this matches rather than fights it.
    button.className = "ui-control icon fa-solid fa-dice-d20 isun-challenge-btn";
    button.dataset.tooltip = game.i18n.localize("ISUN.DeclareChallenge");
    button.setAttribute("aria-label", game.i18n.localize("ISUN.DeclareChallenge"));
    button.addEventListener("click", () => ChallengeDeclaration.open());
    form.prepend(button);
  });

  // ── Register Data Models ─────────────────────────────
  Object.assign(CONFIG.Actor.dataModels, {
    Vislae: VislaeModel,
    NPC: NPCModel,
    Creature: CreatureModel
  });

  Object.assign(CONFIG.Item.dataModels, {
    Heart: HeartModel,
    Foundation: FoundationModel,
    Soul: SoulModel,
    Order: OrderModel,
    Forte: ForteModel,
    ForteAbility: ForteAbilityModel,
    Spell: SpellModel,
    Incantation: IncantationModel,
    Secret: SecretModel,
    Skill: SkillModel,
    CharacterArc: CharacterArcModel,
    SoothCard: SoothCardModel,
    Ephemera: EphemeraModel,
    ObjectOfPower: ObjectOfPowerModel,
    Thread: ThreadModel,
    MinorMagic: MinorMagicModel,
    Connection: ConnectionModel
  });

  // ── Custom Document Classes ──────────────────────────
  CONFIG.Actor.documentClass = ISUNActor;
  CONFIG.Item.documentClass = ISUNItem;

  // ── Register Sheets ──────────────────────────────────

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "invisible-sun", ISUNVislaeSheet, {
    types: ["Vislae"],
    makeDefault: true,
    label: "ISUN.SheetVislae",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "invisible-sun", ISUNNPCSheet, {
    types: ["NPC"],
    makeDefault: true,
    label: "ISUN.SheetNPC",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "invisible-sun", ISUNCreatureSheet, {
    types: ["Creature"],
    makeDefault: true,
    label: "ISUN.SheetCreature",
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNItemSheet, {
    makeDefault: true,
    label: "ISUN.SheetItem",
  });
  // Spell only. Incantation and ForteAbility were previously routed here too,
  // but spell-sheet.hbs edits spellType/cost/range/duration — fields neither
  // model defines — so they submitted keys their schema rejects. The generic
  // sheet renders each of their real fields instead.
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNSpellSheet, {
    types: ["Spell"],
    makeDefault: true,
    label: "ISUN.SheetSpell",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNCharacterArcSheet, {
    types: ["CharacterArc"],
    makeDefault: true,
    label: "ISUN.SheetCharacterArc",
  });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNForteSheet, {
    types: ["Forte"],
    makeDefault: true,
    label: "ISUN.SheetForte",
  });

  // ── Settings ─────────────────────────────────────────
  // The Key (p166) frames the arc limit as GM advice rather than a rule, so
  // the table gets to set it. The other caps are in-fiction and derived.
  game.settings.register("invisible-sun", "arcLimit", {
    name: "ISUN.SettingArcLimit",
    hint: "ISUN.SettingArcLimitHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.NumberField({
      required: true, integer: true, min: 0, initial: ISUN.limits.arcs
    })
  });

  // ── Migrations ───────────────────────────────────────
  // Registered in init because the ready hook reads it.
  registerMigrationSetting();

  // ── Handlebars ───────────────────────────────────────
  registerHandlebarsHelpers();
  preloadHandlebarsTemplates();

  console.log("invisible-sun | System initialisation complete");
});

/* ═══════════════════════════════════════════════════════════
 * READY HOOK — Post-init setup
 * ═══════════════════════════════════════════════════════════ */
Hooks.once("ready", async () => {
  console.log("invisible-sun | System ready");

  /* A player cannot write to a chat message the GM authored — ChatMessage
   * declares no update permission — so a response to a challenge is relayed to
   * a GM client, which applies it. Every client listens; only a GM acts. */
  ChallengeCard.listen();

  /* The card is drawn per client, not stored: it says different things to a
   * player and to the GM, so one saved rendering would show the GM's view to
   * everyone. renderChatMessage is deprecated in v13 and warns. */
  Hooks.on("renderChatMessageHTML", (message, html) => ChallengeCard.render(message, html));

  /* Whatever this world has not had yet. Elects a single GM, runs only what is
   * outstanding, and records how far it got. See module/migrations/. */
  await runMigrations();
});

/* There was a /venture chat command here. It took a challenge rating and rolled
 * with venture 0, no actor and no skills — a placeholder, by its own comment,
 * for a dialog that would come later.
 *
 * That dialog came, and then the challenge flow replaced the need for it: a
 * roll starts with the GM declaring a pool and a rating, because only players
 * roll dice and the GM sets the challenge. A command that rolls against nothing,
 * for nobody, is not a shortcut into that — it is a different and worse way to
 * resolve an action, and it was advertised in the README as a feature.
 *
 * Deleted rather than promoted into a command registry. Building infrastructure
 * around a placeholder is how placeholders become permanent. If slash commands
 * earn their place later, they can arrive with a registry of their own. */
