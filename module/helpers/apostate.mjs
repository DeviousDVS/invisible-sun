/**
 * Invisible Sun — what an Apostate has, having no degrees to have it by
 *
 * Every other order answers "what am I entitled to?" with a number: the degree
 * held, and everything the rungs below it grant. "Apostates have no degrees,
 * but all starting Apostate characters begin with the following abilities" (The
 * Key, p62) — a fixed package, and then one open list bought a piece at a time.
 *
 * So an Apostate's entitlements are read against a list of what they have taken
 * rather than against a number they have reached, and this is the reading. Here
 * rather than on the actor because it is a rule about two lists and a set of
 * names, and wants testing without a world.
 *
 * ── The two lists are not the same kind of list ──
 * `startingAbilities` is granted entire — the book says "all starting Apostate
 * characters begin with the following", and there is no choosing in it. The
 * last of them is the choosing: "Apostate Abilities: We gain two selections
 * from the list of abilities for which we meet the prerequisites."
 *
 * `apostateAbilities` is that list. Two come free at creation and every one
 * after costs 1 Crux.
 *
 * ── What a pick records ──
 * A pick is `{name, crux}`: what was taken, and what it actually cost when it
 * was taken. Recorded rather than worked out from the count, because the two
 * can honestly differ — a GM writing up a character who already has five
 * abilities has spent no Crux at this table, and a total derived from the count
 * would charge them three they never paid.
 */

/** How many of the open list a beginning Apostate takes without paying. */
const freePicks = () => CONFIG.ISUN?.apostateFreePicks ?? 2;

/** What one costs once the free ones are gone. */
const price = () => CONFIG.ISUN?.apostateAbilityCost ?? 1;

/** The names taken, whatever shape the picks are in. */
const names = (taken = []) => taken.map(t => t?.name).filter(Boolean);

/**
 * Every ability an Apostate actually has: the whole starting package, and
 * whichever of the open list they have taken.
 *
 * Matched by name. The order item is shared by every Apostate in the world and
 * may be re-imported, reordered or edited, and a name survives all three where
 * an index into the array survives none of them.
 */
export function abilitiesHeld(order, taken = []) {
  return [...(order?.system?.startingAbilities ?? []), ...takenAbilities(order, taken)];
}

/**
 * The open-list abilities this character holds, each carrying what it cost.
 *
 * Driven by the order's list rather than by the stored picks, so an ability a
 * GM has since removed from the order stops appearing the moment it stops being
 * offered — and in the order the book prints them, not the order they happened
 * to be taken in.
 */
export function takenAbilities(order, taken = []) {
  const paid = new Map(taken.map(t => [t?.name, t?.crux ?? 0]));
  return (order?.system?.apostateAbilities ?? [])
    .filter(a => paid.has(a.name))
    .map(a => ({ ...a, crux: paid.get(a.name) }));
}

/** The open-list abilities still on offer, for the picker. */
export function available(order, taken = []) {
  const held = new Set(names(taken));
  return (order?.system?.apostateAbilities ?? []).filter(a => !held.has(a.name));
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
 * What the next one would cost.
 *
 * "We gain two selections from the list" at creation, and "once an Apostate
 * begins play, we can select a new ability… for a cost of 1 Crux" after. Which
 * two were the free ones is not recorded and does not need to be: the book
 * charges by how many have been taken, not by which.
 */
export function costOf(taken = []) {
  return taken.length < freePicks() ? 0 : price();
}

/** How many free selections are still to be made, if any. */
export function freeLeft(taken = []) {
  return Math.max(0, freePicks() - taken.length);
}

/** What the list has actually cost — what was paid, not what it would cost now. */
export function cruxSpent(taken = []) {
  return taken.reduce((n, t) => n + (Number(t?.crux) || 0), 0);
}

/**
 * Take one, at a stated price.
 *
 * Returns the new list rather than writing it, and refuses a name the order
 * does not offer or already holds — a stale name left over from an order that
 * has since been re-imported would otherwise be uncountable and unremovable.
 */
export function add(order, taken = [], name = "", crux = 0) {
  const offered = (order?.system?.apostateAbilities ?? []).some(a => a.name === name);
  if (!offered || names(taken).includes(name)) return [...taken];
  return [...taken, { name, crux: Math.max(0, Number(crux) || 0) }];
}

/** Give one up. The Crux does not come back; a Joy and a Despair spent are spent. */
export function drop(taken = [], name = "") {
  return taken.filter(t => t?.name !== name);
}
