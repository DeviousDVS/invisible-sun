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

/* ═══════════════════════════════════════════════════════════
 * INIT HOOK — Register everything
 * ═══════════════════════════════════════════════════════════ */
Hooks.once("init", () => {
  console.log("invisible-sun | Initialising the Invisible Sun system");

  // Store config on the global CONFIG object
  CONFIG.ISUN = ISUN;

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

  // ── Handlebars ───────────────────────────────────────
  registerHandlebarsHelpers();
  preloadHandlebarsTemplates();

  console.log("invisible-sun | System initialisation complete");
});

/* ═══════════════════════════════════════════════════════════
 * READY HOOK — Post-init setup
 * ═══════════════════════════════════════════════════════════ */

/**
 * Whether this client is the one that should run migrations.
 *
 * A GM — a player has no business rewriting everyone's documents, and an owner
 * has enough permission to succeed at it, so hoping they will not is not a
 * safeguard.
 *
 * And only *one* GM. A world may have several GM accounts connected at once
 * (this one has two), and every GM client running the same migration at the
 * same moment means each reads the pre-migration value before any of them
 * writes. That happens to be survivable for the migrations here, because both
 * clients compute the same result from the same starting value — but it is
 * survivable by luck rather than by design, and the next migration need not be
 * so forgiving.
 *
 * The lowest-id active GM is elected, which is the same rule ChallengeCard uses
 * to decide which GM applies a relayed response. If that client never gets
 * there, the migration simply runs on the next load.
 */
function isMigrationRunner() {
  if (!game.user.isGM) return false;
  const first = game.users.filter(u => u.isGM && u.active)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return first?.id === game.user.id;
}

/**
 * economy.savings was a single number of crystal orbs, matching the Foundation
 * entries in The Key ("Initial Savings: 100 crystal orbs"). It is now one
 * denomination among nine in economy.purse.
 *
 * The legacy field is deliberately still declared in VislaeModel: Foundry
 * prunes keys that are absent from the schema, so dropping it outright would
 * make the stored value unreadable here and silently lose a character's money.
 * Migrated actors are left with null, which is the signal not to re-run.
 */
async function migrateSavingsToPurse() {
  if (!isMigrationRunner()) return;

  const updates = [];
  for (const actor of game.actors) {
    if (actor.type !== "Vislae") continue;
    const legacy = actor.system?.economy?.savings;
    if (typeof legacy !== "number") continue;

    updates.push({
      _id: actor.id,
      "system.economy.purse.crystal": (actor.system.economy.purse?.crystal ?? 0) + legacy,
      "system.economy.savings": null
    });
  }

  if (!updates.length) return;
  await Actor.updateDocuments(updates);
  console.log(`invisible-sun | moved economy.savings into economy.purse.crystal on ${updates.length} actor(s)`);
  ui.notifications?.info(game.i18n.format("ISUN.MigratedSavings", { count: updates.length }));
}

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

  await migrateSavingsToPurse();

  // Migration for ForteAbility level (String -> Number)
  if (isMigrationRunner()) {
    for (const pack of game.packs) {
      if (pack.metadata.type === "Item") {
        // In a real migration we'd unlock the pack, update items, and lock it again.
        // We will leave this stubbed or log for now.
      }
    }

    for (const item of game.items) {
      if (item.type === "ForteAbility" && typeof item.system.level === "string") {
        item.update({ "system.level": parseInt(item.system.level) || 1 });
      }
    }

    for (const actor of game.actors) {
      for (const item of actor.items) {
        if (item.type === "ForteAbility" && typeof item.system.level === "string") {
          item.update({ "system.level": parseInt(item.system.level) || 1 });
        }
      }
    }
  }
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
