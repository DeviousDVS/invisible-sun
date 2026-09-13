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
  SecretModel, SkillModel, CharacterArcModel, SoothCardModel, FluxModel,
  EphemeraModel, ObjectOfPowerModel,
  ThreadModel, MinorMagicModel, ConnectionModel, GearModel
} from "./module/data-models/index.mjs";

// ── Custom Documents ─────────────────────────────────────
import { ISUNActor } from "./module/documents/ISUNActor.mjs";
import { ISUNItem } from "./module/documents/ISUNItem.mjs";
import { ISUNCombat } from "./module/documents/ISUNCombat.mjs";

// ── Sheets ───────────────────────────────────────────────
import { ISUNVislaeSheet } from "./module/sheets/ISUNVislaeSheet.mjs";
import { ISUNNPCSheet } from "./module/sheets/ISUNNPCSheet.mjs";
import { ISUNCreatureSheet } from "./module/sheets/ISUNCreatureSheet.mjs";
import { ISUNItemSheet } from "./module/sheets/items/ISUNItemSheet.mjs";
import { ISUNSpellSheet } from "./module/sheets/items/ISUNSpellSheet.mjs";
import { ISUNCharacterArcSheet } from "./module/sheets/items/ISUNCharacterArcSheet.mjs";
import { ISUNForteSheet } from "./module/sheets/items/ISUNForteSheet.mjs";
import { ISUNSoothCardSheet } from "./module/sheets/items/ISUNSoothCardSheet.mjs";

// ── Challenges ───────────────────────────────────────────
import { ChallengeCard } from "./module/apps/ChallengeCard.mjs";
import { NegationCard } from "./module/apps/NegationCard.mjs";
import { NewDay } from "./module/apps/NewDay.mjs";
import { ChallengeDeclaration } from "./module/apps/ChallengeDeclaration.mjs";

// ── Helpers ──────────────────────────────────────────────
import { ISUN } from "./module/helpers/config.mjs";
import { registerHandlebarsHelpers, preloadHandlebarsTemplates } from "./module/helpers/templates.mjs";
import { rollVenture, checkDepletion } from "./module/helpers/dice.mjs";
import { ExperimentalDie } from "./module/dice/ExperimentalDie.mjs";
import { registerDiceSoNice } from "./module/helpers/dice-so-nice.mjs";
import { CompendiumBrowser } from "./module/apps/CompendiumBrowser.mjs";
import { ContentImporter } from "./module/apps/ContentImporter.mjs";
import { PortraitMatcher, PORTRAIT_SETTING } from "./module/apps/PortraitMatcher.mjs";
import { ActionTracker } from "./module/apps/ActionTracker.mjs";
import { PathOfSuns } from "./module/apps/PathOfSuns.mjs";
import { DepletionTracker, SETTING as TRACKER_SETTING, EMPTY as TRACKER_EMPTY }
  from "./module/apps/DepletionTracker.mjs";
import { MakerMatrix } from "./module/apps/MakerMatrix.mjs";
import * as flux from "./module/helpers/flux.mjs";
import { FluxPicker } from "./module/apps/FluxPicker.mjs";
import { DEFAULT_STATE as PATH_OF_SUNS } from "./module/helpers/sooth.mjs";

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
    ISUNCombat,
    rollVenture,
    checkDepletion,
    ExperimentalDie,
    CompendiumBrowser,
    ContentImporter,
    PortraitMatcher,
    ChallengeCard,
    NegationCard,
    NewDay,
    ChallengeDeclaration,
    ActionTracker,
    PathOfSuns,
    DepletionTracker,
    MakerMatrix
  };

  // The stylesheet draws the flux mark too — on the chat card and on Foundry's
  // own roll tooltip — and would otherwise need its own copy of the codepoint,
  // which is a thing to forget when the icon changes. Publishing it as a custom
  // property keeps ISUN.fluxGlyph the only place it is written down.
  document.documentElement.style.setProperty("--isun-flux-glyph", `"${ISUN.fluxGlyph}"`);
  /* Routed and absolute, both deliberately. A relative url() inside a custom
   * property is resolved against the stylesheet that *uses* it, not against the
   * document — so "systems/invisible-sun/icons/flux.png" became
   * "styles/systems/invisible-sun/icons/flux.png" once components.css read it,
   * 404'd, and the mask silently matted the mark away to nothing. An absolute
   * path resolves the same from any stylesheet, and getRoute supplies the
   * prefix a Foundry served from a subdirectory needs. */
  document.documentElement.style.setProperty("--isun-flux-mark",
    `url("${foundry.utils.getRoute(ISUN.fluxMark)}")`);

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

    /* And the portrait matcher beside it. It is the second half of importing:
     * the books' pictures arrive with the books, and which one belongs to which
     * creature is the one part of the job a person has to do. */
    const portraits = document.createElement("button");
    portraits.type = "button";
    portraits.className = "isun-portraits-btn";
    portraits.innerHTML = `<i class="fa-solid fa-image-portrait"></i> `
      + game.i18n.localize("ISUN.PortraitsButton");
    portraits.addEventListener("click", () => new PortraitMatcher().render(true));
    footer.appendChild(portraits);
  });

  /* The system's own group on the scene controls.
   *
   * These two were tools inside the token group, on the reasoning that the
   * token group is the one every user has and the one a world loads with, so a
   * tool anywhere else sits behind a click that changes which canvas layer is
   * active. The second half of that is not true of a group of our own: a
   * control group with no `layer` activates nothing, and core only calls a
   * group's onChange when it becomes active, never when it is left. So the
   * canvas is untouched by coming here — the token layer stays active and
   * tokens stay selectable while these tools are showing.
   *
   * What it costs is a click. What it buys is somewhere for the system's tools
   * to live that is not the middle of core's, and room for the ones still to
   * come.
   *
   * `button: true` on each means it does its thing and stays unselected rather
   * than becoming the active tool — so the group has no tool to activate, which
   * core allows: it looks for a non-button tool to make current and settles for
   * none.
   */
  Hooks.on("getSceneControlButtons", (controls) => {
    controls.invisibleSun = {
      name: "invisibleSun",
      // Past core's own groups, which run to 8.
      order: 90,
      title: "ISUN.SceneControlGroup",
      /* The cube the game comes in, rather than a sun. The Path of Suns tool
       * inside is the sun, and a group wearing its own tool's mark tells you
       * nothing about what else is in it. */
      icon: "fa-solid fa-cube",
      tools: {
        /* A board, not an action: "the Path of Suns board needs to have a
         * prominent place at your game table" (The Gate, p71), and what a
         * player wants is to glance at it from wherever they are. */
        pathOfSuns: {
          name: "pathOfSuns",
          order: 1,
          title: "ISUN.PathButton",
          icon: "fa-solid fa-sun",
          button: true,
          onChange: () => PathOfSuns.open()
        },

        /* A flux the GM brings about rather than one the dice found. GM only,
         * unlike the board: the Path of Suns is something the table watches,
         * and this is something only a GM may do. Hidden by `visible` rather
         * than by leaving it out, so the shape of the group is one object to
         * read rather than an object and an amendment to it. */
        magicalFlux: {
          name: "magicalFlux",
          order: 2,
          title: "ISUN.FluxButton",
          /* The scene-control form of the mark, which draws it in the
           * button's ::before and so leaves the button its own background to
           * be styled with. See .isun-flux-tool. */
          icon: "isun-flux-tool",
          button: true,
          visible: game.user.isGM,
          onChange: () => flux.promptShift()
        },

        /* The sun coming up on the whole table. The sheet has this button for
         * one character; a GM ending a session wanted it for four, and was
         * opening four sheets to press it. GM only, for the reason the sheet's
         * own is: a new day is the table moving on rather than one player
         * deciding it has. */
        /* What has not finished yet. "It is the responsibility of the player to
         * keep track of spells they cast and ongoing effects that require
         * depletion rolls" (The Way, p11) — a responsibility with a penalty
         * attached, so it is worth a board rather than a memory. Everyone sees
         * it: a player needs their own rows and the GM needs all of them. */
        ongoingEffects: {
          name: "ongoingEffects",
          order: 3,
          title: "ISUN.TrackerButton",
          icon: "fa-solid fa-hourglass-half",
          button: true,
          onChange: () => DepletionTracker.open()
        },

        newDay: {
          name: "newDay",
          order: 4,
          title: "ISUN.NewDayButton",
          icon: "fa-solid fa-bed",
          button: true,
          visible: game.user.isGM,
          onChange: () => NewDay.open()
        }
      }
    };
  });

  /* Declaring a challenge belongs with chat, because the card is a chat message
   * and the declaration is the first thing the table sees of it. GM only: only
   * the GM declares, and only players roll.
   *
   * It goes in #chat-controls, beside the roll modes, and not in .chat-form
   * where it used to be. The two are not the same place: core moves the input
   * and its controls out to the notifications pane when the sidebar is
   * collapsed, and .chat-form stays behind in the closed sidebar — so a GM
   * playing with the sidebar shut had no button at all.
   *
   * renderChatInput fires on every one of those moves and hands back the
   * elements by selector, which is why the hook is this one and not
   * renderChatLog.
   *
   * The group deliberately does not carry core's own `.control-buttons` class.
   * Core reaches for `chatControls.querySelector(".control-buttons")` to hide
   * the export and clear buttons whenever the notifications pane is showing,
   * and querySelector takes the first match — a second element wearing that
   * class ahead of theirs would be hidden in its place. */
  Hooks.on("renderChatInput", (chat, elements) => {
    if (!game.user.isGM) return;
    const controls = elements["#chat-controls"];
    if (!controls || controls.querySelector(".isun-chat-buttons")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ui-control icon fa-solid fa-dice-d20 isun-challenge-btn";
    button.dataset.tooltip = game.i18n.localize("ISUN.DeclareChallenge");
    button.setAttribute("aria-label", game.i18n.localize("ISUN.DeclareChallenge"));
    button.addEventListener("click", () => ChallengeDeclaration.open());

    const group = document.createElement("div");
    group.className = "isun-chat-buttons";
    group.append(button);
    // Before core's own group, which is the one that gets hidden.
    controls.insertBefore(group, controls.querySelector(".control-buttons"));
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
    Flux: FluxModel,
    Ephemera: EphemeraModel,
    ObjectOfPower: ObjectOfPowerModel,
    Thread: ThreadModel,
    MinorMagic: MinorMagicModel,
    Gear: GearModel,
    Connection: ConnectionModel
  });

  // ── Custom Document Classes ──────────────────────────
  CONFIG.Actor.documentClass = ISUNActor;
  CONFIG.Item.documentClass = ISUNItem;

  /* Action Mode. "Unlike many RPGs, you don't roll dice to determine who goes
   * first" — so there is no initiative formula to configure and no roll button
   * to offer. The d20 the tracker prints beside a combatant with no initiative
   * is core's invitation to roll one; ISUNCombat writes none, and the tracker
   * this system draws does not ask. */
  CONFIG.Combat.documentClass = ISUNCombat;
  CONFIG.Combat.initiative.formula = null;
  CONFIG.ui.combat = ActionTracker;

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
  /* A Sooth card is looked at more than it is edited: the face on the left and
   * The Gate's write-up beside it, rather than the schema in field order. */
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "invisible-sun", ISUNSoothCardSheet, {
    types: ["SoothCard"],
    makeDefault: true,
    label: "ISUN.SheetSoothCard",
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

  /* Whether the Path of Suns reaches the dice, or is only ever read off the
   * board. The books call the deck "a tool, not an obligation", so a table gets
   * to decide; every window shows the same thing either way. */
  game.settings.register("invisible-sun", "applySoothModifiers", {
    name: "ISUN.SettingSoothModifiers",
    hint: "ISUN.SettingSoothModifiersHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /* The board is state, not a preference, so it is not in the settings menu.
   * A world setting is the right home for it: one board for the table, written
   * by the GM and read by everyone, arriving on the other clients as a document
   * update without a socket of its own. */
  /* Which picture belongs to which creature. A world setting rather than a file
   * in the system, so choosing one takes effect without a release — and it is
   * read while the actors are built, so a portrait survives the next import
   * instead of being written over by the type's default icon. The window
   * exports it to a file for keeping in the system or handing to somebody. */
  game.settings.register("invisible-sun", PORTRAIT_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register("invisible-sun", "pathOfSuns", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(PATH_OF_SUNS)
  });

  /* What is running at this table, and when each of it is checked. A world
   * setting for the same reason the Path of Suns is one: it is the table's
   * state rather than any character's, the GM has to see all of it at once,
   * and a GM writing it reaches every other client as a document update. */
  game.settings.register("invisible-sun", TRACKER_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(TRACKER_EMPTY)
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

  /* The same relay, for the same reason, for the bene that shrugs off a Wound.
   * See NegationCard. */
  NegationCard.listen();

  /* Damage announces what it did, and the window that answers it is offered
   * from here. The document cannot reach the card itself — applications sit
   * above documents and the import would point the wrong way — and every caller
   * remembering to offer it was what let a flux Wound land in silence.
   *
   * Fired on the client that applied the damage, so one blow makes one card. */
  Hooks.on("isun.damageApplied", (actor, result) => NegationCard.offer(actor, result));

  /* A GM turning a card writes the world setting; this is what makes every
   * other open board redraw when they do. */
  PathOfSuns.listen();
  DepletionTracker.listen();

  /* A flux "immediately turns a new Sooth card" (The Way, p13). The roller may
   * be a player and the board is a world setting, so the roll flags its message
   * and a GM client acts on the flag.
   *
   * The board and the picker are handed in rather than imported: flux.mjs is
   * rules, and a rule reaching for an application cannot be loaded outside a
   * browser, which took its tests with it. This is the one place that knows
   * about both. */
  flux.listen({
    turnCard: () => PathOfSuns.turnCard(),
    chooseEffect: (options) => FluxPicker.open(options)
  });

  /* The card is drawn per client, not stored: it says different things to a
   * player and to the GM, so one saved rendering would show the GM's view to
   * everyone. renderChatMessage is deprecated in v13 and warns. */
  Hooks.on("renderChatMessageHTML", (message, html) => {
    ChallengeCard.render(message, html);
    NegationCard.render(message, html);
  });

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
