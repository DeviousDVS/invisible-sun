/**
 * Invisible Sun — the skill list, out of The Key.
 *
 * Unlike everything else the importer reads, a skill has no write-up. The book
 * gives three headed sections — ACTION SKILLS, NARRATIVE SKILLS, DEVELOPMENT
 * SKILLS — each ending in a list of names, and says plainly that the list is
 * not a rule: "The game has no definitive list of action skills (players are
 * free to create their own skills to suit their character), but a basic list
 * might include the following." So what is imported is a starting library, and
 * the section a name sits under is the one thing that matters mechanically,
 * since it sets what the next level costs in Acumen.
 *
 * ── The nine that are not in a list ──
 * Six weapon skills and three defences are named in the prose rather than in
 * the bullets, because other rules point at them by name — a weapon finds its
 * own skill, and item text says "must take a successful Resist action". The
 * book names them in two sentences, and those two sentences are read.
 *
 * ── What is not written ──
 * Descriptions. The book writes one for each of the three defences and none
 * for the other fifty-eight, so there is nothing here to import; the field is
 * left alone rather than blanked, so a description written by hand survives.
 */
import { columnAnchors, columnLines, isHeading, PARAGRAPH_SLACK, pageWords } from "./book-page.mjs";

/** The three sections, and the category each one sets. */
const SECTIONS = {
  "ACTION SKILLS": "action",
  "NARRATIVE SKILLS": "narrative",
  "DEVELOPMENT SKILLS": "development"
};

/** How far a list item is set in from its column: two indents, 18 points. */
const ITEM_INDENT = 14;

/**
 * The six weapon skills and the three defences, as the book names them.
 *
 * "Thus, there are six weapon skills: Light Close Combat, Light Ranged,
 * Medium Close Combat, Medium Ranged, Heavy Close Combat, and Heavy Ranged."
 * "There are three defense skills… They are Resist, Dodge, and Withstand."
 */
const WEAPONS_RE = /there are six weapon skills:\s*([^.]+)\./i;
const DEFENSES_RE = /there are three defense skills[^.]*\.\s*They are\s*([^.]+)\./i;

/** A skill's name, where the book qualifies it — "Geography (usually specific
 *  to a locale)" is the Geography skill. */
const QUALIFIER_RE = /\s*\([^)]*\)?\s*$/;

/** Split "A, B, and C" into its members. */
const listed = (text) => text
  .split(/,\s*(?:and\s+)?|\s+and\s+/)
  .map(part => part.trim())
  .filter(Boolean);

/**
 * A reader fed one page at a time.
 *
 * Only the three sections are collected; everything between them is prose
 * about how skills work, which has nothing in it to import.
 */
export function reader() {
  const found = [];
  const seen = new Set();
  let category = null;
  let prose = [];

  const add = (name, category, extra = {}) => {
    const clean = name.replace(QUALIFIER_RE, "").trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    found.push({ kind: "skill", name: clean, category, ...extra });
  };

  /* The weapon and defence skills are pulled from the action section's prose
   * once it is complete, so that the sentence naming them can wrap across
   * lines and columns without being lost. */
  const closeSection = () => {
    if (category !== "action" || !prose.length) { prose = []; return; }
    const text = prose.join(" ").replace(/\s+/g, " ");
    for (const name of listed(WEAPONS_RE.exec(text)?.[1] ?? "")) {
      const [, type, range] = /^(Light|Medium|Heavy)\s+(Close Combat|Ranged)$/.exec(name) ?? [];
      if (type) add(name, "action", { weaponType: type.toLowerCase(),
                                      weaponRange: range === "Ranged" ? "ranged" : "close" });
    }
    for (const name of listed(DEFENSES_RE.exec(text)?.[1] ?? "")) {
      if (/^(Resist|Dodge|Withstand)$/.test(name)) add(name, "action", { defenseKey: name.toLowerCase() });
    }
    prose = [];
  };

  return {
    page(words, n) {
      const columns = columnAnchors(words);
      if (!columns) return;

      for (let column = 0; column < columns.length; column++) {
        const anchor = columns[column];
        for (const line of columnLines(words, columns, column)) {
          const flush = line.x <= anchor + PARAGRAPH_SLACK;

          if (isHeading(line) && flush) {
            closeSection();
            category = SECTIONS[line.text] ?? null;
            continue;
          }
          if (!category) continue;

          if (line.x >= anchor + ITEM_INDENT) {
            /* One name to a line, but a long one wraps and its later lines
             * open lowercase — "Crafting (usually subdivided into woodworking,
             * / metalworking, …". Every skill name opens with a capital. */
            if (/^[A-Z]/.test(line.text)) add(line.text, category, { page: n });
            continue;
          }
          prose.push(line.text);
        }
      }
    },
    done() { closeSection(); return found; }
  };
}

/**
 * One skill.
 *
 * `level` is not written: it is how good a character is at this, not anything
 * the book says about the skill, and the model's own default covers a fresh
 * entry.
 */
export function toItem(entry) {
  return {
    name: entry.name,
    type: "Skill",
    img: "icons/skills/trades/academics-book-study-runes.webp",
    system: {
      category: entry.category,
      ...(entry.weaponType ? { weaponType: entry.weaponType, weaponRange: entry.weaponRange } : {}),
      ...(entry.defenseKey ? { defenseKey: entry.defenseKey } : {})
    }
  };
}

/** Every skill the book lists. */
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
