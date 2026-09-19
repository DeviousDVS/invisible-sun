/**
 * Invisible Sun — moving while Action Mode is running
 *
 * "In Action Mode, a normal character can move to any nearby location as an
 * action. They can move to something close as part of another action" (The
 * Gate, p26). Three things follow, and this enforces all three for players:
 *
 *   You move on your go. The floor is what says it is your go, so a token
 *   whose combatant is not holding it does not move.
 *   Past close costs the action. The move is allowed and the go ends with it.
 *   Past near is not one round's worth. Refused, with the reason said.
 *
 * ── Only players, and only in Action Mode ──
 * A GM moves what they like: they are running the other side, and half of what
 * they move is scenery. Outside Action Mode nobody is counting rounds, so
 * nobody is counting feet either. Both are checked before anything else, so
 * the ordinary case costs one comparison.
 *
 * ── A guard, not a gate ──
 * `preMoveToken` runs on the client doing the moving, which is where every
 * rule in this system is enforced. It stops an honest client from doing what
 * the rules do not allow; it is not a defence against a dishonest one, and
 * nothing in Foundry at this layer is.
 *
 * ── Why the round's total and not this drag's ──
 * "Their entire action to run a short distance" is one budget however many
 * times the mouse is let go. Foundry's movement history holds what has already
 * been walked, and ISUNCombat clears it as each round turns over, so the sum
 * is the round's. See helpers/movement.mjs.
 */
import { judgeMove, totalFor, reach } from "../helpers/movement.mjs";

export class ActionMovement {

  /**
   * Whether this movement may happen, and whether it ends the mover's go.
   *
   * Split out from the hook so the decision can be read on its own: the hook
   * is about saying no, and this is about why.
   *
   * @returns {{allowed: boolean, spends: boolean, reason: string|null}}
   */
  static judge(document, movement, user = game.user) {
    const free = { allowed: true, spends: false, reason: null };

    if (user.isGM) return free;
    const combat = game.combat;
    if (!combat?.started) return free;

    const combatant = combat.combatants.find(c => c.tokenId === document.id);
    if (!combatant) return free;

    /* The floor is what says it is your go. Checked before the distance,
     * because "it is not your turn" is the more useful thing to be told. */
    if (combat.combatant?.id !== combatant.id) {
      return { allowed: false, spends: false, reason: "ISUN.MoveNotYourGo" };
    }

    const units = document.parent?.grid?.units ?? "";
    const verdict = judgeMove(totalFor(movement), units);
    if (verdict === "beyond") {
      return { allowed: false, spends: false, reason: "ISUN.MoveTooFar" };
    }
    return { allowed: true, spends: verdict === "spends", reason: null };
  }

  /* ──────────────────────────────────────────────
   * The hooks
   * ────────────────────────────────────────────── */

  static listen() {
    /* Refusals. Returning false here stops the movement outright. */
    Hooks.on("preMoveToken", (document, movement) => {
      const { allowed, reason } = this.judge(document, movement);
      if (allowed) return true;

      const units = document.parent?.grid?.units ?? "";
      ui.notifications?.warn(game.i18n.format(reason, {
        name: document.name,
        most: reach(units).most,
        units: units || "ft"
      }));
      return false;
    });

    /* And the cost, once the move has actually happened. Done here rather than
     * in the refusal hook because ending somebody's go is a consequence of a
     * move that took place, and a movement rejected further down the chain
     * would otherwise have cost them their action for nothing. */
    Hooks.on("moveToken", async (document, movement) => {
      const { allowed, spends } = this.judge(document, movement);
      if (!allowed || !spends) return;

      const combat = game.combat;
      const combatant = combat?.combatants.find(c => c.tokenId === document.id);
      if (!combatant || combat.combatant?.id !== combatant.id) return;

      await combat.finishTurn(combatant.id);
      ui.notifications?.info(game.i18n.format("ISUN.MoveSpentAction", { name: document.name }));
    });
  }
}
