/**
 * Invisible Sun — import a card deck from your own PDF.
 *
 * The compendia ship empty, because Invisible Sun is Monte Cook Games' work and
 * redistributing it is not something the Fan Use Policy allows. This is how
 * they get filled: point it at the self-print deck PDF that came with your
 * copy, and it builds the compendium and the card art on your own machine.
 *
 * ── The PDF is never copied anywhere ──
 * It is read straight from the file you choose, into memory, and dropped when
 * the import finishes. Foundry's data folder never holds a copy of the book.
 * The card faces it cuts out are yours in exactly the same way the PDF is:
 * they land in your data folder, outside the system folder, so a system update
 * cannot remove them and the release build cannot pick them up.
 *
 * ── Why it stops rather than guesses ──
 * Cards are matched to their pictures by position on the sheet, and position is
 * the thing that fails quietly: one card missed at the front and every name
 * after it slides by one. That is invisible until somebody who knows the deck
 * notices the Hunter is labelled Vizier. So the name printed on each card is
 * read back and checked, and a mismatch stops the import rather than writing
 * sixty subtly wrong items.
 */
import * as deck from "../importers/pdf-deck.mjs";
import * as sooth from "../importers/sooth.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Where the card art goes, relative to Foundry's data folder. */
const ASSET_ROOT = "invisible-sun/cards";

/**
 * The decks this knows how to read.
 *
 * One entry per deck, naming the pack it fills and the module that understands
 * what its cards say. Everything else — finding the grid, telling faces from
 * backs, cutting the pictures — is the same for every deck and lives in
 * pdf-deck.mjs.
 */
const DECKS = {
  sooth: {
    label: "ISUN.ImportSoothDeck",
    pack: "invisible-sun.sooth",
    folder: "sooth",
    expected: 60,
    /* The Sooth cards are round, so a square crop of one carries four white
     * corners that read as a box on any dark background. Rectangular decks
     * fill their crop and want nothing done to them. */
    mask: true,
    read: sooth.readDeck,
    verify: sooth.verifyNames,
    toItem: sooth.toItem,
    slug: sooth.slug
  }
};

export class DeckImporter extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-deck-importer",
    classes: ["invisible-sun", "deck-importer"],
    tag: "div",
    position: { width: 560, height: "auto" },
    window: { title: "ISUN.ImportTitle", icon: "fa-solid fa-file-import" },
    actions: {
      run: DeckImporter.#onRun
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/apps/deck-importer.hbs" }
  };

  /** Progress lines shown while it works. */
  #log = [];
  #busy = false;

  async _prepareContext() {
    return {
      decks: Object.entries(DECKS).map(([key, d]) => ({ key, label: game.i18n.localize(d.label) })),
      log: this.#log,
      busy: this.#busy
    };
  }

  #say(message, failed = false) {
    this.#log.push({ text: message, failed });
    this.render();
  }

  static async #onRun(event, target) {
    if (this.#busy) return;

    const form = this.element.querySelector("form");
    const file = form.querySelector("input[name=pdf]")?.files?.[0];
    const key = form.querySelector("select[name=deck]")?.value;
    const size = Number(form.querySelector("select[name=size]")?.value) || 512;

    if (!file) return ui.notifications.warn(game.i18n.localize("ISUN.ImportNoFile"));
    const spec = DECKS[key];
    if (!spec) return;

    this.#busy = true;
    this.#log = [];
    this.render();

    try {
      const report = await this.#import(file, spec, size);
      this.#say(game.i18n.format("ISUN.ImportDone", report));
      ui.notifications.info(game.i18n.format("ISUN.ImportDone", report));
    } catch (err) {
      this.#say(`✖ ${err.message}`, true);
      ui.notifications.error(err.message, { permanent: true });
      console.error("invisible-sun | deck import failed", err);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  /** The whole job, in the order it has to happen. */
  async #import(file, spec, size) {
    this.#say(game.i18n.localize("ISUN.ImportReading"));
    const doc = await deck.openPdf(file);

    const sheets = await deck.readSheets(doc, {
      onProgress: ({ done, total }) => {
        if (done % 8 === 0 || done === total) {
          this.#say(game.i18n.format("ISUN.ImportScanning", { done, total }));
        }
      }
    });
    this.#say(game.i18n.format("ISUN.ImportFound", {
      faces: sheets.faces.length, backs: sheets.backs.length, per: sheets.fullSheet
    }));

    if (spec.expected && sheets.faces.length !== spec.expected) {
      throw new Error(game.i18n.format("ISUN.ImportWrongCount", {
        found: sheets.faces.length, expected: spec.expected
      }));
    }

    const cards = spec.read(sheets.faces);

    const wrong = spec.verify(cards, sheets.faces);
    if (wrong.length) {
      throw new Error(game.i18n.format("ISUN.ImportNameMismatch", {
        count: wrong.length,
        first: `"${wrong[0].expected}" vs "${wrong[0].printed}"`
      }));
    }
    this.#say(game.i18n.format("ISUN.ImportVerified", { count: cards.length }));

    const images = await this.#writeImages(doc, sheets, cards, spec, size);
    return this.#writePack(cards, images, spec);
  }

  /** Cut every card out and write it into the data folder. */
  async #writeImages(doc, sheets, cards, spec, size) {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const dir = `${ASSET_ROOT}/${spec.folder}`;

    // createDirectory throws if it already exists, which is not a problem.
    for (const part of [ASSET_ROOT.split("/")[0], ASSET_ROOT, dir]) {
      try { await FP.createDirectory("data", part); } catch { /* already there */ }
    }

    const blobs = await deck.cutCards(doc, sheets.faces, {
      card: sheets.card, size, mask: spec.mask,
      onProgress: ({ done, total }) => {
        if (done % 10 === 0 || done === total) {
          this.#say(game.i18n.format("ISUN.ImportImages", { done, total }));
        }
      }
    });

    const images = new Map();
    const seen = new Map();
    for (const [i, card] of cards.entries()) {
      // Two cards in a deck may share a name. Overwriting would lose one and
      // point both items at the same picture.
      let stem = spec.slug(card.name);
      seen.set(stem, (seen.get(stem) ?? 0) + 1);
      if (seen.get(stem) > 1) stem = `${stem}-${seen.get(stem)}`;

      const { blob, extension } = blobs[i];
      const name = `${stem}.${extension}`;
      await FP.upload("data", dir, new File([blob], name, { type: blob.type }), {}, { notify: false });
      images.set(card.name, `${dir}/${name}`);
    }

    // The back is the same picture on every card, so one copy is enough.
    if (sheets.backs.length) {
      const [back] = await deck.cutCards(doc, [sheets.backs[0]],
        { card: sheets.card, size, mask: spec.mask });
      await FP.upload("data", dir,
        new File([back.blob], `back.${back.extension}`, { type: back.blob.type }), {}, { notify: false });
    }
    return images;
  }

  /**
   * Write the cards into the compendium.
   *
   * Matched by name and updated where they already exist, rather than the pack
   * being emptied first. A GM who has corrected an entry keeps their correction
   * of everything this importer does not set, and re-running after fixing one
   * card does not throw away the other fifty-nine.
   */
  async #writePack(cards, images, spec) {
    const pack = game.packs.get(spec.pack);
    if (!pack) throw new Error(game.i18n.format("ISUN.ImportNoPack", { pack: spec.pack }));

    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const index = await pack.getIndex();
      const byName = new Map(index.map(e => [e.name, e._id]));

      const create = [], update = [];
      for (const card of cards) {
        const data = spec.toItem(card, images.get(card.name));
        const id = byName.get(card.name);
        if (id) update.push({ _id: id, ...data });
        else create.push(data);
      }

      if (create.length) await Item.createDocuments(create, { pack: spec.pack, keepId: false });
      if (update.length) await Item.updateDocuments(update, { pack: spec.pack });

      return { created: create.length, updated: update.length, images: images.size };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}
