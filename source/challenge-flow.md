# Challenge flow — design note

One path for resolving every action in the game: the GM declares a challenge,
the player answers it, the roll happens. Combat included, with no structural
change.

## Why this shape

The rules already work this way, and the deciding fact is short:

> **Only the players roll dice in Invisible Sun.** When a character acts, the
> player rolls dice for the action. When an NPC acts against a PC, the player
> rolls to defend. (The Gate, p1240)

So every roll in the game begins with a GM adjudication. Making the GM the
entry point is not a constraint imposed on play — it is the shape of play. And
because an NPC acting against a PC is *still* a GM declaration and a player
roll, combat needs no second mechanism: a defence is the same card with a
different label.

The GM determines the challenge (The Gate, p4016); the player subtracts venture
from it to get the number they need.

## What it fixes

Two things are modelled but unreachable today, and both are the same gap:
nothing knows which pool an action draws on.

- **Scourge** is derived correctly per pool in `ISUNActor._prepareHealth` and
  never read at roll time, so a wounded character currently rolls exactly as
  well as a healthy one.
- **Vex** can be placed by a GM and never spent, because a vex is spent against
  an action and nothing connects the two.

Declaring the pool answers both at the only moment where the answer is
naturally known.

It also removes a workstream: we had planned to tag all 61 skills with a pool
so a dialog could infer one. If the GM declares it, there is nothing to infer —
and nothing to get wrong for skills like Deception, which legitimately span
Interaction and Intellect.

## The flow

```
1. DECLARED   GM     pool · challenge rating · label · max vex · target(s)
2. PROPOSED   player skills · bene · sortilege        → venture published
3. APPROVED   GM     (skippable, see auto-approve)
4. ROLLED     player
5. RESOLVED
```

Each step is a button on one chat card. The card is the record: the
declaration, what was claimed, what was approved and what was rolled all stay
visible, which matters because a GM saying "this costs you 2 vex" is a ruling
the table should see.

## The three kinds of modifier are not alike

Keeping them distinct is most of the interface design.

| | Who decides | When | Player may change it |
|---|---|---|---|
| Scourge | Nobody | Automatic on the declared pool | No |
| Vex | GM | Declared as a maximum | No |
| Skills, bene, sortilege | Player | Step 2 | Yes |

**Scourge** applies because the pool was named. "You don't 'spend' a scourge.
You have to get rid of it somehow" (The Key, p2242). It is `scourgeTotal` for
the declared pool, which already sums all four scopes — pool, group, all-pools,
and one per Wound or Anguish.

**Vex** is `min(declaredMax, held in that pool)`. The GM nominates a ceiling;
what actually applies is bounded by what the character has. A player cannot
decline it — if the GM sets 2 and the pool holds 2, two apply. Unlike a
scourge a vex is consumed, so the pool's count drops when the roll is made.

**Bene cancels vex without any special case.** A bene adds 1 to the venture and
a vex subtracts 1, so spending both nets zero (The Key, p2233) — the arithmetic
already says it. The player's real choice is whether to spend bene offsetting a
vex or save it.

## Venture

```
venture = Σ skill levels
        + bene spent
        − vex applied
        − scourgeTotal(declared pool)
        + circumstance modifier

target  = challenge − venture          (auto-success at ≤ 0)
dice    = 1 + sortilege enhancements + magic dice
```

Sortilege buys dice rather than venture, which `VentureDialog` already models.

## The card's data

One declaration may target several characters, each answering independently, so
responses are a map rather than a single value. Building it that way from the
start avoids retrofitting multi-target onto a single-target v1.

```js
flags["invisible-sun"].challenge = {
  state:     "open" | "closed",
  pool:      "accuracy",          // group derived from the name, as elsewhere
  challenge: 5,
  label:     "Force the door",
  maxVex:    2,
  targets:   [actorUuid, ...],
  responses: {
    [actorUuid]: {
      state:    "pending" | "proposed" | "approved" | "rolled" | "declined",
      skills:   [itemId, ...],
      bene:     { accuracy: 2 },   // by pool, spent at step 4
      sortilege: 1,
      vex:      2,                 // computed, not chosen
      scourge:  1,                 // computed
      venture:  3,
      message:  rollMessageId
    }
  }
}
```

## Rules the implementation has to hold

**Nothing is spent before the roll.** `VentureDialog` deducts bene when it
rolls, which is right there because the dialog *is* the roll. Here the player
proposes at step 2 and may be refused at step 3, so deducting on proposal would
need refunding. Deduct at step 4 and the problem cannot arise. Same for vex.

**Permissions are enforced where the update happens.** Only a targeted player
may propose or roll; only the GM may declare, approve or cancel. Hiding a
button only stops it being offered — the check has to sit in the handler, as
`_onModifyVex` already does.

**Cards get abandoned.** A player logs off, the scene moves on, the GM changes
their mind. Cancel is needed, and probably a stale state, or chat fills with
half-finished challenges.

## Auto-approve

Four interactions per roll is right for a significant action and heavy for a
routine one. Step 3 is the one to watch.

A GM setting for auto-approve keeps the ceremony where it earns its keep: the
venture still publishes, so the table sees what was claimed, but the player may
roll straight away unless this particular challenge was flagged as needing
sign-off. Approval is what makes "two skills may both apply when the situation
warrants it" workable without pre-authorising anything, so it should stay
available per-challenge even when off by default.

## Build order

1. The card's data shape and its renderer, states inert.
2. Step 1 — the GM's declaration dialog.
3. Step 2 — the player's response, reusing `VentureDialog`'s body: it already
   does skills, bene, sortilege and a live target preview that clamps
   overspending. It becomes a responder rather than a self-service window.
4. Steps 3 and 4, and the spend at roll time.
5. Scourge and vex into the venture — small, once the pool is known.
6. Auto-approve, cancel, stale.

## Open questions

- **Which pools may bene come from?** The rules say a bene is spent "from a
  pool relevant to the action" (The Key, p1902). `VentureDialog` currently
  offers every pool. Declaring the pool arguably tightens this to the declared
  one — an Accuracy action probably should not be paid for with Interaction
  bene. Worth settling before step 3, as it changes the response UI.
- **Does a defence declaration differ from an action declaration?** Mechanically
  it should not, but the label and the framing matter for play, and the card may
  want to say which it is.
- **Depletion.** Casting checks depletion after resolution. The card needs to
  carry enough about the source to run that, or hand back to whatever opened it.
