/**
 * Invisible Sun — a round is a checklist, not a running order
 *
 * "Unlike many RPGs, you don't roll dice to determine who goes first. The GM
 * simply presents the situation and asks the players, 'What do you do?'"
 * Everyone acts once, in whatever order the table arrives at, and the round is
 * over when everyone has. There is no initiative, no turn order, and nothing
 * that decides who is next.
 *
 * What there is instead is **the floor**: at most one combatant holds it at a
 * time, and it is free between actions. Anyone who has not acted takes it when
 * they have something to do, gives it up when they are done, and the GM may
 * take it back from whoever is holding it. That is narrative control, not
 * permission to act — the rules do not gate an action behind it — so nothing
 * here refuses anything. It answers questions and changes nothing; writing the
 * answers back belongs to the Combat document.
 *
 * ── Why a round number and not a tick ──
 * "Has acted" is stored as the round it happened in rather than as a boolean.
 * Nothing then has to be cleared when the round turns over, which is the sweep
 * that a boolean needs and that gets missed. It also makes stepping backwards
 * free: a GM who advances the round by accident presses previous, and every
 * stamp reading 5 is once again the record of a round 5 that is happening now.
 * A boolean cleared on the way forward could not be put back.
 *
 * ── Rows, not documents ──
 * Everything here takes plain objects of the shape
 *
 *     { id, name, side, hidden, defeated, actedIn }
 *
 * so that the whole of it can be read, and tested, without Foundry. The Combat
 * document builds them from its combatants.
 */

/** The two sides of the table. A row belongs to one of them. */
export const PLAYERS = "players";
export const OPPOSITION = "opposition";

const SIDES = new Set([PLAYERS, OPPOSITION]);

/**
 * Which side of the table an actor sits on.
 *
 * Derived from the type, and overridable, because the derivation is only a good
 * guess: an NPC ally fighting alongside the party is run by whoever the GM
 * hands them to, and the books have no opinion about it. The override is what a
 * GM sets on the combatant when the guess is wrong.
 *
 * The mapping is two entries and lives here rather than in the config tables,
 * because a side is a thing the action tracker needs and nothing else in the
 * system has a use for.
 */
export function sideOf(actorType, override) {
  if (SIDES.has(override)) return override;
  return actorType === "Vislae" ? PLAYERS : OPPOSITION;
}

/**
 * Has this one acted in the round that is happening now?
 *
 * Equality rather than "at least", so that a stamp left over from a round the
 * table has stepped back out of does not count. Round 0 is an encounter that
 * has not started, and nobody has acted in it.
 */
export function hasActed(row, round) {
  const at = row?.actedIn;
  return Number.isInteger(at) && at >= 1 && at === round;
}

/**
 * Could this one still act this round?
 *
 * "Everyone (both PCs and NPCs) gets to take exactly one action per round", so
 * having acted is the whole of it, bar being out of the fight. Hidden is not a
 * bar: a creature the players have not seen yet still acts, and the GM still
 * narrates it.
 */
export function canAct(row, round) {
  return !!row && !row.defeated && !hasActed(row, round);
}

/**
 * Could this one take the floor?
 *
 * Only while it is free. A player may not take it from another player — the
 * one holding it is mid-sentence — and the GM's way of moving it is to take it
 * back first, which is a separate act and reads as one at the table.
 */
export function canTakeFloor(row, round, floor) {
  return !floor && canAct(row, round);
}

/**
 * Does this one count towards "has everyone acted yet"?
 *
 * Two exclusions, for two different reasons.
 *
 * Defeated: "defeated combatants stay in the list but don't get an action", so
 * a round cannot be waiting on one. They stay listed because a body on the
 * floor is still a thing in the scene, and because being brought round mid-
 * round should hand the action back rather than have to be typed in again.
 *
 * Hidden: a combatant the players cannot see is not in their tally, and the
 * alternative is worse than the bookkeeping it saves — players reading "3 of 4"
 * against a GM reading "4 of 5" and nobody able to say why the round will not
 * end. Excluded for the GM too, so that both are looking at the same number.
 * What the unrevealed creature does is the GM's to remember, which it was
 * going to be regardless.
 */
export function counted(row) {
  return !!row && !row.hidden && !row.defeated;
}

/** How far through the round the table is, over the rows that count. */
export function tally(rows = [], round = 0) {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    if (!counted(row)) continue;
    total++;
    if (hasActed(row, round)) done++;
  }
  return { done, total };
}

/**
 * Is the round over?
 *
 * "Once every participant has acted, the round is over, and a new round
 * begins." A round with nobody in it to act is not over — it has not started —
 * so an empty tally is false rather than vacuously true. That is the state a
 * fight reaches when the last one standing is defeated, and what should happen
 * then is Action Mode ending, not another round beginning.
 */
export function roundComplete(rows = [], round = 0) {
  const { done, total } = tally(rows, round);
  return total > 0 && done === total;
}

/**
 * The reading order of the list: the players, then what they are facing.
 *
 * "The players' response is always the first thing that happens in the round",
 * which needs no enforcing — the GM asks and a player answers — but it does
 * want the list to read the right way round. Within a side, by name, because
 * there is no other order and a list that reshuffled itself as people acted
 * would be unreadable. Id last, so the sort is total and two creatures out of
 * the same stat block do not swap places between renders.
 */
export function byReadingOrder(a, b) {
  const rank = (row) => (row?.side === PLAYERS ? 0 : 1);
  return rank(a) - rank(b)
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
    || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/** The same order, applied to a list, leaving the one handed in alone. */
export function orderRows(rows = []) {
  return [...rows].sort(byReadingOrder);
}
