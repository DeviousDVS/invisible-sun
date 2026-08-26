/**
 * Invisible Sun — the secrets, out of The Van Hauten Collection.
 *
 * Secrets are bought with Acumen, one point per level, and cost no Sorcery to
 * use: "They are simply additions to the list of things the character can do"
 * (The Way, p84). Three kinds exist, and the book heads a section for each —
 * character secrets apply to the vislae, house secrets to their house, and
 * changery secrets require a bodily change to have been made first.
 *
 * ── Why this book and not the five it came from ──
 * They are printed across The Way, Book M, The Nightside and three of the
 * supplements. The Van Hauten Collection reprints all of them: "a complete
 * listing of every minor magic, long-form magic, and secret offered in the
 * Black Cube, Book M, and the Nightside", and the edition here is later still,
 * carrying secrets from The Threshold and the Enchiridion that postdate that
 * sentence.
 *
 * What makes it the better source is not that it is one book but that its
 * pages are plain. It sets no marginal notes and no sidebars, so a line of a
 * secret is a line of that secret and nothing else — where the original books
 * interleave cross-references into the middle of sentences.
 *
 * The one thing it does not say is which book each secret came from. So
 * `source` and `page` are not written here: they are provenance rather than
 * rules, and leaving them alone keeps whatever has already been recorded.
 */
import { columnAnchors, columnLines, isHeading, PARAGRAPH_SLACK, pageWords } from "./book-page.mjs";
import { titleCase } from "./fortes.mjs";

/** The three sections, and the kind each one sets. */
const SECTIONS = {
  "CHARACTER SECRETS": "character",
  "HOUSE SECRETS": "house",
  "CHANGERY SECRETS": "changery"
};

/** "Level: 10 (+3 dice)", "Level: 4 (+1 die)" — the level is also the price in
 *  Acumen. Both spellings of the die matter: matching only the plural read
 *  every "+1 die" secret as granting none. */
const LEVEL_RE = /^Level:\s*(\d+)\s*(?:\(\+(\d+)\s*d(?:ie|ice)\))?/;

/**
 * What The Nightside's secrets are labelled in the compilation.
 *
 * Eight of them are headed "WANTON CASTING (EXPERIMENTAL EFFECT)" where the
 * book they came from heads them by name alone. The bracket says which kind of
 * magic the secret belongs to rather than naming it, so it is not part of the
 * name — kept, it made eight new secrets and left the eight real ones looking
 * as though the compilation had missed them.
 */
const EXPERIMENTAL_RE = /\s*\(EXPERIMENTAL EFFECT\)\s*$/i;

/** Changery secrets alone name the bodily change they need first. */
const CHANGE_RE = /^Change required:\s*(.*)$/;

const ICONS = {
  character: "icons/svg/eye.svg",
  house: "icons/environment/settlement/house-manor.webp",
  changery: "icons/magic/life/cross-worn-green.webp"
};

/**
 * What a secret entitles its holder to.
 *
 * One does, and the book says so in prose rather than in a field: Magical
 * Management allows "two additional objects of power above and beyond the
 * normal limit of three at a time" (The Way, p90). Written down here because
 * a character's limit depends on it, and a limit that quietly stays at three
 * is not something anyone notices at the table.
 */
const GRANTS = {
  "Magical Management": { limits: { objectsOfPower: 2 } }
};

/**
 * A reader fed one page at a time.
 *
 * A secret's name is set in capitals at the size of the body text, flush to
 * its column, with nothing else to mark it — so it is found the way the forte
 * abilities are, by the Level line beneath it.
 *
 * An entry is carried across columns and pages and closed by the next name.
 * Reading each column on its own instead truncates every secret whose text
 * runs over the fold: A Child's Shortcuts lost the sentence saying it can only
 * be learned from the Unseen Children, which is the whole of how you get it.
 */
export function reader() {
  const found = [];
  let kind = null;
  let open = null;

  const close = () => {
    if (!open) return;
    found.push({ ...open, ...finish(open) });
    open = null;
  };

  return {
    page(words, n) {
      const columns = columnAnchors(words);
      if (!columns) return;

      for (let column = 0; column < columns.length; column++) {
        const anchor = columns[column];
        const lines = columnLines(words, columns, column);

        for (const [i, line] of lines.entries()) {
          const flush = flushAt(line, anchor);

          if (isHeading(line) && flush) {
            close();
            kind = SECTIONS[line.text.trim()] ?? kind;
            continue;
          }
          if (!kind) continue;

          /* The second half of a wrapped name is in capitals and flush and
           * has the level under it, so on its own it looks like a name too —
           * and being "(EXPERIMENTAL EFFECT)", it left seven secrets with no
           * name at all beside the seven real ones. It is checked for first. */
          if (consumed(lines, i, anchor)) continue;

          /* A name is in capitals, flush, and has its level under it — the
           * next line, or the one after where the name wraps. */
          const level = starts(lines, i, anchor);
          if (level) {
            close();
            open = {
              kind: "secret",
              secretType: kind,
              name: titleCase(level.name.replace(EXPERIMENTAL_RE, "").replace(/\s+/g, " ").trim()),
              level: level.level,
              bonusDice: level.bonusDice,
              body: [],
              page: n
            };
            continue;
          }
          // The level line and any wrapped half of the name are already taken.
          if (open && !LEVEL_RE.test(line.text)) {
            open.body.push({ text: line.text, flush });
          }
        }
      }
    },
    done() { close(); return found; }
  };
}

/** True if this line is a secret's name, with its level and dice. */
function starts(lines, i, anchor) {
  const line = lines[i];
  if (!flushAt(line, anchor) || !isCaps(line.text)) return null;

  // The level is on the next line, or the one after it where the name wraps.
  for (const span of [1, 2]) {
    const level = LEVEL_RE.exec(lines[i + span]?.text ?? "");
    if (!level) continue;
    if (span === 2) {
      const second = lines[i + 1];
      if (!second || !flushAt(second, anchor) || !isCaps(second.text)) continue;
    }
    return {
      name: span === 2 ? `${line.text} ${lines[i + 1].text}` : line.text,
      level: Number(level[1]),
      bonusDice: level[2] ? Number(level[2]) : 0
    };
  }
  return null;
}

/** True if this line is the second half of a name already taken. */
const consumed = (lines, i, anchor) =>
  i > 0 && Boolean(starts(lines, i - 1, anchor)) && isCaps(lines[i].text)
  && flushAt(lines[i], anchor);

/**
 * A secret's description, and the change it requires.
 *
 * The change runs on to its own indented lines and no further. Left open, it
 * takes every indented line after it — which is most of the description, since
 * that wraps the same way.
 */
function finish(entry) {
  const description = [];
  const changeRequired = [];
  let open = description;

  for (const line of entry.body) {
    const change = CHANGE_RE.exec(line.text);
    if (change) { changeRequired.push(change[1]); open = changeRequired; continue; }
    if (line.flush) open = description;
    open.push(line.text);
  }

  const tidy = (parts) => parts.join(" ").replace(/\s+/g, " ").trim();
  return { description: tidy(description), changeRequired: tidy(changeRequired), body: undefined };
}

const flushAt = (line, anchor) => line.x <= anchor + PARAGRAPH_SLACK;
const isCaps = (text) => text === text.toUpperCase() && /[A-Z]/.test(text);

/** One secret. */
export function toItem(entry) {
  return {
    name: entry.name,
    type: "Secret",
    img: ICONS[entry.secretType] ?? ICONS.character,
    system: {
      level: entry.level,
      /* A secret's level is its price, so the wording is derived rather than
       * read: "Secrets are selected by characters and cost Acumen to acquire —
       * 1 per level of the secret" (The Way, p84). */
      cost: `${entry.level} Acumen`,
      bonusDice: entry.bonusDice,
      description: entry.description ? `<p>${entry.description}</p>` : "",
      secretType: entry.secretType,
      changeRequired: entry.changeRequired,
      ...(GRANTS[entry.name] ? { grants: GRANTS[entry.name] } : {})
      /* source and page are not written; see the module comment. */
    }
  };
}

/** Every secret in the book. */
export async function readEntries(doc, { onProgress } = {}) {
  const read = reader();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    read.page(pageWords((await page.getTextContent()).items, height), n);
    onProgress?.({ done: n, total: doc.numPages });
  }
  return read.done();
}
