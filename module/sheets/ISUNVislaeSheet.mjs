const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

import { ActorSheetMixin } from "./SheetMixin.mjs";
import { VentureDialog } from "../apps/VentureDialog.mjs";

/**
 * Invisible Sun — Vislae Actor Sheet
 */
export class ISUNVislaeSheet extends ActorSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "actor", "vislae"],
    position: { width: 1010, height: 755 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static TABS = {
    primary: {
      initial: "overview",
      tabs: [
        { id: "overview",    label: "ISUN.TabOverview" },
        { id: "magic",       label: "ISUN.TabMagic" },
        { id: "connections", label: "ISUN.TabConnections" },
        { id: "arcs",        label: "ISUN.TabArcs" },
        { id: "inventory",   label: "ISUN.TabInventory" },
        { id: "biography",   label: "ISUN.TabBiography" }
      ]
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/actor/vislae-sheet.hbs" }
  };



  // Application V2 Context prep
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this._prepareSheetData(context);
    return context;
  }


  _prepareSheetData(context) {
    const items = context.actor.items;
    
    // Categorize embedded items
    context.spells = [];
    context.incantations = [];
    context.forteAbilities = [];
    context.secrets = [];
    context.skills = [];
    context.arcs = [];
    context.ephemera = [];
    context.objectsOfPower = [];
    context.hearts = [];
    context.foundations = [];
    context.souls = [];
    context.orders = [];
    context.fortes = [];
    context.threads = [];
    context.minorMagics = [];
    context.connections = [];

    for (let item of items) {
      switch(item.type) {
        case "Spell": context.spells.push(item); break;
        case "Incantation": context.incantations.push(item); break;
        case "ForteAbility": context.forteAbilities.push(item); break;
        case "Secret": context.secrets.push(item); break;
        case "Skill": context.skills.push(item); break;
        case "CharacterArc": context.arcs.push(item); break;
        case "Ephemera": context.ephemera.push(item); break;
        case "ObjectOfPower": context.objectsOfPower.push(item); break;
        case "Heart": context.hearts.push(item); break;
        case "Foundation": context.foundations.push(item); break;
        case "Soul": context.souls.push(item); break;
        case "Order": context.orders.push(item); break;
        case "Forte": context.fortes.push(item); break;
        case "Thread": context.threads.push(item); break;
        case "MinorMagic": context.minorMagics.push(item); break;
        case "Connection": context.connections.push(item); break;
      }
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
        dice: sys.dice || (sys.bonusDice ? `+${sys.bonusDice}` : ""),
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

    context.restRows = [
      { key: "quick",  label: "ISUN.RestQuick",  max: 2, left: remaining.quick },
      { key: "tenMin", label: "ISUN.RestTenMin", max: 1, left: remaining.tenMin },
      { key: "hour",   label: "ISUN.RestHour",   max: 1, left: remaining.hour },
    ];
    context.canRestHeal = remaining.tenMin + remaining.hour > 0;

    // House secrets are augments to a house rather than to the character, and
    // are capped by house size, so they sit with the House block.
    context.houseSecrets = context.secrets.filter(i => i.system?.secretType === "house");
    context.characterSecrets = context.secrets.filter(i => i.system?.secretType !== "house");

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
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    this._attachCustomListeners(htmlElement);
  }

  /** Filter the practices list by kind, without a re-render. */
  _onFilterPractices(event) {
    event.preventDefault();
    const kind = event.currentTarget.dataset.kind ?? "all";
    this._practiceFilter = kind;
    const root = event.currentTarget.closest(".practices");
    root.dataset.filter = kind;
    root.querySelectorAll(".practice-filter").forEach(el =>
      el.classList.toggle("active", el.dataset.kind === kind));
  }

  /** Roll a skill: open the venture dialog with that skill already ticked. */
  async _onRollSkill(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const skill = this.document.items.get(li?.dataset.itemId);
    if (!skill) return;
    return VentureDialog.open(this.document, { skill, label: skill.name });
  }

  /** Edit a skill's level in place, clamped to the cap of 4. */
  async _onSkillLevel(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const item = this.document.items.get(input.dataset.itemId);
    if (!item) return;
    const level = Math.clamp(Math.round(Number(input.value) || 0), 0, CONFIG.ISUN.skillMaxLevel);
    input.value = level;
    return item.update({ "system.level": level });
  }

  /** Open an item named elsewhere on the sheet, by id. */
  _onOpenItem(event) {
    event.preventDefault();
    const item = this.document.items.get(event.currentTarget.dataset.itemId);
    item?.sheet?.render(true);
  }

  /** Add one Injury of the given source; conversion happens in _preUpdate. */
  async _onAddInjury(event) {
    event.preventDefault();
    const source = event.currentTarget.dataset.source === "mental" ? "mental" : "physical";
    return this.document.applyDamage({ amount: 1, type: source, ignoreArmor: true });
  }

  /** Remove a single Injury from the track — healing, not negation. */
  async _onRemoveInjury(event) {
    event.preventDefault();
    const idx = Number(event.currentTarget.dataset.index);
    const track = [...(this.document.system.status.injuries ?? [])];
    if (!Number.isInteger(idx) || idx < 0 || idx >= track.length) return;
    track.splice(idx, 1);
    return this.document.update({ "system.status.injuries": track });
  }

  async _onEntryAdd(event) {
    event.preventDefault();
    const path = event.currentTarget.dataset.path;
    if (!path) return;
    const list = foundry.utils.getProperty(this.document, path) ?? [];
    return this.document.update({ [path]: [...list, { title: "", description: "" }] });
  }

  async _onEntryDelete(event) {
    event.preventDefault();
    const { path, index } = event.currentTarget.dataset;
    if (!path) return;
    const list = [...(foundry.utils.getProperty(this.document, path) ?? [])];
    list.splice(Number(index), 1);
    return this.document.update({ [path]: list });
  }
  
  _attachCustomListeners(html) {
    // Bene spend/refresh
    html.querySelectorAll('.bene-pip.full').forEach(el => el.addEventListener('click', this._onSpendBene.bind(this)));
    html.querySelectorAll('.btn-refresh').forEach(el => el.addEventListener('click', this._onRefreshPool.bind(this)));

    // Wound/Anguish add/remove
    html.querySelectorAll('.wound-pip.empty').forEach(el => el.addEventListener('click', ev => this._onModifyHealth(ev, 'wounds', 1)));
    html.querySelectorAll('.wound-pip.full').forEach(el => el.addEventListener('click', ev => this._onModifyHealth(ev, 'wounds', -1)));
    html.querySelectorAll('.anguish-pip.empty').forEach(el => el.addEventListener('click', ev => this._onModifyHealth(ev, 'anguish', 1)));
    html.querySelectorAll('.anguish-pip.full').forEach(el => el.addEventListener('click', ev => this._onModifyHealth(ev, 'anguish', -1)));
    
    // A skill opens the venture dialog seeded with itself; other rollables
    // still take the generic path until they have dialogs of their own.
    html.querySelectorAll('[data-action="roll-skill"]').forEach(el =>
      el.addEventListener('click', this._onRollSkill.bind(this)));
    html.querySelectorAll('[data-action="skill-level"]').forEach(el =>
      el.addEventListener('change', this._onSkillLevel.bind(this)));

    // Roll items
    html.querySelectorAll('[data-action^="roll-"]:not([data-action="roll-skill"]), [data-action="use-ability"]').forEach(el => {
      el.addEventListener('click', this._onItemRoll.bind(this));
    });

    html.querySelectorAll('[data-action="apply-damage"]').forEach(el =>
      el.addEventListener('click', this._onApplyDamage.bind(this)));

    // Rests
    html.querySelectorAll('[data-action="rest-recover"]').forEach(el =>
      el.addEventListener('click', this._onRestRecover.bind(this)));
    html.querySelectorAll('[data-action="new-day"]').forEach(el =>
      el.addEventListener('click', this._onNewDay.bind(this)));

    // Practice kind filter. Held on the sheet instance rather than the actor:
    // it is a view preference, not character data, and should not write to the
    // document or sync to other players.
    html.querySelectorAll('.practice-filter').forEach(el =>
      el.addEventListener('click', this._onFilterPractices.bind(this)));

    // Sentence parts open the item they name
    html.querySelectorAll('[data-action="open-item"]').forEach(el =>
      el.addEventListener('click', this._onOpenItem.bind(this)));

    // Injury track
    html.querySelectorAll('[data-action="add-injury"]').forEach(el =>
      el.addEventListener('click', this._onAddInjury.bind(this)));
    html.querySelectorAll('[data-action="remove-injury"]').forEach(el =>
      el.addEventListener('click', this._onRemoveInjury.bind(this)));

    // Repeatable narrative entries
    html.querySelectorAll('.entry-add').forEach(el => el.addEventListener('click', this._onEntryAdd.bind(this)));
    html.querySelectorAll('.entry-delete').forEach(el => el.addEventListener('click', this._onEntryDelete.bind(this)));
  }

  async _onSpendBene(event) {
    event.preventDefault();
    const pool = event.currentTarget.dataset.pool;
    if (!pool) return;
    
    const isCertes = CONFIG.ISUN.certesPoolNames.includes(pool);
    const poolPath = `system.stats.${isCertes ? 'certes' : 'qualia'}.pools.${pool}.value`;
    
    const doc = this.document;
    const currentVal = foundry.utils.getProperty(doc, poolPath);
    if (currentVal > 0) {
      await doc.update({ [poolPath]: currentVal - 1 });
    }
  }

  /**
   * Refreshing a pool is what a rest does, so it spends one. Shift-click resets
   * without spending — the GM "can state that pools reset to their starting
   * values" at any time (The Key, p2300).
   */
  async _onRefreshPool(event) {
    event.preventDefault();
    const pool = event.currentTarget.dataset.pool;
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
  async _onApplyDamage(event) {
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
  async _onRestRecover(event) {
    event.preventDefault();
    const kind = event.currentTarget.dataset.kind;
    const result = await this.document.restRecoverHealth(kind);
    if (result?.refused === "noRests") ui.notifications?.warn(game.i18n.localize("ISUN.NoLongRestsLeft"));
    else if (result?.refused === "nothingToHeal") ui.notifications?.info(game.i18n.localize("ISUN.NothingToHeal"));
  }

  /** A night's sleep: pools reset, vexes cleared, rests restored. */
  async _onNewDay(event) {
    event.preventDefault();
    await this.document.newDay();
    ui.notifications?.info(game.i18n.localize("ISUN.NewDayDone"));
  }

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

  _onItemRoll(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    if (!li) return;
    const doc = this.document;
    const item = doc.items.get(li.dataset.itemId);
    if (!item) return;
    
    game.invisibleSun.rollVenture({
      challenge: 0,
      venture: 0,
      magicDice: 1,
      label: `Used ${item.name}`
    });
    
    if (game.invisibleSun.checkDepletion && item.system.depletion) {
      game.invisibleSun.checkDepletion(item);
    }
  }
}
