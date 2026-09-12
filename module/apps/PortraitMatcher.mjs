/**
 * Invisible Sun — putting the books' pictures on the books' creatures
 *
 * The importer saves every illustration a book embeds, named for the page it
 * was printed on, and every creature knows its own page. Nothing in either says
 * which picture is which creature, and no rule written here could: the art on a
 * creature's page is as often a chapter opener or the illustration for the
 * entry facing it. So this offers the candidates, nearest page first, and a
 * person decides. See helpers/portraits.mjs for the ordering and what it is
 * worth — 141 of 307 have exactly one picture on their own page, which is a
 * good guess and not an answer.
 *
 * What it writes is a lookup table, not a portrait.
 *
 * That is the whole point of it. `toItem` sets `img` on every import, so a
 * portrait put straight onto an actor is overwritten the next time its book is
 * read — which happens often here. The table is consulted while the actors are
 * built, so an assignment survives. It is a world setting so it works without a
 * commit, and it exports to a file so it can be kept in the system and shared.
 */
import { tableKey, groupArt, candidatesFor, allArt, progress }
  from "../helpers/portraits.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Where the importer saves what it pulls out of the books. */
export const ART_ROOT = "assets/invisible-sun";

/** The world setting holding the table. */
export const PORTRAIT_SETTING = "portraits";

/** Which folder under ART_ROOT each book's art went into. */
const BOOK_FOLDER = {
  "Teratology": "teratology",
  "The Path": "path",
  "The Nightside": "nightside-book"
};

/** The table as it stands, keyed by book and name. */
export function portraitTable() {
  return game.settings.get("invisible-sun", PORTRAIT_SETTING) ?? {};
}

/**
 * The portraits to use while importing, as a Map of creature name to path.
 *
 * `#writePack` already hands `toItem` an image looked up by name, which is how
 * the card decks give a card its face — so a bucket that wants portraits needs
 * nothing new, only this map.
 */
export function portraitsFor(entries = []) {
  const table = portraitTable();
  const images = new Map();
  for (const entry of entries) {
    const path = table[tableKey({ source: entry.source, name: entry.name })];
    if (path) images.set(entry.name, path);
  }
  return images;
}

export class PortraitMatcher extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-portrait-matcher",
    classes: ["invisible-sun", "portrait-matcher"],
    tag: "div",
    position: { width: 980, height: 720 },
    window: { title: "ISUN.PortraitsTitle", icon: "fa-solid fa-image-portrait",
              resizable: true },
    actions: {
      select: PortraitMatcher.#onSelect,
      assign: PortraitMatcher.#onAssign,
      clear: PortraitMatcher.#onClear,
      "next-unassigned": PortraitMatcher.#onNextUnassigned,
      "show-all": PortraitMatcher.#onShowAll,
      "export-table": PortraitMatcher.#onExport,
      "import-table": PortraitMatcher.#onImport,
      apply: PortraitMatcher.#onApply
    }
  };

  static PARTS = {
    body: { template: "systems/invisible-sun/templates/apps/portrait-matcher.hbs" }
  };

  /** Creatures, read once: the pack index does not change while this is open. */
  #creatures = null;
  /** Art on disk, grouped by book and page. Read once for the same reason. */
  #art = null;
  #selected = null;
  #filter = "";
  /** Whether the current creature is showing its whole book rather than its page. */
  #showAll = false;

  /* The scroll positions matter more here than on a sheet: the list is 307 rows
   * and the candidates are a grid, and losing either on every click would make
   * the window unusable for the job it exists to do. */
  static SCROLLABLE = [".creature-list", ".candidate-grid"];

  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    for (const selector of this.constructor.SCROLLABLE) {
      const el = priorElement.querySelector(selector);
      if (el?.scrollTop) state.scrollPositions.push([selector, el.scrollTop, 0]);
    }
  }

  /** Read the pack and the art folder, once per opening. */
  async #load() {
    if (this.#creatures && this.#art) return;

    const pack = game.packs.get("invisible-sun.creatures");
    const index = pack
      ? await pack.getIndex({ fields: ["system.source", "system.page"] })
      : [];
    this.#creatures = [...index]
      .map(entry => ({
        id: entry._id,
        name: entry.name,
        source: entry.system?.source ?? "",
        book: BOOK_FOLDER[entry.system?.source] ?? "",
        page: entry.system?.page ?? null
      }))
      .sort((a, b) => a.source.localeCompare(b.source) || (a.page ?? 0) - (b.page ?? 0)
                      || a.name.localeCompare(b.name));

    /* Every book's folder, asked for separately: browse does not recurse, and
     * a book whose art was never saved should be a missing folder rather than
     * an error. */
    const FP = foundry.applications.apps.FilePicker.implementation;
    const paths = [];
    for (const folder of new Set(Object.values(BOOK_FOLDER))) {
      try {
        const listing = await FP.browse("data", `${ART_ROOT}/${folder}`);
        paths.push(...listing.files);
      } catch { /* that book's art has not been saved */ }
    }
    this.#art = groupArt(paths);
  }

  async _prepareContext() {
    await this.#load();
    const table = portraitTable();

    const filter = this.#filter.toLowerCase();
    const rows = this.#creatures
      .filter(c => !filter || c.name.toLowerCase().includes(filter))
      .map(c => ({ ...c, portrait: table[tableKey(c)] ?? null }));

    const current = this.#creatures.find(c => c.id === this.#selected) ?? null;
    const candidates = !current ? []
      : (this.#showAll ? allArt(current.book, this.#art)
                       : candidatesFor(current, this.#art));

    return {
      rows,
      current: current && { ...current, portrait: table[tableKey(current)] ?? null },
      candidates: candidates.map(c => ({ ...c,
        chosen: current ? table[tableKey(current)] === c.path : false,
        // Said in words, because "why is this one being offered" is the whole
        // question a person is answering here.
        why: c.distance === null ? game.i18n.localize("ISUN.PortraitsAnywhere")
           : c.distance === 0 ? game.i18n.localize("ISUN.PortraitsSamePage")
           : game.i18n.format("ISUN.PortraitsNearPage", { page: c.page })
      })),
      showingAll: this.#showAll,
      filter: this.#filter,
      progress: progress(this.#creatures, table),
      noArt: this.#art.size === 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Typing filters the list; a re-render on every keystroke would lose focus,
    // so the field is read here rather than being a form input the app submits.
    const search = this.element.querySelector('input[name="filter"]');
    search?.addEventListener("input", foundry.utils.debounce(event => {
      this.#filter = event.target.value;
      this.render();
    }, 250));
  }

  async #write(table) {
    await game.settings.set("invisible-sun", PORTRAIT_SETTING, table);
    this.render();
  }

  static #onSelect(event, target) {
    this.#selected = target.closest("[data-creature-id]")?.dataset.creatureId ?? null;
    this.#showAll = false;
    this.render();
  }

  static async #onAssign(event, target) {
    const current = this.#creatures.find(c => c.id === this.#selected);
    const path = target.closest("[data-path]")?.dataset.path;
    if (!current || !path) return;
    await this.#write({ ...portraitTable(), [tableKey(current)]: path });
  }

  static async #onClear() {
    const current = this.#creatures.find(c => c.id === this.#selected);
    if (!current) return;
    const table = { ...portraitTable() };
    delete table[tableKey(current)];
    await this.#write(table);
  }

  /** Jump to the next creature with nothing chosen, from where we are now. */
  static #onNextUnassigned() {
    const table = portraitTable();
    const at = this.#creatures.findIndex(c => c.id === this.#selected);
    const order = [...this.#creatures.slice(at + 1), ...this.#creatures.slice(0, at + 1)];
    const next = order.find(c => !table[tableKey(c)]);
    if (!next) return ui.notifications.info(game.i18n.localize("ISUN.PortraitsAllDone"));
    this.#selected = next.id;
    this.#showAll = false;
    this.render();
  }

  static #onShowAll() {
    this.#showAll = !this.#showAll;
    this.render();
  }

  /** The table as a file, for keeping in the system or handing to somebody. */
  static #onExport() {
    const table = portraitTable();
    const readable = {};
    for (const [key, path] of Object.entries(table)) {
      const [source, name] = key.split(" ");
      (readable[source] ??= {})[name] = path;
    }
    foundry.utils.saveDataToFile(JSON.stringify(readable, null, 2),
      "application/json", "invisible-sun-portraits.json");
  }

  static async #onImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const readable = JSON.parse(await file.text());
        const table = {};
        for (const [source, names] of Object.entries(readable)) {
          for (const [name, path] of Object.entries(names)) {
            table[tableKey({ source, name })] = path;
          }
        }
        await this.#write(table);
        ui.notifications.info(game.i18n.format("ISUN.PortraitsImported",
          { count: Object.keys(table).length }));
      } catch (err) {
        ui.notifications.error(game.i18n.format("ISUN.PortraitsBadFile", { why: err.message }));
      }
    });
    input.click();
  }

  /**
   * Put the table onto the actors that are in the pack now.
   *
   * The next import would do this anyway, and reading three books to see a
   * portrait you just chose is not a reasonable wait. Both the sheet's picture
   * and the token's, because a creature dragged onto a scene showing the
   * default mystery-man is the half of the job nobody remembers to finish.
   */
  static async #onApply() {
    const pack = game.packs.get("invisible-sun.creatures");
    if (!pack) return;
    const table = portraitTable();

    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const updates = [];
      for (const creature of this.#creatures) {
        const img = table[tableKey(creature)];
        if (!img) continue;
        updates.push({ _id: creature.id, img, "prototypeToken.texture.src": img });
      }
      if (updates.length) {
        const Cls = foundry.utils.getDocumentClass(pack.documentName);
        await Cls.updateDocuments(updates, { pack: pack.collection });
      }
      ui.notifications.info(game.i18n.format("ISUN.PortraitsApplied", { count: updates.length }));
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}
