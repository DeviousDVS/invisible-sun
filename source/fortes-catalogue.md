# Forte Catalogue — all sources

Compiled 2026-08-02 by searching every book with extracted text. Used to scope
the compendium rebuild.

**51 fortes across four books — all now extracted into
`source/data/fortes.json` (489 abilities). Previous file kept as
`fortes.json.bak`.**

| Source | Fortes | Abilities |
|---|---|---|
| The Key | 31 | 295 |
| Book M | 13 | 125 |
| The Nightside | 6 | 59 |
| The Threshold | 1 | 10 |
| **Total** | **51** | **489** |

Extractor: `scripts/extract_fortes.py`. Each forte gained a `source` field
naming its book. Every forte has all six prose fields and 8–10 abilities; every
ability has a name, level and description.

### Extraction notes

Abilities are anchored on their `Level:` line rather than on headings, because
the books interleave sidebars, page numbers and cross-references into the body
text. The name is the nearest plausible line above it. Four traps were worth
recording, since the same parser should serve spells and incantations:

- **The Key title-cases ability names** ("Feed Upon the Power"); Book M and The
  Nightside set them in caps ("BATTLEMAGIC ARMORSUIT"). Long names wrap onto two
  lines in all three.
- **Forte headings wrap too** ("CELEBRATES THE" / "SMALL THINGS"), and The Key
  prints each forte name twice — once for the entry, once for the progression
  diagram — so entries must be self-terminating on a repeated `Background:`
  rather than trusting the span to the next heading.
- **Some ability names contain a colon** ("Silver: Creation"), which means the
  `Color:`/`Depletion:` keys have to be excluded explicitly or they get absorbed
  into the following ability's name.
- **`Noösphere` needs combining marks stripped** before matching, or it never
  resolves against an ASCII name list.

### Known gaps

Three abilities have no colour, because the books do not print one at that
point — verified against the source, not a parser fault:

| Forte | Ability | Book |
|---|---|---|
| Explores the Noösphere | Delve Into the Noösphere | The Key |
| Embraces Nothing | Dark Ally | The Nightside |
| Heralds Plagues | Sorcerous Pestilence | The Nightside |

`Hones Thoughts` sits in a Threshold appendix with relic sidebars set mid-entry;
the Nestari Rod and Indigo Sphere blocks were stripped from its description.

The Key spells one ability two ways — `Skill Du Jour` in the entry heading and
`Skill du Jour` in the diagram. The extract follows the heading.

### Superseded

The previous file had 295 abilities but four fortes with none, and four others
carrying 18–20 — roughly double the 8–10 every other forte has, because the
progression diagram was being counted alongside the entry. The new extract has
no empty fortes and none above 10.

Confirmed absent elsewhere: The Gate, The Way, The Path, Teratology, Secrets of
Silent Streets, the Enchiridion, the Wellspring and both Van Hauten volumes
reference fortes but define none. Van Hauten and The Way contribute rules only
(raising forte ability level to 17; increasing effect level to 10 by spending
Sorcery).

## The Key (31) — captured

Bears An Orb · Breathes Runes · Cages Adversaries · Calls Upon The Serpent ·
Caught Fire's Eye · Channels Strength And Skill · Consumes Flesh · Converses
With Everything · Disgorges Creatures · Dwells In Darkness · Eats Knowledge ·
Explores The Noösphere · Fuses Nightmare To Fist · Hosts A Legion · Inhales The
Aethyr · Is Adored By The Sea · Listens To The Whispers · Provides A Vessel For
Spirits · Revels In Beauty · Shepherds Minds · Sings The Earthsong · Speaks With
The Moon · Splinters Into Fragments · Travels As A Spirit · Turns Tales Into
Reality · Understands The Words · Walks The Path Of Suns · Wanders In Delirium ·
Warps Time And Space · Weaves Stealth With Sorcery · Writhes And Squirms

Verified complete: every one appears as a chapter heading, and no other
verb-phrase heading exists in the forte chapter.

## Book M (13) — missing

| Forte | Page |
|---|---|
| Brandishes Battlemagic | 30 |
| Celebrates the Small Things | 32 |
| Chases Death | 34 |
| Consorts With Demons | 36 |
| Embodies the War | 38 |
| Folds Language | 40 |
| Is Hated by the Earth | 42 |
| Lives in a Fluid Form | 44 |
| Masters the Forms | 46 |
| Murders Spells | 48 |
| Plumbs the Depths of Sleep | 50 |
| Walks With a Secret Companion | 52 |
| Wallows in Corruption | 54 |

## The Nightside (6) — missing

| Forte | Page |
|---|---|
| Embraces Nothing | 32 |
| Foments Dissension | 38 |
| Heralds Plagues | 44 |
| Molds Flesh Like Clay | 50 |
| Renounces the Light | 56 |
| Wallows in Despair | 62 |

## The Threshold (1) — missing

| Forte | Page |
|---|---|
| Hones Thoughts | ~118 |

Presented differently from the others — as an appendix entry headed
`HONES THOUGHTS (FORTE)`, interleaved with unrelated relic sidebars, so
extraction will need more care than the Book M and Nightside chapters.

---

## Data quality in what we already hold

**Three fortes have zero abilities** in `fortes.json`, which is an extraction
failure rather than a design choice — every forte in the books has abilities:

- Channels Strength And Skill
- Converses With Everything
- Provides A Vessel For Spirits

**`level` is a compound string, not a number.** Values run `"3"`,
`"4 (+1 die)"`, `"7 (no cost)"`, `"8 (+2 dice)"`, and conditional forms like
`"3 (+1 die if used as an attack)"`. It encodes the level *and* a mechanical
modifier. `ForteAbilityModel.level` is a NumberField, so it needs splitting into
level / bonus dice / no-cost / condition note.

**The built compendium lost nearly everything.** `build_compendia.js` maps only
`description` when creating ForteAbility items, so across all 295 entries
`parentForte`, `color`, `depletion` are empty and `level` is the schema default
of 1. The forte relationship does not exist in the pack at all.

## A mechanic we do not model

**Every forte has a secret power** (The Threshold, p8243). It is not purchased —
no Crux — and cannot be gained until the vislae holds *every other ability the
forte offers*. Most often called **Journey Into Mystery**, it is level 13,
requires the *Divine Ability* secret, and opens the way into the Labyrinth.

This is a per-forte hidden capstone. It affects the data model (a forte needs a
secret-power entry distinct from its ability list) and the "what can I buy" UI,
which must exclude it.
