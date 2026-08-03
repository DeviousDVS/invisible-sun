const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

import { ActorSheetMixin } from "./SheetMixin.mjs";

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
        { id: "stats",       label: "ISUN.TabStats" },
        { id: "magic",       label: "ISUN.TabMagic" },
        { id: "order",       label: "ISUN.TabOrder" },
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

    // Sort spells by level
    context.spells.sort((a, b) => (a.system.level || 0) - (b.system.level || 0));

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
    
    // Roll items
    html.querySelectorAll('[data-action^="roll-"], [data-action="use-ability"]').forEach(el => {
      el.addEventListener('click', this._onItemRoll.bind(this));
    });

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

  async _onRefreshPool(event) {
    event.preventDefault();
    const pool = event.currentTarget.dataset.pool;
    if (!pool) return;
    
    const isCertes = CONFIG.ISUN.certesPoolNames.includes(pool);
    const base = `system.stats.${isCertes ? 'certes' : 'qualia'}.pools.${pool}`;
    
    const doc = this.document;
    const maxVal = foundry.utils.getProperty(doc, `${base}.max`);
    await doc.update({ [`${base}.value`]: maxVal });
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
