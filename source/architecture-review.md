# Architecture review

A read of the system as it stands at `b42a0cb`, ahead of a public release.
Findings are ordered by leverage — what buys the most future ease per unit of
work — not by severity. Nothing here is a change; it is a list of things worth
deciding about.

Scope: `invisible-sun.mjs`, `module/`, `templates/`, `styles/`, `lang/`,
`system.json`, `package.json`, and the `scripts/` content pipeline.

---

## What is already load-bearing

Naming these first, because the most expensive kind of cleanup is the kind that
removes something that was carrying weight.

**The data models are the strongest part of the system.** `defineSchema()` is
used properly throughout, `migrateData` is used for shape changes at exactly the
right layer, and deprecated fields are retained deliberately with a comment
explaining that Foundry prunes keys absent from the schema — which is the
non-obvious fact that makes the pattern work. `VislaeModel.migrateData` handles
four separate historical shapes without a version number, because each migration
is written to be idempotent by inspecting the value's type. That is the right
design and should not be replaced by the imperative migrations discussed below;
it should absorb them.

**Derived state is derived, not stored.** A stat's score is the sum of its
pools, scourge totals are computed per pool from four scopes, wealth is computed
from the purse. Nothing is written down twice, so nothing can disagree with
itself. `_prepareStatAllocation`'s "own budget first, shared reserve after" is
subtle and correct in both directions.

**The commenting discipline is unusual and worth protecting.** Comments cite the
rule and the page — "you don't spend a scourge... you have to get rid of it
somehow (The Key, p2242)" — so a future reader can tell a deliberate reading of
the rules from an accident of implementation. Several comments also record a bug
that was fixed and why the obvious alternative fails. Do not let a tidy-up pass
strip these; they are the system's design record.

**`CONFIG.ISUN` as a frozen single source** for suns, pools, limits and
currencies, with `pathOfSuns` derived from the sun table rather than typed twice.

**The design-note habit.** `source/challenge-flow.md` records not just what was
built but what was tried and cut, and why. Keep doing this.

---

## 1. Two event-binding conventions, and only one of them is wired

**The highest-leverage change in the codebase.**

`ISUNVislaeSheet` binds 25 listeners by hand in `_attachCustomListeners`
(`ISUNVislaeSheet.mjs:575–646`), matching a mix of CSS classes and
`[data-action]` selectors. The templates, meanwhile, mark up controls with
`data-action` throughout.

The two conventions have already drifted. These five `data-action` values exist
in templates and have no handler of that name anywhere in `module/`:

| action | template |
|---|---|
| `refresh-pool` | `partials/stat-pool-row.hbs:79` |
| `add-wound` | `partials/wound-tracker.hbs:6` |
| `remove-wound` | `partials/wound-tracker.hbs:9` |
| `add-anguish` | `partials/wound-tracker.hbs` |
| `remove-anguish` | `partials/wound-tracker.hbs` |

They work anyway, because each element *also* carries a class (`.btn-refresh`,
`.wound-pip.full`) that is bound. So the `data-action` is decorative — but a
developer reading the template cannot tell that, and will reasonably conclude
`data-action` is how binding happens here.

This has already cost real time. Four separate instances are recorded in the
comments:

- `SheetMixin.mjs:72` — *"These were previously bound to
  `[data-action="item-create"]`, an attribute no template sets, so no listener
  was ever attached."*
- `SheetMixin.mjs:120` — the secret-chip delete button *"found nothing and
  silently did nothing."*
- `ISUNVislaeSheet.mjs:576` — the bene pip that spent a bene into thin air.
- `chat/challenge-card.hbs:51` — every card button rendering `data-actor-id=""`.

Same failure mode each time: markup and handler both correct in isolation, never
joined up, and failing **silently**.

**ApplicationV2 solves this declaratively, and the system already knows how.**
`CompendiumBrowser.mjs:30` uses `static DEFAULT_OPTIONS.actions` — the framework
binds every `[data-action]` under the part, and a `data-action` with no matching
entry raises a console warning instead of doing nothing.

Recommendation: move the sheets onto the `actions` map, and treat `data-action`
as the only binding convention. Class-based binding stays only where an element
genuinely has no action (styling hooks). This converts a class of silent failure
into a loud one, deletes ~60 lines of `querySelectorAll(...).forEach`, and
removes the need for the "is it bound by class or by attribute?" question
entirely.

Chat cards are the legitimate exception: `ChallengeCard.render` injects into a
message rather than an Application part, so its manual binding stays.

---

## 2. `_prepareSheetData` is eight jobs in one method

`ISUNVislaeSheet.mjs:76–316`, about 240 lines. It buckets embedded items, groups
connections, resolves the order and its degree ladder, builds the practices
list, builds skill groups, computes stat allocation display, builds rest rows,
splits secrets by where they are shown, and renders the character sentence to
HTML.

Each block is individually clear and well commented — the problem is only that
they are in one place, so the method has no natural stopping point and every new
feature lands in the middle of it.

Two suggestions, independent of each other:

**Split by concern.** `#prepareItems`, `#prepareOrder`, `#preparePractices`,
`#prepareSkills`, `#prepareHealthAndRests`, `#prepareSentence`, each taking
`context`. Mechanical, low-risk, and makes the tab-to-code mapping obvious.

**Make the item bucketing data-driven.** `ISUNVislaeSheet.mjs:97–116` is a
16-case switch that must be edited whenever an item type is added, and the
`context.spells = []` block above it must be edited in the same commit. Both
could come from one list:

```js
// sketch, not a patch
for (const item of items) (context[BUCKET[item.type]] ??= []).push(item);
```

with `BUCKET` derived from `CONFIG.Item.dataModels` keys. Adding an item type
then touches the model registration and nothing else.

---

## 3. Push derivation down into the data models

`ISUNActor` is ~700 lines and prepares derived data for all three actor types.
`_prepareHealth` (`ISUNActor.mjs:85`) is the clearest symptom: it computes the
Injury track for everyone, then branches mid-method —

```js
if (this.type !== "Vislae") {
  h.effectiveLevel = Math.max(0, (this.system.level ?? 0) - (h.scourge ?? 0));
  return;
}
```

— and does something structurally different for NPCs and Creatures, because they
have no pools for a scourge to sit in. `prepareDerivedData` then branches again
on the same condition at line 72. The `healthPath` / `health` getters exist
purely to paper over Vislae storing health at `system.status` and everyone else
at `system.health`.

All of that is one class doing three jobs. `_prepareStatAllocation`,
`_prepareLimits` and `_prepareEconomy` are Vislae-only and live on the generic
Actor class; `VislaeModel`, `NPCModel` and `CreatureModel` each preparing their
own removes the type branching rather than documenting it, and puts the
derivation next to the schema that declares the fields.

**One prerequisite, which is easy to miss and fails silently.** All 20 models
extend `foundry.abstract.DataModel`. Plain `DataModel` has no
`prepareDerivedData` hook — the parent document never calls it. That is
`foundry.abstract.TypeDataModel`. Moving the methods without changing the base
class first produces no error and no derived values: caps, wealth and scourge
totals simply stop appearing. Change the base class first, verify one model
derives, then move the rest.

Mechanically: `this.items` becomes `this.parent.items` (8 call sites in
`_prepareLimits` and `degreeEntitlements`), and `game.settings.get` is fine to
call from derived data.

What should *stay* on `ISUNActor` is everything that writes — `applyDamage`,
`restRefreshPool`, `restRecoverHealth`, `negateWithBene`, `newDay`,
`recordIncantation`. Those call `this.update()` and belong to the document, not
its data. If the class still reads long once derivation has moved out, splitting
those into `ActorRestMixin` / `ActorHealthMixin` is a reasonable readability
choice — but it is a consequence of this refactor rather than a goal of its own,
and it does not make anything more testable while those methods still need a
live document.

---

## 4. Mechanical rules are derived by parsing English prose

`ISUNActor.degreeEntitlements()` (`ISUNActor.mjs:546–567`) reads how many
ephemera, incantations and conation slots a degree grants by running three
regexes over the ability's `description` text:

```js
const EPHEMERA = /\b(one|two|three|four|five|six)\s+ephemera\b/i;
const INCANTATIONS = /only\s+(one|two|three|four|five|six)\s+of these can be incantations/i;
```

The comment argues for this well — reading the ladder means a GM who edits an
order is followed rather than overridden. That goal is right. The mechanism is
the fragile part:

- It breaks completely under **translation**. A French `lang/fr.json` is a stated
  future; the moment the pack text is translated, every vislae silently loses
  their entitlements. Nothing errors — the caps just quietly become the base.
- It breaks under **rewording**. A GM who edits "you may bear four ephemera" to
  "your ephemera limit rises to four" gets nothing.
- The failure is **silent and mechanical**, which is the worst combination: the
  character sheet shows a wrong cap and nobody is told.

Recommendation: give the degree schema explicit fields — `grants: { ephemera,
incantations, conation }` — and populate them in the extractor, where the parse
runs once against known English text and a mismatch can be caught by
`verify_packs.js`. Keep the regex as a build-time fallback for entries the
extractor cannot resolve, not as a runtime dependency. The GM-edit case is then
better served too: a number field is easier to edit deliberately than a sentence
that has to hit a regex.

This is the only place in the system where mechanics depend on prose. Worth
closing before a translation exists to break it.

---

## 5. The imperative migrations have no version gate

`invisible-sun.mjs:263–299`, the ready hook:

```js
for (const item of game.items) {
  if (item.type === "ForteAbility" && typeof item.system.level === "string") {
    item.update({ "system.level": parseInt(item.system.level) || 1 });
  }
}
for (const actor of game.actors) { for (const item of actor.items) { /* same */ } }
```

Three problems, in increasing order of importance:

1. It runs on **every world load, forever**, walking every item and every actor's
   items. Cheap now; it scales with the world.
2. The updates are **not awaited** and not batched — one document write per item
   rather than one `updateDocuments` call.
3. There is **no `game.user.isGM` guard**. Every connected client runs this loop
   and races to write the same documents. `migrateSavingsToPurse` directly above
   it *does* guard (`invisible-sun.mjs:242`), so the omission looks accidental
   rather than intended.

Lines 279–284 are a stub that loops every pack and does nothing:

```js
// In a real migration we'd unlock the pack, update items, and lock it again.
// We will leave this stubbed or log for now.
```

Recommendation: a `migrationVersion` world setting, a single GM-gated runner
that compares it against `system.version` and runs only what is outstanding, and
delete the stub. Give it a home of its own — `module/migrations/`, since these
accumulate version by version and the entry point should not grow a section per
release. That directory earns its place; `module/hooks/` and `module/commands/`
would each hold a single file today, and splitting a five-file `helpers/` across
several directories would make navigation worse rather than better. The two
inline hooks in the entry point (`renderCompendiumDirectory`, `renderChatLog`)
are ~30 lines together and can wait until there are enough to fill a file.

**Correction, found while adding the guard (item 5):** the `ForteAbility.level`
loops should be *deleted*, not moved. `ForteAbilityModel` declares `level` as a
`NumberField`, so the DataModel casts a stored `"3"` to `3` before anything
reads it, and the loops' condition — `typeof item.system.level === "string"` —
can never be true. Verified in the live world: writing a string with
`validate: false` still reads back as the number `3`. The schema has been doing
this migration silently and correctly all along; the imperative version has
never once fired. Nothing needs to move into `migrateData` either, for the same
reason.

There is currently no `migrationVersion` anywhere in the repo; adding one before
the first public release is much easier than adding one after strangers have
worlds.

---

## 6. A live bug: `checkDepletion` is called with the wrong argument

```js
// helpers/dice.mjs:108
export async function checkDepletion(depletionString, actor = null) {
  if (!depletionString || depletionString === "" || depletionString === "—") return null;
  const match = depletionString.match(/(\d+)(?:-(\d+))?/);
```

```js
// ISUNVislaeSheet.mjs:804
game.invisibleSun.checkDepletion(item);
```

An `Item` is truthy and is neither `""` nor `"—"`, so it passes the guard and
reaches `.match()`, which an Item does not have. Using an item that has a
depletion value from the sheet throws a `TypeError`. This is reachable from the
practices list on the Magic tab.

Two smaller things in the same function: it builds its chat HTML inline as a
template literal while its sibling `postResult` renders a `.hbs` template, and
its user-facing strings — "Depletion Check", "DEPLETED", "Safe" — are hardcoded
English rather than localised.

Related, at `ISUNVislaeSheet.mjs:788–806`: `_onItemRoll` posts a roll with
`challenge: 0, venture: 0, magicDice: 1` regardless of the item, and an
untranslated label `` `Used ${item.name}` ``. That predates the challenge flow
and is now the odd one out — using an ability should probably route through
`ChallengeCard` like everything else, which is also where the depletion hand-back
would naturally live.

---

## 7. Leftover scaffolding

Small individually; together they are what makes a codebase feel unfinished to a
first-time reader, which matters for a public release.

- **`/venture` chat command** (`invisible-sun.mjs:304–319`) — *"In the future,
  this will open the Venture Dialog. For now, just fire off a basic roll."* It
  rolls with venture 0 and no actor. The README advertises it as a feature.
  Delete it rather than promoting it into a command registry: it is a
  placeholder that the challenge flow has superseded, and building infrastructure
  around a placeholder is how placeholders become permanent. If slash commands
  come back as a real feature, the registry can come with them.
- **Dead tail of `_prepareVislaeData`** (`ISUNActor.mjs:687–706`) — a
  commented-out crux calculation, an `isDead` variable that is computed and never
  used, and a pool-total validation block whose body is a comment saying it does
  nothing. Written in a noticeably different voice from the rest of the file.
- **Orphaned JSDoc** at `ISUNActor.mjs:469–480`: a doc comment describing
  `_prepareLimits` sits immediately above a second doc comment for
  `_prepareStatAllocation`. Same detached-comment pattern that was fixed in
  `ChallengeCard.mjs`; worth a sweep for others.
- **Duplicated section comment** — `/* ── House ── */` twice at
  `VislaeModel.mjs:270–273`.
- **`old_char_sheet/`** — 47 tracked files of the superseded system, including
  its own `system.json`, `package.json` and `LICENSE.txt`. `trash/` is correctly
  gitignored; this is not. If it is kept for reference, a git tag would keep it
  without shipping it to everyone who clones.
- **`module/helpers/quirks.mjs` is generated** by `scripts/build_quirks.py` from
  `source/data/quirks.json`, but carries no "generated — do not edit" marker, so
  a direct edit is silently lost on the next build.

---

## 8. Localisation keys that cannot be audited

`lang/en.json` holds 452 keys. Attempting to find dead ones is currently
impossible to do reliably, because keys are composed at runtime:

```js
game.i18n.localize(`ISUN.Outcome${r.outcome.charAt(0).toUpperCase()}${r.outcome.slice(1)}`)
game.i18n.localize(`ISUN.Kind${k.charAt(0).toUpperCase()}${k.slice(1)}`)
game.i18n.localize(`ISUN.ChallengeState${...}`)
game.i18n.localize(`ISUN.Rest${...}`)
game.i18n.localize(`ISUN.Pool${...}`)
```

A naive scan reports ~44 unreferenced keys, of which a large share are false
positives from exactly these patterns — so the number is not trustworthy in
either direction, and dead keys accumulate unnoticed. (The five orphans deleted
during the challenge-flow work were found by hand.)

Recommendation: keep dynamic composition, but declare the prefixes in one place
so a build-time checker can expand them — e.g. an exported
`DYNAMIC_KEY_PREFIXES = ["ISUN.Outcome", "ISUN.Kind", ...]` next to the config,
and a small script that flags any key matching no literal and no declared
prefix. Cheap, and it makes a translation contribution reviewable.

Also untranslated: `IncantationGrant.mjs:329` ("Choose instead"), the
`checkDepletion` strings above, `rollVenture`'s `label = "Action"` default, and
`_onItemRoll`'s `Used ${item.name}`.

---

## 9. Stylesheet organisation

- `styles/sheets.css` carries **23 `!important` in 59 rules**. That density
  usually means fighting Foundry's core styles by force rather than by
  specificity. Scoping under the existing `.invisible-sun` class, or under
  `.invisible-sun.sheet`, would win those fights on specificity instead and make
  the rules overridable by anyone theming the system.
- `styles/components.css` is **1,907 lines** in one file covering pips, chat
  cards, every dialog, the degree ladder, the compendium browser and the
  challenge card. It is sectioned with clear banners and is navigable, so this is
  not urgent — but it is the file most likely to accumulate conflicts if the
  project takes contributors. Splitting along the same lines as `module/apps/`
  would make ownership obvious.
- The 57 custom properties in `styles/invisible-sun.css` are a good foundation;
  a light/dark or accessibility variant would mostly be a matter of overriding
  them, which is worth knowing.

---

## 10. Release packaging

Not architecture, but this is what stands between the current state and someone
on r/invisiblesun successfully installing it.

- **`system.json` has no `manifest` or `download` URL.** Without them Foundry
  cannot install the system from a link, and cannot ever offer an update. This is
  the single most important item for a release; everything else here can wait.
- **No `license` field** in `system.json`, and no `LICENSE` file in the repo.
  `package.json` declares `"license": "ISC"`, which is almost certainly not what
  is intended for a system distributing another publisher's game content.
- **`url`, `bugs` and `changelog` are empty or absent** — these are what a
  reader clicks when something breaks.
- **`@foundryvtt/foundryvtt-cli` is a `dependency`, not a `devDependency`.** It
  is a build tool; it should not be in the shipped dependency set.
- **`npm test` exits 1** with "no test specified".
- The Dependabot count on the default branch (53, 2 critical) is entirely dev
  tooling and reaches no player — but it is the first thing a visitor to the
  GitHub page sees, so it is worth clearing or documenting.

---

## 11. The content pipeline is good and undocumented

The chain is genuinely well designed:

```
PDFs (gitignored) → scripts/extract_*.py → source/data/*.json (tracked)
  → build_compendia.js → packs/_source/*.json (tracked)
  → compile_packs.js → packs/* LevelDB (gitignored)
```

Tracking the JSON and ignoring the LevelDB is the right call, and
`compile_packs.js` guarding against compiling while Foundry holds the locks is
the kind of thing people only add after being bitten.

Two gaps:

- **It is nowhere described end to end.** The README mentions two of the 22
  scripts and does not explain the stages or their order. A contributor cannot
  work out where to make a content fix — `source/data/`, `packs/_source/`, or the
  extractor.
- **`package.json` exposes none of it.** `npm run build`, `npm run compile`,
  `npm run verify` would make the pipeline usable without reading the scripts.
  The Playwright harness in `scripts/shoot.mjs` is only reachable as `npm run
  shot`, and the two-session verification approach that has caught several real
  bugs exists only as ad-hoc scratch files — promoting one to a checked-in smoke
  test would make it repeatable by someone else.

There are no tests, no linting and no CI. For a system of this size a full test
suite is not the right investment, but a lint pass and one scripted smoke test
would catch most of what has actually gone wrong so far.

---

## One non-architectural flag

`packs/_source/` is 8.8 MB of compendium JSON containing verbatim rules text
from Monte Cook Games books — spell and secret descriptions, foundation special
rules, order philosophies, forte abilities. The PDFs themselves are correctly
gitignored, and the README carries a fan-content disclaimer.

A disclaimer and redistribution are different things, and this is a public
release to a community MCG reads. Worth checking their fan-use / third-party
policy before posting, and deciding whether the packs ship complete, ship as
names and mechanical fields with descriptions left empty, or ship separately for
owners to generate themselves from their own PDFs. The extractors already make
that last option viable, which is a strong position to be in.

Raising it as a question to answer, not a verdict.

---

## The work in order

Cheapest-and-most-important first, hardest-and-least-important last. Effort is
rough and relative, not estimated in hours.

Two axes are being folded into one line here, so where they fight it is called
out: item 20 is the most valuable structural change in the list and sits near
the bottom only because it is the largest. Item 1 has the highest stakes of
anything here and sits at the top only because *checking* is cheap — acting on
the answer might not be.

### Before the post — minutes each, and they matter

| # | Do | Why now | § |
|---|---|---|---|
| 1 | Read MCG's fan-use / third-party policy and decide what the packs ship | Cheap to check, and the answer changes what you release | flag |
| 2 | Add `manifest` and `download` URLs to `system.json` | Without them nobody can install or update from a link — this is the release blocker | 10 |
| 3 | Add a `license` field and a LICENSE file; correct `package.json`'s `"ISC"` | The first thing a cautious reader looks for | 10 |
| 4 | Fix the `checkDepletion` call at `ISUNVislaeSheet.mjs:804` | It throws a TypeError in normal use, from the Magic tab | 6 |
| 5 | Add the `isGM` guard to the `ForteAbility` migration loops | One line; stops every connected client racing to write the same documents | 5 |
| 6 | Fill in `url`, `bugs`, `changelog`; move `@foundryvtt/foundryvtt-cli` to `devDependencies`; stop `npm test` exiting 1 | Small manifest and packaging hygiene | 10 |

### Soon after — an hour or two each

| # | Do | Why | § |
|---|---|---|---|
| 7 | Delete the `/venture` command and its README line | A stub the challenge flow superseded, currently advertised as a feature | 7 |
| 8 | Delete the dead tail of `_prepareVislaeData`, the orphaned JSDoc, the duplicate `House` comment | What makes a codebase read as unfinished to a first-time visitor | 7 |
| 9 | Mark `module/helpers/quirks.mjs` as generated | A direct edit is currently lost silently on the next build | 7 |
| 10 | Remove `old_char_sheet/` (tag it first if you want it kept) | 47 tracked files of a superseded system, with its own `system.json` | 7 |
| 11 | Localise the remaining hardcoded strings | `checkDepletion`'s chat text, "Choose instead", `"Action"`, `` `Used ${item.name}` `` | 8 |
| 12 | Add `npm run build` / `compile` / `verify`, and a pipeline section in the README | The content pipeline is good and currently undiscoverable | 11 |

### The substantive work — half a day to a day each

| # | Do | Why | § |
|---|---|---|---|
| 13 | `migrationVersion` setting, runner in `module/migrations/`, delete the pack stub *and* the unreachable `ForteAbility` loops, batch the writes | Far cheaper before strangers have worlds than after. The GM election landed early, in item 5 | 5 |
| 14 | Move the sheets onto declarative `actions` | Retires a bug class that has cost four incidents, all of them silent | 1 |
| 15 | Make the item bucketing data-driven from `CONFIG.Item.dataModels` | Adding an item type stops being a two-place edit | 2 |

### Worth doing, not urgent — a day or more each

| # | Do | Why | § |
|---|---|---|---|
| 16 | Split `_prepareSheetData` into per-concern methods | Maintainability; no behaviour change | 2 |
| 17 | Declare the dynamic i18n key prefixes and add a checker | Makes dead keys findable and a translation PR reviewable | 8 |
| 18 | Structured degree grants in the schema, populated by the extractor | Do it before a translation exists to break the prose parsing | 4 |
| 19 | A lint pass and one checked-in smoke test | The two-session verification has caught real bugs but only exists as scratch files | 11 |

### The big one — do it deliberately, on its own

| # | Do | Why | § |
|---|---|---|---|
| 20 | Change the models' base class to `TypeDataModel`, verify one model derives, then move `_prepareHealth`, `_prepareStatAllocation`, `_prepareLimits` and `_prepareEconomy` into them | The largest structural improvement available. Low on this list only because it is the largest — and because moving the methods before the base class change fails silently | 3 |

### Last — small returns

| # | Do | Why | § |
|---|---|---|---|
| 21 | Replace the 23 `!important` rules in `sheets.css` with specificity | Makes the system themeable; each rule needs checking by hand | 9 |
| 22 | Split `components.css` along the lines of `module/apps/` | Only matters once there are contributors | 9 |
| 23 | Clear or document the Dependabot advisories | Dev tooling only, reaches no player — but it is what a GitHub visitor sees first | 10 |
| 24 | *Optional:* `ActorRestMixin` / `ActorHealthMixin` | Only if `ISUNActor` still reads long after item 20. A readability choice, not a testability one | 3 |

Items 1–6 are what stands between the current state and a release that works.
Everything from 7 down is about the next year of maintenance being cheaper than
it would otherwise be.
