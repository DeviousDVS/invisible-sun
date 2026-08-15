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
- Nothing else. [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice) is
  supported if you have it — magic dice are tinted by the sun being drawn on —
  but it is entirely optional.

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

The intended answer is that the tools under `scripts/` let you generate the
compendium content **from your own copy of the books**, on your own machine,
for your own table. That is being finished now and is the main work outstanding
before a first release. Until it lands, you can enter content by hand — every
item type has a working sheet — but there is no supported bulk route yet.

Content you generate this way remains the property of Monte Cook Games. Keep it
to your own table and do not redistribute it.

**If you do not own Invisible Sun**, [buy it from Monte Cook
Games](https://www.montecookgames.com/store/product-category/invisible-sun/).
This system is no substitute for the books and is not much use without them.

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
npm test          # sources parse, manifest agrees with the tree
```

`npm test` is a smoke check rather than a test suite — it catches a module that
does not parse, a manifest declaring a file that is not there, and a version
that disagrees with the release tag it points at. Run it before you push.

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
  apps/                dialogs and the challenge card
  helpers/             config, dice, Handlebars helpers
templates/             Handlebars: actor/, item/, apps/, chat/, partials/
styles/                invisible-sun.css (theme vars), sheets.css, components.css
lang/                  localisation
scripts/               developer tooling — extraction, pack building, checks
source/                design notes and the data the packs are built from
packs/_source/         compendium JSON; the compiled LevelDB is a build artifact
```

`old_char_sheet/` is the superseded pre-v14 system, kept for reference only.
Nothing in it is live, and it will be removed.

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
- **`module/helpers/quirks.mjs` is generated** from `source/data/quirks.json` by
  `scripts/build_quirks.py`. Edit the JSON, not the module.
- Compiled packs under `packs/` are gitignored build artifacts. The JSON they
  are built from, in `packs/_source/`, is what gets committed.

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
