/**
 * Invisible Sun — the introduction, and the tour behind it.
 *
 * The first release went out to people who could install it and then could not
 * tell what to do next. Nothing they reported was broken; everything they
 * reported was unexplained. A README answers that for the person who goes
 * looking for a README, and the person who needs it most is the one who does
 * not.
 *
 * So this opens by itself, once per login, until it is told to stop.
 *
 * ── Why it is pages and not a tour ──
 * Foundry has Tours, which point at real elements and walk a user round the
 * interface, and they are the right answer right up until core moves a class
 * name. The sidebar has already been rebuilt once in v13 and the combat tracker
 * again in v14. A tour pinned to that markup is a thing that breaks silently in
 * somebody else's world, on a release we did not test against, and the failure
 * looks like the system being broken rather than the tour being stale.
 *
 * A page that *opens the real window* gets the reader to the same place and
 * depends on nothing but our own API. "Here is what the importer does —
 * [Import from my PDFs]" is a tour with one step and no fragility.
 *
 * ── Why the first page is the importer ──
 * Because a fresh world's first problem is not understanding, it is emptiness.
 * Every compendium this system ships arrives with nothing in it, by licence
 * rather than by oversight, and a guide that opens by explaining the design
 * philosophy to somebody staring at twenty empty packs has misread the room.
 * The page reports what is actually in them, so the answer to "did it work" is
 * on screen rather than inferred.
 */
import {
  EDITION, chaptersFor, importStatus, startPage, shouldAutoShow, shouldNudge, clampPage
} from "../helpers/guide.mjs";
import { SOURCES } from "../importers/sources.mjs";
import { ContentImporter } from "./ContentImporter.mjs";
import { PathOfSuns } from "./PathOfSuns.mjs";
import { CompendiumBrowser } from "./CompendiumBrowser.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SCOPE = "invisible-sun";

/** "Show this when I log in." The only thing standing between a user and quiet. */
export const AUTO_SETTING = "guideAutoShow";

/** The edition last dismissed. */
export const SEEN_SETTING = "guideSeen";

/** The edition last mentioned in chat to somebody who reads it no other way. */
export const TOLD_SETTING = "guideTold";

/**
 * What a chapter's `opens` string means.
 *
 * The indirection is the layer rule doing its job: `helpers/guide.mjs` holds
 * the chapter list and may not import an application, so it names a window and
 * this is where the name is resolved. It also means a chapter can point at a
 * window that does not exist yet without breaking anything — the button simply
 * is not offered — which is what lets Phase 2's pages be written before the
 * windows they describe are wired up.
 */
const WINDOWS = {
  importer: () => new ContentImporter().render(true),
  /* Its own opener, because the board is a singleton the whole table shares and
   * a second one would be a second board. */
  pathOfSuns: () => PathOfSuns.open(),
  browser: () => new CompendiumBrowser().render(true)
};

/**
 * How a compendium's state reads at a glance.
 *
 * Chosen here rather than in the helper: what a half-filled pack looks like is
 * a question about this window, and `helpers/guide.mjs` is meant to be arguable
 * about rules and silent about pictures.
 */
const PACK_ICONS = {
  empty:   "fa-regular fa-circle",
  partial: "fa-solid fa-circle-half-stroke",
  full:    "fa-solid fa-circle-check"
};

export class Guide extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-guide",
    classes: ["invisible-sun", "isun-guide"],
    tag: "div",
    position: { width: 680, height: 720 },
    window: { title: "ISUN.GuideTitle", icon: "fa-solid fa-book-open", resizable: true },
    actions: {
      "guide-next": Guide.#onNext,
      "guide-back": Guide.#onBack,
      "guide-goto": Guide.#onGoto,
      "guide-open": Guide.#onOpen
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/apps/guide.hbs" }
  };

  /** Which page is showing. Null until the first render decides. */
  #page = null;

  /* ──────────────────────────────────────────────
   * Opening
   * ────────────────────────────────────────────── */

  /** One guide, however many times it is asked for. */
  static open() {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof Guide) return app.render(true);
    }
    return new this().render(true);
  }

  /**
   * Say hello, in whichever of the two ways this reader has left open.
   *
   * Exactly one of these happens. Somebody who still has the guide opening by
   * itself gets the guide; somebody who switched that off gets, once per
   * edition, a line in chat saying there is more of it than they have read. One
   * entry point rather than two calls in the ready hook, because "at most one
   * greeting" is the rule and a rule is easier to keep in one place.
   */
  static async greet() {
    const auto = game.settings.get(SCOPE, AUTO_SETTING);

    if (shouldAutoShow({ auto, chapters: chaptersFor(game.user.isGM) })) {
      this.open();
      return;
    }

    const seen = game.settings.get(SCOPE, SEEN_SETTING);
    const told = game.settings.get(SCOPE, TOLD_SETTING);
    if (!shouldNudge({ auto, seen, told, edition: EDITION })) return;

    /* Stamped before the message is sent, not after.
     *
     * The two ways this can go wrong are not the same size. A stamp that lands
     * with no message costs one reader one mention of one edition. A message
     * that lands with no stamp repeats on every login for ever — which is the
     * behaviour they switched off, arriving by another door. So the cheap local
     * write goes first and the document creation second. */
    await game.settings.set(SCOPE, TOLD_SETTING, EDITION);

    await ChatMessage.create({
      whisper: [game.user.id],
      speaker: { alias: game.system.title },
      /* Flagged as well as classed. The class is how the link is found in the
       * rendered card; the flag is how anything later can recognise the card
       * itself without matching on its markup. */
      flags: { [SCOPE]: { guideNews: EDITION } },
      content: `<div class="isun-guide-news">`
        + `<p>${game.i18n.localize("ISUN.GuideNews")}</p>`
        + `<p class="isun-guide-news-hint">${game.i18n.localize("ISUN.GuideNewsHint")}</p>`
        + `<a class="isun-guide-news-open">`
        + `<i class="fa-solid fa-book-open"></i> `
        + `${game.i18n.localize("ISUN.GuideNewsOpen")}</a></div>`
    });
  }

  /**
   * Keep the books page honest while it is open.
   *
   * The importer is a window of its own, and the whole point of the page is
   * that the ticks appear as the books are read. Nothing tells a compendium's
   * index to announce itself, so the importer closing is the signal: by then
   * every pack it touched has been written.
   */
  static listen() {
    Hooks.on("closeContentImporter", () => {
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof Guide) app.render();
      }
    });

    /* The way back in, from the one line a reader who switched the guide off
     * gets. Wired on render rather than written as an inline handler: a chat
     * message's content is stored HTML, and stored HTML that calls into the
     * system is a hostage to every rename it survives. */
    Hooks.on("renderChatMessageHTML", (message, html) => {
      const link = html.querySelector?.(".isun-guide-news-open");
      if (link) link.addEventListener("click", () => Guide.open());
    });
  }

  /* ──────────────────────────────────────────────
   * What is on the page
   * ────────────────────────────────────────────── */

  /**
   * Every compendium this system ships, and what is in it.
   *
   * By `collection` rather than `metadata.id`, because `collection` is the
   * "invisible-sun.sooth" form that `sources.mjs` writes its `pack` keys in and
   * the two have to agree for a target to find its pack.
   */
  static #packs() {
    return game.packs
      .filter(p => p.metadata.packageType === "system"
                && p.metadata.packageName === SCOPE)
      .map(p => ({
        id: p.collection,
        label: p.metadata.label,
        count: p.index?.size ?? 0
      }));
  }

  async _prepareContext() {
    const isGM = game.user.isGM;
    const chapters = chaptersFor(isGM);

    /* Gathered whether or not this reader has the books page, because
     * `startPage` needs to know before it knows which page it is choosing. It
     * is a handful of index sizes already in memory; nothing is fetched. */
    const status = importStatus(SOURCES, Guide.#packs());

    this.#page = clampPage(
      this.#page ?? startPage(chapters, { importStarted: status.started }),
      chapters.length
    );

    const chapter = chapters[this.#page];
    return {
      chapters: chapters.map((c, i) => ({
        id: c.id,
        icon: c.icon,
        title: c.title,
        at: i,
        current: i === this.#page
      })),
      chapter: chapter && {
        ...chapter,
        /* Localised here rather than in the template so that a paragraph can
         * be a key or, later, a formatted string with a count in it, without
         * every page having to know which it is. */
        paragraphs: chapter.body.map(key => game.i18n.localize(key)),
        /* Only offered if the window it names actually exists. */
        opens: chapter.opens in WINDOWS ? chapter.opens : null
      },
      /* The books page is the only one with furniture of its own. Handed in
       * regardless; `showBooks` is what decides whether it is drawn, because a
       * template comparing an id to a string needs a helper this project has
       * never needed for anything else. */
      showBooks: chapter?.id === "books",
      status: {
        ...status,
        rows: status.rows.map(r => ({ ...r, icon: PACK_ICONS[r.state] }))
      },
      page: this.#page,
      pages: chapters.length,
      first: this.#page === 0,
      last: this.#page >= chapters.length - 1,
      autoShow: game.settings.get(SCOPE, AUTO_SETTING)
    };
  }

  /* ──────────────────────────────────────────────
   * Turning the pages
   * ────────────────────────────────────────────── */

  #goto(page) {
    this.#page = clampPage(page, chaptersFor(game.user.isGM).length);
    this.render();
  }

  static #onNext() { this.#goto(this.#page + 1); }
  static #onBack() { this.#goto(this.#page - 1); }

  static #onGoto(event, target) {
    this.#goto(Number(target.dataset.page));
  }

  static #onOpen(event, target) {
    const open = WINDOWS[target.dataset.opens];
    if (open) open();
  }

  /* ──────────────────────────────────────────────
   * The checkbox
   * ────────────────────────────────────────────── */

  /**
   * Written the moment it is changed, not on close.
   *
   * A preference that takes effect when you close the window is a preference
   * you have to trust you set. This one is a client setting, so there is no
   * round trip and no reason to defer it.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    const box = this.element.querySelector("input[name=autoShow]");
    box?.addEventListener("change", (event) =>
      game.settings.set(SCOPE, AUTO_SETTING, event.target.checked));
  }

  /** Remember which edition was read. Nothing reads it yet; see helpers/guide.mjs. */
  async _preClose(options) {
    await super._preClose(options);
    if (game.settings.get(SCOPE, SEEN_SETTING) !== EDITION) {
      await game.settings.set(SCOPE, SEEN_SETTING, EDITION);
    }
  }
}
