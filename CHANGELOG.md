# Changelog

Notable changes to the Invisible Sun system for Foundry VTT.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0,
minor versions may contain breaking changes to stored data; where they do, the
system migrates existing worlds and says so here.

Releases are named for the Path of Suns — Silver, Green, Blue, Indigo, Grey,
Pale, Red, Gold — with the Invisible Sun, which stands outside the Path,
reserved for 1.0.0.

## [Unreleased]

## [0.1.0] — Silver — unreleased

First public release. Built for Foundry VTT v14 (minimum 14.366, verified
against 14.368).

**No Invisible Sun rules text is distributed with this system**, and none will
be. See [Content](#content) below.

### Added

#### Characters

- **Vislae, NPC and Creature actors**, with the Certes and Qualia pools, Hidden
  Knowledge and the shared Injury track. A stat's score is derived from what its
  pools hold rather than stored, so the two can never disagree.
- **Eighteen item types**: Heart, Foundation, Soul, Order, Forte and Forte
  Abilities; Spells, Incantations, Minor Magic and Secrets; Skills, Character
  Arcs, Connections, Ephemera, Objects of Power, Aggregates, Gear and Sooth
  cards.
- **Character building.** A dropped Foundation or Heart applies what it grants;
  a heart's two starting skills are offered as the choice the book describes
  rather than assigned; stat points are placed into pools rather than typed,
  with the heart's free six spendable either way and the rest tied to their own
  stat.

#### Play

- **The challenge flow.** The GM declares a pool, a challenge rating and who it
  is put to; the player answers with skills, bene and Sortilege, and rolls. One
  chat card carries the whole exchange and stays as the record. A defence is the
  same card with another label, so combat needs no second mechanism.
- **Action Mode.** A round is a checklist rather than a running order: nothing
  rolls for initiative, and the tracker shows who is still due an action and who
  has taken theirs, the players above what they are facing. Narrative control is
  a floor — taken while it is free, given up with Done, and taken back by the GM
  — and the round turns over when everyone who can act has. Defeated combatants
  stay listed but get no action, and a combatant the players cannot see is in
  nobody's tally, so the GM and the table read the same number. What a character
  has done is stamped with the round it happened in, so stepping a round back
  finds everyone exactly as they were.

- **A target sets the challenge.** "Challenge is often very easy to determine
  because you can just use the level of the NPC, object, or whatever else is
  involved" (The Gate, p18), so a skill rolled with something targeted arrives
  with the challenge already filled in, saying whose level it is. The hardest of
  several targets, and what a scourge has left of a level rather than the number
  printed on the sheet. Defences modify the challenge and are printed as prose
  rather than as a number, so the defence line is shown beside the field instead
  of being guessed at, and the field stays editable.

- **Skills and practices on the hotbar.** Drag either row onto the bar and it
  becomes a macro that uses it — the venture dialog with the skill already
  ticked, or the whole cast, paid for and offered back to a Vance to keep.
  Anything else dropped there still does what Foundry does with it, so a piece
  of gear on the bar opens its sheet. Macros name the item by uuid and resolve
  it when pressed, so a skill whose level has gone up rolls at the level it is
  now, and two abilities sharing a name across two fortes stay distinct.

- **The four distances, drawn.** "In Invisible Sun, distances are divided into
  four categories" (The Gate, p22) and nobody measures them — which works at a
  table with no map and goes wrong quietly on a canvas, where everyone privately
  decides a different thing is "near". While Action Mode runs, the controlled
  token carries Close, Near, Far and Very Far as nested rings, scaled off the
  scene's own grid and labelled with the distance and the scene's units. Metres
  are the book's roundings rather than conversions. A toggle in the Invisible Sun
  scene controls turns them off, per client.
- **Take Action.** A round from a player's side is two moves — take the floor,
  then say you are done — and both live on a sidebar tab nobody is looking at
  mid-fight. One hotbar macro is both: press to take the floor, press again for
  done, and it says out loud when it can do neither. The scene-control button
  puts it on the bar and then hides itself, returning if the macro is moved off
  or deleted.

- **A scene knows what a square is worth.** The manifest declares 10 feet to the
  square, so one square is exactly Close — the shortest of the book's four bands
  and the one a token most often needs to be inside. New scenes inherit it;
  existing ones keep whatever they were set to.

- **Scourge and vex reach the dice.** Both were modelled but unreachable until
  the pool an action draws on was declared: a scourge subtracts from every
  action drawing on its pool, and a vex is the lesser of the GM's ceiling and
  what the pool holds.
- **Health that follows the books.** Injuries fill one ordered track and the
  last of each set decides whether it becomes a Wound or an Anguish. Armor
  reduces physical damage before anything is recorded; a bene may negate a Wound
  or Anguish at the moment it lands, from the pool the rules name and only while
  the window is open.
- **Rests and a day counter.** Four rests a day, the longer two able to recover
  a Wound or an Anguish, and a night's sleep that refreshes every pool and
  clears vexes but never a scourge.
- **Magic.** Spells, incantations, forte abilities and minor magics in one
  sortable list, since the rules treat their level, cost, dice and depletion the
  same way. Magic dice flux on a 0, with intensity following how many were cast,
  and the Experimental Die, which never succeeds and only ever fluxes.

- **The Path of Suns.** The Sooth Deck's board as a window the whole table can
  see: turn a card and it lands on the next sun, with Adept and Companion
  turning the next one themselves, and the Testament of Suns keeping the card
  played on the Invisible Sun in effect across the session. It reads out what is
  in play — the enhanced and diminished suns, doubled where a card sits on its
  own sun, and the venture a card is worth to a heart of its family. Each turn
  is announced in chat with the card, its write-up and the running total, so the
  table follows it without the board open.
- **The board reaches the dice.** The venture a card is worth to a character —
  their heart's family, and whatever a royalty card does to everyone — is shown
  in the answer dialog before they decide what to spend, added to the roll, and
  recorded on the challenge card beside the card it came from. Read when they
  answer rather than when the dice land, so a card turned mid-decision cannot
  change the arithmetic they agreed to, and switched off wholesale by a setting
  for a table that would rather apply it themselves. What a card does to magic
  is shown against each spell of that colour and applied by nobody: choosing
  between the level and the Sorcery cost is the caster's.

#### Progress

- **Advancement.** Joy, Despair, Acumen and Hidden Knowledge, each labelled with
  where it comes from. Crux is not stored: it is what a Joy and a Despair are
  worth together, so the sheet shows how many pairs are in hand and spending one
  takes one of each. Awarding is GM-only; the values are visible to everyone.
- **Order subsystems**, including each order's six-degree ladder read from the
  Order item rather than hardcoded, so a GM who edits it is followed, and the
  Apostate's purchasable abilities handled separately.
- **Incantations** with a ledger, so the day-bounded rules — the daily cap,
  never the same one two days running, and what may be sought as a conation —
  all read from one place.
- **Character arcs**, connections, objects of power, ephemera, aggregates, the
  Sooth deck, and an economy of nine denominations with the bloodsilver curse.

#### Elsewhere

- **An importer**, in Foundry: point it at the folder holding your PDFs and it
  identifies each book and deck, reads it, and fills the compendia — see
  *Content* below.
- **A Sooth card is a card**, not a form: the round face, its family, value and
  the two suns it shifts on the left, and The Gate's write-up beside it in tabs
  — divinatory meaning, game narrative, and the Joy and Despair a shift might
  follow. Every control is the real field, so it is edited where it is read.
- **A compendium browser** for searching across the system's packs.
- **Dice So Nice! support**, optional: magic dice are tinted by the sun being
  drawn on.

### Content

The compendia ship empty. Invisible Sun is Monte Cook Games' work, and
redistributing their text is not something the [Fan Use
Policy](https://www.montecookgames.com/fan-support/fan-use-policy/) allows, so
none of it is in the repository — not in the working tree and not in the
history, which was rewritten to remove it — and the release build refuses to
assemble an archive if any appears.

You fill them from your own copy of the books, in Foundry. The importer sits at
the foot of the compendium tab: point it at the folder your PDFs are in and it
works out what each file is, reads it, and fills the packs, cutting the card
faces out of the decks as it goes. The files are read where they lie — nothing
is uploaded, and nothing but the card art is written anywhere. Running it twice
is safe, and the order the files come in does not matter.

**Every compendium this system ships fills itself this way**: the decks, the
cards printed only in Book M, and the book chapters behind everything that was
never printed on a card — the goods lists, the hearts, souls and foundations,
the fortes and their abilities, the character arcs, skills, orders and secrets.
The README lists what comes from where under *Content and the books*. The two
books it does not recognise yet are The Way and The Path.

Three things it leaves alone, each noted in the code where it arises: a forte's
ability tree, which the books draw as vector art with no text to recover it
from; the eleven boxed sidebars beside the order entries; and the provenance of
a secret, which the compilation they are read from does not record. They are not
written rather than written empty, so a tree built by hand survives a re-import.

The command-line pipeline under `scripts/` remains as the development and test
harness — the same parsers driven from a terminal instead of a dialog, and the
thing to check a new reader against. It is no longer how anything is built.

Every item type also has a working sheet, so anything you would rather enter by
hand, you can.

### Known limitations

- **Acumen is not spent by anything.** The skills list quotes a price in Acumen
  per level; nothing deducts it.
- **Casting does not route through the challenge flow**, so depletion after a
  cast has nowhere to hand back to.
- **Challenge cards have no cancel or stale handling.** An abandoned card stays
  in chat until closed.
- **Apostate entitlements are not tracked.** Their starting Ephemera Use and
  purchasable Incantation carry real grants, but nothing yet records which
  apostate abilities a character has taken.
- **Enhancements outside Sortilege cannot be recorded.** A pool carries a single
  value, which is bene everywhere except Sortilege.

[Unreleased]: https://github.com/DeviousDVS/invisible-sun/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DeviousDVS/invisible-sun/releases/tag/v0.1.0
