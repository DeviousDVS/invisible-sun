/**
 * Invisible Sun — what a target makes an action worth
 *
 * "Challenge is often very easy to determine because you can just use the level
 * of the NPC, object, or whatever else is involved. Trying to pick a level 5
 * lock? Challenge 5. Sneaking past a level 3 watchdog? Challenge 3. Casting a
 * spell on a level 4 thoughtform? Challenge 4" (The Gate, p18). The Key says it
 * again for abilities: "the challenge is the level of the target modified by
 * defenses or other factors… if you're using an ability to attack a person, you
 * use their level as the challenge" (The Key, p87).
 *
 * So a player who has targeted something has already said what the challenge
 * is, and typing it in again is a step the table can skip.
 *
 * ── The starting point, and only that ──
 * "The level is still the starting point, but, for example, a level 4 NPC might
 * have +3 defenses, so striking them in combat or affecting them with spells is
 * challenge 7" (The Gate, p18). Nothing here adds that +3, and it is worth
 * saying why rather than leaving it looking unfinished.
 *
 * A defence is printed as prose, and the prose does not reduce to a number:
 * "Magic (two successes); +3 Dodge" is +3 against one kind of action and
 * nothing against the rest; "immune to physical attacks; +2 to all defenses"
 * carries a number that does apply generally and an immunity beside it that
 * decides the action outright. A parser confident enough to add something would
 * be wrong more often than not, and wrong in the direction of a challenge the
 * player never agreed to.
 *
 * So the level is filled in and the defence line is put beside it, where the
 * two people who can read it are looking. The field stays editable; this only
 * saves the typing.
 *
 * ── What has no level ──
 * A vislae has none — levels belong to the world the characters act on, not to
 * the characters. Targeting one yields nothing rather than a zero, because a
 * challenge of nought is a claim and a blank field is not.
 */

/**
 * The level to reckon a challenge from, or null for something that has none.
 *
 * `effectiveLevel` in preference to the printed one: "if an NPC gains a bene or
 * a vex, this is a +1 bonus or -1 penalty to the NPC's level" (The Gate, p1972),
 * and ISUNActor has already applied that. A scourged creature is easier to
 * affect, and the number the player types should be the one that is true now.
 */
export function levelOf(actor) {
  if (!actor || actor.type === "Vislae") return null;
  const effective = actor.system?.health?.effectiveLevel;
  if (Number.isInteger(effective)) return effective;
  const printed = actor.system?.level;
  return Number.isInteger(printed) ? printed : null;
}

/** A target as the challenge rules see it, or null if it carries no level. */
export function targetRow(actor) {
  const level = levelOf(actor);
  if (level === null) return null;
  return {
    name: actor.name ?? "",
    level,
    defences: (actor.system?.defenses ?? [])
      .map(d => ({ kind: d?.kind ?? "", text: d?.text ?? "" }))
      .filter(d => d.text)
  };
}

/**
 * The challenge a set of targets sets, and which of them set it.
 *
 * The hardest, when there are several. One action against a group is as hard as
 * the hardest thing in it, and a player who targeted three and got the easiest
 * would be rolling against a number nothing in front of them answers to.
 * Which one it came from is returned too, because a challenge that appears
 * without saying where it came from is a challenge nobody can check.
 */
export function challengeFrom(rows = []) {
  const usable = rows.filter(row => Number.isInteger(row?.level));
  if (!usable.length) return null;

  const hardest = usable.reduce((best, row) => (row.level > best.level ? row : best));
  return {
    challenge: hardest.level,
    name: hardest.name,
    /* How many others were targeted, so the note can say the number was the
     * hardest of several rather than the only one. */
    others: usable.length - 1,
    defences: hardest.defences ?? []
  };
}

/**
 * What this user currently has targeted, as rows.
 *
 * The user's own targets rather than the scene's: targeting is per-user in
 * Foundry, and the player about to roll is the one who said what they are
 * acting on.
 */
export function currentTargets(user = game.user) {
  const rows = [];
  for (const token of user?.targets ?? []) {
    const row = targetRow(token?.actor);
    if (row) rows.push(row);
  }
  return rows;
}

/** The challenge this user's targets set, or null if they set none. */
export function challengeForTargets(user = game.user) {
  return challengeFrom(currentTargets(user));
}
