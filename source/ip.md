# Invisible Sun — Foundry VTT System Implementation Plan

A full-featured Foundry VTT v14 system faithfully implementing the Invisible Sun RPG by Monte Cook Games. The system will capture the richly mystical, narrative-focused feel of the game, from the Venture/Challenge d10 dice mechanic and the Sooth Deck card system through to the deep character identity built from Heart, Order, Forte, Soul, and Foundation.

## Source Materials Analyzed

| Source | Content |
|---|---|
| [template.json](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/source/template.json) | Draft data template — Actor types (vislae, npc, creature), Item types (heart, foundation, soul, order, forte, forteAbility, spell, secret, skill, characterArc, soothCard, ephemera, objectOfPower) |
| [source/data/](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/source/data) | Pre-built JSON data for hearts (4), orders (5), souls (13), foundations (8), fortes (~30+), forte abilities (~250+), spells (~280+), incantations (~200+), character arcs (~40+) |
| [source/schemas/](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/source/schemas) | JSON schemas for Heart, Foundation, Soul, Order, Forte, Character Arc |
| [source/books/](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/source/books) | Full text of The Key, The Gate, The Way, The Path, Book M, Enchiridion, Teratology, Secrets of Silent Streets, The Nightside, The Threshold, The Wellspring, Van Hauten Collection vols 1 & 2 |

## Architecture

> [!IMPORTANT]
> **Foundry VTT v14.364** (confirmed on server). Uses modern `foundry.abstract.DataModel` schemas (no `template.json`), `ActorSheetV2` with `HandlebarsApplicationMixin`, and ES Module (`.mjs`) entry points. This mirrors the [dangerous-journeys](file:///home/ubuntu/foundrydata/Data/systems/dangerous-journeys/dangerous-journeys.mjs) system already installed, which we'll use as our architectural reference.

### File Structure

```
invisible-sun/
├── system.json                          # System manifest
├── invisible-sun.mjs                    # Entry point (Hooks, registrations)
├── module/
│   ├── helpers/
│   │   ├── config.mjs                   # ISUN config constants (colors, ranges, etc.)
│   │   ├── templates.mjs                # Handlebars helpers & partial preloading
│   │   └── dice.mjs                     # Venture/Challenge dice engine
│   ├── data-models/
│   │   ├── actor/
│   │   │   ├── VislaeModel.mjs          # Full PC data model
│   │   │   ├── NPCModel.mjs             # Simple NPC
│   │   │   └── CreatureModel.mjs        # Creature/monster
│   │   └── item/
│   │       ├── HeartModel.mjs
│   │       ├── FoundationModel.mjs
│   │       ├── SoulModel.mjs
│   │       ├── OrderModel.mjs
│   │       ├── ForteModel.mjs
│   │       ├── ForteAbilityModel.mjs
│   │       ├── SpellModel.mjs
│   │       ├── IncantationModel.mjs
│   │       ├── SecretModel.mjs
│   │       ├── SkillModel.mjs
│   │       ├── CharacterArcModel.mjs
│   │       ├── SoothCardModel.mjs
│   │       ├── EphemeraModel.mjs
│   │       └── ObjectOfPowerModel.mjs
│   ├── documents/
│   │   ├── ISUNActor.mjs                # Custom Actor document class
│   │   └── ISUNItem.mjs                 # Custom Item document class
│   ├── sheets/
│   │   ├── ISUNVislaeSheet.mjs          # Main vislae character sheet
│   │   ├── ISUNNPCSheet.mjs             # NPC sheet
│   │   ├── ISUNCreatureSheet.mjs        # Creature sheet
│   │   └── items/                       # Item-type-specific sheets
│   │       ├── ISUNSpellSheet.mjs
│   │       ├── ISUNForteSheet.mjs
│   │       ├── ISUNCharacterArcSheet.mjs
│   │       └── ISUNItemSheet.mjs        # Generic item sheet fallback
│   ├── apps/
│   │   ├── SoothDeck.mjs                # Sooth Deck card draw UI
│   │   ├── VentureDialog.mjs            # Venture/Challenge roll dialog
│   │   ├── DataImporter.mjs             # Import from source JSON data
│   │   └── PathOfSuns.mjs               # Path of Suns tracker
│   └── chat/
│       └── dice-result.mjs              # Custom chat message templates
├── templates/
│   ├── actor/
│   │   ├── vislae-sheet.hbs             # Multi-tab vislae sheet
│   │   ├── npc-sheet.hbs
│   │   └── creature-sheet.hbs
│   ├── item/
│   │   ├── spell-sheet.hbs
│   │   ├── forte-sheet.hbs
│   │   ├── character-arc-sheet.hbs
│   │   └── item-sheet.hbs              # Shared/generic
│   ├── apps/
│   │   ├── sooth-deck.hbs
│   │   ├── venture-dialog.hbs
│   │   └── path-of-suns.hbs
│   ├── chat/
│   │   └── dice-result.hbs
│   └── partials/
│       ├── stat-pool.hbs
│       ├── skill-list.hbs
│       ├── spell-list.hbs
│       ├── forte-abilities.hbs
│       ├── character-arc-tracker.hbs
│       └── inventory-list.hbs
├── styles/
│   ├── invisible-sun.css                # Main theme stylesheet
│   ├── sheets.css                       # Actor/item sheet styles
│   └── components.css                   # Reusable UI components
├── packs/                               # Compendium packs (LevelDB)
│   ├── hearts/
│   ├── foundations/
│   ├── souls/
│   ├── orders/
│   ├── fortes/
│   ├── spells/
│   ├── incantations/
│   ├── character-arcs/
│   └── sooth-cards/
├── assets/
│   ├── icons/                           # Sun color icons, order symbols
│   ├── ui/                              # Sheet background textures, logos
│   └── cards/                           # Sooth Deck card images (placeholder)
└── lang/
    └── en.json                          # English localization
```

---

## Core Game Mechanics to Implement

### 1. Venture/Challenge Dice Engine

The core resolution mechanic. Key rules from The Gate:

- **Challenge**: GM-assigned difficulty (0 = routine, 1-10 normal, 11-13 trained, 14-17 magical)
- **Venture**: Player total of skill levels + bene spent + circumstantial modifiers
- **Roll Target**: `Challenge - Venture` = number needed on a d10 (0-9). If 0 or less, auto-success. If 10+, impossible.
- **Dice**: 1 mundane d10 + optional magic d10s (from Sortilege, spells with `+N dice`)
- **Magical Flux**: Rolling a 0 on a magic die triggers flux (side effects). Multiple 0s = worse flux.
- **Success**: Roll >= target on any die
- **Multi-success**: Some challenges (magic-sealed things) require multiple successes (e.g., roll two 4s)
- **Bene for Effect**: After success, spend additional bene for enhanced results

### 2. Statistics & Pools (Bene System)

- **Certes** (physical): divided into pools - Accuracy, Movement, Physicality, Perception
- **Qualia** (mental/magical): divided into pools - Sorcery, Interaction, Intellect, Sortilege
- **Hidden Knowledge**: Special stat for lore/rumor checks
- Pools contain **bene tokens** (spend for +1 venture each, 1 per action normally)
- **Sortilege** pool contains **enhancements** (add +1 die instead of +1 venture)
- Pools refresh during rests
- **Accuracy bene**: Can be spent for +3 damage instead of +1 to attack
- **Physicality bene**: Can absorb 1 Injury
- **Intellect bene**: Can absorb 1 psychic Injury
- **Sorcery bene**: Spent to power spells (1 bene = 1 spell level cost)

### 3. Damage & Health

- Damage creates **Injuries** (3 Injuries = 1 Wound or 1 Anguish)
- Physical damage creates **Wounds** (3 = death)
- Mental/spiritual damage creates **Anguish** (3 = death)
- **Armor** absorbs physical Injuries
- **Ward** absorbs magical/mental Injuries
- **Scourge**: Environmental/persistent damage modifier

### 4. Magic System (five distinct sub-systems)

| Order | Magic Style | Resource | Key Mechanic |
|---|---|---|---|
| **Vance** | Prepared spells (Vancean) | Mind Slots | Prepare spells into slots during rest; cast consumes the slot |
| **Weaver** | Thread weaving | Colored Threads | Combine thread aggregates (Red, Blue, Gold, etc.) dynamically |
| **Goetic** | Summoning and pacts | Summoning Log | Summon entities, bargain, log pacts; backlash risk |
| **Maker** | Magical crafting | Maker Matrix | Craft kindled items, Objects of Power, installations |
| **Apostate** | General magic and secrets | Bonus Secrets | No order structure; flexible spell access + extra secrets |

All orders share **General Spells** (cast by spending Sorcery = spell level).

### 5. Sooth Deck & Path of Suns

- **60-card deck** with four families (Secrets, Mysteries, Visions, Notions) keyed to Hearts
- Cards played sequentially on the **Path of Suns** (Silver, Green, Blue, Red, Indigo, Gold, Grey, Pale, Invisible)
- Active card modifies magic: **bold sun** = spell level +1 or cost -1; **faint sun** = level -1 or cost +1
- Doubled effect when card's sun matches its position on the Path
- Heart-family match gives character +1 venture
- Special royalty cards (Sovereign, Nemesis, Defender, Apprentice, Companion, Adept)

### 6. Character Identity (The Testament of Suns)

Character sentence: *"I am a [Foundation] [Heart] of the [Order] who [Forte]"*

- **Heart**: Galant/Stoic/Empath/Ardent - determines starting Certes/Qualia, pool points, starting skills, Sooth family
- **Order**: Vance/Weaver/Goetic/Maker/Apostate - determines magic style, degrees (ranks)
- **Forte**: ~30+ options - unique abilities with levels and colors
- **Soul**: Secret spiritual patron (13 options) - guardian gifts at Crux cost
- **Foundation**: Social standing (8 options) - income, savings, house, connections

### 7. Advancement

- **Acumen**: Earned from character arcs and GM discretion; spend on spells, secrets, skills
- **Joy / Despair**: Earned from arc climaxes and GM shifts; 1 Joy + 1 Despair = 1 Crux
- **Crux**: Spend on forte ability advancement and order degree advancement

### 8. Character Arcs

Narrative progression arcs with structured phases:
- **Cost** (Acumen to begin)
- **Opening** (initial story beat with Acumen reward)
- **Steps** (1+ intermediate story beats with Acumen rewards)
- **Climax** (critical moment with Acumen + Joy or Despair)
- **Resolution** (aftermath with Acumen reward)

### 9. Economy

- Weekly **Income** (from foundation)
- **Savings** (starting capital)
- **Debts** (narrative tracking)
- **House**: Type, Level, Augments

---

## Open Questions

> [!IMPORTANT]
> **Sooth Deck Images**: The game uses a 60-card custom Sooth Deck. Should I generate placeholder card art using the image generation tool, or leave cards as text-only with the option to add images later?

> [!IMPORTANT]
> **Visual Theme**: Invisible Sun has an extremely distinctive art style with deep blacks, vibrant suns (each sun has a color), and mystical/occult aesthetics. Should I aim for a dark, mystical, sun-glyph-accented theme (blacks, deep purples, gold accents) or do you have specific visual preferences?

> [!IMPORTANT]
> **Compendium Pre-population**: We have ~280+ spells, ~200+ incantations, ~30+ fortes with ~250+ abilities, ~40+ character arcs, and all character creation options in JSON. Should I build a data import tool AND pre-populate compendiums during Phase 2, or focus on the import tool and let you populate manually?

> [!IMPORTANT]
> **Order-Specific Magic Subsystems**: Full implementation of Vance Mind Slots, Weaver Thread tracking, Goetic Summoning Logs, and Maker Matrix crafting are each significant features. Should I implement all four in Phase 3, or prioritize 1-2 orders for the initial release and add others iteratively?

---

## Proposed Changes

### Phase 1 - Foundation (System Bootstrap)

Core system scaffolding. Gets a loadable system into Foundry with data models, basic sheets, and the dice engine.

---

#### [NEW] [system.json](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/system.json)
System manifest for Foundry VTT v14. Declares all actor types (Vislae, NPC, Creature), item types (Heart, Foundation, Soul, Order, Forte, ForteAbility, Spell, Incantation, Secret, Skill, CharacterArc, SoothCard, Ephemera, ObjectOfPower), compendium packs, stylesheets, ES modules, and language files. Sets `compatibility.minimum: "14.354"`, `verified: "14.364"`.

#### [NEW] [invisible-sun.mjs](file:///home/ubuntu/foundrydata/Data/systems/invisible-sun/invisible-sun.mjs)
System entry point. In the `init` hook: registers all DataModels on `CONFIG.Actor.dataModels` and `CONFIG.Item.dataModels`, sets custom document classes, registers actor/item sheets via `DocumentSheetConfig`, loads Handlebars helpers and partials.

#### [NEW] module/helpers/config.mjs
Game constants: sun colors (Silver, Green, Blue, Red, Indigo, Gold, Grey, Pale, Invisible), spell color mappings, range categories (close, short, long, very long), challenge scale descriptions, order names, heart names, depletion patterns.

#### [NEW] module/helpers/templates.mjs
Handlebars helper registration (ifEquals, times, formatPool, colorClass, sunIcon, etc.) and template partial preloading.

#### [NEW] module/helpers/dice.mjs
The Venture/Challenge dice engine:
- `rollVenture({challenge, venture, magicDice, sortilege})` - rolls mundane d10 + magic d10s, detects flux (0 on magic die), evaluates success, returns structured result
- `calculateVenture({skills, bene, modifiers})` - totals venture
- `checkDepletion(depletionString)` - parses depletion notation like "0-2 (check each round)" and rolls for it
- Chat message rendering for results

---

#### [NEW] module/data-models/actor/VislaeModel.mjs
Full PC data model using `foundry.abstract.DataModel`. Schema includes:
- `stats.certes` (value, max, pools: accuracy/movement/physicality/perception each with value/max)
- `stats.qualia` (value, max, pools: sorcery/interaction/intellect/sortilege each with value/max)
- `stats.hiddenKnowledge` (value, max)
- `status.wounds` (value, max=3), `status.anguish` (value, max=3)
- `status.injuries` (physical, mental - tracks sub-wound damage)
- `status.armor`, `status.ward`, `status.scourge`
- `advancement.joy`, `advancement.despair`, `advancement.acumen`, `advancement.crux`
- `meta.characterSentence` (foundation, heart, order, forte strings)
- `meta.secretName`, `meta.soulName`, `meta.orderDegree`
- `economy.income`, `economy.savings`, `economy.debts`
- `house.type`, `house.level`, `house.augments`
- `biography` (HTMLField)

#### [NEW] module/data-models/actor/NPCModel.mjs
Simple NPC: `level`, `armor`, `ward`, `description` (HTML), `notes` (HTML), `modifications`

#### [NEW] module/data-models/actor/CreatureModel.mjs
Creature: `level`, `wounds`, `anguish`, `armor`, `ward`, `combat` (HTML), `description` (HTML)

---

#### [NEW] module/data-models/item/ (14 item data models)
One data model per item type, matching the schemas and template.json structure. Each uses `foundry.data.fields`:
- **HeartModel**: name, alternativeName, description, summary, adjectives[], startingCertes, startingQualia, startingPoolPoints, cardFamily, associatedAnimal, associatedObject, skillsOptions[]
- **FoundationModel**: description, weeklyIncome, initialSavings, startingHiddenKnowledge, houseType, houseLevel, connectionsCount, connectionsText, specialRules, initialMotivations, suggestedArcs[]
- **SoulModel**: description, symbolImage, guardianGift, cost, revelationPenalty
- **OrderModel**: abbreviation, magicStyle, description, uniqueMechanics (object), philosophy, degrees[]
- **ForteModel**: description, background, appearance, suggestedArcs, pathToJoy, pathToDespair
- **ForteAbilityModel**: level, description, color, depletion, parentForte
- **SpellModel**: level, color, cost, range, duration, depletion, description (HTML), spellType (general/vance/weaver/goetic/maker), dice, facets
- **IncantationModel**: level, color, description (HTML), depletion, dice, facets
- **SecretModel**: cost, description (HTML), secretType (character/house/order/apostate)
- **SkillModel**: level, description, category
- **CharacterArcModel**: description, cost, status (planned/active/completed), opening, steps, climax, resolution with rewards
- **SoothCardModel**: family, value, meaningStandard, meaningInverted, effectText
- **EphemeraModel**: level, color, description (HTML), ephemeraType
- **ObjectOfPowerModel**: level, description (HTML), depletion, objectType

---

#### [NEW] module/documents/ISUNActor.mjs
Custom Actor document class. `prepareDerivedData()`:
- Calculate Crux from Joy + Despair
- Compute injury-to-wound/anguish conversions
- Sum modifiers from equipped items

#### [NEW] module/documents/ISUNItem.mjs
Custom Item document class. Handles cross-item relationships (ForteAbility to parent Forte).

---

#### [NEW] module/sheets/ISUNVislaeSheet.mjs
Multi-tab vislae character sheet using `ActorSheetV2` + `HandlebarsApplicationMixin`:
- **Overview tab**: Character sentence, portrait, stat summary, wounds/anguish tracker
- **Stats tab**: Certes/Qualia pools with bene token trackers, Hidden Knowledge
- **Magic tab**: Spells list, incantations, forte abilities, order-specific features
- **Identity tab**: Heart, Order, Forte, Soul, Foundation details
- **Arcs tab**: Character arc tracker with step progression
- **Inventory tab**: Ephemera, Objects of Power, equipment
- **Biography tab**: Notes, connections, secret name, economy

#### [NEW] module/sheets/ISUNNPCSheet.mjs, ISUNCreatureSheet.mjs
Simpler sheets for NPC/creature types.

#### [NEW] module/sheets/items/ (Item sheets)
Specialized sheets for Spell, Forte, CharacterArc with appropriate layouts. Generic fallback for simpler types.

---

#### [NEW] styles/invisible-sun.css
Main theme. Dark, mystical aesthetic:
- Deep black/charcoal backgrounds (#0a0a0f, #12121a)
- Sun-color accent palette (Silver: #c0c0c0, Green: #2ecc71, Blue: #3498db, Red: #e74c3c, Indigo: #6c3483, Gold: #f1c40f, Grey: #7f8c8d, Pale: #ecf0f1, Invisible: gradient shimmer)
- Gold (#d4af37) primary accent for borders, headings, interactive elements
- Subtle glow effects on active elements
- Custom fonts (serif for headings, clean sans-serif for body)
- Mystical border/divider patterns

#### [NEW] styles/sheets.css
Actor and item sheet layouts: tab navigation, stat pool grid, spell list tables, arc progression bars.

#### [NEW] styles/components.css
Reusable UI components: bene token displays, wound/anguish pips, color-coded spell badges, depletion indicators.

---

#### [NEW] templates/ (all Handlebars templates)
Full set of `.hbs` templates for all sheets, dialogs, and chat messages, plus partials for stat pools, skill lists, spell lists, forte abilities, arc trackers, and inventory.

#### [NEW] lang/en.json
Complete English localization strings for all labels, tooltips, sheet tabs, dialog text, and chat messages.

---

### Phase 2 - Data & Compendiums

Import all source JSON data into Foundry compendium packs.

---

#### [NEW] module/apps/DataImporter.mjs
GM-only import tool that reads the source JSON files and creates Items in compendium packs:
- Hearts to `packs/hearts/`
- Foundations to `packs/foundations/`
- Souls to `packs/souls/`
- Orders to `packs/orders/`
- Fortes + ForteAbilities to `packs/fortes/`
- Spells to `packs/spells/`
- Incantations to `packs/incantations/`
- Character Arcs to `packs/character-arcs/`

#### [NEW] packs/ (Compendium directories)
LevelDB-format compendium directories for each data type.

---

### Phase 3 - Advanced Mechanics

Order-specific magic subsystems and the Sooth Deck.

---

#### [NEW] module/apps/SoothDeck.mjs
Interactive Sooth Deck application:
- 60-card deck state tracking
- Card draw with visual reveal
- Active card effects calculation (enhanced/diminished sun magic)
- Family bonus detection (heart to card family match)
- Royalty card special rules

#### [NEW] module/apps/PathOfSuns.mjs
Visual tracker for the nine suns showing which position the current card occupies. Double-effect detection when card sun matches position sun.

#### [NEW] module/apps/VentureDialog.mjs
Interactive roll dialog:
- GM enters challenge
- Player selects skills, bene to spend
- Auto-calculates venture
- Shows target number
- Roll button with mundane + magic dice
- Flux detection and reporting
- Bene-for-effect spending post-roll

---

#### Order-specific features (in VislaeModel + VislaeSheet):
- **Vance**: Mind Slot tracker (slots by degree), spell preparation UI, cast-and-forget tracking
- **Weaver**: Thread inventory (colored aggregates), weave builder, thread combination UI
- **Goetic**: Summoning log, entity pact tracker, summoning check workflow
- **Maker**: Maker Matrix tracker, crafting workflow, material inventory

---

### Phase 4 - Polish & Advanced Features

- **Guided Character Creation Wizard**: Step-by-step workflow following the Testament of Suns
- **Automated Pool Refresh**: Rest mechanics that restore bene to pools
- **Combat Tracker Integration**: Custom initiative (PCs first, then NPCs; player-chosen order)
- **Token HUD**: Quick-access bene spending, wound tracking from the map
- **Drag-and-drop**: Heart/Foundation/Order/Forte/Soul items onto character sheet auto-populate stats
- **Compendium Browser**: Filterable spell/incantation/forte browser (by color, level, order)
- **Journal Integration**: Lore from source books as journal entries
- **Active Effects**: Sooth card bonuses, spell duration tracking, armor/ward as active effects

---

## Verification Plan

### Automated Tests
- Validate all data models load without error via `Hooks.once("ready")` diagnostic
- Verify compendium pack integrity after import
- Test dice engine with known challenge/venture/roll combinations

### Manual Verification
1. **System loads**: Foundry launches with invisible-sun selected, no console errors
2. **Actor creation**: Create Vislae, NPC, Creature actors; sheets render correctly
3. **Item creation**: Create each of the 14 item types; sheets render and save
4. **Drag-and-drop**: Drop a Heart, Order, Foundation, Forte, Soul onto a Vislae; stats auto-populate
5. **Dice rolls**: Use Venture Dialog with various challenge/venture combinations; verify flux detection
6. **Compendium import**: Run DataImporter; verify all ~800+ items created correctly
7. **Sooth Deck**: Draw cards, verify active effects on magic
8. **Character Arc tracking**: Progress through an arc's opening, steps, climax, resolution
9. **Visual inspection**: Verify dark mystical theme renders correctly across all sheets

---
---

# Revision — 2026-08-02

Roadmap revision following analysis of a [fan-made Invisible Sun character
sheet](https://docs.google.com/spreadsheets/d/13IgnMr0kXTD5mws_IPJb37cE9xGOhBeFO0H1wvdgOYU/edit),
studied for what it reveals about **function and data grouping** after years of
actual play. Every rule below was then checked against the source books; where
the fan sheet and the books disagree, the books win and the discrepancy is
noted.

## Corrections to the original plan

### The Path of Suns order was wrong

`config.mjs` currently orders the suns Silver, Green, Blue, **Red, Indigo,
Gold, Grey, Pale**, Invisible. The correct path order is:

> **Silver → Green → Blue → Indigo → Grey → Pale → Red → Gold**, with the
> Invisible Sun sitting outside the path entirely.

This is mechanically load-bearing: a Sooth card's effect doubles when its sun
matches its position on the Path, so a wrong ordering silently produces wrong
magic. The Nightside Path runs this sequence in reverse.

### Caps are derived values, not schema constants

The instinct to write `max: 3` into the data model is wrong — every cap in the
game is modifiable:

| Cap | Base | Modified by |
|---|---|---|
| Objects of Power | 3 | *Magical Management* secret (The Key, p3825) |
| Ephemera | 3 | Maker 6th degree → 6 (The Key, p4268) |
| Incantations | — | **sub-cap within** the ephemera limit; Maker 6th allows 3 of 6 |
| Character Arcs | 3 | GM discretion only — see below |

Two further wrinkles: **kindled items are exempt** from the ephemera and
Objects of Power counts entirely (The Key, p16051), and the arc limit is not
RAW at all. The Key (p166) says only that *"GMs might wish to limit players to
a maximum of three arcs at a time."* The fan sheet's cap of 4 is a house rule.
Caps therefore belong in `prepareDerivedData` as base-plus-modifier
computations, with a world setting for the arc limit.

### The injury pipeline is substantially unimplemented

Damage runs Injuries → Wounds *or* Anguish, and our implementation gets the
central branch wrong. Sources: The Gate p2405–2470 (damage, Wounds), p2490–2520
(Anguish), p2540–2570 (the third-injury rule), p2600–2615 (recovery).

#### One Injury track, not two

This is the correction that matters most. `VislaeModel` currently declares
`status.injuries.physical` and `status.injuries.mental` as **separate**
counters, and `_handleVislaeInjuryOverflow` converts each independently once it
reaches three. That is not the rule.

There is a **single Injury track**. Each Injury remembers whether it came from
a physical or a mental source, and on the third Injury **the type of that third
Injury decides** what the set becomes (The Gate, p2547):

> If a character has 1 Injury from a mental attack and 1 Injury from a physical
> attack, the third Injury sustained determines whether the Injuries translate
> to a Wound or an Anguish. So if you suffer 2 points of mental damage and then
> 1 point of physical damage, those Injuries become 1 Wound.

So two mental plus one physical yields a **Wound**, not an Anguish and not two
part-filled tracks. Our model cannot represent that state at all. Note this is
also not the "whichever is dominant" reading the fan sheet gives — it is
strictly the most recent Injury that decides.

The track resets to empty after converting.

#### Wounds and Anguish are siblings, not tiers

They differ in more than flavour:

| | Wound | Anguish |
|---|---|---|
| Inflicted by | physical damage | mental and spiritual attacks |
| 1 sustained | scourge in **all Certes** pools | scourge in **all Qualia** pools |
| 2 sustained | 2 scourges in all Certes pools | 2 scourges in all Qualia pools |
| 3 sustained | **death** | long-term catatonia, madness, utter suggestibility, **or** death, as circumstances suggest |
| Negated by | 1 bene from **Physicality** | 1 bene from **Intellect** |
| Armor applies | yes, point-by-point | **no — armor does not protect against mental damage** |

Three Anguish is therefore *not* automatically fatal the way three Wounds are;
it is a GM call among several bad outcomes. Intellect bene can never negate a
Wound.

`status.scourge` is currently one hand-entered number. It should be derived —
wounds scourging the Certes pools, anguish scourging the Qualia pools.

#### Order of application

1. **Armor** reduces physical damage point-by-point. It does nothing against
   mental damage.
2. What remains becomes Injuries on the shared track, each tagged by source.
3. Every third Injury converts, per the third-Injury rule above.
4. **Physicality bene may negate a Wound only as the damage arrives** — never
   afterwards. The *Expansive Endeavor* secret allows several at once.
5. Some powerful magical attacks inflict Wounds or Anguish **directly**,
   bypassing both Armor and the Injury track.

#### Recovery is asymmetric

- **Physicality bene** recovers already-sustained Injuries one for one. This is
  distinct from spending Physicality to negate a Wound as it lands, and it
  cannot touch a Wound once sustained.
- A **ten-minute or one-hour rest** recovers 1 Wound *or* 1 Anguish. A PC has
  one rest of each type per day; they are otherwise used to refresh pools.
- A **full night's sleep** also recovers 1 Wound or Anguish.
- **Healing Injuries never affects Wounds or Anguish.** Once either is
  sustained it must be healed on its own terms.

#### Shadow characters

Shadow characters take Injuries, Wounds and Anguish exactly as vislae do and
have the same four rests, but having no pools they spend the one-action rests
to heal 1 Injury and the longer rests to heal 1 Wound or Anguish (The Gate,
p3664).

#### NPCs and creatures (Teratology)

Teratology corroborates the shared track — *"boxes represent damage sustained
as Injuries, and when Injuries are all checked, they become a Wound or Anguish,
as appropriate (and then reset)"* — and adds rules of its own.

**The Injury threshold is not fixed at three for NPCs.** It scales with level:

| NPC level | Injuries per Wound |
|---|---|
| 1–2 | 1–2 |
| 3–5 (general case) | 3 |
| 6+ | 4–6 |

`baseNonPlayerSchema` currently has no Injury track at all and no threshold, so
both need adding, with the threshold defaulting from level but remaining
editable — Teratology treats these as guidelines a GM adjusts per creature.

**NPC Armor is not quite PC Armor.** It *"reduces the damage sustained by any
attack (physical, unless otherwise mentioned)"*, so it defaults to physical but
individual creatures may declare otherwise. For PCs, armor never applies to
mental damage.

Two further things worth modelling eventually, both currently absent:

- **Defenses** are modifiers to Withstand, Dodge and Resist, added to level to
  give a per-defence effective level. A creature may also have magic defences
  requiring two or more successes, or outright immunities.
- **Regeneration and healing** abilities are expressed as "heals 1 Wound or
  Anguish", which the same recovery path can serve.

#### Implementation notes

`ISUNActor._handleVislaeInjuryOverflow` calls `this.updateSource()` inside
`_preUpdate`, where the `changed` object should be mutated instead. It will
need rewriting regardless, since the separate-counters model it implements is
not the rule.

The schema needs to change shape, not just behaviour — something along the
lines of an ordered list of Injuries tagged `physical` or `mental`, so the
third one can be inspected when it lands.

## What the fan sheet does that we don't

**Currency is a system, not a number.** *(Implemented.)* `economy.savings`
collapsed nine distinct things, four of which are not really money. The books
correct the fan sheet twice here — it lists neither trueorbs nor the fact that
magecoins have no fixed orb price:

| Denomination | Rate | Mechanical role |
|---|---|---|
| Bits & bobs | 5 = 1 glass | — |
| Glass orbs | base | discorporate after ~50 years |
| Crystal orbs | 100 glass | — |
| Gem orbs | 100 crystal | — |
| **Trueorbs** | as gem orbs | consumed for **+1 Hidden Knowledge** |
| Bloodsilver | ~1 crystal | cursed; ownership alone risks it, challenge scales with count |
| Magecoin — **Vim** | *no fixed rate* | restores any **Certes** pool |
| Magecoin — **Lumin** | *no fixed rate* | restores any **Qualia** pool |
| Demontear | *no fixed rate* | restores **any** pool |

The two economies deliberately do not convert. The Key (p182) is explicit that
magical goods are *"paid for with magecoins or sometimes barter... but never
with orbs"*, and that *"there is no standard exchange rate"* — when a trade
happens at all it is roughly 1 magecoin for 1–2 gem orbs and rarely for more
than a coin or two. Spendable wealth therefore totals only the orb side, and
excludes bloodsilver, which is worth about a crystal orb but widely refused.

Bloodsilver curse challenge is derived from the number owned: 2–10 is level 1,
11–20 level 2, and so on (The Key, p182).

**Narrative fields are structured, not one blob.** Against our single
`biography` HTML field: Appearance, Quirk, Childhood Memories (repeatable),
Shadow Life, Personality (repeatable), plus player name and RP style. The
**Secret Soul sits in a deliberately hidden row** — a privacy affordance that
wants owner/GM-gated visibility rather than another text field.

**Order data is its own space.** The sheet gives the Order a whole tab, because
Vancean slots, thread weaving, Goetic pacts and Maker matrices share almost no
interface. For Weavers it holds aggregates (title, description, duration,
range, **qualities**, **absences**), practiced weaves, and a **times cast**
counter per weave.

**People and Home are first-class.** We bury connections inside
`FoundationModel.connectionsText` (a string) and house inside Inventory. The
fan sheet separates Connections, PC Bonds, NPC Bonds and Others, and pairs the
House with its Neighborhood.

**Two functions have no equivalent here at all.** The *Log* tab is an
advancement ledger — dated entries, all-time totals beside current values, and
the origin of each stat's Base. The *Wishlist* tab is an advancement planner
whose Type column enumerates everything Acumen and Crux can buy: aggregates,
character secrets, house secrets, connections, forte abilities, minor magics
(cantrip/charm/hex/sign), NPC bonds, order levels, spells.

**Minor Magics is a missing item type.** Cantrip, Charm, Hex and Sign are a
distinct category from Ephemera, whose subtypes are conflux/charm/cypher/oddity.

## Blockers discovered in the existing implementation

These gate everything above and are addressed as Phase 0.

- **Item create/edit/delete does nothing.** `SheetMixin` binds
  `[data-action="item-create"]`, but every template uses `class="item-create"`
  with no such attribute. No listener is ever attached.
- **Eleven of fourteen item types have no sheet**, falling through to a generic
  template that renders only name and description.
- **A new item's description can never be filled in** — `item-sheet.hbs` wraps
  the editor in `{{#if system.description}}`, so an empty field hides its own
  editor.

## Revised roadmap

### Phase 0 — Unblock

Item CRUD listeners; the empty-description trap; and a schema-driven generic
item sheet that renders every field of whatever data model it is given, so new
item types are usable the moment they are defined.

### Phase 1 — Data model

Path of Suns ordering; range distances and the advancement-spend enum in
config; the currency system; derived caps; structured narrative fields; and new
item types for Connection, MinorMagic and Thread/Aggregate.

### Phase 2 — Sheets

An **Order tab** dispatching to a per-order partial (Weaver first, being the
best-evidenced); a **Connections tab**; narrative fields moved into Biography;
House and Neighborhood out of Inventory; cap indicators showing usage against
the derived limit.

### Phase 3 — Mechanics

Steps 1–3 are done, 4 and 6 partly; see the status notes on each.

The damage pipeline, per the specification above. In order:

1. ~~**Reshape the Injury schema.**~~ **Done.** One ordered `injuries` track
   tagged by source, replacing the two counters. NPCs and creatures carry the
   same track with a `injuryThreshold` deriving from level (1–2 → 2, 3–5 → 3,
   6+ → 5) and overridable per creature. Migrated in `VislaeModel.migrateData`,
   which runs against the raw source — a type change cannot use the
   deprecate-the-field approach, since an ArrayField handed an object just
   falls back to empty.
2. ~~**Conversion.**~~ **Done.** `_convertFilledInjuries` folds each completed
   set, the last Injury deciding Wound or Anguish, and mutates `changed` rather
   than calling `updateSource`.
3. ~~**Derive scourge.**~~ **Done.** Per pool, since a scourge is "a lingering
   type of vex that forces you to subtract 1 from your venture for every action
   you take related to that pool". `pool()` gained a `scourge` field for those
   applied directly; `scourgeTotal` adds the wounds or anguish contribution.
   The single `status.scourge` number is gone.
4. **Damage application.** *Armor and the track are done* — `applyDamage()`
   takes armor off physical damage point by point, ignores it for mental, and
   supports `direct` for magic that inflicts Wounds or Anguish outright.
   **Outstanding:** the window to spend Physicality bene to negate an arriving
   Wound, or Intellect bene an arriving Anguish. That is a prompt at the moment
   damage lands, so it needs a dialog rather than a data change.
5. **Recovery.** `healInjuries()` exists and never touches Wounds or Anguish.
   **Outstanding:** wiring rests and sleep to recover 1 Wound or Anguish, and
   spending Physicality bene against standing Injuries.
6. **Outcomes.** *Flags are done* — `dead` at three Wounds, `broken` at three
   Anguish, shown on the sheet. **Outstanding:** applying Foundry status
   effects, and prompting on three Anguish, which is a GM choice among
   catatonia, madness, suggestibility or death rather than an automatic result.

Not yet modelled: for an NPC a scourge is −1 to their *level* rather than to a
pool, since NPCs have no pools.

### Phase 4 — Advancement

Reviewed across all thirteen books. The Key carries the rules (pp. 203-206,
plus costs scattered through the chapters); The Gate carries the GM side
(p. 60); The Way holds most of the prices. Book M, The Nightside and the
scenario books add no new rules, only worked examples and awards.

#### There are three currencies, not four

The sheet currently stores Joy, Despair, Acumen **and** Crux as four
independent counters. Crux is not a currency a character holds:

> You can spend Joy only along with the same amount of Despair... you spend Joy
> and Despair together as "Crux." **A Crux is 1 Joy and 1 Despair.**
> — The Key, p204

So `crux` is derived — `min(joy, despair)` — and storing it separately lets it
drift out of step with the two values that define it. The stored field should
go.

| Currency | Earned from | Tracked how |
|---|---|---|
| **Acumen** | character arcs, GM rewards for experiences | current total only |
| **Joy** | arcs concluded well, deeds, positive GM intrusions and shifts | current **and lifetime** |
| **Despair** | arcs concluded unsatisfyingly, negative GM intrusions and shifts | current **and lifetime** |
| **Crux** | *derived*: `min(joy, despair)` | lifetime spent total |

Lifetime totals are a rule, not a nicety: *"you should keep track of your total
earned Joy, even after you spend it"* (The Key, p204), for both Joy and Despair.

#### Earning constraints

The Gate (p60) caps the pace, which a system can usefully enforce or at least
surface:

- In any session a PC earns **one or the other, or none — never more than 1,
  and never 1 of each.** Joy and Despair from **GM shifts do not count** toward
  that cap.
- Where an event is both good and bad, the player picks Joy **or** Despair,
  never both, and must justify the choice.
- A positive or negative GM "intrusion" into the narrative is worth exactly
  1 Joy or 1 Despair.
- GM shifts happen a couple of times a session, and Sooth cards carry Joy and
  Despair meanings that suggest them — a hook for the Sooth Deck work.
- Each order and each forte lists example sources. We already store these as
  `pathToJoy` and `pathToDespair` on the Forte item, and they are currently
  displayed nowhere.

#### Prices

| Purchase | Cost | Source |
|---|---|---|
| Spell or long-form working | **Acumen = effect level** (min 1) | The Key p1713, The Way p474 |
| Minor magic (cantrip, charm, sign, hex) | **1 Acumen**, always — cannot fail, takes a day | The Way p1965 |
| Secret | **Acumen = its level** (usually) | The Key p204 |
| Skill — action | **3 Acumen per level** | The Key p33 |
| Skill — narrative | **2 Acumen per level** | The Key p33 |
| Skill — development | **1 Acumen per level** | The Key p33 |
| Order degree | **Crux = the degree entered** (1st→2nd costs 2) | The Key p205 |
| Forte ability, level 1-4 | **1 Crux** | The Key p71 |
| Forte ability, level 5-6 | **2 Crux** | The Key p71 |
| Forte ability, level 7+ | **3 Crux** | The Key p71 |
| Despair → Acumen | **1 Despair buys 2 Acumen**, one way only | The Key p204 |

Advancing in an order also carries a story requirement and takes two weeks to
two months; study time is about three days per effect level. Worth recording on
the purchase, not enforcing.

#### Two consequences we do not model at all

**Every forte ability bought raises a stat.** *"Every time you gain a new forte
ability, you permanently increase one of your stats by 2 points (or two of your
stats by 1 point each). If that stat is Certes or Qualia, the points are
distributed into the refined pools of that stat. This is the primary way vislae
can improve their stats."* (The Key, p71.) Buying a forte ability must therefore
prompt for where the points go.

**Lifetime Crux powers the Testament of Suns.** The object gains an effect whose
level tracks the total Crux earned and spent over the character's life (The Key,
p205) — which is why lifetime totals must be kept:

| Crux spent | Object power |
|---|---|
| 0-4 | none |
| 5-8 | Level 2 effect |
| 9-12 | Level 3 effect |
| 13-16 | Level 4 effect |
| 17-24 | Level 6 effect |
| 25-34 | Level 8 effect |
| 35-46 | Level 9 effect |
| 47+ | Level 10 effect |

#### Forte abilities form a graph, not a list

*"If you choose Voice of the Serpent, you can later choose Bite of the Serpent,
but Voice also unlocks Hypnotic Gaze of the Serpent"* (The Key, p71). `ForteModel.abilities`
is currently an ordered array, which models a single path. The real structure is
a prerequisite graph with multiple entry points. The extracted data does not
capture the edges — the books express them as a diagram — so this needs either
hand-authoring per forte or leaving the order advisory and letting the GM
adjudicate. **Open question below.**

#### Order degrees — and a data correction

Advancing a degree has **three requirements, all of which must be met**
(The Key, p205):

1. **Crux equal to the degree entered.** 1st→2nd costs 2, 2nd→3rd costs 3, and
   so on. Reaching 6th degree therefore costs 2+3+4+5+6 = **20 Crux** across a
   character's life — 20 Joy and 20 Despair.
2. **A story requirement**, specific to the order and the degree, which
   *"always requires interacting in some way with other members of your order
   (unless you're an Apostate)"*. A 2nd-degree Vance needs the personal
   sponsorship of a 3rd-degree or higher Vance, good standing, an interview with
   a representative of the Telemeric Court and a private ceremony; a 6th-degree
   Maker must have performed the Invocation of Craft as a 5th-degree Maker in
   the company of a 6th-degree Maker.
3. **Time** — two weeks to two months once the Crux is in hand, longer at higher
   degrees, and some orders specify their own.

The Crux and the story requirement are independent gates: *"some characters will
complete all the necessary requirements before they earn enough Crux."*

Each degree entry then lists what it grants — *"As part of our training and
initiation into the ranks of this new degree, we learn the following"* — and
these are real mechanics, not flavour. The Maker's 6th degree is where the
ephemera limit rises to six, which the derived caps already depend on, and
Vancean mind slots scale by degree.

**Apostates work differently and have no degrees at all.** They begin with a
fixed set of abilities and afterwards buy Apostate Abilities, for which they
meet the prerequisites, at a flat **1 Crux each**.

##### `source/data/orders.json` is wrong

It records **four** degrees per order. There are **six**. Worse, none of the
titles it holds appear anywhere in The Key or The Way — checked individually,
zero hits for every one. They are invented:

| | Vance | Weaver | Goetic | Maker |
|---|---|---|---|---|
| 1 | Postulant | Master of the Loom | Initiate of the Mysteries | Shaper |
| 2 | Velator | Master of the Temple | Mysterion | Crafter |
| 3 | Magister | Master of the Spindle | Conjurer | Maker |
| 4 | Cantral | Master of the Weft | Master Conjurer | Prime Maker |
| 5 | Magus | Master of the Warp | Master of the Pacts | Master Shaper |
| 6 | Grand Magus | Grand Artist | Ultima Mysterion | Imperator |

against the stored *"Aspirant / Initiate / Master / Grand Master"* for Vance and
similar for the rest. The one thing the file gets right is that Apostates have
no degrees.

`OrderModel.degrees` is a flat `ArrayField(StringField)`, which can hold a title
and nothing else — not the Crux cost, the sponsorship requirement, the time, or
what the degree grants. It needs to become an array of objects, and the data
needs re-extracting from The Key, whose degree entries are well-formed and
should yield to the same approach as `scripts/extract_fortes.py`.

#### Proposed implementation

**1. Model.** Replace the four counters with:

```
advancement: {
  acumen:  Number,                 // current
  joy:     { current, lifetime },
  despair: { current, lifetime },
  cruxSpent: Number                // lifetime, drives the Testament table
}
```

Derived: `cruxAvailable = min(joy.current, despair.current)`, and
`testamentPower` from the table above. The stored `crux` field is migrated —
`joy.current` and `despair.current` take the old values, and any stored `crux`
is added to both lifetimes, since a held Crux was a Joy and a Despair earned.

**2. Awarding.** A small API and a GM-facing control:
`actor.awardJoy(n, {fromShift})`, `awardDespair`, `awardAcumen`. Raising Joy or
Despair raises the lifetime total with it; lowering it by spending does not.
`fromShift` marks awards exempt from the once-per-session cap, and the sheet
warns rather than blocks when the cap is exceeded — the same advisory stance the
item caps take, for the same reason.

**3. Spending.** One dialog driven by `config.advancementPurchases`, which
already enumerates every purchase and is currently referenced nowhere. It:

- takes a target (a compendium item, or the next degree in the order)
- computes the price from the table above
- refuses only when the character cannot afford it, showing the shortfall
- deducts Acumen, or deducts a Joy and a Despair per Crux and adds to `cruxSpent`
- creates the purchased item on the actor
- for a forte ability, prompts for the +2 stat points before completing
- for an order degree, shows the degree's story requirement and what it grants,
  and records the degree reached on the actor rather than as free text
- writes a ledger entry

**4. Ledger.** An array of `{ when, kind, label, cost, balanceAfter }` on the
actor. This is the fan sheet's Log tab, and it earns its place: it explains how
a character reached its current state, survives a GM correcting an award, and is
the only way to audit lifetime totals that the rules require be kept.

**5. Sheet.** The Overview advancement block becomes editable and shows current
against lifetime for Joy and Despair, available Crux as a derived value, and a
Spend button. A fuller Advancement tab would carry the ledger and the wishlist —
purchases planned but not yet afforded, which is the other half of what the fan
sheet's Wishlist does.

## Open questions

> [!NOTE]
> **Arc cap — decided.** Ships as **3**, matching The Key's suggestion, with a
> world setting for tables that want a different number.

> [!NOTE]
> **Cap enforcement — decided.** Caps are kept and shown as usage against the
> limit. Because items a character takes must be able to raise them, limits are
> computed rather than stored:
>
> ```
> limit = base + Σ(contributions from owned items) + GM override
> ```
>
> The summing mechanism is built now so the architecture is settled; wiring up
> the individual sources — the *Magical Management* secret, Maker degree
> progression, forte abilities — comes later, as each depends on modelling that
> item type properly. Until a source is wired, its cap simply sits at base and
> the GM override covers the gap.

> [!IMPORTANT]
> **Forte ability prerequisites.** The books express a forte's abilities as a
> branching diagram — choosing one unlocks particular others — but the extracted
> data holds only a flat ordered list, because the edges live in the artwork
> rather than the text. Options: hand-author the graph for all 51 fortes (~489
> abilities, substantial work); infer a rough order from ability level and leave
> it advisory; or show the list and let the GM adjudicate. Recommendation: the
> third for now, since the purchase flow works regardless and a wrong graph is
> worse than none.

> [!IMPORTANT]
> **Re-extracting the orders.** The five order entries need redoing from The
> Key: six degrees each with their real titles, Crux cost, story requirement and
> the abilities granted, plus the Apostate's flat 1-Crux ability purchases. Same
> shape of job as the forte extraction, and the parser should mostly transfer.
> The unique mechanics per order — mind slots, the Maker's Matrix, thread
> weaving, summoning — are described in the same chapters and are what a per-order
> tab needs, so it is worth doing both passes together.

> [!IMPORTANT]
> **Session cap enforcement.** The Gate limits a PC to one Joy *or* one Despair
> per session, excluding GM shifts. Tracking that needs a notion of "session"
> the system does not currently have. Options: a GM-pressed "new session"
> button, tie it to world time, or drop the cap and let the table manage it.

> [!NOTE]
> The fan sheet's *Rules* tab (range distances, currency conversion, Path of
> Suns meanings, weaving procedure) is not needed as a sheet tab — this system
> bakes those in. It remains a useful reference for what players look up often.
