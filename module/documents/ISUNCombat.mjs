/**
 * Invisible Sun — Action Mode
 *
 * "Unlike many RPGs, you don't roll dice to determine who goes first." There is
 * no initiative, no turn order, and nothing that says who is next. The GM
 * presents the situation and asks "what do you do?", everyone acts once, and
 * the round is over when everyone has.
 *
 * So what this document tracks is a checklist and a **floor** — narrative
 * control, held by at most one combatant at a time and free between actions.
 * Anyone who has not acted may take it while it is free; the one holding it
 * gives it up when they are done; the GM may take it back. It is not
 * permission to act, and nothing here refuses an action for want of it.
 *
 * The rules themselves are in helpers/action-round.mjs, where they can be read
 * and tested without Foundry. This is the part that has to know about documents.
 *
 * ── Where the two facts are stored, and why ──
 * Both are decided by what a player is allowed to write, which is narrower than
 * it looks:
 *
 *   The floor is `combat.turn`. BaseCombat lets a non-GM update exactly four
 *   fields — `_id`, `round`, `turn`, `combatants` — and a flag is not among
 *   them, so a floor kept in a flag could only ever be claimed through a GM
 *   relay. `turn` is also the field the rest of Foundry reads: `combat.combatant`
 *   resolves through it, and a token's turn marker draws on
 *   `game.combat?.combatant?.tokenId`, so the floor marks itself on the canvas
 *   without anything here asking it to.
 *
 *   Having acted is a flag on the Combatant. BaseCombatant lets an owner write
 *   `flags`, so a player ticks their own row without a round trip, and the
 *   value is the round it happened in rather than a tick — see `hasActed`.
 *
 * ── The one cost of `turn` being an index ──
 * A combatant added mid-round re-sorts the list, and the slot the floor was in
 * belongs to somebody else afterwards. `setupTurns` therefore holds the floor
 * by *identity*: it remembers which combatant had it and finds them again. See
 * the note there.
 */
import { sideOf, canAct, hasActed, tally, roundComplete, byReadingOrder }
  from "../helpers/action-round.mjs";

const SCOPE = "invisible-sun";

/** Flags on a Combatant: the round it acted in, and which side it is on. */
const ACTED = "actedIn";
const SIDE = "side";

/**
 * A combatant as the rules see it.
 *
 * Module level rather than a method because `_sortCombatants` is handed to
 * `Array#sort` unbound and has no `this` to reach a method through.
 */
function rowOf(combatant) {
  return {
    id: combatant.id,
    name: combatant.name ?? "",
    side: sideOf(combatant.actor?.type, combatant.getFlag(SCOPE, SIDE)),
    hidden: !!combatant.hidden,
    defeated: !!combatant.isDefeated,
    actedIn: combatant.getFlag(SCOPE, ACTED) ?? null
  };
}

export class ISUNCombat extends Combat {

  /* ──────────────────────────────────────────────
   * Reading
   * ────────────────────────────────────────────── */

  /** Every combatant as a row, in the order the list reads. */
  get rows() {
    return this.turns.map(rowOf);
  }

  /** How far through the round the table is: `{done, total}`. */
  get tally() {
    return tally(this.rows, this.round);
  }

  /** Has everyone who is due an action taken it? */
  get roundComplete() {
    return roundComplete(this.rows, this.round);
  }

  /** Whether this combatant has acted in the round happening now. */
  hasActed(combatant) {
    return combatant ? hasActed(rowOf(combatant), this.round) : false;
  }

  /** Whether this combatant could still act this round. */
  canAct(combatant) {
    return combatant ? canAct(rowOf(combatant), this.round) : false;
  }

  /* ──────────────────────────────────────────────
   * The floor
   * ────────────────────────────────────────────── */

  /**
   * Take the floor, if it is free and this one can still act.
   *
   * Refused rather than queued when somebody already holds it: they are
   * mid-sentence, and the GM's way of moving it is `release` first, which is a
   * separate act and reads as one at the table.
   */
  async takeFloor(combatantId) {
    if (this.combatant) return this;
    const at = this.turns.findIndex(c => c.id === combatantId);
    if (at === -1 || !this.canAct(this.turns[at])) return this;
    return this.update({ turn: at });
  }

  /** Give the floor up, or take it back. Nobody holds it afterwards. */
  async releaseFloor() {
    if (!this.combatant) return this;
    return this.update({ turn: null });
  }

  /**
   * Done: this one has acted, and the floor is free again.
   *
   * The two together because they are one thing at the table — "that's my go" —
   * and a tracker that made them two buttons would collect rounds that never
   * ended because somebody ticked and kept the floor.
   */
  async finishTurn(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return this;
    await this.markActed(combatantId);
    if (this.combatant?.id === combatantId) await this.releaseFloor();
    return this;
  }

  /* ──────────────────────────────────────────────
   * Having acted
   * ────────────────────────────────────────────── */

  /** Record that this one acted in the round happening now. */
  async markActed(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant || !this.started) return this;
    await combatant.setFlag(SCOPE, ACTED, this.round);
    return this;
  }

  /** Undo that, for a GM who ticked the wrong row. */
  async clearActed(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return this;
    await combatant.unsetFlag(SCOPE, ACTED);
    return this;
  }

  /* ──────────────────────────────────────────────
   * The order the list reads in
   * ────────────────────────────────────────────── */

  /** @override */
  _sortCombatants(a, b) {
    return byReadingOrder(rowOf(a), rowOf(b));
  }

  /**
   * Sort the combatants, and find the floor again.
   *
   * Written out rather than calling super, for two reasons. Core holds the turn
   * as a slot and repairs an out-of-range one by resetting it to zero *and
   * incrementing the round* — which, when the combatant holding the floor is
   * deleted, silently advances the round on every client that noticed. And the
   * repair wanted here is the other one: the floor belongs to a combatant, not
   * to a position, so when a token dropped into the fight re-sorts the list the
   * floor has to follow the person holding it.
   *
   * `this.current.combatantId` is what core maintains for exactly this — who
   * held it before this sort. On a client that has only just loaded there is no
   * such record yet, and the stored slot is read instead, which is correct
   * because nothing has re-sorted since it was written.
   */
  setupTurns() {
    const turns = this.turns = this.combatants.contents.sort(this._sortCombatants);
    turns.forEach((c, i) => { c.turnNumber = i; });

    const held = this.current?.combatantId ?? turns[this.turn ?? -1]?.id ?? null;
    const at = held ? turns.findIndex(c => c.id === held) : -1;
    this.turn = at === -1 ? null : at;

    this.current = this._getCurrentState(turns[at]);
    this.previous ??= this.current;
    return turns;
  }

  /**
   * Write the repair back, so a client loading later reads the same floor.
   *
   * `setupTurns` corrects the slot on every client that is here to see the list
   * change, which is everyone at the table. What it cannot do is correct the
   * stored value — it runs during data preparation, which is no place to write
   * a document. So the moment the list actually changes, one GM persists it.
   */
  #persistFloor() {
    if (!game.user.isActiveGM) return;
    this.setupTurns();
    if (this._source.turn === this.turn) return;
    this.update({ turn: this.turn }, { turnEvents: false });
  }

  /** @inheritDoc */
  _onCreateDescendantDocuments(...args) {
    super._onCreateDescendantDocuments(...args);
    this.#persistFloor();
  }

  /** @inheritDoc */
  _onDeleteDescendantDocuments(...args) {
    super._onDeleteDescendantDocuments(...args);
    this.#persistFloor();
  }

  /* ──────────────────────────────────────────────
   * Rounds
   * ────────────────────────────────────────────── */

  /** A new round is the table moving on, which is the GM's to say. */
  _canChangeRound(user) {
    return user.isGM;
  }

  /**
   * Begin, with the floor free.
   *
   * Core opens on turn zero, which would hand the floor to whoever sorts first
   * before anyone has said anything. The round opens with the GM describing the
   * situation, and nobody holding it is the honest state for that.
   */
  async startCombat() {
    this._playCombatSound("startEncounter");
    const updateData = { round: 1, turn: null };
    Hooks.callAll("combatStart", this, updateData);
    await this.update(updateData);
    await this.#resetMovement();
    return this;
  }

  /** @override */
  async nextRound() {
    return this.#changeRound(this.round + 1, 1);
  }

  /** @override */
  async previousRound() {
    if (this.round === 0) return this;
    return this.#changeRound(this.round - 1, -1);
  }

  /**
   * Move to a round, with the floor free.
   *
   * Nothing is cleared on the way: what a combatant has done is stamped with
   * the round it happened in, so stepping forward leaves everyone un-acted and
   * stepping back finds them exactly as they were. A GM who presses next by
   * mistake presses previous and has lost nothing.
   *
   * No time passes. A round is "roughly 5 to 10 seconds", which is an abstract
   * for imagining what an action could be rather than a quantity the fiction
   * keeps a total of, so there is no world-time delta to apply.
   */
  async #changeRound(round, direction) {
    const updateData = { round, turn: null };
    const updateOptions = { direction };
    Hooks.callAll("combatRound", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    await this.#resetMovement();
    return this;
  }

  /**
   * Forget how far everyone has walked.
   *
   * "A character can use their entire action to run a short distance" is one
   * budget per round, and Foundry's movement history is what apps/ActionMovement
   * measures it against — so the round turning over has to empty it, or the
   * second round's first step is refused for distance covered in the first.
   *
   * One GM does it, because it writes every token in the fight.
   */
  async #resetMovement() {
    if (!game.user.isActiveGM) return;
    /* Only the ones that resolve to a token. Core throws on a combatant from
     * another combat and quietly does nothing for one with no token to find —
     * and a combatant with no token cannot have walked anywhere, so there is
     * nothing of theirs to forget. */
    const walked = this.combatants.filter(c => c.token);
    if (walked.length) await this.clearMovementHistories(walked);
  }

  /* There are no turns to step through. Left as no-ops rather than deleted
   * because a macro or a module may call them, and quietly doing nothing is
   * better than an error about a method that used to exist. */

  /** @override */
  async nextTurn() { return this; }

  /** @override */
  async previousTurn() { return this; }

  /* ──────────────────────────────────────────────
   * No initiative
   * ────────────────────────────────────────────── */

  /* "You don't roll dice to determine who goes first" (and in this system only
   * players roll at all). Nothing is written, so a combatant's initiative stays
   * null and the tracker has nothing to print. */

  /** @override */
  async rollInitiative() { return this; }

  /** @override */
  async rollAll() { return this; }

  /** @override */
  async rollNPC() { return this; }

  /* ──────────────────────────────────────────────
   * What may be written
   * ────────────────────────────────────────────── */

  /**
   * Who may move the floor.
   *
   * A guard rather than a gate: `_preUpdate` runs on the client asking, so this
   * is where an honest client is stopped from doing something the rules do not
   * allow, and the tracker is what stops it being offered in the first place.
   * The GM is not bound by it — taking the floor back from somebody is theirs
   * to do, and so is handing it to anyone.
   */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    if (!("turn" in changed) || user.isGM) return;

    const held = this.combatant;

    // Giving it up: only the one holding it may.
    if (changed.turn === null) {
      return held?.testUserPermission(user, "OWNER") ? undefined : false;
    }

    // Taking it: only while it is free, only for someone you own, and only if
    // they have an action left.
    if (held) return false;
    const wanted = this.turns[changed.turn];
    if (!wanted?.testUserPermission(user, "OWNER")) return false;
    if (!this.canAct(wanted)) return false;
    return undefined;
  }

  /* ──────────────────────────────────────────────
   * Round events
   * ────────────────────────────────────────────── */

  /**
   * Fire the round events, and nothing else.
   *
   * Core walks the turns between the previous state and the current one to work
   * out what to fire. With no turns to walk that walk is nonsense — a null slot
   * reads as slot one, and every combatant gets a start and an end of a turn
   * they never had — so the round change is read directly instead.
   *
   * There is nothing here for turns to do: the floor moving is not a turn
   * beginning, it is somebody starting to talk.
   */
  async _manageTurnEvents() {
    if (!this.started) return;
    const { current, previous } = this;

    if (current.round !== previous.round) {
      if (game.user.isActiveGM) {
        if (previous.round > 0) await this._onEndRound({ round: previous.round });
        await this._onStartRound({ round: current.round });
      }
    }

    Hooks.callAll("combatTurnChange", this, previous, current);
  }

  /* The seam the rest of the system hangs off. Both are announced rather than
   * acted on here: 168 entries across the packs check their depletion each
   * round, and the board that tracks those is an application — which this
   * cannot reach, and should not. */

  /** @override */
  async _onStartRound(context) {
    Hooks.callAll("isunRoundStart", this, context);
  }

  /** @override */
  async _onEndRound(context) {
    Hooks.callAll("isunRoundEnd", this, context);
  }
}
