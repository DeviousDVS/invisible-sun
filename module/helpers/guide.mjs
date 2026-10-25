/**
 * Invisible Sun — what the guide says, and when it says it.
 *
 * Sixty people installed 0.1.0 and almost nothing they reported was a fault.
 * It was all the same question in different words: how does this work, and why
 * are my compendia empty. That is not a bug list, it is a missing first page —
 * so this is the first page.
 *
 * ── Why the chapters are data ──
 * A guide is prose, and prose in a template is prose nobody can test and
 * nobody can translate. So a chapter is a record: a title key, a list of
 * paragraph keys, and what window it can open. One template renders any of
 * them, `lang/en.json` holds every word, and `scripts/check.mjs` already fails
 * the build for a key that is referenced and not defined — which means a
 * chapter pointing at prose that does not exist cannot ship.
 *
 * ── Why this file knows nothing about windows ──
 * It is a helper, and a helper may not import an application: that rule exists
 * because `helpers/flux.mjs` once reached for the Path of Suns and took two
 * files' worth of tests out of Node with it. A chapter therefore *names* what
 * it opens — `opens: "importer"` — and `apps/Guide.mjs` is the one place that
 * knows a string called "importer" means a ContentImporter. The same reason
 * `importStatus` is handed plain counts rather than fetching them: the reckoning
 * is testable here, and only the gathering needs a browser.
 */

/**
 * Which edition of the guide this is.
 *
 * Bumped when the pages change enough that somebody who has read them should
 * read them again. Nothing in Phase 1 acts on it — the checkbox is the only
 * gate — but it is recorded from the first release so that a later "the guide
 * has new pages" has something honest to compare against. A stamp that starts
 * being written in version three can only ever say "not version three".
 */
export const EDITION = 2;

/**
 * The pages, in order.
 *
 * `gm` and `player` are audience filters and are mutually exclusive by
 * convention: a chapter carries one or neither. `attention` marks a chapter as
 * a task rather than a reading — a page the guide should open on while the task
 * is outstanding, and skip past once it is done. See `startPage`.
 */
export const CHAPTERS = Object.freeze([
  {
    id: "books",
    gm: true,
    attention: "import",
    title: "ISUN.GuideBooksTitle",
    icon: "fa-solid fa-file-import",
    body: ["ISUN.GuideBooksP1", "ISUN.GuideBooksP2", "ISUN.GuideBooksP3"],
    opens: "importer",
    opensLabel: "ISUN.GuideBooksOpen",
    opensIcon: "fa-solid fa-file-import"
  },
  {
    id: "welcome",
    title: "ISUN.GuideWelcomeTitle",
    icon: "fa-solid fa-cube",
    body: ["ISUN.GuideWelcomeP1", "ISUN.GuideWelcomeP2"],
    /* The same page says a different second half depending on who is reading
     * it. A GM is told the compendia are theirs to fill; a player is told why
     * their sheet may be offering them nothing yet, which is the question they
     * would otherwise ask in session one and which no amount of GM-facing
     * documentation reaches. */
    bodyGM: ["ISUN.GuideWelcomeGM"],
    bodyPlayer: ["ISUN.GuideWelcomePlayer"]
  },
  {
    id: "sheet",
    title: "ISUN.GuideSheetTitle",
    icon: "fa-solid fa-user",
    body: ["ISUN.GuideSheetP1", "ISUN.GuideSheetP2", "ISUN.GuideSheetP3"]
  },
  {
    id: "rolling",
    title: "ISUN.GuideRollingTitle",
    icon: "fa-solid fa-dice-d20",
    body: ["ISUN.GuideRollingP1", "ISUN.GuideRollingP2", "ISUN.GuideRollingP3"],
    /* The pool an action draws on is the GM's to name, and naming it is what
     * makes a scourge or a vex apply at all. A player never sets it, so
     * telling them about it is telling them about somebody else's field. */
    bodyGM: ["ISUN.GuideRollingGM"]
  },
  {
    id: "magic",
    title: "ISUN.GuideMagicTitle",
    icon: "fa-solid fa-wand-sparkles",
    body: ["ISUN.GuideMagicP1", "ISUN.GuideMagicP2", "ISUN.GuideMagicP3"],
    opens: "pathOfSuns",
    opensLabel: "ISUN.GuideMagicOpen",
    opensIcon: "fa-solid fa-sun"
  },
  {
    id: "action",
    title: "ISUN.GuideActionTitle",
    icon: "fa-solid fa-hand-fist",
    body: ["ISUN.GuideActionP1", "ISUN.GuideActionP2",
           "ISUN.GuideActionP3", "ISUN.GuideActionP4"]
  },
  {
    id: "where",
    title: "ISUN.GuideWhereTitle",
    icon: "fa-solid fa-compass",
    body: ["ISUN.GuideWhereP1", "ISUN.GuideWhereP2", "ISUN.GuideWhereP3"],
    opens: "browser",
    opensLabel: "ISUN.GuideWhereOpen",
    opensIcon: "fa-solid fa-magnifying-glass",
    /* The one address in the guide worth being able to click. Kept as data
     * rather than as markup inside a localised paragraph: a translator should
     * be handed a sentence, not a sentence with an anchor tag in it. */
    link: {
      href: "https://github.com/DeviousDVS/invisible-sun/issues",
      label: "ISUN.GuideWhereIssues"
    }
  }
]);

/**
 * The chapters this reader gets, with their audience's paragraphs folded in.
 *
 * Returns copies. The chapter list is frozen and shared, and a caller that
 * appended to `body` in place would grow the paragraph list by one on every
 * render.
 */
export function chaptersFor(isGM) {
  return CHAPTERS
    .filter(c => (!c.gm || isGM) && (!c.player || !isGM))
    .map(c => ({
      ...c,
      body: [...c.body, ...((isGM ? c.bodyGM : c.bodyPlayer) ?? [])]
    }));
}

/**
 * How many entries each compendium should end up holding.
 *
 * Only the decks answer this. A deck is a source with one pack and a known
 * count — sixty Sooth cards, three hundred spells — so "241 of 241" is a true
 * sentence about the Ephemera compendium. A book is not: The Key alone fills
 * nine packs and the importer's `expected` for it, where there is one at all,
 * counts pages and not items, so attributing it to any single compendium would
 * put a wrong number on the screen with an air of authority.
 *
 * So a pack fed only by books gets no target and is reported as a count. A
 * number with nothing to compare it to is honest; a made-up denominator is not.
 */
export function packTargets(sources = []) {
  const targets = {};
  for (const source of sources) {
    if (!source?.pack || !Number.isInteger(source.expected)) continue;
    targets[source.pack] = (targets[source.pack] ?? 0) + source.expected;
  }
  return targets;
}

/**
 * What is in the compendia, said plainly.
 *
 * `packs` is `[{ id, label, count }]` — gathered by the app from `game.packs`,
 * because that needs a browser and this does not.
 *
 * ── Why "started" and not "complete" ──
 * There is no way to know which books somebody owns. A table with the core
 * books and none of the expansions will never fill Vance Spells, and a guide
 * that keeps reopening on a page of empty rows to tell them so is nagging them
 * about a purchase. What can be known is whether they have ever run the
 * importer at all, and that is the question actually worth asking: one full
 * compendium means they found it and it worked.
 */
export function importStatus(sources = [], packs = []) {
  const targets = packTargets(sources);
  const rows = packs.map(pack => {
    const count = Number(pack?.count) || 0;
    const expected = targets[pack?.id] ?? null;
    const state = count === 0 ? "empty"
      : (expected && count < expected) ? "partial"
      : "full";
    return {
      id: pack?.id ?? "",
      label: pack?.label ?? "",
      count,
      expected,
      /* The number to print beside the count, which is not always the one we
       * hold. A deck's `expected` is what the deck provides, and several packs
       * are fed by books as well — so a finished Ephemera compendium holds 307
       * against a deck target of 293, and "307 / 293" reads as an error rather
       * than as success. A target is worth showing while it is being worked
       * towards and is noise once it is met, so it is offered only then. */
      target: state === "partial" ? expected : null,
      state
    };
  });
  const filled = rows.filter(r => r.count > 0).length;
  return { rows, filled, total: rows.length, started: filled > 0 };
}

/**
 * Which page to open on.
 *
 * The first chapter with something outstanding, or — when there is nothing
 * outstanding — the first chapter that is not a task at all. A GM who has
 * finished importing should be greeted by the tour, not by a page of ticks
 * congratulating them, and a GM who has not should be greeted by the one thing
 * standing between them and a usable world.
 */
export function startPage(chapters = [], state = {}) {
  const urgent = chapters.findIndex(c => needsAttention(c, state));
  if (urgent !== -1) return urgent;
  const reading = chapters.findIndex(c => !c.attention);
  return reading === -1 ? 0 : reading;
}

/** Whether a task chapter still has its task to do. */
function needsAttention(chapter, state = {}) {
  if (chapter?.attention === "import") return state.importStarted === false;
  return false;
}

/**
 * Whether to open the guide unasked.
 *
 * One condition, deliberately. "Displays automatically until the user asks it
 * not to" is the whole specification, and a second clause — seen it once, seen
 * this edition, seen it on this world — would make the checkbox a liar in some
 * case nobody would find until it annoyed them.
 */
export function shouldAutoShow({ auto = true, chapters = [] } = {}) {
  return auto === true && chapters.length > 0;
}

/**
 * Whether to mention, once, that the guide has moved on.
 *
 * ── Why this exists at all ──
 * `shouldAutoShow` has one condition on purpose: the footer says "show this
 * when I log in", and a guide that reappears after being told not to has lied
 * to the person who told it. But a reader who switched it off at edition one
 * and never hears about edition four is a reader the guide has given up on, and
 * these pages are the answer to the questions people actually ask.
 *
 * So the window stays shut and a line goes to chat instead. It is the smallest
 * thing that can carry a way back in.
 *
 * ── Why `told` is separate from `seen` ──
 * They are different facts. `seen` is the edition somebody read; `told` is the
 * edition somebody was told about. Conflating them makes one of two mistakes:
 * stamping `seen` on a nudge records a reading that never happened and buries
 * the pages for good, and not stamping anything at all nudges on every single
 * login — which is precisely the behaviour they switched off, wearing a
 * different hat.
 */
export function shouldNudge({ auto = true, seen = 0, told = 0, edition = EDITION } = {}) {
  // Still opening by itself: they get the pages, not a line about them.
  if (auto === true) return false;
  const read = Number.isFinite(seen) ? seen : 0;
  const mentioned = Number.isFinite(told) ? told : 0;
  return read < edition && mentioned < edition;
}

/** Keep a page number inside the book. */
export function clampPage(index, count) {
  const last = Math.max(0, count - 1);
  const at = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(0, at), last);
}
