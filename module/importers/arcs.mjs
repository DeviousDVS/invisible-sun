/**
 * Invisible Sun — the character arcs, out of The Key.
 *
 * Thirty-seven of them, set out as a heading in capitals, a paragraph or two
 * of what the arc is, and then the beats it runs through: a Cost, an Opening,
 * one or more Steps, a Climax and a Resolution. The chapter is bounded by two
 * headings of its own — CHARACTER ARC MODELS above and GAMEMASTERING CHARACTER
 * ARCS below — but neither is needed, because an arc says what it is by having
 * a Cost and an Opening and the section headings do not.
 *
 * ── The beats ──
 * Each beat is one line of prose that states its own reward inside itself:
 * "Naming the Secret. 1 Acumen reward. You give your goal a name…". The model
 * keeps the whole sentence and the reward separately, so the reward is lifted
 * out rather than parsed away — what a beat says is more than what it pays.
 */
import { columnAnchors, columnLines, isHeading, PARAGRAPH_SLACK, pageWords } from "./book-page.mjs";
import { titleCase } from "./fortes.mjs";
/* The rule for taking a beat apart lives with the model that defines a beat:
 * the importer writes them and the model migrates old ones, and both have to
 * agree about what a beat's name is. A data model may not reach up to an
 * importer, so it is the importer that reaches down. */
import { splitBeat } from "../data-models/item/arc-beat.mjs";

/**
 * The beats an arc runs through.
 *
 * A label may be plural — "Step(s):", "Opening(s):" — and one arc joins two of
 * them, because for Aid a Friend both depend on the friend: "Step(s) and
 * Climax: Depends on the friend's arc." Read as a label that must stand alone,
 * that line is not a label at all and the arc loses both beats.
 */
/**
 * How large an arc's own heading is set.
 *
 * The chapter's headings — CHARACTER ARC MODELS, BEGINNING A NEW ARC — are set
 * at fifteen points and the arcs themselves at twelve. The size is what
 * separates them, because nothing else does: BEGINNING A NEW ARC explains what
 * a cost, an opening, a step, a climax and a resolution are, under exactly the
 * labels an arc uses, so it reads as a thirty-eighth arc otherwise.
 */
const ENTRY_HEADING = 14;

const BEATS = ["Cost", "Opening", "Step", "Climax", "Resolution", "Special"];
const BEAT = `(?:${BEATS.join("|")})(?:\\(s\\))?`;
const LABEL_RE = new RegExp(`^(${BEAT}(?:\\s+and\\s+${BEAT})*):\\s*(.*)$`);

/** "Step(s) and Climax" → ["Step", "Climax"]. */
const beatsNamed = (label) =>
  label.split(/\s+and\s+/).map(part => part.replace(/\(s\)$/, "").trim());

/** Split one arc's lines into its description and its beats. */
export function parseArc(lines) {
  const description = [];
  const beats = [];
  let open = null;

  for (const line of lines) {
    const label = LABEL_RE.exec(line.text);
    if (label) {
      open = { labels: beatsNamed(label[1]), text: label[2] };
      beats.push(open);
      continue;
    }
    if (open) { open.text += ` ${line.text}`; continue; }
    /* Every line, not only the flush ones. The Key opens a paragraph one
     * indent in and runs the rest flush, so testing for flush drops the first
     * line of each: "Someone needs your help. select this arc to help them". */
    description.push(line.text);
  }

  const tidy = (text) => text.replace(/\s+/g, " ").trim();
  const of = (name) => tidy(beats.find(b => b.labels.includes(name))?.text ?? "");
  return {
    description: description.join(" ").replace(/\s+/g, " ").trim(),
    cost: of("Cost"),
    opening: of("Opening"),
    steps: beats.filter(b => b.labels.includes("Step")).map(b => tidy(b.text)),
    climax: of("Climax"),
    resolution: of("Resolution"),
    special: of("Special")
  };
}

/**
 * A reader fed one page at a time.
 *
 * Arcs are contiguous, so one is closed by the next heading. The chapter's own
 * headings close one too, and are then discarded for having no beats.
 */
export function reader() {
  const found = [];
  let heading = {};
  let open = null;

  const close = () => {
    if (!open) return;
    const parsed = parseArc(open.lines);
    if (open.height <= ENTRY_HEADING && (parsed.cost || parsed.opening)) {
      found.push({ kind: "arc", name: open.heading, page: open.page, ...parsed });
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
          /* Every heading closes what came before it, whatever its size, and
           * only the entry-sized ones open an arc. Rejecting the large ones
           * outright instead leaves the block before them running, so that
           * BEGINNING A NEW ARC's explanation of the beats was collected under
           * whatever heading last happened to be small enough — the character
           * creation checklist's "SKILLS". */
          if (isHeading(line) && flush) {
            close();
            heading = { text: line.text, h: line.h, parts: [...(heading.parts ?? []), line.text] };
            continue;
          }
          if (heading.parts) {
            open = { heading: heading.parts.join(" "), height: heading.h,
                     lines: [], column: anchor, page: n };
            heading = {};
          }
          if (open) open.lines.push({ ...line, x: line.x - anchor + open.column });
        }
      }
    },
    done() { close(); return found; }
  };
}

const beat = (text) => ({ ...splitBeat(text), completed: false });

/**
 * One character arc.
 *
 * Its text is stored plain rather than as markup: the model declares these as
 * StringFields and the arc tracker edits them with plain inputs, so wrapping
 * them in paragraphs printed the tags on the sheet.
 *
 * `status` is not written. It is where a character is in the arc, not
 * something the book says, and a compendium entry has not begun one.
 */
export function toItem(entry) {
  return {
    name: titleCase(entry.name),
    type: "CharacterArc",
    img: "icons/sundries/scrolls/scroll-bound-blue-brown.webp",
    system: {
      description: entry.description,
      cost: entry.cost,
      opening: beat(entry.opening),
      steps: entry.steps.map(beat),
      climax: beat(entry.climax),
      resolution: beat(entry.resolution)
    }
  };
}

/** Every character arc in the book. */
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
