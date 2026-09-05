/**
 * Invisible Sun — searching across the packs
 *
 * Searching the packs by name alone is not much use when what a player wants is
 * "a Gold spell of level 4 or less" or "which aggregates carry Fire". The
 * filters are therefore built from the data models rather than written out by
 * hand: a StringField with choices becomes a dropdown, a NumberField a range,
 * an ArrayField a contains-test, and everything else a substring match. Adding
 * a field to a model puts it in the browser without touching this file.
 *
 * Packs are indexed rather than loaded. An index can carry system fields if it
 * is asked for them, so a pack of 415 spells is searchable without
 * instantiating 415 documents. Descriptions are heavy and only wanted when a
 * player is actually searching prose, so they are fetched only if that is
 * switched on.
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Fields no one wants to filter on. */
const SKIP = new Set(["aliases"]);

export class CompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-compendium-browser",
    classes: ["invisible-sun", "compendium-browser"],
    tag: "div",
    position: { width: 900, height: 700 },
    window: { title: "ISUN.BrowserTitle", resizable: true, icon: "fa-solid fa-magnifying-glass" },
    actions: {
      togglePack: CompendiumBrowser.#onTogglePack,
      clearFilters: CompendiumBrowser.#onClearFilters,
      openResult: CompendiumBrowser.#onOpenResult
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/apps/compendium-browser.hbs" }
  };

  /** Pack name -> index, built on demand and kept for the window's lifetime. */
  #indexes = new Map();

  /** Which packs are being searched; empty means all of them. */
  #packs = new Set();

  /** Field filters, keyed `type.field`. */
  #filters = {};

  #query = "";
  #searchText = false;

  /** Every pack this system ships. */
  get #systemPacks() {
    return game.packs.filter(p => p.metadata.packageName === game.system.id
      && p.metadata.type === "Item");
  }

  /** The document types present in the packs being searched. */
  #typesInScope(packs) {
    const types = new Set();
    for (const p of packs) {
      for (const e of p.index) if (e.type) types.add(e.type);
    }
    return [...types];
  }

  /**
   * The filterable shape of a document type, read off its data model.
   * @returns {Array<{key, label, kind, choices}>}
   */
  #fieldsOf(type) {
    const model = CONFIG.Item.dataModels?.[type];
    if (!model) return [];
    const out = [];
    for (const [key, field] of Object.entries(model.schema.fields)) {
      if (SKIP.has(key)) continue;
      const cls = field.constructor.name;
      let kind = null, choices = null;

      if (cls === "StringField" && field.choices) {
        kind = "choice";
        choices = Object.entries(field.choices)
          .filter(([k]) => k !== "")
          .map(([k, v]) => ({ value: k, label: typeof v === "string" ? game.i18n.localize(v) : k }));
      } else if (cls === "NumberField") kind = "number";
      else if (cls === "ArrayField" && field.element?.constructor.name === "StringField") kind = "array";
      else if (cls === "StringField") kind = "text";
      // HTMLField is prose; it is covered by the text search rather than a
      // filter of its own.

      if (kind) out.push({ key, kind, choices, label: CompendiumBrowser.#labelFor(key) });
    }
    return out;
  }

  /** "weaponRange" -> "Weapon Range". */
  static #labelFor(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  }

  /** Which system fields an index must carry to answer the current filters. */
  #indexFields(types) {
    const fields = new Set();
    for (const t of types) {
      for (const f of this.#fieldsOf(t)) fields.add(`system.${f.key}`);
    }
    if (this.#searchText) fields.add("system.description");
    return [...fields];
  }

  async #indexFor(pack, fields) {
    const key = `${pack.metadata.id}|${fields.join(",")}`;
    if (!this.#indexes.has(key)) {
      this.#indexes.set(key, await pack.getIndex({ fields }));
    }
    return this.#indexes.get(key);
  }

  async #search() {
    const all = this.#systemPacks;
    const packs = this.#packs.size ? all.filter(p => this.#packs.has(p.metadata.name)) : all;
    const types = this.#typesInScope(packs);
    const fields = this.#indexFields(types);
    const q = this.#query.trim().toLowerCase();

    const results = [];
    for (const pack of packs) {
      const index = await this.#indexFor(pack, fields);
      for (const entry of index) {
        if (!this.#matches(entry, q)) continue;
        results.push({
          uuid: entry.uuid ?? `Compendium.${pack.metadata.id}.${entry._id}`,
          name: entry.name,
          img: entry.img,
          type: entry.type,
          pack: pack.metadata.label,
          summary: this.#summarise(entry)
        });
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  #matches(entry, q) {
    const sys = entry.system ?? {};

    if (q) {
      let hit = entry.name?.toLowerCase().includes(q);
      if (!hit) {
        for (const v of Object.values(sys)) {
          if (typeof v === "string" && v.toLowerCase().includes(q)) { hit = true; break; }
          if (Array.isArray(v) && v.some(x => String(x).toLowerCase().includes(q))) { hit = true; break; }
        }
      }
      if (!hit) return false;
    }

    for (const [id, value] of Object.entries(this.#filters)) {
      if (value === "" || value == null) continue;
      const [type, key] = id.split(".");
      // A filter only speaks for its own type; an item of another type is not
      // excluded by a field it does not have.
      if (entry.type !== type) continue;
      const v = sys[key];

      if (id.endsWith("__min")) continue;      // handled with its max below
      if (Array.isArray(v)) {
        if (!v.some(x => String(x).toLowerCase().includes(String(value).toLowerCase()))) return false;
      } else if (typeof v === "number") {
        if (Number(v) !== Number(value)) return false;
      } else if (!String(v ?? "").toLowerCase().includes(String(value).toLowerCase())) {
        return false;
      }
    }
    return true;
  }

  /** A line of whatever the type actually distinguishes itself by. */
  #summarise(entry) {
    const s = entry.system ?? {};
    const bits = [];
    if (s.level != null && s.level !== "") bits.push(`level ${s.level}`);
    if (s.color) bits.push(s.color);
    if (s.category) bits.push(s.category);
    if (s.family) bits.push(s.family);
    if (s.rank) bits.push(s.rank);
    if (s.objectType) bits.push(s.objectType);
    if (s.form) bits.push(s.form);
    return bits.join(" · ");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const all = this.#systemPacks;
    const inScope = this.#packs.size ? all.filter(p => this.#packs.has(p.metadata.name)) : all;

    context.packs = all.map(p => ({
      name: p.metadata.name,
      label: p.metadata.label,
      count: p.index.size,
      selected: this.#packs.has(p.metadata.name)
    }));

    context.types = this.#typesInScope(inScope).sort().map(type => ({
      type,
      label: game.i18n.localize(`TYPES.Item.${type}`) ?? type,
      fields: this.#fieldsOf(type).map(f => ({
        ...f, id: `${type}.${f.key}`, value: this.#filters[`${type}.${f.key}`] ?? ""
      }))
    }));

    context.query = this.#query;
    context.searchText = this.#searchText;
    context.results = await this.#search();
    context.resultCount = context.results.length;
    context.anyFilter = !!this.#query || Object.values(this.#filters).some(v => v !== "");
    return context;
  }

  /* Which fields have a caret to keep. Asked of the type rather than of the
   * element, because reading selectionStart off a number or an email input
   * throws rather than answering. */
  static #CARET_TYPES = new Set(["text", "search", "url", "tel", "password"]);

  static #hasCaret(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && CompendiumBrowser.#CARET_TYPES.has(el.type);
  }

  /**
   * Carry the caret across a re-render, not just the focus.
   *
   * Every search re-runs the whole window — it is one part — so the field being
   * typed into is rebuilt under the typist. ApplicationV2 finds that field
   * again by selector and focuses it, but a freshly built input begins with its
   * caret at position zero, and the next letter therefore landed in front of
   * everything already there: "flameward" arrived as "wardmefla".
   *
   * Core saves which field to go back to. These two save where in it.
   */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    const focused = priorElement.querySelector(":focus");
    if (!CompendiumBrowser.#hasCaret(focused)) return;
    state.caret = [focused.selectionStart, focused.selectionEnd, focused.selectionDirection];
  }

  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (!state.caret || !state.focus) return;
    const field = newElement.querySelector(state.focus);
    /* Restored even if the text came back different — setSelectionRange clamps
     * to what is there, so the worst this does is land at the end, and the
     * start is never the better guess. */
    if (CompendiumBrowser.#hasCaret(field)) field.setSelectionRange(...state.caret);
  }

  _attachPartListeners(partId, el, options) {
    super._attachPartListeners(partId, el, options);

    el.querySelector('[name="query"]')?.addEventListener("input",
      foundry.utils.debounce(ev => { this.#query = ev.target.value; this.render(); }, 250));

    el.querySelector('[name="searchText"]')?.addEventListener("change", ev => {
      this.#searchText = ev.target.checked;
      this.render();
    });

    for (const control of el.querySelectorAll("[data-filter]")) {
      control.addEventListener("change", ev => {
        this.#filters[ev.target.dataset.filter] = ev.target.value;
        this.render();
      });
    }

    // Results carry a uuid, which is all a sheet's drop handler needs.
    for (const row of el.querySelectorAll(".browser-result")) {
      row.addEventListener("dragstart", ev => {
        ev.dataTransfer.setData("text/plain",
          JSON.stringify({ type: "Item", uuid: row.dataset.uuid }));
      });
    }
  }

  static #onTogglePack(event, target) {
    const name = target.dataset.pack;
    if (this.#packs.has(name)) this.#packs.delete(name);
    else this.#packs.add(name);
    this.render();
  }

  static #onClearFilters() {
    this.#filters = {};
    this.#query = "";
    this.render();
  }

  static async #onOpenResult(event, target) {
    const doc = await fromUuid(target.closest(".browser-result")?.dataset.uuid);
    doc?.sheet?.render(true);
  }
}
