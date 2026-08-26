/**
 * Invisible Sun — the fortes and their abilities.
 *
 * The largest body of content in the game: 51 fortes across four books, each
 * with nine or ten abilities, 491 in all. It is also the only content whose
 * shape the page cannot fully give up — see "What this cannot read" below.
 *
 * The four books do not agree with each other. The Key sets ability names in
 * the body face and Book M and The Nightside set them in capitals at the size
 * of a heading; The Key runs its columns at 72 and 428 for some fortes and 72
 * and 369 for others. What they do agree on is the shape of an entry, so that
 * is what this reads, measuring the rest off each page as it goes.
 *
 * ── The entry ──
 * A forte is a heading in capitals, prose, and then labelled fields:
 * Background, Appearance, Character Arcs, Path to Joy, Path to Despair, and
 * last Forte Abilities, after which the abilities themselves run to the next
 * forte. An entry runs to four pages, so it is carried across both columns and
 * several page breaks and closed only by the next heading.
 *
 * ── The abilities ──
 * An ability is a name, a Level, a description and a Colour — and a Depletion,
 * where it has one, which is the field that wraps: nine of the 491 run their
 * depletion onto a second line, and read a line at a time they lose the half
 * of it that says what is actually being checked. So a labelled value stays
 * open, and the indented lines under it belong to it rather than to the
 * description.
 *
 * The name is the awkward one. In The Key it is set in the same face and size
 * as the text under it, flush to the column, with nothing at all to mark it.
 * So it is found the way the older Python extractor found it: by its Level
 * line, which every ability has and nothing else on the page does, taking the
 * line above.
 *
 * ── What this cannot read ──
 * A forte is a tree rather than a list: "learning one ability unlocks the
 * potential acquisition of another (or sometimes two) later". The book draws
 * that tree as a diagram facing the ability text, and its arrows are vector
 * art — there is no text on the page that says which ability leads to which,
 * and the levels do not imply it either, since the paths cross.
 *
 * So `unlocks` is not written here, and must not be: the tree in the compendium
 * came from hand-built data (source/isdata_2026.json for The Key's 31 fortes
 * and source/forte-trees/*.mmd for the other 20) and nothing in any PDF can
 * reproduce it. Writing the field empty would destroy the one piece of this
 * system that cannot be rebuilt. Every other field an ability has is read from
 * the page and written; that one is left exactly as it is found.
 */
import {
  columnAnchors, columnLines, isHeading, joinWords, pageWords, PARAGRAPH_SLACK
} from "./book-page.mjs";
import { ISUN } from "../helpers/config.mjs";

/** The labelled fields a forte's entry carries, before its abilities. */
const FIELDS = ["Background", "Appearance", "Character Arcs",
                "Path to Joy", "Path to Despair", "Forte Abilities"];
const FIELD_RE = new RegExp(`^(${FIELDS.join("|")}):\\s*(.*)$`);

/**
 * An ability's level line.
 *
 * The colon is optional, and that is not tidiness: The Key drops it exactly
 * once, heading Cheat Death "Level 5 (no cost)". Requiring it skipped that
 * ability altogether and — worse — left its Color line to be read as the
 * previous ability's, so The Illusion came out Pale instead of Grey. Found the
 * hard way by the extractor this replaces; kept here so it is not found again.
 */
const LEVEL_RE = /^Level:?\s+(.+?)\s*$/;
const COLOR_RE = /^Color:\s*(.+?)\s*$/;
const DEPLETION_RE = /^Depletion:\s*(.+?)\s*$/;

/**
 * A cross-reference set into the margin.
 *
 * These land on the same baseline as body text and are joined to it: "I can
 * control these breath runes and use Sorcery, page 27". Where one falls at the
 * foot of a column it becomes a line of its own, and the line above an ability
 * name is taken for the first half of a wrapped name — which is how the ability
 * See Through Flame came to be called "Birth, page 166 See Through Flame".
 */
const REFERENCE_RE = /\s*\b[A-Z][^.]{0,40}, page \d+\s*$/;
const REFERENCE_LINE_RE = /^[A-Z][^.]{0,45}, page \d+$/;

/**
 * The book's own casing for its forte names.
 *
 * The entries are headed in capitals, and there is no rule that recovers the
 * casing from them: the books write "Calls Upon the Serpent" but "Walks the
 * Path of Suns", "Speaks With the Moon" but "Sings the Earthsong". Title-casing
 * the heading gets twenty-one of the thirty-one wrong, and a wrong name does
 * not merely look wrong — the importer matches entries by name, so it renames
 * whatever is already in the compendium to match.
 *
 * The Key settles it itself. It prints a Forte List, thirty-one names against
 * their page numbers, in the casing the book uses everywhere else. It is a
 * boxed table two indents into the column, so it is read from the page rather
 * than from the column.
 */
export function readForteList(words, into) {
  const lines = [];
  for (const word of words) {
    const line = lines.find(l => Math.abs(l.y - word.y) < 2.5);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }
  /* Sorted within the line, not across the page. Grouping by baseline gathers
   * words from two lines set a point apart, and in page order the aside in the
   * margin can arrive before the row it sits beside — which read straight
   * through gives "Record your forte andDisgorges Creatures". */
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  lines.sort((a, b) => a.y - b.y);

  /* The Key heads the list "Forte List"; Book M and The Nightside head it
   * "FORTE", over a column of page numbers headed "PAGE". Book M also opens
   * the chapter with the word FORTE set forty points tall, which is not a list
   * and is told apart by what follows it: a list's first row is the next line
   * down, and the chapter title's is a hundred points below. */
  for (const [i, line] of lines.entries()) {
    /* Exactly the heading, not merely starting with it: Book M also heads a
     * paragraph "FORTE ABILITIES", which is about them rather than a list. */
    if (!/^(Forte List|FORTE)$/.test(joinWords(line.words).trim())) continue;

    /* The first row is looked for under the heading rather than simply next:
     * Book M sets a note in the outer margin whose lines fall between the two,
     * and taken as the first row it puts the list in the wrong column. */
    /* Only what is in the list's own band. The list is a box beside the body
     * text, and a row shares its baseline with whatever line of that text
     * happens to fall level with it — which, measured from the left of the
     * page, puts the row's edge at the body's margin and loses it. */
    const band = line.words[0].x - LIST_COLUMN;
    const rows = lines.slice(i + 1)
      .map(l => ({ ...l, cells: withoutBullets(l.words.filter(w => w.x >= band)) }))
      .filter(l => l.cells.length);
    const first = rows.find(l => Math.abs(l.cells[0].x - line.words[0].x) < LIST_COLUMN);
    if (!first || first.y - line.y > LIST_GAP) continue;
    const rowX = first.cells[0].x;

    for (const row of rows) {
      if (Math.abs(row.cells[0].x - rowX) > 2) continue;
      /* Book M keeps its bullets in the text layer where The Key loses them,
       * so a row can arrive as "✦ Brandishes Battlemagic". The page number
       * against it is usually far enough right that joining the line stops
       * before it, but not always — the longest name in Book M reaches to
       * within fifteen points of its own page number. */
      const name = joinWords(row.cells).replace(/\s+\d{1,3}$/, "").trim();
      if (!NAME_RE.test(name)) break;
      into.set(normalise(name), name);
    }
  }
}

/**
 * A row's words without its bullet.
 *
 * Book M keeps the bullet in the text layer where The Key loses it, and it is
 * set nine points left of the name — but pdf.js gathers it onto the row's
 * baseline for some rows and not others, so a row's left edge is the name for
 * some and the bullet for others. Measuring from the name settles it.
 */
const withoutBullets = (words) => words.filter(w => !/^[✦•]+$/.test(w.text));

/** How far under its heading a list's first row sits. One line; a chapter
 *  opening set in the same word is a hundred points clear of anything. */
const LIST_GAP = 20;

/** How far a row may sit from its heading's own edge and still be under it. */
const LIST_COLUMN = 30;

/** What a forte's name looks like: two or more words, each opening in capitals
 *  or a small word, and nothing else — no digits, no sentence punctuation. */
const NAME_RE = /^[A-Z][A-Za-z\u00C0-\u024F’']+(?: [A-Za-z\u00C0-\u024F’']+)+$/;

export const normalise = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const SMALL = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "of",
                       "in", "on", "at", "to", "from", "by", "with", "as",
                       "into", "upon", "over", "under", "than", "that"]);

/**
 * Recase a name the book set in capitals.
 *
 * Only one the book set that way. The Key writes its ability names as they
 * should read — "Feed Upon the Power" — and there is no rule that would
 * improve on it; Book M and The Nightside set theirs in capitals and something
 * has to be decided. A small word keeps its case unless it opens or closes the
 * name, which is the convention those books follow everywhere they do write a
 * name out: "Invitation to Ruin", "Creatures Great and Small", "First the
 * Word".
 */
export function titleCase(text) {
  if (text !== text.toUpperCase()) return text;
  const words = text.toLowerCase().split(/\s+/);
  return words
    .map((word, i) => (i > 0 && i < words.length - 1 && SMALL.has(word))
      ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Strip the marginal cross-references that land inside a line of body text. */
const clean = (text) => text.replace(REFERENCE_RE, "").trim();

/**
 * Split one forte's lines into its fields and its abilities.
 *
 * The two halves are read differently and the Forte Abilities label is the
 * join: everything above it is prose under labels, everything below it is a
 * run of abilities found by their Level lines.
 */
export function parseForte(lines, column) {
  const flush = (line) => line.x <= column + PARAGRAPH_SLACK;
  const bulleted = (line) => line.x >= column + BULLET_INDENT;
  const fields = {};
  const description = [];
  let current = null;
  let split = lines.length;

  for (const [i, line] of lines.entries()) {
    const label = FIELD_RE.exec(line.text);
    if (label) {
      if (label[1] === "Forte Abilities") { split = i + 1; break; }
      current = label[1];
      fields[current] = { intro: [label[2]], items: [], marked: false };
      continue;
    }
    if (current) {
      const field = fields[current];

      /* Where the book's own bullet survives, it decides. The Threshold keeps
       * its ✦ in the text layer and sets the items at the same indent as the
       * label they follow, with their continuations one step further in —
       * which is the opposite of The Key, where the glyph is lost and the
       * items are the indented ones. Reading The Threshold by indent gives one
       * item made of every continuation. */
      const marked = BULLET_RE.test(line.text);
      const text = line.text.replace(BULLET_RE, "");
      if (marked) { field.marked = true; field.items.push(text); continue; }

      if (field.marked) {
        if (field.items.length) field.items[field.items.length - 1] += ` ${text}`;
        else field.intro.push(text);
        continue;
      }

      if (!bulleted(line)) { field.intro.push(text); continue; }
      const last = field.items[field.items.length - 1];
      if (!field.items.length || (endsSentence(last) && startsItem(text))) {
        field.items.push(text);
      } else {
        field.items[field.items.length - 1] += ` ${text}`;
      }
    } else if (flush(line) && !LEVEL_RE.test(line.text)) description.push(line.text);
  }

  return {
    description: join(description),
    fields: Object.fromEntries(Object.entries(fields).map(([key, field]) =>
      [key, { text: join(field.intro), items: field.items.map(item => join([item])) }])),
    abilities: parseAbilities(lines.slice(split), column)
  };
}

/**
 * Where one bullet ends and the next begins.
 *
 * The books set these as bulleted lists and pdf.js does not give the bullets
 * up: the ✦✦ is drawn from a symbol font it cannot map, and all that survives
 * is a zero-width item at the head of every line — every line, not only the
 * ones that start an item, so it marks the column and not the bullet.
 *
 * What is left is the prose. An item is a sentence or two set as a paragraph,
 * so both sides of a break have to agree: the line above ends a sentence and
 * the line below opens one. Asking only the line above splits twenty-one items
 * in The Key, all of them on a parenthetical that follows the full stop —
 * "…to incorporate into their breath runes. (Learn.)" is one arc, not two.
 */
const endsSentence = (text) => /[.!?][)"”’']?$/.test(text.trim());
const startsItem = (text) => /^[A-Z“"']/.test(text.trim());

/** How far a bullet item is set in from its column: two indents, 18 points.
 *  Used only where the glyph itself did not survive. */
const BULLET_INDENT = 14;

/** The bullet these books mark a list item with, where pdf.js keeps it. */
const BULLET_RE = /^[✦•]+\s*/;

/** Lines further apart than this are not one wrapped value. A line is thirteen
 *  points below the one above it. */
const VALUE_GAP = 20;

const join = (parts) => clean(parts.join(" ").replace(/\s+/g, " ").trim());

/**
 * Every ability in the run, found by its Level line.
 *
 * The name is the line above — flush to the column, and not itself a label.
 * Where a name is too long for the measure it wraps, so a second flush line
 * above is taken too, but only when it is not the tail of the previous
 * ability's description: a description's last line is flush as well, and
 * joining it produced names like "and then fades away Multiple Runes".
 * What separates them is that a description's tail ends in a full stop.
 */
export function parseAbilities(lines, column) {
  const flush = (line) => line.x <= column + PARAGRAPH_SLACK;
  const isLabel = (text) => FIELD_RE.test(text) || COLOR_RE.test(text)
    || DEPLETION_RE.test(text) || LEVEL_RE.test(text);

  const marks = [];
  for (const [i, line] of lines.entries()) {
    if (!LEVEL_RE.test(line.text) || i === 0) continue;
    let start = i - 1;
    if (!flush(lines[start]) || isLabel(lines[start].text)) continue;

    let name = lines[start].text;
    const above = lines[start - 1];
    if (above && flush(above) && !isLabel(above.text) && !/[.:]$/.test(above.text)
        && above.text.length < 30) {
      start -= 1;
      name = `${above.text} ${name}`;
    }
    marks.push({ start, level: i, name });
  }

  return marks.map((mark, n) => {
    const end = n + 1 < marks.length ? marks[n + 1].start : lines.length;
    const body = [];
    const value = { color: [], depletion: [] };
    let open = body;
    let previous = lines[mark.level].y;

    for (const line of lines.slice(mark.level + 1, end)) {
      /* A wrapped value runs straight on from the line it started, so it is
       * closed by any break in the setting. Without that the colour of the
       * last ability on a page keeps absorbing whatever is indented after it —
       * the labels of the progression diagram, mostly, so that Avaunt came out
       * coloured "Gold Spell Slayer Exalt in Death". */
      const broken = line.y - previous > VALUE_GAP || line.y < previous;
      previous = line.y;
      if (broken && open !== body && open !== null) open = value.color.length ? null : body;

      if (!flush(line)) { open?.push(line.text); continue; }

      /* A colour is one word from a fixed list, so it never wraps and nothing
       * is left open to absorb what follows it — which on one page is an aside
       * set close enough to look like a continuation. A depletion is a
       * sentence and does wrap. */
      const color = COLOR_RE.exec(line.text);
      if (color) { value.color.push(color[1]); open = null; continue; }
      const depletion = DEPLETION_RE.exec(line.text);
      if (depletion) { value.depletion.push(depletion[1]); open = value.depletion; continue; }

      /* Once the colour is given the ability is over. Without this the last
       * ability of the last forte reads on into the next chapter, which has no
       * heading this recognises to stop it. */
      if (value.color.length) break;
      body.push(line.text);
      open = body;
    }

    return {
      name: titleCase(mark.name.replace(/\s+/g, " ").trim()),
      levelText: LEVEL_RE.exec(lines[mark.level].text)[1],
      description: join(body),
      color: join(value.color),
      depletion: join(value.depletion)
    };
  });
}

/**
 * True when a heading is an ability's name rather than a forte's.
 *
 * The Key sets its ability names in the body face, so nothing but a forte is
 * ever a heading there. Book M and The Nightside set them in capitals at the
 * same size as the forte itself — BATTLEMAGIC ARMORSUIT beside BRANDISHES
 * BATTLEMAGIC, both fifteen point — and read as headings they close the forte
 * they belong to, which then has no abilities and is dropped for it.
 *
 * What separates them is the line underneath: an ability states its level
 * immediately, and a forte begins with prose. A name too long for the measure
 * wraps, so the line after that is checked as well.
 */
function namesAnAbility(lines, i) {
  const next = lines[i + 1];
  if (next && LEVEL_RE.test(next.text)) return true;
  return Boolean(next && isHeading(next) && lines[i + 2] && LEVEL_RE.test(lines[i + 2].text));
}

/**
 * A reader fed one page at a time.
 *
 * The forte entries are contiguous — one ends where the next begins — so an
 * entry is closed only by the next heading flush to its column. The heading is
 * repeated over the progression diagram, but inset, which is what tells the two
 * apart: of every heading in these chapters the diagram's is the one that is
 * not flush.
 */
export function reader() {
  const names = new Map();
  const found = [];
  let heading = [];
  let open = null;

  const close = () => {
    if (!open) return;
    const parsed = parseForte(open.lines, open.column);
    // A forte says what it is by having a path to joy and a run of abilities.
    if (parsed.fields["Path to Joy"] && parsed.abilities.length) {
      found.push({ heading: open.heading, page: open.page, ...parsed });
    }
    open = null;
  };

  return {
    page(words, n) {
      readForteList(words, names);

      /* Measured per page. These chapters are not set to one grid — see
       * columnAnchors — and a page read on the wrong one loses a column. */
      const COLUMNS = columnAnchors(words);
      if (!COLUMNS) return;

      for (let column = 0; column < COLUMNS.length; column++) {
        const anchor = COLUMNS[column];
        const lines = columnLines(words, COLUMNS, column);
        let boxed = false;

        for (const [i, line] of lines.entries()) {
          const flush = line.x <= anchor + PARAGRAPH_SLACK;
          if (isHeading(line) && !flush) { boxed = true; continue; }
          if (boxed && !flush) continue;
          boxed = false;

          if (isHeading(line) && flush && !namesAnAbility(lines, i)) {
            close();
            heading.push(line.text);
            continue;
          }
          if (heading.length) {
            open = { heading: heading.join(" "), lines: [], column: anchor, page: n };
            heading = [];
          }
          if (open && !REFERENCE_LINE_RE.test(line.text)) {
            open.lines.push({ ...line, x: line.x - anchor + open.column });
          }
        }
      }
    },

    done() {
      close();
      return found.map(forte => {
        /* The Threshold heads its entries with what they are — "HONES
         * THOUGHTS (FORTE)" — the same way it labels the objects in its
         * appendix. The bracket is not part of the name. */
        const heading = forte.heading.replace(/\s*\([A-Z ]+\)\s*$/, "").trim();
        return { ...forte, name: names.get(normalise(heading)) ?? titleCase(heading) };
      });
    }
  };
}

const html = (text) => (text ? `<p>${text}</p>` : "");

/** A labelled field: its opening sentence, and the list under it. */
function htmlField(field) {
  if (!field) return "";
  const items = field.items?.length
    ? `<ul>${field.items.map(item => `<li>${item}</li>`).join("")}</ul>` : "";
  return html(field.text) + items;
}

/** A forte. Its abilities are separate items; see toAbilityItem. */
export function toForteItem(entry) {
  return {
    name: entry.name,
    type: "Forte",
    img: "icons/magic/symbols/runes-triangle-orange.webp",
    system: {
      description: html(entry.description),
      background: htmlField(entry.fields["Background"]),
      appearance: htmlField(entry.fields["Appearance"]),
      suggestedArcs: entry.fields["Character Arcs"]?.items?.join(", ") ?? "",
      pathToJoy: htmlField(entry.fields["Path to Joy"]),
      pathToDespair: htmlField(entry.fields["Path to Despair"]),
      source: entry.source ?? ""
      /* abilities and secretPower are not written. The first is a list of item
       * ids that nothing reads — the sheets find a forte's abilities by
       * parentForte — and the second is a rule the same for every forte, set
       * by the model's own defaults. */
    }
  };
}

/**
 * The colour of an ability, as the game knows colours.
 *
 * Five abilities of Masters the Forms are printed "Color: Varies (see above)",
 * where the bracket is a cross-reference and not part of the colour — Varies
 * is one of the game's colours and the phrase is not. Written through, the
 * item is refused: the field takes a fixed list, so the update fails and the
 * ability keeps whatever it held before.
 *
 * That is also how the compendium came to hold the phrase in the first place.
 * The old pipeline writes its JSON straight to disk without a model to answer
 * to, so a value the model would refuse went in unremarked and has been there
 * ever since. Importing over it puts it right.
 */
function colorOf(text) {
  const bare = String(text ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return bare in ISUN.spellColorChoices ? bare : null;
}

/**
 * One forte ability.
 *
 * `unlocks` is absent by design, and the module comment says why: the tree it
 * holds is not on the page and cannot be recovered from one.
 */
export function toAbilityItem(entry) {
  const color = colorOf(entry.color);
  return {
    name: entry.name,
    type: "ForteAbility",
    img: "icons/magic/symbols/rune-sigil-rough-white-teal.webp",
    system: {
      ...levelParts(entry.levelText),
      description: html(entry.description),
      /* A colour the game does not have is not written at all, rather than
       * written empty over one that was set by hand. */
      ...(color === null ? {} : { color }),
      depletion: entry.depletion,
      parentForte: entry.parentForte
    }
  };
}

/**
 * "8 (+2 dice)" → a level, a dice bonus, and whether it costs Sorcery.
 * Mirrors ForteAbilityModel.parseLevel, which cannot be imported here: this
 * module is read outside Foundry by the tests.
 */
export function levelParts(raw) {
  const levelText = String(raw ?? "").trim();
  const out = { level: 1, bonusDice: 0, noCost: false, condition: "", levelText };
  const level = /^(\d+)/.exec(levelText);
  if (level) out.level = Number(level[1]);
  if (/no cost/i.test(levelText)) out.noCost = true;
  const dice = /\+(\d+)\s*d(?:ie|ice)\b([^)]*)/i.exec(levelText);
  if (dice) { out.bonusDice = Number(dice[1]); out.condition = dice[2].trim(); }
  return out;
}

/**
 * A forte and its abilities as separate entries, which is how they are stored.
 *
 * The books nest them and the compendia do not: a character buys abilities one
 * at a time, so each is an item of its own. They are tied back by the forte's
 * name, which is what the sheets look them up by.
 */
export function entries(forte, book) {
  return [
    { kind: "forte", source: book, ...forte },
    ...forte.abilities.map(ability =>
      ({ kind: "forteAbility", parentForte: forte.name, ...ability }))
  ];
}

/** Every forte in a book, and every ability, flattened. */
export async function readEntries(doc, { book, onProgress } = {}) {
  const read = reader();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    read.page(pageWords((await page.getTextContent()).items, height), n);
    onProgress?.({ done: n, total: doc.numPages });
  }
  return read.done().flatMap(forte => entries(forte, book));
}
