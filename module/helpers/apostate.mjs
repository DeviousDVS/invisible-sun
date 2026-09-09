/**
 * Invisible Sun — what an Apostate has, having no degrees to have it by
 *
 * Every other order is a ladder: a degree is attained, and everything the
 * degrees up to it grant is yours. "Apostates have no degrees, but all starting
 * Apostate characters begin with the following abilities" (The Key, p62) — a
 * fixed package, and then one open list bought a piece at a time.
 *
 * So an Apostate's entitlements are read against a list of names the character
 * has taken rather than against a number they have reached, and this is the
 * reading. Here rather than on the actor because it is a rule about two lists
 * and a set of names, and wants testing without a world.
 *
 * ── The two lists are not the same kind of list ──
 * `startingAbilities` is granted entire — the book says "all starting Apostate
 * characters begin with the following", and there is no choosing in it. The
 * last of them is the choosing: "Apostate Abilities: We gain two selections
 * from the list of abilities for which we meet the prerequisites."
 *
 * `apostateAbilities` is that list. Two come free at creation and every one
 * after costs 1 Crux, which is the only arithmetic here.
 */

/** How many of the open list a beginning Apostate takes without paying. */
const freePicks = () => CONFIG.ISUN?.apostateFreePicks ?? 2;

/**
 * Every ability an Apostate actually has: the whole starting package, and
 * whichever of the open list they have taken.
 *
 * Matched by name. The order item is shared by every Apostate in the world and
 * may be re-imported, reordered or edited, and a name survives all three where
 * an index into the array survives none of them.
 */
export function abilitiesHeld(order, taken = []) {
  const chosen = new Set(taken);
  const open = (order?.system?.apostateAbilities ?? []).filter(a => chosen.has(a.name));
  return [...(order?.system?.startingAbilities ?? []), ...open];
}

/**
 * What those abilities entitle the character to.
 *
 * The same reading the degree ladder gets: each ability states a total rather
 * than an increment, so the largest wins rather than the sum. "Ephemera Use: we
 * can safely possess three ephemera at any given time" is the number, not three
 * more than the number.
 *
 * @returns {{ephemera: number, incantations: number, conation: number}}
 */
export function entitlements(order, taken = []) {
  const out = { ephemera: 0, incantations: 0, conation: 0 };
  for (const ability of abilitiesHeld(order, taken)) {
    const grants = ability.grants;
    if (!grants) continue;
    for (const key of Object.keys(out)) out[key] = Math.max(out[key], grants[key] ?? 0);
  }
  return out;
}

/**
 * What the open list has cost so far.
 *
 * "We gain two selections from the list" at creation, and "once an Apostate
 * begins play, we can select a new ability… for a cost of 1 Crux" after. Which
 * two were the free ones is not recorded and does not need to be: the book
 * charges by how many have been taken, not by which.
 */
export function cruxSpent(taken = []) {
  return Math.max(0, taken.length - freePicks()) * (CONFIG.ISUN?.apostateAbilityCost ?? 1);
}

/** How many free selections are still to be made, if any. */
export function freeLeft(taken = []) {
  return Math.max(0, freePicks() - taken.length);
}

/**
 * Take an ability, or give it up.
 *
 * Returns the new list rather than writing it, and refuses a name the order
 * does not offer — a stale name left over from an order that has since been
 * re-imported would otherwise be uncountable and unremovable, and would go on
 * costing Crux.
 */
export function toggle(order, taken = [], name = "") {
  const offered = (order?.system?.apostateAbilities ?? []).some(a => a.name === name);
  if (!offered) return [...taken];
  return taken.includes(name) ? taken.filter(n => n !== name) : [...taken, name];
}
