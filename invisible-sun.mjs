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
  EphemeraModel, ObjectOfPowerModel
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

// ── Helpers ──────────────────────────────────────────────
import { ISUN } from "./module/helpers/config.mjs";
import { registerHandlebarsHelpers, preloadHandlebarsTemplates } from "./module/helpers/templates.mjs";
import { rollVenture, checkDepletion } from "./module/helpers/dice.mjs";

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
    checkDepletion
  };

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
    ObjectOfPower: ObjectOfPowerModel
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
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNSpellSheet, {
    types: ["Spell", "Incantation", "ForteAbility"],
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

  // ── Handlebars ───────────────────────────────────────
  registerHandlebarsHelpers();
  preloadHandlebarsTemplates();

  console.log("invisible-sun | System initialisation complete");
});

/* ═══════════════════════════════════════════════════════════
 * READY HOOK — Post-init setup
 * ═══════════════════════════════════════════════════════════ */
Hooks.once("ready", () => {
  console.log("invisible-sun | System ready");

  // Migration for ForteAbility level (String -> Number)
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
});

/* ═══════════════════════════════════════════════════════════
 * CHAT MESSAGE HOOK — Intercept /venture commands
 * ═══════════════════════════════════════════════════════════ */
Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
  if (messageText.startsWith("/venture")) {
    const parts = messageText.split(" ");
    let challenge = 0;
    if (parts.length > 1 && !isNaN(parseInt(parts[1]))) {
      challenge = parseInt(parts[1]);
    }
    
    // In the future, this will open the Venture Dialog. 
    // For now, just fire off a basic roll.
    game.invisibleSun.rollVenture({ challenge, venture: 0, magicDice: 0, label: "Basic Venture" });
    
    return false; // Prevent Foundry from sending the literal "/venture" string
  }
  return true;
});
