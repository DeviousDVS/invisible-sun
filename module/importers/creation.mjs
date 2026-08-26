/**
 * Invisible Sun — heart, soul and foundation, out of The Key.
 *
 * Three of the five steps of character creation. They are the last content in
 * this system with no reproducible source at all: every other compendium is
 * either read from a PDF by an importer or built by an extractor that reads
 * one, while these twenty-five entries were typed in by hand and have lived in
 * a JSON file ever since. Lose the file and they are typed again.
 *
 * They are read together because they are read the same way. All three are
 * written up as a heading in capitals followed by labelled fields — Stats,
 * Skills and Card family for a heart, Symbol/Image and Gift for a soul, Income
 * and Initial Motivations for a foundation — set in the same two columns, on
 * pages that also carry section headings, asides and explanatory prose.
 *
 * ── What makes a heading an entry ──
 * Not the heading. SOUL ALLEGIANCES, THE MAGISTERIUM and THE EIGHT FOUNDATIONS
 * are set exactly like THE CHILD and ESTABLISHED, and there is nothing in the
 * words to separate them. What separates them is the labels underneath: a
 * block carrying Symbol/Image and Gift is a soul, and a block carrying neither
 * is prose about souls. This also settles the harder case, which is that the
 * page introducing the foundations explains each of their fields in turn —
 * "Income: This is a monetary amount that the character earns each week" — and
 * so carries every label an entry does. It is told apart by the value: a
 * foundation's income is a number, and a paragraph explaining income is not.
 *
 * ── The indents ──
 * The Key sets a paragraph's first line one step in and the rest flush, which
 * is the opposite of The Threshold, and its lists two steps in. So the step is
 * what the structure is read from: nine points, three levels, throughout.
 */
import { columnLines, isHeading, PARAGRAPH_SLACK, pageWords, title } from "./book-page.mjs";

/** The Key's two columns. The same as The Threshold's, as it happens — these
 *  books are set to one grid. */
export const COLUMNS = [72, 428];

/**
 * How far one indent moves a line.
 *
 * Nine points, twice over: paragraphs open at 81 against a column at 72, and
 * list items sit at 90. The right column repeats it at 428, 437 and 446. Read
 * as levels rather than as positions, the same three numbers describe both
 * columns and every page of the chapter.
 */
const INDENT_STEP = 9;

/** Labels the three kinds of entry carry, longest first so that "Initial
 *  Savings" is not read as "Initial". */
const LABELS = [
  "Symbol/Image", "Initial Motivations", "Initial Savings", "Hidden Knowledge",
  "Character Arcs", "Card family", "Connections", "Income", "Animal", "Object",
  "Skills", "Stats", "House", "Gift", "Special"
].sort((a, b) => b.length - a.length);

const LABEL_RE = new RegExp(`^(${LABELS.map(l => l.replace("/", "\\/")).join("|")}): ?(.*)$`);

/** "Certes: 9    Qualia: 8" — one line, two figures, and the only place a
 *  heart's starting stats are stated. */
const STATS_RE = /Certes:\s*(\d+).*?Qualia:\s*(\d+)/;

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * What a foundation's income looks like, as against a paragraph explaining
 * what income is.
 *
 * The page introducing the foundations defines every one of their fields in
 * turn — "Income: This is a monetary amount that the character earns each
 * week" — so it carries every label an entry does and would be read as a ninth
 * foundation. The value is what tells them apart. Not simply a figure, though:
 * the Mendicant has no income at all, and requiring one dropped it.
 */
const INCOME_RE = /^(\d|None\b)/;

/**
 * Read one entry's body into paragraphs, labelled fields and lists.
 *
 * A list belongs to whatever came before it: a heart prints its adjectives
 * after the sentence introducing them and its skills after the Skills label,
 * and nothing distinguishes the two runs of bullets except what they follow.
 */
export function parseBody(lines, column) {
  const body = { paragraphs: [], fields: {}, lists: [] };
  let open = null;          // where continuation text goes
  let list = null;          // the run of list items being collected

  const openParagraph = (text) => {
    body.paragraphs.push(text);
    const index = body.paragraphs.length - 1;
    open = { append: (more) => { body.paragraphs[index] += ` ${more}`; } };
  };

  for (const line of lines) {
    const level = Math.max(0, Math.min(2, Math.round((line.x - column) / INDENT_STEP)));

    if (level === 2) {
      if (!list) { list = { items: [] }; body.lists.push(list); }
      list.items.push(line.text);
      continue;
    }

    if (level === 1) {
      list = null;

      /* The stats are set as one line of two values rather than as a labelled
       * field, and they are not prose — so they are taken here and kept out of
       * the description. Read from the uncut line: the two halves are set far
       * enough apart to look like an aside. */
      const stats = STATS_RE.exec(line.raw ?? line.text);
      if (stats) {
        body.fields["Certes"] = stats[1];
        body.fields["Qualia"] = stats[2];
        open = null;
        continue;
      }

      const label = LABEL_RE.exec(line.text);
      if (label) {
        const key = label[1];
        body.fields[key] = label[2].trim();
        open = { append: (more) => { body.fields[key] = `${body.fields[key]} ${more}`.trim(); } };
        continue;
      }
      openParagraph(line.text);
      continue;
    }

    // Flush: the continuation of whatever paragraph or field is open.
    if (open) open.append(line.text);
    else openParagraph(line.text);
  }
  return body;
}

/**
 * True once an entry has reached the last field its kind prints.
 *
 * An entry has to be carried across a column and a page — the Established
 * foundation begins in one column and finishes its motivations and character
 * arcs in the next — so it cannot simply be closed at a break. But carried
 * indefinitely it runs into whatever follows: The Dancer is the last of the
 * thirteen souls, and with nothing to stop it, it read on through the opening
 * of the Foundation chapter and took twelve hundred characters of it.
 *
 * So a break closes an entry that has nothing left to collect. Each kind ends
 * on a field of its own: a heart on its object, a soul on its gift, a
 * foundation on its character arcs.
 */
const finished = (fields) =>
  Boolean(fields["Object"] || fields["Gift"] || fields["Character Arcs"]);

/** What a block is, judged by the fields it carries. */
function classify({ fields }) {
  if (fields["Stats"] !== undefined && fields["Card family"]) return "heart";
  if (fields["Symbol/Image"] && fields["Gift"]) return "soul";
  if (INCOME_RE.test(fields["Income"] ?? "") && fields["Initial Motivations"]) return "foundation";
  return null;
}

/**
 * A reader that is fed one page at a time.
 *
 * Pages are handed in by whoever is walking the book, so that The Key is read
 * once rather than once per chapter. An entry is left open across a column or
 * page break and closed by the next heading — the foundations run to most of a
 * column each and several of them break.
 */
export function reader() {
  const found = [];
  let heading = [];
  let open = null;

  const close = () => {
    if (!open) return;
    const body = parseBody(open.lines, open.column);
    const kind = classify(body);
    if (kind) found.push({ name: title(open.heading), kind, ...body, page: open.page });
    open = null;
  };

  return {
    page(words, n) {
      for (let column = 0; column < COLUMNS.length; column++) {
        if (open && finished(parseBody(open.lines, open.column).fields)) close();
        const anchor = COLUMNS[column];
        let boxed = false;
        for (const line of columnLines(words, COLUMNS, column)) {
          const flush = line.x <= anchor + PARAGRAPH_SLACK;

          /* A boxed sidebar sits in the column but is not part of it, and the
           * column's text resumes underneath. Left in, the box ends whatever
           * entry was running and swallows the rest of it: the Connected
           * foundation stops at "You've got a house and the financial" and
           * loses its character arcs entirely.
           *
           * What marks the box is that it is set inside its own border, one
           * indent in. Of the forty headings in this chapter, thirty-nine are
           * flush to their column and DICHOTOMIES is the one that is not. So
           * the box is skipped until the column comes back to its own edge. */
          if (isHeading(line) && !flush) { boxed = true; continue; }
          if (boxed && !flush) continue;
          boxed = false;

          if (isHeading(line)) {
            close();
            heading.push(line.text);
            continue;
          }
          if (heading.length) {
            open = { heading: heading.join(" "), lines: [], column: COLUMNS[column], page: n };
            heading = [];
          }
          if (open) {
            // Normalised into the column the entry started in, so that its
            // indents still read as levels after it breaks to the next one.
            open.lines.push({ ...line, x: line.x - COLUMNS[column] + open.column });
          }
        }
      }
    },
    done() { close(); return found; }
  };
}

const paragraphs = (list) => list.map(p => `<p>${p}</p>`).join("");
const trim = (text = "") => text.replace(/\.$/, "").trim();
const firstNumber = (text) => { const m = /(\d+)/.exec(text ?? ""); return m ? Number(m[1]) : 0; };

/**
 * A heart.
 *
 * The older name — Flameheart for a Galant, Stoneheart for a Stoic — is not a
 * field. It is stated once, mid-sentence, in the paragraph offering the
 * alternatives: "Characters who don't wish to be called a Galant or a
 * Flameheart can use the following adjectives".
 */
export function toHeartItem(entry) {
  const text = entry.paragraphs.join(" ");

  /* Two runs of bullets, and only their order tells them apart: the
   * adjectives are offered before the stats, the skills after them. */
  const adjectives = entry.lists.length > 1 ? entry.lists[0] : null;
  const skills = entry.lists[entry.lists.length - 1];
  const granted = /choose (\w+) skills/i.exec(entry.fields["Skills"] ?? "");
  const level = /have (\d+) level/i.exec(entry.fields["Skills"] ?? "");

  return {
    name: entry.name,
    type: "Heart",
    img: "icons/magic/life/heart-glowing-red.webp",
    system: {
      alternativeName: /called an? \w+ or an? (\w+)/i.exec(text)?.[1] ?? "",
      description: paragraphs(entry.paragraphs),
      adjectives: adjectives?.items ?? [],
      startingCertes: firstNumber(entry.fields["Certes"]),
      startingQualia: firstNumber(entry.fields["Qualia"]),
      startingPoolPoints: firstNumber(/have (\d+) points? to divide/i.exec(entry.fields["Stats"] ?? "")?.[1]),
      cardFamily: trim(entry.fields["Card family"]),
      associatedAnimal: trim(entry.fields["Animal"]),
      associatedObject: trim(entry.fields["Object"]),
      skillsOptions: skills?.items ?? [],
      skillsGranted: WORDS[granted?.[1]?.toLowerCase()] ?? firstNumber(granted?.[1]) ?? 2,
      skillsLevel: level ? Number(level[1]) : 1
      /* summary is not written. It is not part of the entry: it is one line
       * per heart in a summary box printed two pages earlier, in a layout of
       * its own. Leaving it alone also means a re-import never overwrites one
       * that has been written by hand. */
    }
  };
}

/**
 * A soul.
 *
 * The cost of calling a Soul Guardian, and what it gives away, are not written
 * up per soul: they are one rule stated once for all thirteen. So they are not
 * written here — the model's own default covers the cost, and a field left
 * alone is a field a GM can set.
 */
export function toSoulItem(entry) {
  return {
    name: entry.name,
    type: "Soul",
    img: "icons/magic/symbols/runes-star-blue.webp",
    system: {
      description: paragraphs(entry.paragraphs),
      symbolImage: entry.fields["Symbol/Image"] ?? "",
      guardianGift: entry.fields["Gift"] ? `<p>${entry.fields["Gift"]}</p>` : ""
    }
  };
}

/** A foundation. */
export function toFoundationItem(entry) {
  const house = entry.fields["House"] ?? "";
  const level = /level (\d+)/i.exec(house);
  const arcs = entry.fields["Character Arcs"] ?? "";

  return {
    name: entry.name,
    type: "Foundation",
    img: "icons/environment/settlement/house-manor.webp",
    system: {
      description: paragraphs(entry.paragraphs),
      weeklyIncome: firstNumber(entry.fields["Income"]),
      initialSavings: firstNumber(entry.fields["Initial Savings"]),
      startingHiddenKnowledge: firstNumber(entry.fields["Hidden Knowledge"]),
      houseType: house.replace(/;?\s*level \d+\s*$/i, "").trim(),
      houseLevel: level ? Number(level[1]) : 0,
      connectionsCount: firstNumber(entry.fields["Connections"]),
      connectionsText: entry.fields["Connections"] ?? "",
      specialRules: entry.fields["Special"] ? `<p>${entry.fields["Special"]}</p>` : "",
      initialMotivations: entry.fields["Initial Motivations"]
        ? `<p>${entry.fields["Initial Motivations"]}</p>` : "",
      suggestedArcs: arcs ? arcs.split(/,\s*/).map(a => a.trim()).filter(Boolean) : []
    }
  };
}

/** Every character-creation entry, for a caller that has the whole book. */
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
