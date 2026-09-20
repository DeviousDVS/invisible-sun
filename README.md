# Invisible Sun — a system for Foundry VTT

An unofficial system for playing **Invisible Sun** by Monte Cook Games on
[Foundry Virtual Tabletop](https://foundryvtt.com/). Step into the Actuality: a
surreal world where ideas have power, magic is real, and the ordinary is
extraordinary.

I wanted a system that knows the rules rather than a set of digital note cards.
Scourges reach the dice. Vexes are spent against actions. A heart's starting
points are placed rather than typed. Where the books are explicit, the code
follows them and says which page; where the books leave a call to the table,
so does the system.

> **This system ships no Invisible Sun text.** The compendia arrive empty and
> fill themselves from the PDFs you already own, on your machine, for your
> table. See [Content and the books](#content-and-the-books).

---

## What you need

- **Foundry VTT v14** — minimum `14.366`, tested against `14.368`.
- **Your own copy of the Invisible Sun books and decks**, as PDFs.
- Nothing else. [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice)
  is supported if you have it — magic dice are tinted by the sun being drawn
  on — but it is entirely optional.

## Installing

Paste this into Foundry's **Install System** dialog:

```
https://github.com/DeviousDVS/invisible-sun/releases/latest/download/system.json
```

Then create a world with **Invisible Sun** as its system. The compendia will be
empty; the next section is how you fill them.

---

## Content and the books

Spell descriptions, secrets, forte abilities and the rest are Monte Cook Games'
copyright, and redistributing them is not something the [Fan Use
Policy](https://www.montecookgames.com/fan-support/fan-use-policy/) allows. So
none of it is here — not in this download, not in the repository, and not in its
history either, which was rewritten to remove it. The release build refuses to
assemble an archive if any appears.

What you get instead is a reader. Put your PDFs in one folder, open **Import
Content** from the compendium sidebar, and point it at that folder. It works out
what each file is from what is printed on its first page, so renamed and
re-dated downloads are recognised, and anything it cannot read is named in the
log rather than skipped in silence. **Your files are read where they lie** —
nothing is uploaded, and nothing but the card art is written anywhere.

It fills every compendium the system ships:

| From | What it brings in |
|---|---|
| Sooth Deck | the 60 cards, each with its face cut out and the sheet masked away |
| The Gate | the write-up behind every Sooth card — meanings, divination, Joy, Despair |
| Spell Deck, Vance Spell Deck, Book M | 390 spells, the Vancian ones with the class their card size records |
| Objects of Power, Ephemera, Incantations, Weaver Aggregates | the rest of the decks |
| The Nightside | its five kinds of card, sorted by the livery on the back |
| The Key | 401 goods; the hearts, souls and foundations; 31 fortes and their 297 abilities; character arcs, the starting skill library, and the orders with their degrees |
| Book M, The Nightside, The Threshold | 20 more fortes and their 194 abilities |
| The Threshold, Secrets of Silent Streets | the objects and ephemera never printed on a card |
| The Van Hauten Collection | 279 secrets — character, house and changery |
| Teratology, The Nightside, The Path | creatures and NPCs, with the artwork from their own pages |

Order does not matter, and running it twice is safe: entries are matched by name
and updated rather than duplicated, and a book only writes the fields it
actually states — so anything you edit by hand survives a re-import. If you need
to start over, **Empty the compendia** sits beside the import button, counts
what it would delete, and lets you clear one deck rather than all twenty.

Two things worth knowing. A forte's **ability tree** is the one thing no PDF can
give up — the books draw it as a diagram and its arrows are vector art, so the
tree was built by hand and a re-import will not touch it. And your imported
compendia are the only copy there is; if you ever reinstall the system, run the
importer again. The card art lives outside the system folder, so it survives an
update and links straight back up.

Content you generate this way remains Monte Cook Games' property. Keep it to
your own table.

**If you do not own Invisible Sun**, [buy it from Monte Cook
Games](https://www.montecookgames.com/store/product-category/invisible-sun/).
This system is no substitute for the books and is not much use without them.

---

## What it does

**Characters.** Vislae for player characters, plus NPCs and Creatures, which run
on a level shifted by scourge rather than on pools. Nineteen item types cover a
vislae completely — hearts, foundations, souls, orders, fortes and their
abilities, spells, incantations, minor magic, secrets, skills, character arcs,
connections, ephemera, objects of power, aggregates, goods and Sooth cards.

**Character building that follows the text.** A dropped Foundation or Heart
applies what it grants. A heart's two starting skills are offered as a choice,
because that is what the book asks for. Stat points are placed into pools rather
than typed, with the heart's free six spendable either way and the rest tied to
their own stat.

**The challenge flow.** Only players roll dice in Invisible Sun, so every roll
starts with you: declare a pool, a challenge rating and who it is put to; the
player answers with skills, bene and Sortilege, and rolls. One chat card carries
the whole exchange and stays as the record of it. A defence is the same card
with another label, so combat needs no second mechanism.

**Health as the books describe it.** Injuries fill one ordered track, and the
last of each set decides whether it becomes a Wound or an Anguish — so two
mental and one physical is a Wound. Armor reduces physical damage before
anything is recorded. A bene may be spent to negate a Wound or an Anguish at the
moment it lands, from the pool the rules name and only while the window is open.

**Rests and days.** Four rests a day, the longer two able to recover a Wound or
an Anguish, and a night's sleep that refreshes every pool and clears vexes — but
never a scourge, which has to be got rid of some other way.

**Action Mode.** A round is a checklist, not a running order: nothing rolls for
initiative, and the tracker shows who is still due an action and who has taken
theirs. Narrative control is a floor — taken while it's free, given up when
you're done, and the GM can take it back. The four distances are drawn on the
canvas from the selected token, and movement is held to what a round is worth:
a close move costs nothing, a near move is your action, and further than that
takes another round.

**The Path of Suns.** The Sooth Deck's board, where you turn a card and the whole
table can see which one is up — the nine positions, the Testament of Suns
holding whatever last landed on the Invisible Sun, and a readout of what is in
play. Every turn is announced in chat with the card and its write-up, so nobody
needs the board open. The Nightside Path is the same board in reverse.

**What the board is worth reaches the dice.** A card of your heart's family is
+1 to every action, and a royalty card moves everyone's — so the answer dialog
shows what the Path is giving you before you decide what to spend, and the
challenge card records it beside the card it came from. What a card does to
*magic* is shown rather than applied: your spells carry a badge saying what the
board is doing to their colour, because the book is plain that the Sooth Deck is
a tool and not an obligation. A world setting turns all of it off for a table
that would rather do the arithmetic themselves.

**Scourge and vex actually apply**, because naming the pool an action draws on
makes them reachable: a scourge subtracts from every action drawing on its pool,
and a vex is the lesser of your ceiling and what the pool holds.

**Magic in one list.** Spells, incantations, forte abilities and minor magics
share a sortable table, because the rules treat their level, cost, dice and
depletion the same way. Magic dice flux on a 0, with intensity following how
many were cast, and the Experimental Die is supported — it never succeeds, it
only ever fluxes. A depletion tracker keeps what is still running, grouped by
the moment each card says to check it.

**Odds and ends.** Each order's six-degree ladder is read from the Order item
rather than hardcoded, so editing it is followed. The Apostate's purchasable
abilities are handled separately, as they should be. There is an economy of nine
denominations, with magecoins deliberately not converted into orbs — the books
are explicit that no exchange rate exists — and the bloodsilver curse tracked.
Skills and practices can be dragged onto the hotbar. And there is a browser for
searching across every compendium at once.

---

## Known limitations

Honest about what is not finished:

- **Acumen is not spent by anything.** The skills list quotes a price per level;
  nothing deducts it.
- **Casting does not route through the challenge flow**, so a depletion after a
  cast has nowhere to hand back to.
- **Challenge cards have no cancel handling.** An abandoned card stays in chat
  until it is closed.
- **Apostate entitlements are not tracked.** Their starting Ephemera Use and
  purchasable Incantation carry real grants, but nothing records which apostate
  abilities a character has taken.
- **Enhancements outside Sortilege cannot be recorded.** A pool carries a single
  value, which is bene everywhere except Sortilege.

Three things the importer cannot do, all of them because the source does not
contain the answer: a forte's ability tree, the boxed sidebars beside the order
entries, and the provenance stamped on each secret.

What changed in each release is in the [changelog](CHANGELOG.md). Where a
version changes the shape of stored data, the system migrates existing worlds
and says so there.

---

## Help and contributions

Issues, bug reports and pull requests are all welcome.

**Play reports are the most useful thing you can send me.** If a rule is
modelled wrongly, tell me which rule and which book page — that is enough to fix
it. If something is broken, what you did and what happened.

If you want to work on the system itself, clone the repository into your Foundry
`Data/systems/` directory, run `npm install`, and `npm test` before you open a
pull request. All user-facing strings live in `lang/en.json`; some keys are
composed at runtime, so a bare search will not find every use.

---

## Credits

**DeviousDVS.** Built originally from the [Boilerplate
system](https://github.com/asacolips-projects/boilerplate) by Asacolips Projects
/ Foundry Mods, since fully rewritten for Foundry v14's ApplicationV2 and
DataModel APIs.

## Licence

The system's code — sheets, templates, styles and tooling — is released under
the [MIT licence](LICENSE). Use it, fork it, learn from it.

That licence covers the software only. It does not cover the game.

## Legal

*Invisible Sun* and its associated properties are trademarks and copyrights of
Monte Cook Games. This system is an unofficial fan creation for playing the game
on Foundry VTT, produced under the [Monte Cook Games Fan Use
Policy](https://www.montecookgames.com/fan-support/fan-use-policy/). It is not
affiliated with, endorsed by, or published by Monte Cook Games.
