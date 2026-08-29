# Style guide

What this codebase already does, written down — so a contributor can match it
without reading all 13,000 lines first, and so the places where it contradicts
itself are visible rather than merely present.

Everything below was derived from the code as it stands. Where two conventions
compete, both are described and one is named as the target, with a note on what
it would cost to converge. Nothing here is enforced by tooling unless it says
so; `npm test` checks facts, not taste.

---

## 1. The rules that are not negotiable

These four have each cost this project real data or real hours. They are not
preferences.

### A field written empty is not a field left alone

Foundry's `update()` merges. A key you omit keeps its stored value; a key you
write as `""` destroys it. Every importer therefore builds its update object
conditionally:

```js
// Right: the key only exists when there is something to say.
const data = { system: {} };
if (entry.color) data.system.color = entry.color;

// Wrong: erases a colour a GM typed in by hand.
const data = { system: { color: entry.color ?? "" } };
```

This has caused three separate data-loss incidents: the Sooth deck import wiped
sixty write-ups, The Gate's re-import erased a set of descriptions, and a forte
re-import came close to blanking hand-built ability trees. `unlocks`, the order
sidebars and a secret's provenance are all *deliberately never written* for
this reason — see the comments where each arises.

### Never compile packs while Foundry is running

LevelDB permits one reader-writer. `compile_packs.js` guards against it; do not
work around the guard.

### No Monte Cook Games text enters git

Not in the working tree, not in the history, not in the release archive.
`scripts/dist.mjs` refuses `source/`, `scripts/`, `packs/_source/`, PDFs,
`assets/` and card images; `npm test` fails if `module/helpers/quirks.mjs`
gains an entry. The generated half lives in gitignored siblings
(`quirks.local.mjs`, `source/data/`, `packs/`).

### Cite the rule

Where code implements a ruling, the comment names the book and the page:

```js
/* "Skills have levels, but only ever rise to 4" (The Key, p2558). */
```

There are 64 such citations, and every one names its book. They are how a
reader tells a deliberate reading of the rules from an accident of
implementation. **Format: `(The Key, p2558)`** — book name, comma, `p`, no
space, no full stop inside the parenthesis.

A bare `page 191` in the importers is *not* a citation: it refers to a physical
page of the PDF being parsed, or quotes one printed in the book's own
cross-references. Leave those alone.

---

## 2. Comments

This is the most distinctive thing about the codebase and the easiest to erode.
Comment density runs **26–41%** by directory, highest in the parsers and the
data models. That is deliberate.

**Comments explain *why*, never *what*.** A comment restating the code is
noise; a comment recording the reasoning is the asset.

```js
/* Keyed by actor id, never by UUID. Foundry expands a dotted flag path into
 * nested objects, and every UUID contains a dot — "Actor.x7f2" stored as a key
 * becomes {Actor: {x7f2: ...}}, so the key never exists as written and every
 * read and write against it silently misses. */
```

**Record the fix that is not obvious, and why the obvious alternative fails.**
Several dozen comments are bug post-mortems. They have earned their place; do
not strip them in a tidy-up. When you fix something subtle, add one.

**Deletions get an obituary when the deletion is the interesting part.** The
foot of `invisible-sun.mjs` explains at length why a `/venture` chat command
was removed rather than fixed. That is the right instinct: a reader who wonders
"why is there no X?" deserves an answer in the code.

**Voice.** Prose sentences, British spelling (*colour*, *behaviour*,
*localisation*), em dashes, no exclamation marks. Write for a colleague, not a
compiler.

### Formats

| Kind | Marker | Use |
|---|---|---|
| File header | `/** ... */` | Every module. What this file is *for*. |
| Section banner | `/* ─────… */` | 30 in use. Separates concerns inside a long class. |
| Reasoning block | `/* ... */` | Multi-line *why*. The workhorse. |
| API contract | `/** ... */` with `@param`/`@returns` | Anything another module calls. |
| Aside | `// ...` | One line, inside a function. |

### File headers

```js
/**
 * Invisible Sun — answering a challenge
 *
 * The player's half. The GM has already fixed what cannot be argued with...
 */
```

The em-dash form covers 62 of the 76 modules — the fourteen without it are
mostly `index.mjs` re-export files and the four thinnest sheet subclasses,
where there is genuinely nothing to say. The *title* is where it diverges:

> **Inconsistency.** Newer files use a lowercase descriptive phrase —
> *"answering a challenge"*, *"walking a forte's ability tree"*. Thirty use a
> Title Case noun phrase — all 21 data models, plus `VentureDialog`,
> `CompendiumBrowser`, `ISUNVislaeSheet`, `config`, `dice`, `dice-so-nice`,
> `templates`, `ExperimentalDie` and `key`. The lowercase phrase is better: it
> says what the file *does*, where the Title Case form usually restates the
> filename. Converging is 30 one-line edits.

---

## 3. Layout and syntax

Not policed by the linter, and deliberately so — `eslint.config.mjs` says
"formatting is not policed; this codebase has a voice, and a linter is a poor
editor of prose." What follows is description, not enforcement.

- **2 spaces**, never tabs (2,032 lines : 0).
- **Double quotes** for strings and imports (139 : 0).
- **Semicolons**, always.
- **Line length** is soft. Comment prose wraps near 80; code runs longer where
  breaking it would hurt — a data model field declaration is one line.
- **Guard clauses over nesting.** 102 early returns of the form
  `if (!thing) return;`. Handle the exits first, then the body at one indent.
- **`const` by default**, `let` where reassigned. `prefer-const` is off because
  it is a preference, but the code follows it anyway.

### Aligned columns in declarations

Data model schemas align their `new fields.…` calls into a column:

```js
level:       new fields.NumberField({ required: true, initial: 1 }),
color:       new fields.StringField({ required: false, initial: "" }),
description: new fields.HTMLField({ required: false, initial: "" }),
```

Every block does this. The column is set by the longest name in the run and
resets at each blank line or comment, so a block is self-contained: adding a
long field means re-spacing its neighbours and nothing else. It reads as a
table, which is what a schema is.

**Align within a block. Do not reflow a whole file to chase it**, and do not
count a single-space line as unaligned — if it holds the longest name, it *is*
the column.

---

## 4. Naming

### Files

| Directory | Convention | Example |
|---|---|---|
| `module/documents/` | `ISUN` + document | `ISUNActor.mjs` |
| `module/sheets/` | `ISUN` + type + `Sheet` | `ISUNVislaeSheet.mjs` |
| `module/data-models/` | Type + `Model` | `SpellModel.mjs` |
| `module/apps/` | What it is, PascalCase, no prefix | `PathOfSuns.mjs` |
| `module/helpers/`, `module/importers/` | lowercase, hyphenated | `book-page.mjs` |
| `templates/` | lowercase, hyphenated, mirrors the app | `path-of-suns.hbs` |

The `ISUN` prefix exists only where a name would otherwise collide with a
Foundry global (`Actor`, `Item`, `ActorSheet`). Apps and helpers have no such
problem and take no prefix. **Do not add `ISUN` to a new app.**

### Class members

- `#private` for anything the class alone uses.
- `_protected` **only** where Foundry's own API or a subclass calls it —
  `_prepareContext`, `_onRender`, `_processFormData`.
- Everything else public.

### Event handlers

- **Apps** name them `#onTurnCard`, `#onPlaceCard` — private, static, referenced
  from `DEFAULT_OPTIONS.actions`.
- **Sheets** name them `_onAddWound`, `_onItemRoll` — protected, because
  `ISUNVislaeSheet` inherits from `SheetMixin` and the mixin's actions map
  reaches them through `this.prototype`.

The split is principled and should stay. 37 `#` methods, 25 `_` methods; the
`_on*` ones are confined to `ISUNVislaeSheet` (59) and `SheetMixin` (6).

### Localisation keys

`ISUN.<Area><Thing>` in PascalCase, grouped by feature prefix: `ISUN.PathTurn`,
`ISUN.SoothTabCard`, `ISUN.ImportStart`. 625 keys. Composed keys (built at
runtime from a fragment) **must** be declared in `DYNAMIC_KEY_PREFIXES` in
`config.mjs`, or the key audit cannot see them.

### CSS

Every rule is scoped to a component root — `.path-of-suns`, `.challenge-card`,
`.sooth-card`. Design tokens are `--isun-*` custom properties on `:root` (41 of
them). **Never write a raw colour where a token exists.**

---

## 5. Architecture

### The layers, and which way they may point

```
invisible-sun.mjs          registration and hooks only
   ↓
module/documents/          Actor and Item subclasses — derived data, business rules
module/data-models/        schemas; the shape of stored data
   ↓
module/sheets/             what a document looks like
module/apps/               everything else with a window or a decision
   ↓
module/helpers/            pure logic, config, dice
module/importers/          PDF → item data
```

**Helpers do not import apps. Data models do not import sheets.** The one
allowed upward reference is `ISUN` from `helpers/config.mjs`, which everything
may read.

### Rules live in helpers, not in windows

The clearest recent example: `helpers/sooth.mjs` holds the whole Path of Suns —
board state, the royalty table, what a card is worth to a character — as pure
functions of `(state, cards)`. `apps/PathOfSuns.mjs` draws it,
`ChallengeResponse` reads it into a roll, the vislae sheet badges spells with
it. None of the three repeats the arithmetic.

**When a rule is needed in two places, it belongs in a helper.** Two of those
three call sites had grown their own copy before this was fixed.

### Config, not constants

Every game-mechanical table lives in `helpers/config.mjs` and is published as
`CONFIG.ISUN`. Caps are derived (`forteAbilityCrux(level)`), not stored, because
"every cap in the game is modifiable."

**Read it as `CONFIG.ISUN`, not through an import.** Every call site does, with
two exceptions that have a reason: `invisible-sun.mjs`, which performs the
`CONFIG.ISUN = ISUN` assignment, and `config.mjs`, which declares it.

The reason is convention rather than capability, and it is worth being honest
about which. `CONFIG.ISUN` *is* `ISUN` — the same frozen object — so mutating a
table on it (`CONFIG.ISUN.spellColorChoices.Chartreuse = "Chartreuse"`, which
works because the freeze is shallow) is visible either way, and the system
already relies on that when it pushes the generated quirks into
`CONFIG.ISUN.quirks`. What the import blocks is a module *replacing* the
namespace or one of its tables wholesale, and what it costs regardless is a
reader having to know that two spellings mean the same thing.

`CONFIG` is populated in the first statement of the `init` hook, before
anything else registers, so any code running after that may read it — including
`defineSchema()`, which Foundry calls lazily on first access. **Code that runs
at module scope may not**, because a module body is evaluated when it is
imported, which is before any hook. `dice-so-nice.mjs` had one such constant and
now builds it inside its hook.

### Apps: three shapes, two justified

| Shape | Files | When |
|---|---|---|
| `ApplicationV2` + `HandlebarsApplicationMixin` | `PathOfSuns`, `CompendiumBrowser`, `ContentImporter` | A window that persists, re-renders, holds state |
| `DialogV2.wait()` behind a static `open()` | `VentureDialog`, `ChallengeResponse`, `HeartSkills`, … | Ask a question, return an answer, close |
| Static-only class, no UI | `ChallengeCard`, `ForteTree`, `ApplyIdentity` | Logic that belongs to a feature, not a window |

The third is really a helper that lives in `apps/` for proximity to its
feature. Defensible, but `ForteTree` (pure layout arithmetic, no UI at all) sits
oddly beside `PathOfSuns`.

### Dialogs decide nothing

A dialog collects a choice and returns it. The caller spends the resources and
writes the document, in one step:

> *"The dialog decides nothing. It hands back what the player chose and
> ChallengeCard does the spending, the rolling and the recording in one step, so
> there is no window in which a pool has been debited but the card does not yet
> say why."*

Re-validate on the way out: what the player chose may no longer be affordable
by the time they click.

### Players ask, the GM writes

`ChatMessage` declares no `update` permission, so a player cannot write to a
GM-authored card. Everything that mutates one goes through a socket relay to a
GM client, which **re-checks the permission rather than trusting the sender**.
The first active GM by sorted id applies it, so two GMs do not both write.

Any future shared-state feature should follow this: one writer, permission
re-checked at the point of application, and a warning when no GM is connected
rather than a silent no-op.

### Importers: one interface

Every reader module in `module/importers/` exports the same three things:

```js
export function reader()      // { page(words, n), done() } — accumulates across pages
export function toItem(entry) // one parsed entry → Foundry item data
export async function readEntries(doc, opts)  // whole document → entries
```

`sources.mjs` is the registry: each source declares `hint`, `signature`,
`kind`, `pack`, `read`, `toItem`, and optionally `uniqueBy`. **A new book is a
new entry in `SOURCES` plus a reader that fits the interface** — no change to
`ContentImporter`. This is the best-factored part of the codebase.

`book-page.mjs` holds the shared positional-PDF logic so each reader argues
about *its chapter*, not about pdf.js.

---

## 6. Sheets and templates

### Every `data-action` must have a handler

`scripts/check.mjs` enforces this. Four separate bugs in this project were a
control that rendered, clicked, and did nothing. Declare the action in
`DEFAULT_OPTIONS.actions` or delete the markup.

### Context preparation

Apps: a single `async _prepareContext()`. `ISUNVislaeSheet` splits into
`#prepareItems`, `#prepareOrder`, `#preparePractices`… because it was one
206-line method. **Split when a `_prepareContext` grows past roughly 60 lines**,
by concern, in dependency order.

### Templates

- Localise everything a player reads: `{{localize "ISUN.Foo"}}`. 368 calls.
- `{{!-- --}}` comments carry the same *why* as the modules. 26 of 32 templates
  have them.
- One `PART` per sheet is the norm. The window's single child is the sheet root
  — `.invisible-sun.sheet .window-content > *` relies on that.
- An empty HTML field hides its own editor rather than showing an empty box.

> **Inconsistency.** A handful of column headings are hardcoded English —
> `<div class="header">Level</div>`, `Lvl`, `Type`, `Depletion`. Every one has a
> localisation key already. Small, mechanical, worth clearing.

---

## 7. Errors

| Situation | What to do |
|---|---|
| The user must know and can act | `ui.notifications.warn(game.i18n.localize(…))` (32 uses) |
| A step of a batch failed, the rest can continue | Catch, log to the visible log, keep going |
| Programmer error / a contract broken | `throw new Error(…)` (15 uses) |
| Something that should not be possible | `console.error` with context (6 uses) |

**Never fail silently.** The importer's log names every file it skipped and
why; the challenge card warns when no GM is connected rather than dropping the
roll. An unhandled promise rejection is how a failed write becomes a silent
no-op, which is why `no-async-promise-executor` is an error.

---

## 8. Testing

Three tiers, all real:

- **`npm test`** — no Foundry needed. Sources parse; the manifest agrees with
  the tree; every `data-action` has a handler; every registered item type is on
  the vislae sheet or explicitly excluded; every referenced i18n key exists.
- **`npm run smoke`** — drives a live world with Playwright. Builds a throwaway
  vislae, walks every tab clicking every control, opens every sheet, rolls,
  turns a card. Fails on **any** console error. 16 checks.
- **Probe scripts** — throwaway Playwright scripts in the scratchpad for one
  investigation. Never committed.

Rules for anything touching a live world:

- Name every artefact `ZZ *` and delete it in a `finally`, including on failure.
- Save and restore any shared state you touch (the board, world settings).
- Probes go in the scratchpad, never the repo root.

**Measure, don't assume.** Nearly every threshold in the importers traces to a
measurement of the actual PDF; nearly every layout fix traces to a
`getBoundingClientRect`. When a fix is a guess, say so in the commit.

---

## 9. Commits

Subject line: **imperative, lowercase after the first word, no full stop, no
prefix tag.** It says what the change *does for the reader*, not what was
edited.

```
Stop two abilities sharing a name from collapsing onto one item
Let a royalty card's number be the whole answer
Import the compendia that only the books could fill
```

Not `fix: dedupe abilities`. Not `Update sooth.mjs`.

Body: prose paragraphs. What was wrong, what it cost, why this fix rather than
the obvious one. Long is fine — several run 20 lines and every line earns it.
End with the `Co-Authored-By:` and `Claude-Session:` trailers when applicable.

Bigger decisions get a design note in `source/`, recording what was tried and
cut as well as what was built. See `challenge-flow.md`.

---

## 10. The open questions

Five of the seven this document first recorded have been cleared: Title Case
file headers, five citations that did not name their book, hardcoded English in
two templates, one misaligned schema block, and the split between `CONFIG.ISUN`
and a direct import. One judgement is left, and one gap.

1. **`apps/` holds three different kinds of thing** — windows, dialogs, and
   pure logic with no UI at all. `ForteTree` is layout arithmetic and
   `ApplyIdentity` is a rules routine; neither has a window. *Either move them
   to a `module/rules/` alongside `helpers/`, or decide that proximity to the
   feature beats purity and record that here.*

2. **No unit tests for the pure helpers.** `helpers/sooth.mjs` is entirely
   functions of `(state, cards)` and was verified with a throwaway Node script
   of 26 assertions that was then deleted. That script should have been
   committed. There is no test runner in the project yet; adding one for the
   pure-logic helpers is the single highest-value testing gap, and `sooth.mjs`
   is the natural first subject.

---

*Derived from the codebase at v0.1.0. When the code and this document disagree,
one of them is wrong — decide which, then fix it.*
