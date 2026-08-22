/**
 * Invisible Sun — import your content from your own PDFs.
 *
 * The compendia ship empty, because Invisible Sun is Monte Cook Games' work and
 * redistributing it is not something the Fan Use Policy allows. This is how
 * they get filled: put the PDFs you bought in one folder, point this at it, and
 * it works out what each file is and imports what it can.
 *
 * ── One button, one folder ──
 * Asking for a file at a time means knowing which file feeds which compendium,
 * which is this project's problem and not the reader's. A folder is something
 * anyone can assemble, and the importer identifies what is in it.
 *
 * ── Nothing is copied anywhere ──
 * The browser reads the folder in place. The PDFs are never uploaded, never
 * written into Foundry's data folder, and are dropped from memory as each one
 * finishes. Card art cut from them lands outside the system folder, where a
 * system update cannot remove it and the release build cannot pick it up.
 *
 * ── Why it stops rather than guesses ──
 * Cards are matched to their pictures by position, and position is what fails
 * quietly: one card missed at the front and every name after it slides by one.
 * That is invisible until somebody who knows the deck notices the Hunter is
 * labelled Vizier. So the name printed on each card is read back and checked,
 * and a mismatch abandons that file rather than writing subtly wrong items.
 */
import * as deck from "../importers/pdf-deck.mjs";
import { SOURCES, NOT_YET, openingText, guessFromName, identifyFromText, isSupported }
  from "../importers/sources.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Where card art goes, relative to Foundry's data folder. */
const ASSET_ROOT = "invisible-sun/cards";

/** Uploads run several at a time; browsers cap connections per host anyway. */
const UPLOADS_AT_ONCE = 6;

export class ContentImporter extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-content-importer",
    classes: ["invisible-sun", "content-importer"],
    tag: "div",
    position: { width: 620, height: "auto" },
    window: { title: "ISUN.ImportTitle", icon: "fa-solid fa-file-import" },
    actions: { run: ContentImporter.#onRun }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/apps/content-importer.hbs" }
  };

  #log = [];
  #busy = false;

  async _prepareContext() {
    return {
      log: this.#log,
      busy: this.#busy,
      /* Listed so the dialog can say what it is able to read, rather than
       * leaving the reader to find out by trying. */
      supported: SOURCES.map(s => game.i18n.localize(s.label)),
      planned: NOT_YET.map(s => game.i18n.localize(s.label))
    };
  }

  #say(message, failed = false) {
    this.#log.push({ text: message, failed });
    this.render();
  }

  static async #onRun(event, target) {
    if (this.#busy) return;

    const form = this.element.querySelector("form");
    const files = [...(form.querySelector("input[name=folder]")?.files ?? [])];
    const size = Number(form.querySelector("select[name=size]")?.value) || 512;

    if (!files.length) return ui.notifications.warn(game.i18n.localize("ISUN.ImportNoFolder"));

    this.#busy = true;
    this.#log = [];
    this.render();

    try {
      await this.#importFolder(files, size);
    } catch (err) {
      this.#say(`✖ ${err.message}`, true);
      ui.notifications.error(err.message, { permanent: true });
      console.error("invisible-sun | import failed", err);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  /** Work out what is in the folder, then import everything that can be. */
  async #importFolder(files, size) {
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name));
    this.#say(game.i18n.format("ISUN.ImportFolderScan",
      { pdfs: pdfs.length, files: files.length }));
    if (!pdfs.length) throw new Error(game.i18n.localize("ISUN.ImportNoPdfs"));

    const plan = await this.#identify(pdfs);

    /* Decks first. A book explains cards a deck imported, so running The Gate
     * before the Sooth Deck in the same folder would refuse for want of
     * anything to fill — and the reader would have to work out that the order
     * of files in their folder was the problem. */
    const doable = plan.filter(p => p.source && isSupported(p.source))
      .sort((a, b) => (a.source.kind === "book" ? 1 : 0) - (b.source.kind === "book" ? 1 : 0));
    const later = plan.filter(p => p.source && !isSupported(p.source));
    const unknown = plan.filter(p => !p.source);

    for (const { file, source } of later) {
      this.#say(game.i18n.format("ISUN.ImportNotYet",
        { file: file.name, what: game.i18n.localize(source.label) }));
    }
    for (const { file } of unknown) {
      this.#say(game.i18n.format("ISUN.ImportUnknown", { file: file.name }));
    }

    if (!doable.length) {
      this.#say(game.i18n.localize("ISUN.ImportNothingToDo"), true);
      return;
    }

    let imported = 0;
    for (const { file, source } of doable) {
      this.#say(game.i18n.format("ISUN.ImportStarting",
        { what: game.i18n.localize(source.label) }));
      try {
        const report = await this.#importOne(file, source, size);
        this.#say(game.i18n.format("ISUN.ImportOneDone", report));
        imported++;
      } catch (err) {
        // One bad file should not abandon the rest of the folder.
        this.#say(`✖ ${file.name}: ${err.message}`, true);
        console.error(`invisible-sun | ${file.name} failed to import`, err);
      }
    }

    const summary = game.i18n.format("ISUN.ImportAllDone",
      { imported, skipped: later.length + unknown.length });
    this.#say(summary);
    ui.notifications.info(summary);
  }

  /**
   * Decide what each PDF is.
   *
   * The filename is tried first because it costs nothing, and it settles most
   * files: these PDFs arrive named for what they are. It is only ever a
   * shortcut, though — anything that will actually be acted on has its first
   * page read and its signature confirmed before a single item is written.
   */
  async #identify(pdfs) {
    const plan = [];
    for (const file of pdfs) {
      const guess = guessFromName(file.name);
      if (guess && !isSupported(guess)) {
        // Nothing can be done with it either way, so do not spend time opening
        // a large PDF to confirm what its name already says.
        plan.push({ file, source: guess });
        continue;
      }

      let doc = null;
      try {
        doc = await deck.openPdf(file);
        const source = identifyFromText(await openingText(doc));
        plan.push({ file, source, doc });
      } catch (err) {
        this.#say(game.i18n.format("ISUN.ImportUnreadable",
          { file: file.name, why: err.message }), true);
        plan.push({ file, source: null });
      }
    }
    return plan;
  }

  /** Import one recognised source. */
  async #importOne(file, spec, size) {
    const doc = await deck.openPdf(file);
    if (spec.kind === "book") return this.#importBook(doc, spec);
    if (spec.kind === "deck-text") return this.#importTextDeck(doc, spec, size);

    const sheets = await deck.readSheets(doc, {
      onProgress: ({ stage, done, total }) => {
        // Two stages counting different things; reported as one number they
        // would appear to go backwards.
        if (stage === "text" && (done % 8 === 0 || done === total)) {
          this.#say(game.i18n.format("ISUN.ImportReadingPages", { done, total }));
        } else if (stage === "scan") {
          this.#say(game.i18n.format("ISUN.ImportScanning", { done, total }));
        }
      }
    });
    this.#say(game.i18n.format("ISUN.ImportFound", {
      faces: sheets.faces.length, backs: sheets.backs.length, per: sheets.fullSheet
    }));

    if (spec.expected && sheets.faces.length !== spec.expected) {
      throw new Error(game.i18n.format("ISUN.ImportWrongCount",
        { found: sheets.faces.length, expected: spec.expected }));
    }

    const cards = spec.read(sheets.faces);

    const wrong = spec.verify(cards, sheets.faces);
    if (wrong.length) {
      throw new Error(game.i18n.format("ISUN.ImportNameMismatch", {
        count: wrong.length, first: `"${wrong[0].expected}" vs "${wrong[0].printed}"`
      }));
    }
    this.#say(game.i18n.format("ISUN.ImportVerified", { count: cards.length }));

    const images = spec.images
      ? await this.#writeImages(doc, sheets, cards, spec, size)
      : new Map();
    return this.#writePack(cards, images, spec);
  }

  /**
   * Import a deck that is read rather than looked at.
   *
   * No grid is measured and no card is cut: the text layer carries the whole
   * card. The one picture taken is the deck's back, which is the same on every
   * card in it, so it stands as the artwork for every entry — the faces carry
   * no art of their own to use instead.
   */
  async #importTextDeck(doc, spec, size) {
    const { cards, grid, sheets, classPages } = await spec.read(doc, {
      classes: spec.classes,
      onProgress: ({ done, total, found }) => {
        if (done % 12 === 0 || done >= total) {
          this.#say(game.i18n.format("ISUN.ImportReadingCards", { done, total, found }));
        }
      }
    });
    this.#say(game.i18n.format("ISUN.ImportFoundCards",
      { count: cards.length, sheets, columns: grid?.columns.length ?? 0 }));

    if (spec.expected && cards.length !== spec.expected) {
      throw new Error(game.i18n.format("ISUN.ImportWrongCount",
        { found: cards.length, expected: spec.expected }));
    }

    /* A deck whose cards come in classes has a back per class rather than one
     * for the whole deck — and those backs say which class they are, in their
     * artwork. So the picture a spell carries tells you at a glance whether it
     * is an alpha or an omega, which is the thing a Vance is actually juggling. */
    const images = classPages?.size
      ? await this.#writeClassBacks(doc, spec, classPages, size)
      : new Map();

    const img = (!images.size && spec.sharedBack)
      ? await this.#writeBackArt(doc, spec, grid, size) : null;
    if (img) this.#say(game.i18n.format("ISUN.ImportBackArt", { count: cards.length }));

    if (spec.classes) {
      const byClass = {};
      for (const card of cards) byClass[card.spellClass || "?"] = (byClass[card.spellClass || "?"] ?? 0) + 1;
      this.#say(game.i18n.format("ISUN.ImportClasses",
        { classes: Object.entries(byClass).map(([k, n]) => `${k} ${n}`).join(", ") }));
    }

    const byName = new Map(cards.map(c => [c.name, images.get(c.spellClass) ?? img]));
    return this.#writePack(cards, byName, spec);
  }

  /**
   * Cut one card back per class.
   *
   * Each class is printed on its own sheets, and a sheet's back is the page
   * before it — so the back for alpha comes off the page facing an alpha
   * sheet. The rectangle is the card's own: its left edge from the text grid,
   * its size from the class, and its top from where the ink starts on the back
   * page. Nothing here can be found by looking for white gaps; these sheets
   * print their cards against each other with crop marks across the gutters.
   */
  async #writeClassBacks(doc, spec, classPages, size) {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const dir = `${ASSET_ROOT}/${spec.folder}`;
    for (const part of [ASSET_ROOT.split("/")[0], ASSET_ROOT, dir]) {
      try { await FP.createDirectory("data", part); } catch { /* already there */ }
    }

    const INSET = 0.06;
    const images = new Map();

    for (const [spellClass, place] of classPages) {
      const backPage = place.backPage;
      if (!backPage) continue;

      const image = await deck.cutRegion(doc, backPage, {
        x: place.left + INSET,
        y: place.top + INSET,
        w: place.width - INSET * 2,
        h: place.height - INSET * 2
      }, { size: Math.round(size * Math.min(1, place.width / 3)) });

      const name = `back-${spellClass}.${image.extension}`;
      await FP.upload("data", dir,
        new File([image.blob], name, { type: image.blob.type }), {}, { notify: false });
      images.set(spellClass, `${dir}/${name}`);
    }

    if (images.size) {
      this.#say(game.i18n.format("ISUN.ImportClassBacks",
        { count: images.size, classes: [...images.keys()].join(", ") }));
    }
    return images;
  }

  /**
   * Cut the deck's back and save it once.
   *
   * The sheets give no white gutter to find the cards by — they abut, and the
   * crop marks bridge what gaps there are — so the rectangle is worked out
   * instead: the columns come from where the cards print "Level:", and the
   * rows from a strip taken down the middle of one column, which meets card
   * and gutter but no crop marks.
   */
  async #writeBackArt(doc, spec, grid, size) {
    if (!grid) return null;
    const FP = foundry.applications.apps.FilePicker.implementation;
    const dir = `${ASSET_ROOT}/${spec.folder}`;
    for (const part of [ASSET_ROOT.split("/")[0], ASSET_ROOT, dir]) {
      try { await FP.createDirectory("data", part); } catch { /* already there */ }
    }

    // A back sheet faces every front one; the second page of cards is a back.
    const backPage = 3;
    const column = grid.columns[Math.min(1, grid.columns.length - 1)];
    const centre = (column.x + column.w / 2) / 72;
    const bands = await deck.rowBandsAt(await doc.getPage(backPage), centre - 0.25, 0.5);
    if (!bands.length) return null;

    const rows = Math.max(1, Math.round(bands[0].h / (column.w / 72 * 1.4)));
    const INSET = 0.1;
    const image = await deck.cutRegion(doc, backPage, {
      x: column.x / 72 + INSET,
      y: bands[0].y + INSET,
      w: column.w / 72 - INSET * 2,
      h: bands[0].h / rows - INSET * 2
    }, { size });

    const name = `back.${image.extension}`;
    await FP.upload("data", dir,
      new File([image.blob], name, { type: image.blob.type }), {}, { notify: false });
    return `${dir}/${name}`;
  }

  /**
   * Import a book's write-ups into entries that already exist.
   *
   * A book carries no cards of its own — it explains ones already imported
   * from a deck — so it fills entries in rather than creating them, and joins
   * the two by the name printed at the head of each page. That is also why it
   * refuses when there is nothing to fill: importing The Gate into an empty
   * compendium would read a hundred and fifty pages and write nothing, and
   * "0 updated" is not an explanation.
   */
  async #importBook(doc, spec) {
    const pack = game.packs.get(spec.pack);
    if (!pack) throw new Error(game.i18n.format("ISUN.ImportNoPack", { pack: spec.pack }));

    /* Whole documents, not the index. An index carries a name and an id and
     * nothing else, and what a write-up needs to know is the card's rank —
     * that is what decides a royalty card's effect, which is printed once in
     * the rules rather than on the card's own page. Indexed, every rank came
     * back undefined and all six royalty effects were quietly left empty. */
    const cards = await pack.getDocuments();
    if (!cards.length) throw new Error(game.i18n.localize("ISUN.ImportDeckFirst"));

    const squash = (name) => name.replace(/\s+/g, "").toLowerCase();
    const byName = new Map(cards.map(c => [squash(c.name), {
      _id: c._id, name: c.name, value: c.system?.value, rank: c.system?.rank
    }]));

    const found = await spec.read(doc, byName, {
      onProgress: ({ done, total, found: n }) => {
        if (done % 24 === 0 || done >= total) {
          this.#say(game.i18n.format("ISUN.ImportReadingEntries", { done, total, found: n }));
        }
      }
    });

    const unmatched = found.filter(f => !f.card);
    for (const { page } of unmatched) {
      this.#say(game.i18n.format("ISUN.ImportPageUnmatched", { page }), true);
    }

    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const updates = found.filter(f => f.card).map(({ card, entry }) => ({
        _id: card._id,
        // statedValue is the page restating what the card already told us. It
        // is checked below rather than stored.
        system: Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== "statedValue"))
      }));
      if (updates.length) await Item.updateDocuments(updates, { pack: spec.pack });

      /* The write-up repeats the card's value, so it can check the deck import
       * rather than merely restate it. A disagreement means the two halves are
       * describing different cards, which is worth saying out loud. */
      const mismatched = found.filter(f => f.card && f.entry.statedValue
        && !f.entry.statedValue.startsWith(String(f.card.system?.value ?? "")));

      if (mismatched.length) {
        this.#say(game.i18n.format("ISUN.ImportValueMismatch",
          { count: mismatched.length, first: mismatched[0].card.name }), true);
      }
      return { created: 0, updated: updates.length, images: 0 };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  /** Cut every card out and write it into the data folder. */
  async #writeImages(doc, sheets, cards, spec, size) {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const dir = `${ASSET_ROOT}/${spec.folder}`;
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

    // Names are settled first, in order, because the rule for a repeat depends
    // on what came before it — not something to work out mid-flight.
    const images = new Map();
    const seen = new Map();
    const files = cards.map((card, i) => {
      let stem = spec.slug(card.name);
      seen.set(stem, (seen.get(stem) ?? 0) + 1);
      if (seen.get(stem) > 1) stem = `${stem}-${seen.get(stem)}`;
      const { blob, extension } = blobs[i];
      images.set(card.name, `${dir}/${stem}.${extension}`);
      return new File([blob], `${stem}.${extension}`, { type: blob.type });
    });

    let uploaded = 0;
    for (let start = 0; start < files.length; start += UPLOADS_AT_ONCE) {
      const batch = files.slice(start, start + UPLOADS_AT_ONCE);
      await Promise.all(batch.map(f => FP.upload("data", dir, f, {}, { notify: false })));
      uploaded += batch.length;
      this.#say(game.i18n.format("ISUN.ImportUploading", { done: uploaded, total: files.length }));
    }

    if (sheets.backs.length) {
      const [back] = await deck.cutCards(doc, [sheets.backs[0]],
        { card: sheets.card, size, mask: spec.mask });
      await FP.upload("data", dir,
        new File([back.blob], `back.${back.extension}`, { type: back.blob.type }),
        {}, { notify: false });
    }
    return images;
  }

  /**
   * Write the cards into the compendium.
   *
   * Matched by name and updated where they already exist, rather than the pack
   * being emptied first. A GM who has corrected an entry keeps their correction
   * of everything this does not set, and re-running after fixing one card does
   * not throw away the other fifty-nine.
   */
  async #writePack(cards, images, spec) {
    const pack = game.packs.get(spec.pack);
    if (!pack) throw new Error(game.i18n.format("ISUN.ImportNoPack", { pack: spec.pack }));

    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const index = await pack.getIndex();
      const byName = new Map(index.map(e => [e.name, e._id]));

      /* A second index that ignores case and punctuation, tried only when the
       * name does not match outright.
       *
       * Naming rules change. When the apostrophe rule was corrected — "Abra'S
       * Physique" to "Abra's" — twenty spells stopped matching what was
       * already in the pack, so they were created afresh and the old ones were
       * left sitting beside them. Matching exactly is right, but failing to
       * match should mean "this is a new card", not "this card is spelled
       * slightly differently than last time". */
      const loose = new Map();
      for (const entry of index) {
        const key = entry.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
        // Ambiguous keys are no help: leave those to the exact match.
        loose.set(key, loose.has(key) ? null : entry._id);
      }

      const create = [], update = [];
      for (const card of cards) {
        const data = spec.toItem(card, images.get(card.name), spec.spellType);
        const id = byName.get(card.name)
          ?? loose.get(card.name.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        if (id) update.push({ _id: id, ...data });
        else create.push(data);
      }

      if (create.length) await Item.createDocuments(create, { pack: spec.pack });
      if (update.length) await Item.updateDocuments(update, { pack: spec.pack });

      return { created: create.length, updated: update.length, images: images.size };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}
