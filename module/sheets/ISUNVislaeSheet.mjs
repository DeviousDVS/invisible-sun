const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

import { ActorSheetMixin } from "./SheetMixin.mjs";
import { VentureDialog } from "../apps/VentureDialog.mjs";
import { ApplyIdentity } from "../apps/ApplyIdentity.mjs";
import { HeartSkills } from "../apps/HeartSkills.mjs";
import * as vance from "../helpers/vance.mjs";
import * as practiceRules from "../helpers/practice.mjs";
import { ForteAbilityPicker } from "../apps/ForteAbilityPicker.mjs";
import { CompendiumPicker } from "../apps/CompendiumPicker.mjs";
import { IncantationGrant } from "../apps/IncantationGrant.mjs";
import * as sooth from "../helpers/sooth.mjs";

/**
 * Invisible Sun — the vislae sheet
 */
export class ISUNVislaeSheet extends ActorSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "actor", "vislae"],
    position: { width: 1010, height: 755 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },

    /* Every control the sheet answers, named once.
     *
     * These were bound by hand — twenty-five querySelectorAll calls against a
     * mix of classes and [data-action] attributes — and the two conventions had
     * already drifted apart: refresh-pool, add-wound, remove-wound, add-anguish
     * and remove-anguish were written in the markup with no handler of that
     * name anywhere, working only because the same elements happened to carry a
     * class that was bound. A reader could not tell which convention was live.
     *
     * ApplicationV2 dispatches these itself and warns about an action it does
     * not recognise, so the failure that has cost this project four incidents —
     * markup and handler both correct in isolation, never joined up, failing
     * silently — becomes a console warning. scripts/check.mjs then refuses any
     * data-action in a template that has no entry here.
     *
     * Handlers are called with `this` set to the sheet and the element carrying
     * the attribute as the second argument, so they read that argument and
     * never `event.currentTarget`, which under delegation is the part root
     * rather than the control that was clicked. */
    actions: {
      "refresh-pool":       this.prototype._onRefreshPool,
      "alloc-pool":         this.prototype._onAllocatePool,
      "add-wound":          this.prototype._onAddWound,
      "remove-wound":       this.prototype._onRemoveWound,
      "add-anguish":        this.prototype._onAddAnguish,
      "remove-anguish":     this.prototype._onRemoveAnguish,
      "add-vex":            this.prototype._onAddVex,
      "remove-vex":         this.prototype._onRemoveVex,
      "add-injury":         this.prototype._onAddInjury,
      "remove-injury":      this.prototype._onRemoveInjury,
      "apply-damage":       this.prototype._onApplyDamage,
      "rest-recover":       this.prototype._onRestRecover,
      "new-day":            this.prototype._onNewDay,
      "roll-skill":         this.prototype._onRollSkill,
      "open-item":          this.prototype._onOpenItem,
      "toggle-ladder":      this.prototype._onToggleLadder,
      "toggle-degree":      this.prototype._onToggleDegree,
      "pick-forte-ability": this.prototype._onPickForteAbility,
      "pick-thread":        this.prototype._onPickThread,
      "pick-spell":         this.prototype._onPickSpell,
      "grant-incantation":  this.prototype._onGrantIncantation,
      "filter-practices":   this.prototype._onFilterPractices,
      "advancement-adjust": this.prototype._onAdjustAdvancement,
      "entry-add":          this.prototype._onEntryAdd,
      "entry-delete":       this.prototype._onEntryDelete,
      /* The practices list emits one of these three from {{p.action}}. They all
       * mean "use this", and all reach the same handler. */
      "toggle-prepared":    this.prototype._onTogglePrepared,
      "toggle-halved":      this.prototype._onToggleHalved,
      "roll-depletion":     this.prototype._onRollDepletion,
      "roll-spell":         this.prototype._onItemRoll,
      "roll-incantation":   this.prototype._onItemRoll,
      "use-ability":        this.prototype._onItemRoll
    }
  };

  static TABS = {
    primary: {
      initial: "overview",
      tabs: [
        { id: "overview",    label: "ISUN.TabOverview" },
        { id: "magic",       label: "ISUN.TabMagic" },
        { id: "inventory",   label: "ISUN.TabInventory" },
        { id: "connections", label: "ISUN.TabConnections" },
        { id: "arcs",        label: "ISUN.TabArcs" },
        { id: "biography",   label: "ISUN.TabBiography" }
      ]
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/actor/vislae-sheet.hbs" }
  };

  /**
   * Which context key each item type is collected into.
   *
   * One map, where there were sixteen array declarations and a sixteen-case
   * switch that had to agree with them — a type added to one and not the other
   * produced an empty list rather than an error.
   *
   * Deliberately a map and not a rule. Three of these are irregular in English:
   * a CharacterArc lands in `arcs`, Ephemera is already plural, and
   * ObjectOfPower pluralises in the middle. A rule clever enough to derive the
   * regular thirteen would still need those three declared, and would have
   * renamed `objectsOfPower` to `objectOfPowers` to earn it — the tail wagging
   * the dog. The names here are the ones the templates read.
   */
  static ITEM_BUCKETS = {
    Heart:         "hearts",
    Foundation:    "foundations",
    Soul:          "souls",
    Order:         "orders",
    Forte:         "fortes",
    ForteAbility:  "forteAbilities",
    Spell:         "spells",
    Incantation:   "incantations",
    Secret:        "secrets",
    Skill:         "skills",
    CharacterArc:  "arcs",
    Ephemera:      "ephemera",
    ObjectOfPower: "objectsOfPower",
    Thread:        "threads",
    MinorMagic:    "minorMagics",
    Gear:          "gear",
    Connection:    "connections"
  };

  /**
   * Item types this sheet deliberately does not collect.
   *
   * Declared rather than simply omitted, so the difference between "decided
   * against" and "forgotten" is written down. npm test holds every registered
   * item type to appearing in one list or the other.
   */
  static UNBUCKETED_ITEM_TYPES = [
    // A Sooth card is drawn and read, not carried; nothing on the sheet shows one.
    "SoothCard",
    /* A flux effect happens to a character rather than being held by one. The
     * GM picks it off a chart and it lands in chat; what it leaves behind — a
     * vex, a Wound — is written onto the sheet as that, not as an item. */
    "Flux"
  ];



  // Application V2 Context prep
  /**
   * Load the current forte's abilities from the compendium.
   *
   * The character holds only what they have taken, but the tree has to show
   * what they could take next, which means the whole forte. Cached against the
   * forte so a re-render does not re-read the pack.
   */
  async _loadForteAbilities(forte) {
    if (!forte) { this._forteAbilities = null; this._forteAbilitiesFor = null; return null; }
    if (this._forteAbilitiesFor === forte.name && this._forteAbilities) return this._forteAbilities;
    const pack = game.packs.get("invisible-sun.forte-abilities");
    if (!pack) return null;
    const docs = await pack.getDocuments();
    /* Matched loosely, as ForteTree matches it. A Forte already on a character
     * keeps whatever name it was dragged in under, so an exact comparison ties
     * the tree to a spelling rather than to a forte: re-casing 21 names in the
     * pack — "Bears An Orb" to the book's "Bears an Orb" — would have emptied
     * the tree for every character built before the correction. */
    const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    this._forteAbilities = docs.filter(d => norm(d.system.parentForte) === norm(forte.name));
    this._forteAbilitiesFor = forte.name;
    return this._forteAbilities;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    /* What the Path of Suns is doing to each colour of magic. Read here because
     * it needs the Sooth pack's index, which is asynchronous, and the practices
     * table below is not. */
    context.soothShifts = await sooth.spellShifts();
    this._prepareSheetData(context);
    return context;
  }


  /**
   * Everything the template reads, assembled in dependency order.
   *
   * This was one 206-line method. Splitting it changes no behaviour — the
   * pieces below are the blocks it already had, in the order it already ran
   * them — but it gives each concern a name and a place, so a new feature lands
   * in one of them rather than in the middle of everything.
   *
   * Items come first and everything else reads what they produced: the order
   * panel needs context.orders, the practices table needs four of the buckets,
   * the sentence needs four more.
   */
  _prepareSheetData(context) {
    // Config for template dropdowns
    context.config = CONFIG.ISUN;

    this.#prepareItems(context);
    this.#prepareOrder(context);
    this.#preparePractices(context);
    this.#prepareAllocation(context);
    this.#prepareRests(context);
    this.#prepareSecrets(context);
    this.#prepareSentence(context);
  }

  /**
   * Sort the embedded items into their buckets, and group the connections.
   */
  #prepareItems(context) {
    for (const bucket of Object.values(ISUNVislaeSheet.ITEM_BUCKETS)) context[bucket] = [];
    for (const item of context.actor.items) {
      const bucket = ISUNVislaeSheet.ITEM_BUCKETS[item.type];
      if (bucket) context[bucket].push(item);
    }

    // Connections are one type distinguished by bondType, so the sheet groups
    // them rather than the data model splitting them.
    context.connectionGroups = Object.keys(CONFIG.ISUN?.bondTypes ?? {}).map(key => ({
      key,
      label: CONFIG.ISUN.bondTypeGroups?.[key] ?? CONFIG.ISUN.bondTypes[key],
      items: context.connections.filter(c => c.system?.bondType === key)
    }));
  }

  /**
   * The order panel: which order, which degree, and the ladder either side of it.
   */
  #prepareOrder(context) {
    // Which order's subsystem to show. Worked out by the actor, so that what
    // the sheet draws and what prepareDerivedData computed cannot disagree.
    context.orderKey = this.document.orderKey;
    context.order = context.orders[0] ?? null;
    context.orderInfo = context.orderKey ? CONFIG.ISUN.orders[context.orderKey] : null;

    /* The ladder is read from the Order item rather than copied onto the
     * character: every order names its own six degrees, and which abilities a
     * vislae holds follows from the degree they have reached. Degrees not yet
     * attained are still shown, with what they cost and ask, because that is
     * what a player is deciding about when they spend Crux. */
    const held = context.actor.system.meta?.orderDegree ?? 0;
    const degrees = context.order?.system?.degrees ?? [];
    context.orderDegree = held;
    /* Which parts of the ladder are open is a view preference, held on the
     * sheet rather than the actor: it should not write to the document, sync
     * to other players, or survive into someone else's window. */
    context.ladderOpen = this._ladderOpen ?? false;
    context.orderDegreeTitle = degrees.find(d => d.degree === held)?.title ?? "";
    context.degreeLadder = degrees.map(d => ({
      ...d,
      attained: d.degree <= held,
      current: d.degree === held,
      expanded: this._openDegree === d.degree,
      // The 1st degree is where a character starts, so it is not bought.
      cost: d.degree === 1 ? 0 : d.cruxCost
    }));
    /* What the next rung costs, for the row that offers the choice. Read off
     * the ladder rather than computed, so it is the same number the ladder
     * shows further down the sheet. Null at the top of the ladder, and null
     * with no order to have degrees in — in both cases there is nothing to
     * save towards and the row says nothing. */
    context.nextDegree = context.degreeLadder.find(d => d.degree === held + 1) ?? null;

    /* An Apostate has no ladder at all: a fixed set to begin with, and the
     * rest bought one at a time for 1 Crux each (The Key, p5535). */
    context.isApostate = context.orderKey === "apostate";
    context.apostateStarting = context.order?.system?.startingAbilities ?? [];
    context.apostatePurchasable = context.order?.system?.apostateAbilities ?? [];
    // How many of each list a character gets, and what the second one costs.
    // Both are rules about the list rather than about any one ability.
    context.apostateStartingNote = context.order?.system?.startingNote ?? "";
    context.apostatePurchasableNote = context.order?.system?.apostateNote ?? "";
  }

  /**
   * Spells, incantations, forte abilities and minor magics as one sortable list.
   */
  /**
   * What the Mind column shows for one practice.
   *
   * Separated from `practice()` because it is the only part of a row that
   * depends on the character rather than on the item, and because it answers
   * three different things — whether the column applies at all, whether the
   * box is ticked, and why it cannot be — that read better named than inline.
   */
  #preparation(item, mind) {
    if (!mind || !vance.isVancian(item)) return { vancian: false };
    const { allowed, reason } = vance.canPrepare(item, mind);
    return {
      vancian: true,
      prepared: !!item.system.prepared,
      halved: !!item.system.halved,
      footprint: vance.footprint(item),
      canPrepare: allowed,
      /* Why not, for the tooltip. A disabled control that will not say what is
       * wrong with it is the thing players ask the GM about. */
      blockedReason: reason
    };
  }

  #preparePractices(context) {
    const shifts = context.soothShifts ?? {};
    /* The mind, with the two things only the view needs: how full the bar is,
     * and what to call it. The book captions its diagrams by degree — "Mind of
     * the Postulant", "Mind of the Magister" — so the heading follows the
     * degree title, and falls back to a bare "Mind" for a Vance who has not
     * been placed on the ladder yet. */
    const mind = context.actor.system.mind ?? null;
    if (mind) {
      mind.percent = mind.capacity ? Math.min(100, Math.round((mind.used / mind.capacity) * 100)) : 0;
      mind.label = context.orderDegreeTitle
        ? game.i18n.format("ISUN.MindOf", { title: context.orderDegreeTitle })
        : game.i18n.localize("ISUN.Mind");
    }
    context.mind = mind;
    // Spells, incantations, forte abilities and minor magics share a shape —
    // level, colour, cost, dice, depletion — because the rules treat them the
    // same way: a forte ability "unless stated otherwise, costs Sorcery to use,
    // equal to the level of the effect", exactly as a spell does. One list lets
    // a player sort across all of them, which four separate lists cannot.
    /* What the Kind column says lives in helpers/practice.mjs, because the
     * chat card names a practice too and the two must not disagree about what
     * a thing is. Localised there rather than in the template because a
     * spell's label is composed rather than looked up, and `cost` already
     * localises here for the same reason. */
    const practice = (item, kind, action) => {
      const sys = item.system;
      return {
        item, kind, action,
        kindLabel: practiceRules.kindLabelFor(item, kind),
        level: sys.level ?? 0,
        color: sys.color ?? "",
        /* What a practice costs in Sorcery is its level, so the two are not
         * shown side by side. `system.cost` exists on the models and is empty
         * on all 1,117 entries across the four packs, so nothing is being
         * hidden by not consulting it; if a world ever fills one in, this is
         * where it would have to be read again.
         *
         * A forte ability marked "(no cost)" is the one real exception — 74 of
         * the 491 — and the level badge says so rather than a column. */
        free: !!sys.noCost,
        // A spell carries its bonus as printed ("+1 die"); a forte ability's is
        // parsed out of its level line as a number. Both mean the same thing, so
        // the column says it the same way.
        dice: sys.dice || (sys.bonusDice
          ? `+${sys.bonusDice} ${game.i18n.localize(sys.bonusDice === 1 ? "ISUN.DieUnit" : "ISUN.DiceUnit")}`
          : ""),
        depletion: sys.depletion || "",
        /* Whether the Depletion column is a button or just words. 370 of the
         * 541 entries begin with a number and can be thrown; the rest end on a
         * sunrise or a condition and there is nothing to roll. */
        depletionRollable: !!practiceRules.depletionRange(sys.depletion),
        condition: sys.condition || "",
        /* What the board is doing to this one right now. "Spells and effects
         * linked to the stronger sun have their effective level increased by 1
         * … or the Sorcery cost of their effect reduced by 1" (The Gate, p73) —
         * effects, so an incantation or a forte ability of that colour is
         * shifted as much as a spell is. Shown beside it and applied by nobody:
         * which of the two the player takes is their choice, made as they
         * cast. */
        shift: shifts[String(sys.color ?? "").toLowerCase()] ?? null,

        /* Vancian preparation. `mind` is null for every other order and for
         * every other kind of practice, which the row reads as "this column is
         * not about you" and leaves blank — a Weaver's spells and a Vance's
         * forte abilities are not prepared and must not offer a checkbox. */
        ...this.#preparation(item, mind)
      };
    };

    context.practices = [
      ...context.spells.map(i => practice(i, "spell", "roll-spell")),
      ...context.incantations.map(i => practice(i, "incantation", "roll-incantation")),
      ...context.forteAbilities.map(i => practice(i, "forte", "use-ability")),
      ...context.minorMagics.map(i => practice(i, "minor", "use-ability"))
    ].sort((a, b) => a.level - b.level || a.item.name.localeCompare(b.item.name));

    context.practiceKinds = ["spell", "incantation", "forte", "minor"].map(k => ({
      key: k,
      label: `ISUN.Kind${k.charAt(0).toUpperCase()}${k.slice(1)}`,
      count: context.practices.filter(p => p.kind === k).length
    }));
    context.practiceFilter = this._practiceFilter ?? "all";
  }

  /**
   * Stat points still to place, the forte, and Crux.
   */
  #prepareAllocation(context) {
    /* The controls appear only while points are waiting to be placed — at
     * creation, and again whenever advancement grants more. A finished sheet
     * carries none of it. Reallocating afterwards is still possible through the
     * pool's own max field, which sits beside them. */
    const stats = this.document.system.stats ?? {};
    context.unspentPoints = stats.unspentPoints ?? 0;
    context.unspent = stats.unspent ?? { certes: 0, qualia: 0, shared: 0 };
    context.canPlace = stats.canPlace ?? { certes: 0, qualia: 0 };
    context.showAllocation = context.unspentPoints > 0;

    /* A forte's abilities are a tree, so the panel needs the whole forte's
     * abilities from the compendium, not only the ones already taken. Loading
     * them is async, so it is done in _prepareContext and cached per forte. */
    context.forte = context.fortes[0] ?? null;

    /* What a character can advance with.
     *
     * Crux is derived rather than held: a Joy and a Despair together are worth
     * one, and the exchange happens when something is bought. So the row shows
     * how many pairs are in hand, and says which of the two is the limit when
     * they are uneven — "you have the Joy for four but the Despair for one" is
     * the useful thing to know when deciding what to chase next.
     *
     * Hidden Knowledge sits here rather than with the pools it is stored beside.
     * It is not spent and refreshed the way a pool is; it grows, like Acumen.
     */
    const adv = context.actor.system.advancement ?? {};
    context.crux = adv.cruxAvailable ?? 0;
    context.advancement = [
      { key: "joy", value: adv.joy ?? 0, icon: "fa-sun",
        label: "ISUN.Joy", hint: "ISUN.JoyHint" },
      { key: "despair", value: adv.despair ?? 0, icon: "fa-moon",
        label: "ISUN.Despair", hint: "ISUN.DespairHint" },
      { key: "acumen", value: adv.acumen ?? 0, icon: "fa-graduation-cap",
        label: "ISUN.Acumen", hint: "ISUN.AcumenHint" },
      { key: "hiddenKnowledge", value: context.actor.system.stats?.hiddenKnowledge?.value ?? 0,
        icon: "fa-eye", label: "ISUN.StatHiddenKnowledge", hint: "ISUN.HiddenKnowledgeHint",
        path: "system.stats.hiddenKnowledge.value" },
    ];
    context.cruxShortOf = adv.cruxShortOf
      ? game.i18n.localize(adv.cruxShortOf === "joy" ? "ISUN.Joy" : "ISUN.Despair")
      : null;
  }

  /**
   * Rests remaining, what refreshing costs, and who may type in a pool.
   */
  #prepareRests(context) {
    // Rests remaining today, as pips rather than a used-count.
    const remaining = context.actor.restsRemaining;
    // Skills are grouped by category because that is what a new level costs
    // in Acumen, and the groups are shown even when empty so the cost is
    // visible before a character has any.
    const cfg = CONFIG.ISUN;
    context.skillGroups = ["action", "narrative", "development"].map(key => ({
      key,
      label: game.i18n.localize(cfg.skillCategories[key]),
      acumenCost: cfg.skillAcumenCost[key],
      skills: context.skills
        .filter(i => (i.system.category || "action") === key)
        .sort((a, b) => a.name.localeCompare(b.name))
    }));
    for (const g of context.skillGroups) {
      for (const sk of g.skills) sk.maxLevel = cfg.skillMaxLevel;
    }

    context.restRows = [
      { key: "quick",  label: "ISUN.RestQuick",  max: 2, left: remaining.quick },
      { key: "tenMin", label: "ISUN.RestTenMin", max: 1, left: remaining.tenMin },
      { key: "hour",   label: "ISUN.RestHour",   max: 1, left: remaining.hour },
    ];
    context.canRestHeal = remaining.tenMin + remaining.hour > 0;

    /* Refreshing a pool spends the cheapest rest still available, so the button
     * can say which one that is and how many are left before it is clicked. */
    const cheapest = this.document.cheapestRest;
    context.restsLeft = remaining.quick + remaining.tenMin + remaining.hour;
    context.nextRest = cheapest;
    context.refreshTip = cheapest
      ? game.i18n.format("ISUN.RefreshCosts", {
          rest: game.i18n.localize(`ISUN.Rest${cheapest.charAt(0).toUpperCase()}${cheapest.slice(1)}`),
          left: context.restsLeft })
      : game.i18n.localize("ISUN.NoRestsLeft");

    /* The pool boxes are the allocation and the bene currently held; neither is
     * something a player should type over. A GM keeps inputs as the escape
     * hatch — the difference is invisible to a player, who just sees numbers. */
    context.canEditPools = game.user.isGM;
  }

  /**
   * The soul, and secrets split by where on the sheet they belong.
   */
  #prepareSecrets(context) {
    // A vislae's soul is secret — the fan sheet this was modelled on keeps it
    // in a hidden row. Owners and GMs see it; observers with read access do not.
    context.showSecrets = this.document.isOwner;
    context.soul = context.showSecrets ? (context.souls[0] ?? null) : null;

    /* Secrets are split by what they apply to, and each kind is shown where the
     * thing it applies to lives. House secrets are augments to a house, capped
     * by its size, so they sit with the House block. Changery secrets only work
     * once the body has been altered to suit, so they sit under Appearance. The
     * rest apply to the vislae and stay with the practices they modify.
     *
     * The character strip stays the catch-all — everything not claimed by a
     * block of its own — so a secret can never be filtered off the sheet
     * altogether. Naming the kinds it wants instead would hide any that arrives
     * with a type this list has not been taught about. */
    const ELSEWHERE = ["house", "changery"];
    const secretsOfType = t => context.secrets.filter(i => i.system?.secretType === t);
    context.houseSecrets = secretsOfType("house");
    context.changerySecrets = secretsOfType("changery");
    context.characterSecrets =
      context.secrets.filter(i => !ELSEWHERE.includes(i.system?.secretType));
  }

  /**
   * The character sentence, pre-rendered with each part linking to its item.
   */
  /**
   * The vertula kada — the sentence a vislae introduces themselves with.
   *
   * "I am a Connected Stoic of the order of Vance's who Caught Fire's Eye."
   *
   * Assembled rather than filled in, because its shape changes. An Apostate
   * belongs to no order, so they are named rather than placed in one — "…, an
   * Apostate who…" instead of the nonsense "…of the order of Apostate's…" — and
   * the article follows the foundation, which may begin with a vowel.
   *
   * Every noun in it is a link to the item it names. That is the sheet's only
   * route to a Heart, Foundation, Order or Forte, so a part the character does
   * not hold is deliberately inert rather than looking clickable and doing
   * nothing. Item names are user-supplied and escaped; the template emits the
   * result with {{{ }}}.
   */
  #prepareSentence(context) {
    const esc = Handlebars.escapeExpression;
    const part = (cls, item, placeholder) => {
      if (!item) return `<span class="sentence-part ${cls} unset">${esc(placeholder)}</span>`;
      return `<a class="sentence-part ${cls}" data-action="open-item" data-item-id="${esc(item.id)}"`
           + ` data-tooltip="${esc(item.name)}">${esc(item.name)}</a>`;
    };

    /* "an Iconoclastic", "a Connected". The test is on the letter rather than
     * the sound: none of the eight foundations is an "hour" or a "unicorn", and
     * a rule that reads the spelling is one a GM adding their own can predict.
     * With no foundation yet, the placeholder takes the commoner article. */
    const foundation = context.foundations[0]?.name ?? "";
    const article = game.i18n.localize(
      /^[aeiou]/i.test(foundation) ? "ISUN.SentenceArticleAn" : "ISUN.SentenceArticleA");

    /* The grammar sits outside the link: "Vance" is the item's name, and the
     * plural's "s" — or "the" before it, or the "a" that makes Goetica — is
     * not part of that name.
     *
     * Which phrasing an order takes is a fact about the order, so it is
     * declared with the rest of them in CONFIG.ISUN.orders rather than decided
     * here. The Apostate is one of those declarations now instead of a branch:
     * they are not of an order, which is a different sentence rather than a
     * special case of this one.
     *
     * The joining letter is marked up so it reads as part of the word it joins
     * — bold and the order's colour, like the name — while staying outside the
     * anchor, so it is not part of what a click opens. Only when there is a
     * name for it to join: appended to the "[Order]" placeholder it would be a
     * bold letter on the end of a grey italic stand-in. */
    const order = context.orders[0];
    const affix = context.orderInfo?.affix ?? CONFIG.ISUN.orderAffix;
    const orderPhrase = game.i18n.format(
      context.orderInfo?.sentence ?? "ISUN.SentenceOfTheOrder",
      {
        order: part("order", order, "[Order]"),
        affix: (order && affix) ? `<span class="sentence-part order affix">${esc(affix)}</span>` : ""
      });

    context.characterSentenceHTML = game.i18n.format("ISUN.CharacterSentence", {
      article,
      foundation: part("foundation", context.foundations[0], "[Foundation]"),
      heart:      part("heart",      context.hearts[0],      "[Heart]"),
      // Carries its own leading space or comma, since which one depends on it.
      order:      orderPhrase,
      forte:      part("forte",      context.fortes[0],      "[Forte]")
    });
  }


  /** Narrative lists the sheet can add rows to. */
  static ENTRY_LISTS = ["system.narrative.memories", "system.narrative.personality"];

  /**
   * expandObject turns `foo.0.title` into `{foo: {0: {...}}}`, which an
   * ArrayField rejects. Convert those numeric-keyed objects back into arrays.
   */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    for (const path of ISUNVislaeSheet.ENTRY_LISTS) {
      const raw = foundry.utils.getProperty(submitData, path);
      if (!raw || Array.isArray(raw) || typeof raw !== "object") continue;
      const list = Object.keys(raw)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => raw[k]);
      foundry.utils.setProperty(submitData, path, list);
    }

    return submitData;
  }

  // Application V2 Event Listeners
  /* Everything clickable is declared in DEFAULT_OPTIONS.actions. This remains
   * for the one control that is not a click: a skill's level is an <input>, and
   * an action map only dispatches clicks.
   *
   * It is marked data-change rather than data-action deliberately. Letting a
   * change-bound control wear data-action would put back the exact ambiguity
   * this commit removes — that an attribute sometimes means "ApplicationV2
   * dispatches this" and sometimes means "something, somewhere, binds this".
   * data-action now means the first and only the first, which is what lets
   * check.mjs treat any unhandled one as an error. */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    htmlElement.querySelectorAll('[data-change="skill-level"]').forEach(el =>
      el.addEventListener("change", this._onSkillLevel.bind(this)));
  }

  /** Filter the practices list by kind, without a re-render. */
  _onFilterPractices(event, target) {
    event.preventDefault();
    const kind = target.dataset.kind ?? "all";
    this._practiceFilter = kind;
    const root = target.closest(".practices");
    root.dataset.filter = kind;
    root.querySelectorAll(".practice-filter").forEach(el =>
      el.classList.toggle("active", el.dataset.kind === kind));
  }

  /**
   * A dropped Foundation states what the character begins play with, and a
   * vislae cannot change foundation in play — so a drop is always character
   * creation and the values are simply assigned. Swapping the foundation while
   * building reassigns them to the new one, and replaces the old item, since
   * the sheet reads a single Foundation and a second would do nothing.
   *
   * The ids are collected before the drop creates anything, so the replacement
   * cannot delete what it just added.
   */
  async _onDropItem(event, item) {
    const superseded = ApplyIdentity.handles(item)
      ? this.document.items.filter(i => i.type === item.type).map(i => i.id)
      : [];

    const created = await super._onDropItem(event, item);
    const dropped = Array.isArray(created) ? created[0] : created;
    if (!dropped || !ApplyIdentity.handles(dropped)) return created;

    // A heart's starting skills belong to the heart that granted them, so a
    // swap takes them away before the new one offers its own.
    for (const id of superseded) await HeartSkills.clearFrom(this.document, id);
    if (superseded.length) await this.document.deleteEmbeddedDocuments("Item", superseded);

    const changed = await ApplyIdentity.apply(this.document, dropped);
    if (changed.length) {
      ui.notifications?.info(
        game.i18n.format("ISUN.IdentityApplied",
          { name: dropped.name, values: changed.join(", ") }));
    }

    /* The heart's skills are a choice — "choose two skills from this list" —
     * so unlike its points they are asked for rather than assigned. */
    if (dropped.type === "Heart") await HeartSkills.offer(this.document, dropped);
    return created;
  }

  /**
   * Place a point in a pool, or take one back.
   *
   * A pool's `max` is its allocation — what it refreshes to — so that is what
   * moves. `value` is the bene currently in it, and at creation it follows the
   * allocation; once a character is in play it has drifted with spending, and
   * raising the allocation should not hand them a free bene. So value only
   * follows while it still matches what the pool held.
   */
  async _onAllocatePool(event, target) {
    event.preventDefault();
    const el = target;
    if (el.classList.contains("disabled")) return;

    const { pool, stat, delta } = el.dataset;
    const d = Number(delta);
    const p = this.document.system.stats?.[stat]?.pools?.[pool];
    if (!p) return;

    const max = (p.max ?? 0) + d;
    if (max < 0) return;
    // A stat may place what it still holds plus whatever is left of the shared
    // reserve; it may never reach into the other stat's grant.
    if (d > 0 && (this.document.system.stats?.canPlace?.[stat] ?? 0) < 1) return;

    const update = { [`system.stats.${stat}.pools.${pool}.max`]: max };
    if ((p.value ?? 0) === (p.max ?? 0)) {
      update[`system.stats.${stat}.pools.${pool}.value`] = max;
    }
    return this.document.update(update);
  }

  /**
   * Open or close the degree ladder.
   *
   * Toggled in place rather than by re-rendering, like the practice filter: a
   * re-render would rebuild the tab and lose the scroll position for what is
   * only a change of view.
   */
  _onToggleLadder(event, target) {
    event.preventDefault();
    const root = target.closest(".degree-ladder");
    this._ladderOpen = !root.classList.contains("open");
    root.classList.toggle("open", this._ladderOpen);
    const caret = target.querySelector("i");
    caret?.classList.toggle("fa-caret-right", !this._ladderOpen);
    caret?.classList.toggle("fa-caret-down", this._ladderOpen);
  }

  /** Expand one degree, closing whichever was open. */
  _onToggleDegree(event, target) {
    event.preventDefault();
    const degree = Number(target.dataset.degree);
    const root = target.closest(".degree-ladder");
    const already = this._openDegree === degree;
    this._openDegree = already ? null : degree;
    for (const el of root.querySelectorAll(".degree")) {
      el.classList.toggle("expanded", !already && Number(el.dataset.degree) === degree);
    }
  }

  /** Open the forte's tree to pick the next ability. */
  async _onPickForteAbility(event, target) {
    event.preventDefault();
    const forte = this.document.items.find(i => i.type === "Forte");
    // Abilities come from a forte, so without one there is nothing to offer —
    // and saying which is missing is more use than an empty window.
    if (!forte) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ForteNoneYet"));
      return;
    }
    const abilities = await this._loadForteAbilities(forte);
    if (!abilities?.length) {
      ui.notifications?.warn(game.i18n.format("ISUN.ForteNoAbilities", { forte: forte.name }));
      return;
    }
    return ForteAbilityPicker.open(this.document, forte, abilities);
  }

  /**
   * Add an aggregate from the compendium.
   *
   * The Way prints every aggregate with eight or so qualities and a handful of
   * absences, so a blank one is a page of retyping. The picker offers the pack
   * and keeps the option to invent one.
   */
  async _onPickThread(event, target) {
    event.preventDefault();
    await CompendiumPicker.open({
      actor: this.document,
      pack: "invisible-sun.threads",
      type: "Thread",
      title: game.i18n.localize("ISUN.PickerThreadTitle"),
      hint: game.i18n.localize("ISUN.AggregatesHint"),
      fields: ["color", "defaultRange", "defaultDuration", "qualities"],
      // What tells one aggregate from another at a glance is what it is made
      // of, so the qualities lead; range and duration follow.
      summarise: e => {
        const s = e.system ?? {};
        const range = [s.defaultRange, s.defaultDuration].filter(Boolean).join(" · ");
        const qualities = (s.qualities ?? []).slice(0, 4).join(", ");
        return [qualities, range].filter(Boolean).join("  —  ");
      }
    });
    this.render();
  }

  /**
   * Roll a practice's depletion, when the table says the moment has come.
   *
   * "0 (check each round)", "0–1 (check each use)", "0–4 (check each hour)" —
   * the number is what a d10 has to land in and the parenthesis is when to
   * throw it. Only the second half of that is a rule the sheet could enforce,
   * and it would need to know about rounds, hours and days that Foundry is not
   * tracking, so the moment stays the table's and the throw is a click.
   *
   * Offered only where there is something to roll: an entry that ends on the
   * next sunset has no range, and the column renders as plain text.
   */
  async _onRollDepletion(event, target) {
    event.preventDefault();
    const li = target.closest(".item");
    const item = li && this.document.items.get(li.dataset.itemId);
    if (!item) return;

    /* The depletion value, not the item holding it. checkDepletion parses a
     * string, so passing the Item put an object through .match() and threw —
     * and a guard on truthiness could not catch it, because an Item is truthy. */
    await game.invisibleSun.checkDepletion(item.system?.depletion ?? "", this.document);
  }

  /**
   * Add a spell from the compendium.
   *
   * A blank Spell is a page of retyping — level, colour, cost, range, duration,
   * depletion, dice, facets and the description, all of which are printed on a
   * card that is already in the pack. So the "+" offers the pack, and keeps the
   * option to invent one for a spell a table has made up.
   *
   * Which decks are offered depends on the order, and the two directions are
   * not symmetrical. A Vance holds general spells beside the ones in their
   * grimoire, so they are offered both. Nobody else is offered the Vance deck
   * at all: Vancian magic is what the order *is* — spells prepared into the
   * mind and cast free — and there is no price at which a Weaver buys into it.
   *
   * Offered, not enforced. A spell already on the sheet stays there and still
   * casts, so a GM who hands a Vance spell to somebody else as a plot object
   * has not been overruled by a dialog. This only decides what the "+" puts in
   * front of a player, which for a Weaver was a whole deck they could never use.
   *
   * A character with no Order item yet counts as not a Vance, which is right:
   * the deck arrives with the order, and dropping the Order on the sheet is
   * what opens it.
   */
  async _onPickSpell(event, target) {
    event.preventDefault();
    const vance = this.document.orderKey === "vance";
    await CompendiumPicker.open({
      actor: this.document,
      pack: vance
        ? ["invisible-sun.spells", "invisible-sun.vance-spells"]
        : ["invisible-sun.spells"],
      type: "Spell",
      title: game.i18n.localize("ISUN.PickerSpellTitle"),
      hint: game.i18n.localize(vance ? "ISUN.PickerSpellHintVance" : "ISUN.PickerSpellHint"),
      /* More than the summary shows: the picker searches everything the index
       * carries, so fetching depletion means "sun sets" finds the spells that
       * end at nightfall even though no row prints it. */
      fields: ["level", "color", "spellType", "depletion", "cost", "facets"],
      /* What tells one spell from another in a list of several hundred: its
       * level, which is also what it costs to cast, its colour, and the
       * tradition it belongs to. The tradition is said only when there is one —
       * "general" is the absence of a tradition rather than a fifth one, and
       * printing it on every general spell would bury the word on the rows
       * where it means something. */
      summarise: e => {
        const sys = e.system ?? {};
        const tradition = sys.spellType && sys.spellType !== "general"
          ? game.i18n.localize(CONFIG.ISUN.spellTypes[sys.spellType] ?? sys.spellType)
          : "";
        /* Not localised: spellColorChoices maps a colour to itself, so the
         * stored value is already the label. The suns are named, not described. */
        const colour = sys.color ?? "";
        return [sys.level != null ? game.i18n.format("ISUN.LevelN", { level: sys.level }) : "",
                colour, tradition].filter(Boolean).join(" · ");
      }
    });
    this.render();
  }

  /**
   * Receive an incantation.
   *
   * Not a create button and not a picker: an acquiescent incantation is what
   * the universe decides to give, so this draws one. Choosing is offered only
   * where the character's degree has earned a conation slot.
   */
  async _onGrantIncantation(event, target) {
    event.preventDefault();
    await IncantationGrant.open(this.document);
    this.render();
  }

  /** Roll a skill: open the venture dialog with that skill already ticked. */
  async _onRollSkill(event, target) {
    event.preventDefault();
    const li = target.closest(".item");
    const skill = this.document.items.get(li?.dataset.itemId);
    if (!skill) return;
    return VentureDialog.open(this.document, { skill, label: skill.name });
  }

  /**
   * Award or spend one of the four advancement values. The GM's to give.
   *
   * Checked here as well as hidden in the template, the same way vex is.
   * Hiding a control only stops it being offered — an owner has permission to
   * update their own actor — so this is what actually holds, for as long as a
   * client-side check holds anything.
   *
   * Hidden Knowledge lives under stats rather than advancement, so the row
   * carries its own path; the rest are addressed by key.
   */
  async _onAdjustAdvancement(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;

    const { key, delta } = target.dataset;
    if (!key) return;

    const row = (this.constructor.ADVANCEMENT_PATHS ?? {})[key] ?? `system.advancement.${key}`;
    const current = foundry.utils.getProperty(this.document, row) ?? 0;
    const next = Math.max(0, current + (Number(delta) || 0));
    if (next === current) return;
    return this.document.update({ [row]: next });
  }

  /** Where each advancement value is stored, where it is not under advancement. */
  static ADVANCEMENT_PATHS = {
    hiddenKnowledge: "system.stats.hiddenKnowledge.value"
  };

  /** Edit a skill's level in place, clamped to the cap of 4. */
  async _onSkillLevel(event, target) {
    event.preventDefault();
    const input = target;
    const item = this.document.items.get(input.dataset.itemId);
    if (!item) return;
    const level = Math.clamp(Math.round(Number(input.value) || 0), 0, CONFIG.ISUN.skillMaxLevel);
    input.value = level;
    return item.update({ "system.level": level });
  }

  /** Open an item named elsewhere on the sheet, by id. */
  _onOpenItem(event, target) {
    event.preventDefault();
    const item = this.document.items.get(target.dataset.itemId);
    item?.sheet?.render(true);
  }

  /** Add one Injury of the given source; conversion happens in _preUpdate. */
  async _onAddInjury(event, target) {
    event.preventDefault();
    const source = target.dataset.source === "mental" ? "mental" : "physical";
    return this.document.applyDamage({ amount: 1, type: source, ignoreArmor: true });
  }

  /** Remove a single Injury from the track — healing, not negation. */
  async _onRemoveInjury(event, target) {
    event.preventDefault();
    const idx = Number(target.dataset.index);
    const track = [...(this.document.system.status.injuries ?? [])];
    if (!Number.isInteger(idx) || idx < 0 || idx >= track.length) return;
    track.splice(idx, 1);
    return this.document.update({ "system.status.injuries": track });
  }

  async _onEntryAdd(event, target) {
    event.preventDefault();
    const path = target.dataset.path;
    if (!path) return;
    const list = foundry.utils.getProperty(this.document, path) ?? [];
    return this.document.update({ [path]: [...list, { title: "", description: "" }] });
  }

  async _onEntryDelete(event, target) {
    event.preventDefault();
    const { path, index } = target.dataset;
    if (!path) return;
    const list = [...(foundry.utils.getProperty(this.document, path) ?? [])];
    list.splice(Number(index), 1);
    return this.document.update({ [path]: list });
  }
  
  /**
   * Place or clear a vex. The GM's to give: a vex comes from a kindled item or
   * a piece of weird magic, never from something the character chooses.
   *
   * Checked here as well as hidden in the template. Hiding a control only
   * stops it being offered — an owner can still update their own actor — so
   * the guard is what actually holds, for as long as a client-side check can
   * hold anything.
   *
   * The pool's group is derived from its name rather than read from the
   * dataset, matching _onAllocatePool, so the two cannot disagree about where
   * a pool lives.
   */
  _onAddVex(event, target)    { return this._onModifyVex(event, target, 1); }
  _onRemoveVex(event, target) { return this._onModifyVex(event, target, -1); }

  async _onModifyVex(event, target, delta) {
    event.preventDefault();
    if (!game.user.isGM) return;

    const pool = target.dataset.pool;
    if (!pool) return;
    const group = CONFIG.ISUN.certesPoolNames.includes(pool) ? "certes" : "qualia";
    const path = `system.stats.${group}.pools.${pool}.vex`;

    const current = foundry.utils.getProperty(this.document, path) ?? 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    await this.document.update({ [path]: next });
  }

  /**
   * Refreshing a pool is what a rest does, so it spends one. Shift-click resets
   * without spending — the GM "can state that pools reset to their starting
   * values" at any time (The Key, p2300).
   */
  async _onRefreshPool(event, target) {
    event.preventDefault();
    if (target.classList.contains("disabled")) return;
    const pool = target.dataset.pool;
    if (!pool) return;

    const group = CONFIG.ISUN.certesPoolNames.includes(pool) ? "certes" : "qualia";
    const result = await this.document.restRefreshPool(group, pool, { free: event.shiftKey });

    if (result?.refused === "noRests") {
      ui.notifications?.warn(game.i18n.localize("ISUN.NoRestsLeft"));
      return;
    }
    if (result?.refreshed) await ISUNVislaeSheet.#announceRefresh(this.document, result);
  }

  /**
   * Say that a pool was refreshed, and what it cost.
   *
   * Rests are a shared reckoning — three a day between everyone's turns — so a
   * player spending one is not private bookkeeping. Announced from the sheet
   * rather than from the actor for the same reason the challenge card is: the
   * document changes state, and telling the table is a different job.
   */
  static async #announceRefresh(actor, result) {
    const { renderTemplate } = foundry.applications.handlebars;
    const restLabel = (key) =>
      game.i18n.localize(`ISUN.Rest${key.charAt(0).toUpperCase()}${key.slice(1)}`);

    /* What is left, in the terms the sheet uses — "Action x2, 1 hour" rather
     * than a count, because the three are not interchangeable and knowing two
     * remain says nothing about which. */
    const left = Object.entries(result.restsLeft ?? {})
      .filter(([, n]) => n > 0)
      .map(([key, n]) => n > 1 ? `${restLabel(key)} ×${n}` : restLabel(key));

    const content = await renderTemplate(
      "systems/invisible-sun/templates/chat/rest-refresh.hbs", {
        poolLabel: game.i18n.localize(CONFIG.ISUN.poolLabels[result.refreshed] ?? result.refreshed),
        from: result.from,
        to: result.to,
        vexCleared: result.vexCleared,
        free: result.free,
        restLabel: result.restType ? restLabel(result.restType) : "",
        restsLeftText: left.length ? left.join(", ") : game.i18n.localize("ISUN.RestNoneLeft")
      });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  /**
   * Take damage. The bene-negation window follows on its own.
   *
   * It used to be offered from here, as a confirm on whoever clicked. That was
   * one path out of four — a flux, the injury pips and any macro landed a Wound
   * in silence — and it asked the wrong person once applying damage went
   * GM-only. applyDamage announces what it did now, and NegationCard answers,
   * so every path offers the window and it opens for the player whose bene it
   * is. See module/apps/NegationCard.mjs.
   */
  async _onApplyDamage(event, target) {
    event.preventDefault();
    const DialogV2 = foundry.applications.api.DialogV2;

    const form = await DialogV2.prompt({
      window: { title: game.i18n.localize("ISUN.ApplyDamage") },
      classes: ["invisible-sun", "apply-damage-dialog"],
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("ISUN.DamageAmount")}</label>
          <input type="number" name="amount" value="1" min="1" autofocus />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ISUN.DamageSource")}</label>
          <select name="type">
            <option value="physical">${game.i18n.localize("ISUN.InjuryPhysical")}</option>
            <option value="mental">${game.i18n.localize("ISUN.InjuryMental")}</option>
          </select>
        </div>
        <div class="form-group checkbox">
          <label><input type="checkbox" name="ignoreArmor" /> ${game.i18n.localize("ISUN.IgnoreArmor")}</label>
        </div>`,
      ok: {
        label: game.i18n.localize("ISUN.Apply"),
        callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!form) return;

    await this.document.applyDamage({
      amount: Number(form.amount) || 0,
      type: form.type === "mental" ? "mental" : "physical",
      ignoreArmor: !!form.ignoreArmor
    });
  }

  /** Spend a longer rest to recover a Wound or an Anguish. */
  async _onRestRecover(event, target) {
    event.preventDefault();
    const kind = target.dataset.kind;
    const result = await this.document.restRecoverHealth(kind);
    if (result?.refused === "noRests") ui.notifications?.warn(game.i18n.localize("ISUN.NoLongRestsLeft"));
    else if (result?.refused === "nothingToHeal") ui.notifications?.info(game.i18n.localize("ISUN.NothingToHeal"));
  }

  /** A night's sleep: pools reset, vexes cleared, rests restored. */
  async _onNewDay(event, target) {
    event.preventDefault();
    await this.document.newDay();
    ui.notifications?.info(game.i18n.localize("ISUN.NewDayDone"));
  }

  /* The pip that adds and the pip that removes are different elements with
   * different actions, so which way they move is markup rather than argument. */
  _onAddWound(event, target)      { return this._onModifyHealth(event, "wounds", 1); }
  _onRemoveWound(event, target)   { return this._onModifyHealth(event, "wounds", -1); }
  _onAddAnguish(event, target)    { return this._onModifyHealth(event, "anguish", 1); }
  _onRemoveAnguish(event, target) { return this._onModifyHealth(event, "anguish", -1); }

  async _onModifyHealth(event, type, delta) {
    event.preventDefault();
    const doc = this.document;
    const currentVal = doc.system.status[type].value;
    const maxVal = doc.system.status[type].max;
    
    const newVal = Math.clamp(currentVal + delta, 0, maxVal);
    if (newVal !== currentVal) {
      await doc.update({ [`system.status.${type}.value`]: newVal });
    }
  }

  /**
   * Put a spell into the Vance's mind, or let it go.
   *
   * Preparation "takes about an hour, regardless of how many spells are
   * involved" (The Key, Vance 1st degree), which is a cost the table tracks in
   * the fiction rather than one this can charge: a player ticking boxes is
   * recording the hour they already spent, not spending it now.
   *
   * Room is checked here as well as in the row, because the row's answer was
   * computed at render and a second window on the same actor may have filled
   * the mind since. Refused rather than allowed-and-flagged, unlike the
   * ephemera limits: those report a state the rules permit a GM to grant,
   * whereas a spell that does not fit simply has nowhere to go.
   */
  async _onTogglePrepared(event, target) {
    event.preventDefault();
    const item = this.document.items.get(target.closest(".item")?.dataset.itemId);
    if (!item) return;

    const mind = this.document.system.mind;
    const { allowed, reason } = vance.canPrepare(item, mind);
    if (!allowed) {
      ui.notifications?.warn(game.i18n.format(reason || "ISUN.MindNoRoom",
        { name: item.name, need: vance.footprint(item), free: mind?.free ?? 0 }));
      return this.render();
    }
    await item.update({ "system.prepared": !item.system.prepared });
  }

  /**
   * Reduce a spell to half its footprint, or restore it.
   *
   * The allowance is a count, not a claim on particular spells, so taking one
   * back frees it for another. Refused once they are all spoken for.
   */
  async _onToggleHalved(event, target) {
    event.preventDefault();
    const item = this.document.items.get(target.closest(".item")?.dataset.itemId);
    if (!item || !vance.isVancian(item)) return;

    const r = this.document.system.mind?.reductions;
    if (!item.system.halved && r && r.used >= r.value) {
      ui.notifications?.warn(game.i18n.format("ISUN.MindNoReductions", { count: r.value }));
      return;
    }
    await item.update({ "system.halved": !item.system.halved });
  }

  /**
   * Use a practice: pay for it, roll for it, and see what it costs to keep.
   *
   * This was a stub that rolled challenge 0 against venture 0 with one magic
   * die and spent nothing, whatever the practice was. What the rules ask for:
   *
   *   the cost    Sorcery equal to the level, "almost always" (The Way, p8),
   *               and nothing at all for a Vancian spell or a forte ability
   *               that says so.
   *   the venture "you always add the level of the effect to the venture" (p7).
   *   the dice    what the card itself grants — "+1 die", "+2 dice" — not one
   *               by default.
   *   the target  "the challenge is the level of the target", or nothing, which
   *               is the commoner case: cast on yourself or on something that
   *               does not object and no roll is needed at all.
   *
   * Refused outright when it cannot be paid for or, for a Vance, is not in
   * mind. Elsewhere this system reports over-limit and lets the table decide,
   * but those are caps on what may be held; this is the price of an act, and a
   * spell a Vance has not prepared is not in their head to cast.
   */
  async _onItemRoll(event, target) {
    event.preventDefault();
    const li = target.closest(".item");
    if (!li) return;
    const doc = this.document;
    const item = doc.items.get(li.dataset.itemId);
    if (!item) return;

    const { allowed, reason, cost, pool } = practiceRules.canCast(doc, item);
    if (!allowed) {
      ui.notifications?.warn(game.i18n.format(reason,
        { name: item.name, cost, pool, level: item.system?.level ?? 0 }));
      return;
    }

    const result = await VentureDialog.open(doc, {
      challenge: practiceRules.challengeFor(),
      magicDice: practiceRules.magicDiceOf(item),
      base: item.system?.level ?? 0,
      baseLabel: item.name,
      /* Every magical practice draws on Sorcery, whatever it costs — a Vancian
       * spell and a no-cost forte ability still work the pool, so a scourge on
       * it still bites. Naming it is what lets the dialog reach the scourge and
       * offer the vex. */
      pool: "sorcery",
      label: game.i18n.format("ISUN.UsedItem", { name: item.name }),
      practice: await ISUNVislaeSheet.#practiceCard(item, cost)
    });
    if (!result) return;   // cancelled; nothing is spent and nothing is used

    /* Paid after the roll, not before. The dialog can be dismissed, and a
     * practice that was never used should not have been paid for. */
    if (cost) await doc.adjustPool("sorcery", -cost);

    /* Depletion is deliberately not rolled here. It used to be, on the reading
     * that using a thing is when it wears out — but the books say when to check
     * and it is hardly ever the moment of casting. Of 541 entries across the
     * packs: 106 check each round, 49 each use, 25 each hour, 10 each day, and
     * 171 do not roll at all but end on a sunrise, a sunset or a condition.
     * Rolling on the cast was wrong for the great majority and quietly spent
     * things that should still have been in play.
     *
     * So the table decides when, and the Depletion column in the practices
     * table is the control that throws it. See _onRollDepletion. */

    await this.constructor.#offerRetain(doc, item);
  }

  /**
   * What the chat card says about the practice that was used.
   *
   * The point is the table rather than the caster: everyone can see the roll
   * already, and nobody but the owner can see what the spell actually does. So
   * the effect travels with the roll.
   *
   * Range and duration are not carried. Both fields exist on the model and both
   * are empty on all 1,117 entries across the four packs, so a row for them
   * would be a label with nothing after it.
   *
   * The description is enriched here, where there is an item to enrich it
   * against; chat content is not enriched on the way in.
   */
  static async #practiceCard(item, cost) {
    const { TextEditor } = foundry.applications.ux;
    return {
      name: item.name,
      img: item.img,
      kind: practiceRules.kindLabelFor(item),
      level: item.system?.level ?? 0,
      colour: item.system?.color ?? "",
      cost,
      /* Said only when there was one. A Vancian spell costs nothing to cast and
       * a no-cost forte ability nothing ever, and "0 Sorcery" invites the
       * reader to wonder what went wrong. */
      paid: cost > 0,
      depletion: item.system?.depletion ?? "",
      description: item.system?.description
        ? await TextEditor.implementation.enrichHTML(item.system.description, { relativeTo: item })
        : ""
    };
  }

  /**
   * Ask a Vance whether the spell stays in mind.
   *
   * "To cast a spell is to expel it from your mind and soul (unless you use
   * your personal power to grasp onto it so you can cast it again)" — and that
   * grasp costs "Sorcery equal to the spell's level" (The Key, Vance 1st
   * degree). So the default is that it goes: keeping it is the deliberate act
   * and the one that is paid for.
   *
   * Asked only of a Vancian spell that was prepared, which is the only thing
   * with anything to lose.
   */
  static async #offerRetain(actor, item) {
    if (!practiceRules.isVancian(item) || !item.system.prepared) return;

    const cost = practiceRules.retainCost(item);
    const afford = (actor.system.stats?.qualia?.pools?.sorcery?.value ?? 0) >= cost;

    const keep = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.RetainTitle"), icon: "fa-solid fa-brain" },
      classes: ["invisible-sun"],
      content: `<p>${game.i18n.format("ISUN.RetainAsk", { name: item.name, cost })}</p>`
        + (afford ? "" : `<p class="notes">${game.i18n.localize("ISUN.RetainCannotAfford")}</p>`),
      buttons: [
        { action: "keep", default: afford, icon: "fa-solid fa-hand-holding-heart",
          label: game.i18n.format("ISUN.RetainKeep", { cost }),
          disabled: !afford, callback: () => true },
        { action: "release", default: !afford, icon: "fa-solid fa-wind",
          label: game.i18n.localize("ISUN.RetainRelease"), callback: () => false }
      ],
      rejectClose: false
    });

    /* Dismissing the window is not keeping it. The spell leaves unless somebody
     * says otherwise and pays, which is the way round the rule is written. */
    if (keep === true && afford) {
      await actor.adjustPool("sorcery", -cost);
      return;
    }
    await item.update({ "system.prepared": false });
  }
}
