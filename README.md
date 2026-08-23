# Invisible Sun — a system for Foundry VTT

An unofficial system for playing **Invisible Sun** by Monte Cook Games on
[Foundry Virtual Tabletop](https://foundryvtt.com/). Step into the Actuality: a
surreal world where ideas have power, magic is real, and the ordinary is
extraordinary.

It aims to be a system that knows the rules rather than a set of digital note
cards — scourges reach the dice, vexes are spent against actions, a heart's
starting points are placed rather than typed, and the incantation ledger answers
the day-bounded rules from one place. Where the books are explicit, the code
cites them; where the books leave a call to the table, the system leaves it too.

> **Status: pre-release.** The mechanics below work and have been played with,
> but this has not been released yet and stored data may still change shape
> between versions. Where it does, the system migrates existing worlds and says
> so in the [changelog](CHANGELOG.md).
>
> **The content tooling is not finished.** See [Content and the
> books](#content-and-the-books) — this is the main thing standing between here
> and a first release.

---

## Requirements

- **Foundry VTT v14** — minimum `14.354`, verified against `14.365`.
- **Your own copy of the Invisible Sun books.** The compendia arrive empty and
  you fill them from the PDFs you bought; see *Content and the books*.
- Nothing else to run it. [Dice So
  Nice!](https://foundryvtt.com/packages/dice-so-nice) is supported if you have
  it — magic dice are tinted by the sun being drawn on — but it is entirely
  optional.

Filling the compendia currently also needs Python 3, Node, and `pdftotext` and
`pdftoppm` from poppler. That is a fair thing to ask of someone editing the
system and not of someone who wants to play, which is why it is being moved
into Foundry itself.

## Installation

Once released, paste this manifest URL into Foundry's **Install System** dialog:

```
https://github.com/DeviousDVS/invisible-sun/releases/latest/download/system.json
```

To install from source in the meantime:

1. Clone this repository into your Foundry `Data/systems/` directory as a folder
   named `invisible-sun`.
2. Run `npm install`, then `node scripts/compile_packs.js` to build the
   compendium packs. **Foundry must not be running** — LevelDB allows a single
   reader-writer, and the script refuses rather than corrupting a pack.
3. Restart Foundry and pick **Invisible Sun** when creating a world.

---

## What it does

**Three actor types.** Vislae for player characters, plus NPCs and Creatures,
which use level and an effective level shifted by scourge rather than pools.

**Seventeen item types**, covering a vislae completely: Heart, Foundation, Soul,
Order, Forte and Forte Abilities; Spells, Incantations, Minor Magic and Secrets;
Skills, Character Arcs, Connections, Ephemera, Objects of Power, Aggregates and
Sooth cards.

**Health as the books describe it.** Injuries fill one ordered track, and the
last of each set decides whether it becomes a Wound or an Anguish — so two
mental and one physical is a Wound. Armor reduces physical damage before
anything is recorded. A bene may be spent to negate a Wound or Anguish at the
moment it lands, from the pool the rules name and only while the window is open.

**Rests and days.** Four rests a day, the two longer ones able to recover a Wound
or an Anguish, and a night's sleep that refreshes every pool and clears vexes —
but never a scourge, which has to be got rid of some other way.

**The challenge flow.** Only players roll dice in Invisible Sun, so every roll
starts with the GM: declare a pool, a challenge rating and who it is put to; the
player answers with skills, bene and Sortilege, and rolls. One chat card carries
the whole exchange and stays as the record of it. A defence is the same card with
another label, so combat needs no second mechanism.

**Scourge and vex actually apply.** Naming the pool an action draws on is what
makes that possible: a scourge subtracts from every action drawing on its pool,
and a vex is the lesser of the GM's ceiling and what the pool holds.

**Magic in one list.** Spells, incantations, forte abilities and minor magics
share a sortable table, because the rules treat their level, cost, dice and
depletion the same way. Magic dice flux on a 0, with intensity following how many
were cast, and the Experimental Die is supported — it never succeeds, it only
ever fluxes.

**Character building that follows the text.** A dropped Foundation or Heart
applies what it grants; a heart's two starting skills are offered as a choice,
because that is what the book asks for; stat points are placed into pools rather
than typed, with the heart's free six spendable either way and the rest tied to
their own stat.

**Order subsystems.** Each order's six-degree ladder is read from the Order item
rather than hardcoded, so a GM who edits it is followed. The Apostate's
purchasable abilities are handled separately, as they should be.

**An economy** of nine denominations, with magecoins deliberately not converted
into orbs — the books are explicit that no exchange rate exists — and the
bloodsilver curse tracked.

**A compendium browser** for searching across the system's packs.

---

## Content and the books

**This system ships no Invisible Sun rules text**, and it never will. Spell
descriptions, secrets, forte abilities and the rest are Monte Cook Games'
copyright, and redistributing them is not something the [Fan Use
Policy](https://www.montecookgames.com/fan-support/fan-use-policy/) allows.

That is enforced rather than promised. None of it is in this repository — not
in the working tree and not in the history either, which was rewritten to
remove it. The release build refuses to assemble an archive if any appears, and
`npm test` fails if the quirks list that ships stops being empty.

So the compendia arrive empty, and you fill them **from your own copy of the
books**, on your own machine, for your own table. The tooling to do that is
below. Every item type also has a working sheet, so anything you would rather
enter by hand, you can.

Content you generate this way remains the property of Monte Cook Games. Keep it
to your own table and do not redistribute it.

**If you do not own Invisible Sun**, [buy it from Monte Cook
Games](https://www.montecookgames.com/store/product-category/invisible-sun/).
This system is no substitute for the books and is not much use without them.

### Importing from your PDFs

The compendia fill themselves from the PDFs you bought, inside Foundry. Put
them in one folder, open **Import Content** from the compendium sidebar, and
point it at that folder. Every file is identified by what is printed on its
first page rather than by its name, so renamed and re-dated downloads are
recognised; anything it cannot read yet is named in the log rather than
silently skipped. Your files are read where they lie — nothing is uploaded or
copied into Foundry.

It reads, today:

| From | What it brings in |
|---|---|
| Sooth Deck | the 60 cards, each with its face cut out and the sheet masked away |
| The Gate | the write-up behind every Sooth card — meanings, divination, Joy, Despair |
| Spell Deck, Vance Spell Deck, Book M spell cards | 390 spells; the Vancian ones with the class their card size records |
| Objects of Power, Ephemera, Incantations, Weaver Aggregates, and the Book M cards for each | the rest of the decks |
| The Nightside | its five kinds of card, sorted by the livery on the back |
| The Key | the goods lists — 401 items of gear, and the price of the 50 kindled objects the deck already holds |
| The Threshold, Secrets of Silent Streets | the nine objects and ephemera that were never printed on a card |

Order does not matter: decks are imported before the books that annotate them.
Running it twice is safe — entries are matched by name and updated, not
duplicated — and a book only ever writes the fields it actually states, so
anything you have edited by hand survives a re-import.

### Generating the content

Compendium content is built, not hand-written. Four stages feed one another,
with the card art coming off the same PDFs on a branch of its own:

```
source/books/*.pdf        your own copy of the books
source/cards/*.pdf        your own copy of the card decks
        │
        │  scripts/extract_*.py          (Python; 8 read the books, 4 read the decks)
        │  scripts/extract_all_cards.sh  runs every deck in one go
        ▼
source/data/*.json        structured game data
        │
        │  npm run packs:build
        ▼
packs/_source/<pack>/     one JSON file per compendium entry
        │
        │  npm run packs:compile         ⚠ Foundry must be stopped
        ▼
packs/<pack>/             LevelDB databases Foundry reads
        │
        │  npm run packs:verify          ⚠ Foundry must be stopped
        ▼
                          compiled output diffed back against packs/_source

  ─ and, alongside ─

source/cards/*.pdf
        │
        │  scripts/extract_card_images.py
        ▼
Data/invisible-sun/cards/<deck>/   the card faces, outside the system folder
```

**Every one of those paths is gitignored.** All of it is Monte Cook Games'
text and artwork, so none of it is in the repository at any stage — which
means git is not protecting it either. See *Backing up what you generate*.

`npm run packs` runs the last three in order. The card images are separate
because they take about a minute a deck and only change when MCG reissues a
PDF; they go into Foundry's data folder rather than the system folder, so a
system update cannot delete them, and the release build refuses to include
them.

**Which stage do I edit?** Whichever is furthest upstream, or your change is
overwritten by the next build:

| To change | Edit | Then run |
|---|---|---|
| a description, cost, level — anything in a compendium entry | `source/data/*.json` | `npm run packs` |
| how entries are *shaped* (fields, icons, ids) | `scripts/build_compendia.js` | `npm run packs` |
| what gets pulled out of the books | `scripts/extract_*.py` | that script, then `npm run packs` |
| the quirks list | `source/data/quirks.json` | `python3 scripts/build_quirks.py` |
| the card faces | — | `python3 scripts/extract_card_images.py <deck.pdf> <cards.json> <out>` |

Editing `packs/_source` directly works until the next `packs:build` silently
reverts it. `npm run packs:build` is deterministic — ids are hashed from name
and type — so a re-run on an unchanged tree produces an empty diff. If a re-run
moves something you did not touch, your edit did more than you meant.

**Two constraints worth knowing before you hit them:**

- **`packs:compile` and `packs:verify` need Foundry stopped.** LevelDB permits a
  single writer. Both refuse rather than risking a half-written pack, and change
  nothing when they refuse — but the error will look like a failure if you were
  not expecting it.
- **The extractors are Python**; everything else is Node. You need both
  toolchains only if you are regenerating from the books. Editing
  `source/data/*.json` and rebuilding needs Node alone.

### Backing up what you generate

The generated content is not in git and never will be — it is Monte Cook Games'
text and artwork, pulled out of books you own. That means git is not protecting
it, and a bad rebuild or a wrong path loses the lot.

```
npm run data:backup                  write a new archive
npm run data:list                    what has been kept, newest first
npm run data:verify                  check the newest archive is intact
npm run data:verify -- --disk        compare the newest archive to disk
npm run data:restore                 restore the newest archive in place
npm run data:restore -- --to /tmp/x  restore beside the real data instead
```

Archives go to `~/invisible-sun-backups` (`ISUN_BACKUP_DIR` to change that),
carrying `source/data`, `source/forte-trees`, `source/isdata_2026.json`,
`packs/_source`, the extracted card art, and **the compendia themselves**.
Every file is checksummed individually, so a damaged archive names what broke
rather than just failing. Restoring over data that is already there refuses and
lists what it would replace; `--force` overrides, `--to` puts it somewhere
harmless.

**Stop Foundry before backing up.** The compendia are LevelDB, which permits
one writer, so they cannot be read while a world is open. A backup taken with
Foundry running captures everything else and says in as many words that it
skipped them — it does not fail, because the rest is still worth having, but
the archive is then incomplete in the way that matters most.

They are captured as JSON, a file per document, rather than as the database.
Partly so a restore stays possible whatever Foundry does to its storage next,
and partly because LevelDB rewrites its own files as it compacts — checksums
over the database would report every pack as changed every time, which would
make `--disk` useless. Restoring compiles them back; `--to` drops the JSON as a
fixture instead, and touches nothing live.

`packs/_source` is kept alongside them and is not the same thing. It is what
the build produces out of `source/data`; the compendia are what is actually in
the world, which since the in-Foundry importer arrived is the larger set — the
Vance spells and the goods lists never went through `_source` at all, and
neither does anything you edit in a compendium by hand.

The deck and book PDFs are **not** captured. They are large and you own them
already. Nor is anything cheaply regenerated from what is here —
`quirks.local.mjs` comes back from `build_quirks.py`.

**`--disk` is the useful one.** It reports what on disk no longer matches the
archive, file by file. That makes a backup taken today the reference for
checking tomorrow's extractor against: run it, compare, and any drift is named
rather than discovered months later in play.


### Where this is going

The pipeline above is a command line: Python, Node, and a shell that can find
`pdftotext`. That is a reasonable thing to ask of someone editing the system
and an unreasonable thing to ask of someone who just wants to play — so it is
being replaced by the importer above, deck by deck and book by book.

What is left to move is the book content: fortes and their abilities, secrets,
orders, skills, souls, hearts, foundations and character arcs. Those compendia
are still built by the Python extractors, which means a fresh install plus your
PDFs does not yet reproduce them. Until it does, the pipeline above is how they
are made; afterwards it stays as the development and test harness, the same
parsers driven from a terminal instead of a dialog.

---

## Contributing

Contributions are welcome once this is public — issues, bug reports and pull
requests alike. A few things worth knowing before you start.

### Where help is most wanted

- **Play reports.** More useful than almost anything else. If a rule is modelled
  wrongly, say which rule and which book page.
- **Known work**, with rationale and a suggested order, is written up in
  [`source/architecture-review.md`](source/architecture-review.md). Anything in
  there is fair game.
- **Localisation.** All user-facing strings live in `lang/en.json`. Note that
  some keys are composed at runtime (`ISUN.Outcome` + the outcome), so a bare
  search will not find every use.

### Getting set up

```bash
npm install       # dependencies (all dev-only; nothing ships)
npm test          # lint, then check the tree against itself
npm run smoke     # drive a running world and click everything
```

**`npm test`** never launches anything. It lints, then checks that the tree
agrees with itself: every module parses, the manifest declares no file that is
missing, its version matches the release tag it points at, no `data-action` in a
template lacks a handler, every registered item type is either collected by the
vislae sheet or explicitly excluded, no localisation key is used without being
defined, and the quirks list that ships is still empty. It is fast and
safe to run at any time. Run it before you push.

**`npm run smoke`** needs a world running, and a GM password in the
environment. It logs in, builds a throwaway vislae holding one of every item
type, walks all six tabs clicking every control it can reach, rolls something,
and fails on any console error or any control Foundry does not recognise.

```bash
export FOUNDRY_PASSWORD='...'          # never committed; read from the environment
npm run smoke
```

The two catch different things, and both are needed. A handler that references
a name which does not exist is caught by the lint; one that reads a property of
the wrong object is not, and only shows up when something clicks it. Four
separate bugs in this project have been a control that rendered, clicked and did
nothing — every one found weeks later by a human noticing.

### Cutting a release

```bash
npm run packs      # compile and verify the compendia — Foundry must be stopped
npm test           # lint and check the tree
npm run dist       # build dist/invisible-sun.zip and dist/system.json
```

Both files go on the GitHub release: the zip is what Foundry downloads, and
`system.json` has to be uploaded **as its own asset** or the manifest URL in
the install dialog resolves to nothing.

`dist` refuses to run against a dirty working tree, so the archive always
matches a commit. It also asserts that the manifest version matches the tag you
pass, since a release tagged one thing and declaring another installs as the
wrong version.

**What ends up in the archive is an allowlist, derived from the manifest** —
the modules reached by following imports out of the declared entry point, the
stylesheets and language files `system.json` names, the licence it points at,
the compiled packs, and the templates and fonts that are referenced by string
rather than imported. Nothing else is copied.

That is deliberate rather than tidy. A list of things to *leave out* is one
forgotten entry away from publishing `source/data`, which is the extracted text
of somebody else's books. The build then re-checks the staged tree anyway and
refuses outright if anything from `source/`, `scripts/`, `packs/_source/`, any
PDF, or any card image has found its way in.

The shipped manifest also drops `hotReload`: watching files for changes is a
convenience for whoever is writing the system, and costs everyone else.

### Screenshots

There is also a headless screenshot harness for checking sheets without
eyeballing every one by hand:

```bash
export FOUNDRY_PASSWORD='...'          # never committed; read from the environment
npm run shot -- actor "Some Vislae" --tab magic
```

### How the repository is laid out

```
invisible-sun.mjs      entry point: registration, hooks, migrations
module/
  data-models/         DataModel schemas — one per actor and item type
  documents/           ISUNActor, ISUNItem: derivation and document methods
  sheets/              ApplicationV2 sheets, plus the shared SheetMixin
  apps/                dialogs, the challenge card, the content importer
  importers/           one reader per PDF: the decks, and the books
  helpers/             config, dice, Handlebars helpers
templates/             Handlebars: actor/, item/, apps/, chat/, partials/
styles/                invisible-sun.css (theme vars), sheets.css, components.css
lang/                  localisation
scripts/               developer tooling — extraction, pack building, checks
source/                design notes and schemas (the extracted data is gitignored)
```

Two directories exist on a working machine but are in no commit, because what
they hold is Monte Cook Games' text and artwork: `source/data/` and
`packs/_source/`, along with `source/books/`, `source/cards/` and the card
faces under `Data/invisible-sun/`. `npm run data:backup` is what keeps them.

The pre-v14 system this replaced is not in the working tree, but it is in the
history. If you need it — its `template.json` records the data shape the
migrations in `module/data-models/` migrate away from — it was removed in
`7f84f7f`, so any commit before that has it:

```bash
git show 821067e:old_char_sheet/template.json
```

It is [Asacolips Projects' Boilerplate
system](https://github.com/asacolips-projects/boilerplate), MIT licensed, and
its licence travels with it in that directory.

### Conventions

A few habits this codebase keeps, which are worth keeping:

- **Cite the rule.** Where code implements a ruling, the comment says which rule
  and which page — `"you don't spend a scourge... you have to get rid of it
  somehow" (The Key, p2242)`. It is how a future reader tells a deliberate
  reading of the rules from an accident of implementation. Please do the same.
- **Explain the non-obvious fix.** Several comments record a bug that was fixed
  and why the obvious alternative fails. These have earned their place; do not
  strip them in a tidy-up.
- **Derive rather than store.** A stat's score is the sum of its pools, not a
  field that could disagree with them. Prefer computing to duplicating.
- **Bigger decisions get a design note** in `source/`, recording what was tried
  and cut as well as what was built. See
  [`challenge-flow.md`](source/challenge-flow.md) for the shape.
- **Never compile packs while Foundry is running.** LevelDB permits one
  reader-writer; `compile_packs.js` guards against it, but do not fight the
  guard.
- **`module/helpers/quirks.mjs` ships empty and must stay that way.** The list
  is book text, so `scripts/build_quirks.py` writes it to `quirks.local.mjs`
  beside it, gitignored and loaded at init when present. `npm test` fails if
  the shipped stub ever gains an entry — which is exactly what an older copy of
  the generator, or an old backup restored over the top, would do.
- **Nothing generated is committed.** Not `packs/` and not `packs/_source/`,
  which used to be tracked and no longer is. Both are rebuilt from
  `source/data/`, which is not committed either.

---

## Compatibility

| | |
|---|---|
| Foundry VTT minimum | `14.354` |
| Foundry VTT verified | `14.365` |
| Node (development only) | 20+ |

## Author

**DeviousDVS**

Built originally from the [Boilerplate
system](https://github.com/asacolips-projects/boilerplate) by Asacolips Projects
/ Foundry Mods, since fully rewritten for Foundry v14's ApplicationV2 and
DataModel APIs.

## Licence

The system's code — sheets, templates, styles, and the tools under `scripts/` —
is released under the [MIT licence](LICENSE). Use it, fork it, learn from it.

That licence covers the software only. It does not cover the game.

## Legal

*Invisible Sun* and its associated properties are trademarks and copyrights of
Monte Cook Games. This system is an unofficial fan creation for playing the game
on Foundry VTT, produced under the [Monte Cook Games Fan Use
Policy](https://www.montecookgames.com/fan-support/fan-use-policy/). It is not
affiliated with, endorsed by, or published by Monte Cook Games.
