const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

import { ActorSheetMixin } from "./SheetMixin.mjs";
import { VentureDialog } from "../apps/VentureDialog.mjs";
import { ApplyIdentity } from "../apps/ApplyIdentity.mjs";
import { HeartSkills } from "../apps/HeartSkills.mjs";
import { ForteAbilityPicker } from "../apps/ForteAbilityPicker.mjs";
import { CompendiumPicker } from "../apps/CompendiumPicker.mjs";
import { IncantationGrant } from "../apps/IncantationGrant.mjs";

/**
 * Invisible Sun — Vislae Actor Sheet
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
      "grant-incantation":  this.prototype._onGrantIncantation,
      "filter-practices":   this.prototype._onFilterPractices,
      "entry-add":          this.prototype._onEntryAdd,
      "entry-delete":       this.prototype._onEntryDelete,
      /* The practices list emits one of these three from {{p.action}}. They all
       * mean "use this", and all reach the same handler. */
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
    "SoothCard"
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
    this._prepareSheetData(context);
    return context;
  }


  _prepareSheetData(context) {
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

    // Which order's subsystem to show. Prefer the Order item the character
    // holds; fall back to the free-text meta field for characters set up by
    // hand before drag-and-drop population exists.
    const orderNames = Object.keys(CONFIG.ISUN?.orders ?? {});
    const orderSource = (context.orders[0]?.name || context.actor.system?.meta?.orderType || "").toLowerCase();
    context.orderKey = orderNames.find(k => orderSource.includes(k)) ?? "";
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
    /* An Apostate has no ladder at all: a fixed set to begin with, and the
     * rest bought one at a time for 1 Crux each (The Key, p5535). */
    context.isApostate = context.orderKey === "apostate";
    context.apostateStarting = context.order?.system?.startingAbilities ?? [];
    context.apostatePurchasable = context.order?.system?.apostateAbilities ?? [];
    // How many of each list a character gets, and what the second one costs.
    // Both are rules about the list rather than about any one ability.
    context.apostateStartingNote = context.order?.system?.startingNote ?? "";
    context.apostatePurchasableNote = context.order?.system?.apostateNote ?? "";

    // A vislae's soul is secret — the fan sheet this was modelled on keeps it
    // in a hidden row. Owners and GMs see it; observers with read access do not.
    context.showSecrets = this.document.isOwner;
    context.soul = context.showSecrets ? (context.souls[0] ?? null) : null;

    // Spells, incantations, forte abilities and minor magics share a shape —
    // level, colour, cost, dice, depletion — because the rules treat them the
    // same way: a forte ability "unless stated otherwise, costs Sorcery to use,
    // equal to the level of the effect", exactly as a spell does. One list lets
    // a player sort across all of them, which four separate lists cannot.
    const practice = (item, kind, action) => {
      const sys = item.system;
      return {
        item, kind, action,
        kindLabel: `ISUN.Kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
        level: sys.level ?? 0,
        color: sys.color ?? "",
        // A forte ability marked "(no cost)" costs no Sorcery; otherwise the
        // cost is the spell's own, falling back to its level.
        cost: sys.noCost ? game.i18n.localize("ISUN.Free") : (sys.cost || sys.level || ""),
        // A spell carries its bonus as printed ("+1 die"); a forte ability's is
        // parsed out of its level line as a number. Both mean the same thing, so
        // the column says it the same way.
        dice: sys.dice || (sys.bonusDice
          ? `+${sys.bonusDice} ${game.i18n.localize(sys.bonusDice === 1 ? "ISUN.DieUnit" : "ISUN.DiceUnit")}`
          : ""),
        depletion: sys.depletion || "",
        condition: sys.condition || ""
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
    context.crux = context.actor.system.advancement?.crux ?? 0;

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

    // Config for template dropdowns
    context.config = CONFIG.ISUN;

    // Character Sentence derivation
    context.characterSentence = {
      foundation: context.foundations[0]?.name || "[Foundation]",
      heart: context.hearts[0]?.name || "[Heart]",
      order: context.orders[0]?.name || "[Order]",
      forte: context.fortes[0]?.name || "[Forte]"
    };

    // Pre-render the sentence as markup. Item names are user-supplied, so each
    // part is escaped before being wrapped — the template emits this with {{{ }}}.
    //
    // Where the character actually holds the item, the part is a link that
    // opens it. That is the sheet's only route to a Heart, Foundation, Order or
    // Forte, so the placeholder form is deliberately inert rather than looking
    // clickable and doing nothing.
    const esc = Handlebars.escapeExpression;
    const part = (cls, item, placeholder) => {
      if (!item) return `<span class="sentence-part ${cls} unset">${esc(placeholder)}</span>`;
      return `<a class="sentence-part ${cls}" data-action="open-item" data-item-id="${esc(item.id)}"`
           + ` data-tooltip="${esc(item.name)}">${esc(item.name)}</a>`;
    };

    context.characterSentenceHTML = game.i18n.format("ISUN.CharacterSentence", {
      foundation: part("foundation", context.foundations[0], "[Foundation]"),
      heart:      part("heart",      context.hearts[0],      "[Heart]"),
      order:      part("order",      context.orders[0],      "[Order]"),
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
    }
  }

  /**
   * Take damage, then offer the bene-negation window.
   *
   * The window only exists at the moment damage arrives — "once damage is
   * sustained, a character cannot use Physicality to negate a Wound" — so it is
   * offered here, immediately, and nowhere else on the sheet.
   */
  async _onApplyDamage(event, target) {
    event.preventDefault();
    const DialogV2 = foundry.applications.api.DialogV2;

    const form = await DialogV2.prompt({
      window: { title: game.i18n.localize("ISUN.ApplyDamage") },
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

    const result = await this.document.applyDamage({
      amount: Number(form.amount) || 0,
      type: form.type === "mental" ? "mental" : "physical",
      ignoreArmor: !!form.ignoreArmor
    });
    if (!result) return;

    for (const [kind, count] of [["wounds", result.newWounds], ["anguish", result.newAnguish]]) {
      for (let i = 0; i < (count ?? 0); i++) await this._offerNegation(kind);
    }
  }

  /** Offer one bene to cancel one arriving Wound or Anguish. */
  async _offerNegation(kind) {
    const poolKey = kind === "anguish" ? "intellect" : "physicality";
    const group = kind === "anguish" ? "qualia" : "certes";
    const available = this.document.system.stats?.[group]?.pools?.[poolKey]?.value ?? 0;
    if (!available) return;

    const label = game.i18n.localize(kind === "anguish" ? "ISUN.Anguish" : "ISUN.Wounds");
    const pool = game.i18n.localize(`ISUN.Pool${poolKey.charAt(0).toUpperCase()}${poolKey.slice(1)}`);
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ISUN.NegateTitle") },
      content: `<p>${game.i18n.format("ISUN.NegatePrompt", { kind: label, pool, available })}</p>`,
      rejectClose: false
    });
    if (ok) await this.document.negateWithBene(kind);
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

  async _onItemRoll(event, target) {
    event.preventDefault();
    const li = target.closest(".item");
    if (!li) return;
    const doc = this.document;
    const item = doc.items.get(li.dataset.itemId);
    if (!item) return;

    await game.invisibleSun.rollVenture({
      challenge: 0,
      venture: 0,
      magicDice: 1,
      label: game.i18n.format("ISUN.UsedItem", { name: item.name }),
      actor: doc
    });

    /* The depletion value, not the item holding it. checkDepletion parses a
     * string, so passing the Item put an object through .match() and threw —
     * and the guard above it could not catch that, because an Item is truthy.
     *
     * Awaited, so the depletion result cannot reach chat ahead of the roll it
     * follows, and given the actor so the message has a speaker. */
    if (item.system.depletion) {
      await game.invisibleSun.checkDepletion(item.system.depletion, doc);
    }
  }
}
