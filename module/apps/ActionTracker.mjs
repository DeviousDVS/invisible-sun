/**
 * Invisible Sun — the Action Mode tracker
 *
 * Core's tracker is a running order: a column of combatants sorted by a number
 * each of them rolled, with the one whose turn it is highlighted and a button
 * to end that turn. None of that exists here. What this shows instead is a
 * round as a checklist — who is still due an action, who has taken theirs, and
 * who is holding the floor while they take it.
 *
 * Only two of core's three parts are replaced. The header stays as it is: the
 * encounter cycling, the round number and the settings are all still right, and
 * reimplementing them to change nothing would be a copy to keep in step. Its
 * two bulk-roll buttons are the one thing that does not belong, and they are
 * hidden in the stylesheet rather than here.
 *
 * ── Where the rules are ──
 * Nowhere in this file. Whether somebody may take the floor, whether the round
 * is over, which order the list reads in — all of it is on ISUNCombat, and
 * under that in helpers/action-round.mjs where it can be tested without a
 * browser. This decides what a row looks like and what a click calls.
 */
import { PLAYERS, OPPOSITION } from "../helpers/action-round.mjs";

const { CombatTracker } = foundry.applications.sidebar.tabs;

export class ActionTracker extends CombatTracker {

  static DEFAULT_OPTIONS = {
    classes: ["invisible-sun", "isun-action-tracker"],
    actions: {
      "take-floor":   ActionTracker.#onTakeFloor,
      "finish-turn":  ActionTracker.#onFinishTurn,
      "release-floor": ActionTracker.#onReleaseFloor,
      "toggle-acted": ActionTracker.#onToggleActed
    }
  };

  /* The header is core's, unchanged. The other two are ours. */
  static PARTS = {
    header: { template: "templates/sidebar/tabs/combat/header.hbs" },
    tracker: {
      template: "systems/invisible-sun/templates/combat/tracker.hbs",
      scrollable: [""]
    },
    footer: { template: "systems/invisible-sun/templates/combat/footer.hbs" }
  };

  /* ──────────────────────────────────────────────
   * What a row knows about itself
   * ────────────────────────────────────────────── */

  /** @inheritDoc */
  async _prepareTurnContext(combat, combatant, index) {
    const turn = await super._prepareTurnContext(combat, combatant, index);

    /* Who may work this row: its owner, or the GM. A player acts for their own
     * character and nobody else's, which is the same rule the challenge card
     * answers a challenge by. */
    const mine = game.user.isGM || combatant.isOwner;

    turn.side = combat.rows.find(r => r.id === combatant.id)?.side ?? OPPOSITION;
    turn.acted = combat.hasActed(combatant);
    turn.hasFloor = combat.combatant?.id === combatant.id;
    turn.canTake = mine && !combat.combatant && combat.canAct(combatant);
    turn.canFinish = mine && turn.hasFloor;
    /* Ticking a row by hand is the GM's: it is how an action that happened away
     * from the tracker gets recorded, and how a mis-click is undone. */
    turn.canTick = game.user.isGM && combat.started;
    return turn;
  }

  /** @inheritDoc */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    const combat = this.viewed;
    if (!combat) return;

    /* Two sections, because "the players' response is always the first thing
     * that happens in the round" — which needs no enforcing, but does want the
     * list to read the right way round. A side with nobody on it is not shown:
     * an empty heading says less than no heading. */
    const turns = context.turns ?? [];
    context.sides = [
      { key: PLAYERS, label: "ISUN.ActionSidePlayers" },
      { key: OPPOSITION, label: "ISUN.ActionSideOpposition" }
    ].map(side => ({ ...side, turns: turns.filter(t => t.side === side.key) }))
      .filter(side => side.turns.length);

    Object.assign(context, this.#roundContext(combat));
  }

  /** @inheritDoc */
  async _prepareCombatContext(context, options) {
    await super._prepareCombatContext(context, options);
    if (this.viewed) Object.assign(context, this.#roundContext(this.viewed));
  }

  /**
   * Where the round has got to, in one line.
   *
   * The line is the whole point of the panel: a GM glancing at the tracker
   * wants to know whether they are waiting on somebody, and if so whether that
   * somebody is mid-sentence or has not started.
   */
  #roundContext(combat) {
    const holder = combat.combatant;
    const tally = combat.tally;
    const complete = combat.roundComplete;

    let state = null;
    if (!combat.started) state = null;
    else if (holder) state = game.i18n.format("ISUN.ActionHolding", { name: holder.name });
    else if (complete) state = game.i18n.localize("ISUN.ActionRoundOver");
    else state = game.i18n.localize("ISUN.ActionWhoActs");

    return { tally, roundComplete: complete, isunState: state, started: combat.started };
  }

  /* ──────────────────────────────────────────────
   * Clicks
   * ────────────────────────────────────────────── */

  /** The combatant a control belongs to. */
  #combatantId(target) {
    return target.closest("[data-combatant-id]")?.dataset.combatantId ?? null;
  }

  static async #onTakeFloor(event, target) {
    event.stopPropagation();
    const id = this.#combatantId(target);
    if (id) await this.viewed?.takeFloor(id);
  }

  static async #onFinishTurn(event, target) {
    event.stopPropagation();
    const id = this.#combatantId(target);
    if (id) await this.viewed?.finishTurn(id);
  }

  static async #onReleaseFloor(event) {
    event.stopPropagation();
    await this.viewed?.releaseFloor();
  }

  static async #onToggleActed(event, target) {
    event.stopPropagation();
    const combat = this.viewed;
    const id = this.#combatantId(target);
    if (!combat || !id) return;
    const combatant = combat.combatants.get(id);
    if (combat.hasActed(combatant)) await combat.clearActed(id);
    else await combat.markActed(id);
  }
}
