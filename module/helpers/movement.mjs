/**
 * Invisible Sun — how far a character may go in a round
 *
 * "In Action Mode, a normal character can move to any nearby location as an
 * action. They can move to something close as part of another action. So, for
 * example, a character can use their entire action to run a short distance or
 * they can move a close distance and cast a spell" (The Gate, p26).
 *
 * Three outcomes, and they are the same three distances the range overlay
 * draws — close, near, and further than either:
 *
 *   free      up to close. The move is part of whatever else you do, and you
 *             still have your action.
 *   spends    past close and up to near. The move *is* the action, so taking it
 *             ends your go.
 *   beyond    past near. Not a thing one round holds; it takes another.
 *
 * ── Measured across the round, not the drag ──
 * "Their entire action to run a short distance" is one budget, however many
 * times a player lets go of the mouse. Three ten-foot steps is a near move and
 * costs the action, and a rule counting each drag on its own would let it be
 * three free ones.
 *
 * The distances come from `helpers/ranges.mjs`, which reads the same table the
 * canvas rings are drawn from — the bands a GM sees and the bands the rule
 * enforces cannot be allowed to disagree.
 */
import { bands } from "./ranges.mjs";

/**
 * What a round allows, in the scene's own units.
 *
 * @returns {{free: number, most: number}} the close and near distances
 */
export function reach(units) {
  const [close, near] = bands(units);
  return { free: close?.distance ?? 0, most: near?.distance ?? 0 };
}

/**
 * What moving this far, in total, this round, costs.
 *
 * Boundaries belong to the band that names them, the way they do everywhere
 * else in the books: "a distance of 10 to 50 feet" makes exactly 10 close and
 * exactly 50 near. So a ten-foot step is free and a fifty-foot run is the whole
 * action rather than being refused for overshooting by nothing.
 *
 * @returns {"free"|"spends"|"beyond"}
 */
export function judgeMove(distance, units) {
  const away = Number(distance);
  const { free, most } = reach(units);
  if (!Number.isFinite(away) || away <= free) return "free";
  return away <= most ? "spends" : "beyond";
}

/**
 * How far this movement takes the token in total this round.
 *
 * What has already been recorded plus what this move adds. Foundry measures
 * both for us; this only says which parts count, and the answer is all of
 * them — a path already walked and a path about to be are the same distance to
 * a character who has to cover it.
 */
export function totalFor(movement) {
  const already = Number(movement?.history?.distance) || 0;
  const passed = Number(movement?.passed?.distance) || 0;
  const pending = Number(movement?.pending?.distance) || 0;
  return already + passed + pending;
}
