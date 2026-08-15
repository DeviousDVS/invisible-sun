# Changelog

Notable changes to the Invisible Sun system for Foundry VTT.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0,
minor versions may contain breaking changes to stored data; where they do, the
system migrates existing worlds and says so here.

## [Unreleased]

## [0.1.0] — unreleased

First public release. Built for Foundry VTT v14 (minimum 14.354).

### Added

- **Vislae, NPC and Creature actors**, with the Certes and Qualia pools, Hidden
  Knowledge, and the shared Injury track. A stat's score is derived from what its
  pools hold rather than stored, so the two can never disagree.
- **Health that follows the books.** Injuries fill an ordered track and the last
  one of each set decides whether it becomes a Wound or an Anguish. Armor reduces
  physical damage before anything is recorded; a bene may be spent to negate a
  Wound or Anguish at the moment it lands, from the pool the rules name.
- **Rests and a day counter.** Four rests a day, the longer two able to recover a
  Wound or an Anguish, and a night's sleep that refreshes every pool and clears
  vexes but never a scourge.
- **The challenge flow.** The GM declares a pool, a challenge rating and who it
  is put to; the player answers with skills, bene and Sortilege, and rolls. One
  chat card carries the whole exchange and stays as the record. A defence is the
  same card with another label, so combat needs no second mechanism.
- **Scourge and vex reach the dice.** Both were modelled but unreachable before
  the pool an action draws on was declared: a scourge subtracts from every action
  drawing on its pool, and a vex is the lesser of the GM's ceiling and what the
  pool holds.
- **Magic.** Spells, incantations, forte abilities and minor magics in one
  sortable list, since the rules treat their level, cost, dice and depletion the
  same way. Magic dice flux on a 0, with the intensity following how many were
  cast, and the Experimental Die which only ever fluxes.
- **Character building.** Heart, Foundation, Soul, Order and Forte as items; a
  dropped Foundation or Heart applies what it grants; a heart's starting skills
  are offered as the choice the book describes rather than assigned.
- **Order subsystems**, including each order's six-degree ladder read from the
  Order item, and the Apostate's purchasable abilities.
- **Incantations** with a ledger, so the day-bounded rules — the daily cap, never
  the same one two days running, and what may be sought as a conation — all read
  from one place.
- **Character arcs**, connections, objects of power, ephemera, aggregates, the
  Sooth deck, and an economy of nine denominations with the bloodsilver curse.
- **A compendium browser** for searching across the system's packs.
- **Tools under `scripts/`** for building compendium content from your own copy
  of the books.

### Notes

No Invisible Sun rules text is distributed with this system. See the
[README](README.md#legal) and [LICENSE](LICENSE).

[Unreleased]: https://github.com/DeviousDVS/invisible-sun/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DeviousDVS/invisible-sun/releases/tag/v0.1.0
