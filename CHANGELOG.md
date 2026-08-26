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

First public release. Built for Foundry VTT v14 (minimum 14.354, verified
against 14.365).

**No Invisible Sun rules text is distributed with this system**, and none will
be. See [Content](#content) below.

### Added

#### Characters

- **Vislae, NPC and Creature actors**, with the Certes and Qualia pools, Hidden
  Knowledge and the shared Injury track. A stat's score is derived from what its
  pools hold rather than stored, so the two can never disagree.
- **Seventeen item types**: Heart, Foundation, Soul, Order, Forte and Forte
  Abilities; Spells, Incantations, Minor Magic and Secrets; Skills, Character
  Arcs, Connections, Ephemera, Objects of Power, Aggregates and Sooth cards.
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
  own sun, and each character's venture bonus where their heart's family is
  showing — and applies none of it, which is what the books ask for.

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

You fill them from your own copy of the books with the tooling under
`scripts/`, documented in the README under *Content and the books*. It reads
the book and deck PDFs, cuts the card faces out of the decks, and builds the
compendia. It is a command line for now: Python, Node and `pdftotext`. Moving
it into Foundry, so that installing the system and pointing it at your PDFs is
all that is needed, is the next piece of work and has not started.

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
