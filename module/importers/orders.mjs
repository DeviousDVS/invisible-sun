/**
 * Invisible Sun — the five magical orders, out of The Key.
 *
 * An order is a heading in capitals, prose, five labelled fields, and then a
 * ladder of six degrees. Each degree is headed "3rd-Degree Vance: Magister",
 * states what attaining it requires, and grants named abilities written as
 * "Label: text" — the same shape the fortes use for their fields, one level
 * further in.
 *
 * ── The Apostate ──
 * The fifth order is not an order. Apostates have no degrees and no hierarchy,
 * so instead of a ladder the book gives them two lists: what a beginning
 * Apostate starts with, and what any Apostate may buy afterwards at 1 Crux
 * each. Both are read into their own fields, and the sentence governing each
 * list is kept with it — the note is a rule about the list rather than an
 * ability in it.
 *
 * ── The two kinds of aside ──
 * A page is two columns of prose with a thin column of notes down the middle,
 * and boxed rules set inside the columns themselves. They are not the same
 * thing and are not treated the same way.
 *
 * The middle notes are somebody talking past the text — a cross-reference, a
 * remark about the printed components — and book-page.mjs already drops them:
 * they start about 240 points along, where body text is flush to its column or
 * a step or two in.
 *
 * A box is content. "VANCIAN MAGIC", the cycle a Vance casts by, is a rule the
 * order's entry would be poorer without. So boxes are read, into `sidebars`.
 *
 * What they must not do is land in the middle of a sentence. A box interrupts
 * the column it sits in, and the prose picks up below it — the Vance's 2nd
 * degree reads "we can reduce the", then the whole of the Vancian Magic box,
 * then "occupying space of two of the spells". Read straight through, the box
 * is spliced into the ability and the sentence is cut in half.
 */
import { columnAnchors, columnLines, isHeading, PARAGRAPH_SLACK, pageWords } from "./book-page.mjs";

/** The labelled fields an order carries before its degrees. */
const FIELDS = ["Other Names", "Philosophy and Outlook", "Relationships",
                "Path to Joy", "Path to Despair"];
const FIELD_RE = new RegExp(`^(${FIELDS.join("|")}):\\s*(.*)$`);

/**
 * "3rd-Degree Vance: Magister" — and sometimes only "1st-Degree Weaver:",
 * because a long title wraps to the line below. Four of the Weaver's six do,
 * and read as a heading that must carry its own title they are not headings at
 * all: the order came back with one degree instead of six.
 */
const DEGREE_RE = /^(\d+)(?:st|nd|rd|th)-Degree(?:\s+\w+)?:\s*(.*)$/;

/**
 * A named ability: a short label in title case, then what it does.
 *
 * The space after the colon is optional, because once it is missing:
 * "Authority and Responsibilities:A 6th-degree Weaver is expected to start
 * their own cell". Requiring it lost that ability and folded its text into the
 * one above.
 */
const ABILITY_RE = /^([A-Z][A-Za-z’'-]*(?: [A-Za-z’'-]+){0,5}):\s*(\S.*)$/;

/** The two lists the Apostate has instead of degrees. */
const APOSTATE_LISTS = { "Beginning Apostates": "starting", "Apostate Abilities": "bought" };


/** Bullets under Path to Joy and Path to Despair sit two indents in. */
const BULLET_INDENT = 14;

/**
 * What an ability entitles its holder to.
 *
 * Read here rather than when a character is prepared, and the model says why
 * at length: derivation at runtime failed silently when a sentence was
 * reworded, dropping a character's caps to the base with nothing said. These
 * are the same three patterns scripts/build_compendia.js uses, run once
 * against the English they were written for.
 */
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const word = (match) => NUMBERS[match?.[1]?.toLowerCase()] ?? 0;
const grantsOf = (text) => ({
  ephemera:     word(/\b(one|two|three|four|five|six)\s+ephemera\b/i.exec(text ?? "")),
  incantations: word(/only\s+(one|two|three|four|five|six)\s+of these can be incantations/i.exec(text ?? "")),
  conation:     word(/\b(one|two|three|four|five|six)\b[^.]*conation/i.exec(text ?? ""))
});

/** Split one order's lines into its fields, its degrees and its lists. */
export function parseOrder(lines, column) {
  const order = { description: [], fields: {}, degrees: [], lists: {}, sidebars: [] };
  /* A label is set one indent in. Two indents is a list inside an ability —
   * the properties a Maker may give a signature object are set that way, and
   * read as abilities in their own right they gave the Maker sixty-six of them
   * instead of thirty-seven. */
  const labelled = (line) =>
    line.x > column + PARAGRAPH_SLACK && line.x < column + BULLET_INDENT;
  let degree = null;      // the degree being read
  let list = null;        // the Apostate list being read
  let open = null;        // where continuation text goes

  const push = (into, text) => { into.push(text); open = into; };

  let sidebar = null;     // the box being read, if any

  for (const line of lines) {
    /* A box inside a column, told from an order's own heading by where it sits:
     * both are set large and in capitals, but an order's is flush to the column
     * and a box's is indented — measured at 81 against a column edge of 72 on
     * The Key's page 43.
     *
     * The body of a box is indented too, so the box ends at the first line that
     * returns to the column edge. Nothing else changes: whatever was being read
     * before the box is still open, so the interrupted sentence continues into
     * it and closes properly. */
    const flush = line.x <= column + PARAGRAPH_SLACK;
    if (isHeading(line) && !flush) {
      sidebar = { heading: line.text, lines: [] };
      order.sidebars.push(sidebar);
      continue;
    }
    if (sidebar) {
      if (!flush) { sidebar.lines.push(line.text); continue; }
      sidebar = null;   // and fall through: this line is prose again
    }

    const step = DEGREE_RE.exec(line.text);
    if (step && !labelled(line)) {
      degree = { degree: Number(step[1]), title: step[2].trim(), requirement: [], abilities: [] };
      order.degrees.push(degree);
      list = null;
      // A wrapped title is the next line; the requirement begins after it.
      open = degree.title ? degree.requirement : null;
      continue;
    }
    if (degree && !degree.title) { degree.title = line.text.trim(); open = degree.requirement; continue; }

    /* The Apostate's two lists are headed rather than labelled, and the
     * heading is set like the body — so it is recognised by what it says. */
    if (!labelled(line) && APOSTATE_LISTS[line.text.trim()]) {
      list = { note: [], abilities: [] };
      order.lists[APOSTATE_LISTS[line.text.trim()]] = list;
      degree = null;
      open = list.note;
      continue;
    }

    /* The Apostate's two lists set their labels flush, where a degree sets
     * them one indent in. Requiring the indent everywhere left all twelve
     * Apostate abilities in the note that introduces them. */
    const ability = list ? ABILITY_RE.exec(line.text) : null;
    if (ability) {
      list.abilities.push({ name: ability[1], description: [ability[2]] });
      open = list.abilities[list.abilities.length - 1].description;
      continue;
    }

    if (labelled(line)) {
      const field = FIELD_RE.exec(line.text);
      if (field && !degree && !list) {
        order.fields[field[1]] = [field[2]];
        open = order.fields[field[1]];
        continue;
      }
      const granted = degree ? ABILITY_RE.exec(line.text) : null;
      if (granted) {
        degree.abilities.push({ name: granted[1], description: [granted[2]] });
        open = degree.abilities[degree.abilities.length - 1].description;
        continue;
      }
      if (field || (!degree && !list)) { push(order.description, line.text); continue; }
      if (line.x >= column + BULLET_INDENT && open) { open.push(line.text); continue; }
      /* A degree states what it requires once, before it names anything. So an
       * indented paragraph that is not itself an ability belongs to the ability
       * being read, not back to the requirement.
       *
       * Without this the Vance came out with the long passage on preparing
       * spells — the whole of how Vancian magic works — filed under what the
       * 1st degree requires, and every degree from the 3rd lost the sentence
       * granting a free spell off the end of its ability and into the
       * requirement above it. Nothing was dropped; it was in the wrong field,
       * which is worse, because the text looked complete on the sheet. */
      if (degree?.abilities.length && open) { open.push(line.text); continue; }
      push(degree ? degree.requirement : list.note, line.text);
      continue;
    }

    if (open) { open.push(line.text); continue; }
    push(order.description, line.text);
  }
  return order;
}

const join = (parts) => (parts ?? []).join(" ").replace(/\s+/g, " ").trim();

/**
 * A reader fed one page at a time.
 *
 * An order runs to several pages and is closed by the next order's heading.
 * A block that turns out to have no philosophy is not an order — the chapter
 * carries headings of its own about how orders work in general.
 */
export function reader() {
  const found = [];
  let heading = [];
  let open = null;

  const close = () => {
    if (!open) return;
    const parsed = parseOrder(open.lines, open.column);
    /* An order is a ladder of degrees, or — for the Apostate, who has none —
     * the two lists that stand in for one. The chapter's own opening pages
     * describe what an order is, under the same labels, and are told apart by
     * having neither. */
    if (parsed.degrees.length || parsed.lists.bought) {
      found.push({ kind: "order", name: title(open.heading), ...parsed, page: open.page });
    }
    open = null;
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
            close();
            heading.push(line.text);
            continue;
          }
          if (heading.length) {
            open = { heading: heading.join(" "), lines: [], column: anchor, page: n };
            heading = [];
          }
          if (open) open.lines.push({ ...line, x: line.x - anchor + open.column });
        }
      }
    },
    done() { close(); return found; }
  };
}

/** VANCE → Vance. The order names are single words the book capitalises. */
const title = (text) => text.charAt(0) + text.slice(1).toLowerCase();

const html = (text) => (text ? `<p>${text}</p>` : "");

const named = (list) => (list ?? []).map(ability => {
  const description = join(ability.description);
  return { name: ability.name, description: html(description), grants: grantsOf(description) };
});

/**
 * One order.
 *
 * `abbreviation`, `magicStyle` and `uniqueMechanics` are not written, none of
 * them being something the book states as a field of its own.
 */
export function toItem(entry) {
  const starting = entry.lists.starting;
  const bought = entry.lists.bought;

  /* The sentence governing the starting list is set as its last ability:
   * "Apostate Abilities: We gain two selections from the list of abilities for
   * which we meet the prerequisites." It is a rule about what follows, not an
   * ability, so it is lifted out of the list and into the note. */
  const startingAbilities = (starting?.abilities ?? []).filter(a => a.name !== "Apostate Abilities");
  const startingNote = (starting?.abilities ?? []).find(a => a.name === "Apostate Abilities");

  return {
    name: entry.name,
    type: "Order",
    img: "icons/magic/symbols/ring-circle-smoke-blue.webp",
    system: {
      description: html(join(entry.description)),
      /* Each box as its heading and then its text. Written now, where it used
       * to be left alone: a box is content, and reading it is what stops it
       * being spliced into the ability beside it. */
      sidebars: (entry.sidebars ?? []).map(box =>
        html([box.heading, join(box.lines)].filter(Boolean).join(" — "))),
      otherNames: join(entry.fields["Other Names"]),
      philosophy: html(join(entry.fields["Philosophy and Outlook"])),
      relationships: html(join(entry.fields["Relationships"])),
      pathToJoy: html(join(entry.fields["Path to Joy"])),
      pathToDespair: html(join(entry.fields["Path to Despair"])),
      degrees: entry.degrees.map(d => ({
        degree: d.degree,
        title: d.title,
        /* Crux equal to the degree being entered (The Key, p205). The first is
         * where a character starts, so it costs nothing. */
        cruxCost: d.degree === 1 ? 0 : d.degree,
        requirement: html(join(d.requirement)),
        abilities: named(d.abilities)
      })),
      startingAbilities: named(startingAbilities),
      startingNote: startingNote ? join(startingNote.description) : "",
      apostateAbilities: named(bought?.abilities),
      apostateNote: bought ? join(bought.note) : ""
    }
  };
}

/** Every order in the book. */
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
