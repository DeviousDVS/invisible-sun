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
2. ROLLED     player skills · bene · sortilege → spend → dice
```

Each step is a button on one chat card. The card is the record: the
declaration, what was claimed and what was rolled all stay visible, which
matters because a GM saying "this costs you 2 vex" is a ruling the table should
see.

### The two beats this used to have in the middle

The first build ran five states: the player *proposed* a venture, the GM
*approved* it, and only then did the player roll. Test play cut them.

The argument for approval was that "two skills may both apply when the
situation warrants it" needs adjudicating, and that a claim ought to be visible
before it becomes dice. Both are true and neither needs a button. A table is
two people who can talk; asking the GM to click Approve on a claim they just
heard out loud is ceremony charged against every roll of the session to buy
something the conversation already provided.

What went with them is worth naming, so it can come back if play misses it:

- there is no point at which the GM sees a claim and can refuse it, so a
  disputed venture is settled by talking and re-declaring;
- the card shows the working after the roll rather than before it.

The rest survived the cut intact. Nothing about which pool pays, what a scourge
costs or how vex is bounded depended on the approval step.

## The three kinds of modifier are not alike

Keeping them distinct is most of the interface design.

| | Who decides | When | Player may change it |
|---|---|---|---|
| Scourge | Nobody | Automatic on the declared pool | No |
| Vex | GM | Declared as a maximum | No |
| Skills, bene, sortilege | Player | Step 2, in the answer dialog | Yes |

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

## Which pool pays

The declared pool decides this, and the rule reads the opposite way round from
the obvious guess. A bene is not spent *from a pool relevant to the action* —
it belongs to a pool and reaches the actions that pool covers:

> A bene token can be used with any action relevant **to that pool**.
> (The Key, p1902)

So a declaration of Accuracy puts only Accuracy bene on the table. Interaction
bene cannot pay for it.

Sortilege is the exception, in the same passage: its value is measured in
enhancements rather than bene, and "these enhancements can be used with **any**
action". Sortilege is therefore always offered, whatever pool was declared.

Magic can also put enhancements in other pools, and those follow the bene rule
rather than the Sortilege one — "used only with the pool that they are in".

**This last case has nowhere to live yet.** `pool()` in `_fields.mjs` carries
one `value`, which is bene for every pool but Sortilege and enhancements for
Sortilege; `VentureDialog` splits them with `isEnhancement: key === "sortilege"`.
An enhancement granted into Accuracy cannot be recorded at all. Not needed for
this flow to work, but it is the reason the response step should ask a pool for
its bene and its enhancements separately rather than assuming which it holds.

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
    [actorId]: {                   // id, not UUID: a dot in a flag key becomes
      state:    "pending" | "rolled",   // a nested path, so the key never exists
      skills:   [itemId, ...],
      bene:     2,                 // from the declared pool, spent at the roll
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

**Nothing is spent before the roll.** The answer dialog decides nothing: it
hands back what the player chose, and the spend, the roll and the card write
happen together. Dismissing it costs the character nothing, and there is no
window in which a pool is short but the card cannot say why.

**What is spent is re-read at the moment of spending.** The dialog can sit open
across a rest, another action or a fresh Wound. Bene and Sortilege are clamped
against the pools as they stand, and scourge and vex are recomputed rather than
carried from the dialog, so a roll can never claim what the character no longer
has.

**The card must be writable before anything is charged.** A player's write is
relayed through a GM client, so with no GM connected the pool would be debited
and the dice thrown against a card that records neither. Refuse while it is
still free to refuse.

**A row's button outlives the click.** The card only re-renders once the roll is
recorded, so the same button is live throughout — an in-flight guard keys the
answer by message and actor, or a double-click spends the pool twice.

**Permissions are enforced where the update happens.** Only a targeted player
may answer; only the GM may declare or cancel. Hiding a button only stops it
being offered — the check has to sit in the handler, as `_onModifyVex` already
does.

**Cards get abandoned.** A player logs off, the scene moves on, the GM changes
their mind. Cancel is needed, and probably a stale state, or chat fills with
half-finished challenges.

## If approval is ever wanted back

Not as a state. A per-challenge flag on the declaration — *this one needs
sign-off* — would keep the ceremony where it earns its keep and leave routine
rolls at two beats. Adding it back as a state everything passes through is the
mistake this note already records making once.

## Build order

1. The card's data shape and its renderer, states inert. ✓
2. Step 1 — the GM's declaration dialog. ✓
3. Step 2 — the player's answer, reusing `VentureDialog`'s body: it already
   does skills, bene, sortilege and a live target preview that clamps
   overspending. It becomes a responder rather than a self-service window. ✓
4. The spend and the roll, at the moment the answer is given. ✓
5. Scourge and vex into the venture — small, once the pool is known. ✓
6. Cancel and stale. The result card wants a pass of its own.

## Open questions

- **Does a defence declaration differ from an action declaration?** Mechanically
  it should not, but the label and the framing matter for play, and the card may
  want to say which it is.
- **Depletion.** Casting checks depletion after resolution. The card needs to
  carry enough about the source to run that, or hand back to whatever opened it.
