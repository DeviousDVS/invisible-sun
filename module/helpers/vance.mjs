/**
 * Invisible Sun — what a Vance can hold in mind
 *
 * "When we want to use a spell, we read the complex formulae, lengthy
 * linguistic keys, intricate images, and elaborate instructions and draw it all
 * into ourselves, preparing it to be cast later… Each spell takes up virtual
 * 'space' within us. The total space we have is represented by a square that is
 * 3 inches by 3 inches. If we advance in degree, this space increases. Whatever
 * spells we can fit into this space, that is how many spells we can prepare"
 * (The Key, Vance 1st degree).
 *
 * ── Why one number and not a puzzle ──
 * The book means this literally: a Vance lays cards of four sizes out inside a
 * rectangle, "arranged as the Vance sees fit". That reads like a packing
 * problem, and it is not one. Every spell class and every container is a whole
 * multiple of 1.5 inches — in those units the pieces are 2x1, 2x2, 2x4 and 4x4
 * and the containers 2x2, 2x4 and 4x4 — so nothing can fit by area yet fail to
 * be arranged. `scripts/test/vance.test.mjs` proves that by packing every
 * area-legal combination rather than taking it on trust.
 *
 * Given that, the areas themselves stop earning their keep. The classes run
 * 1 : 2 : 4 : 8 and the minds 1 : 2 : 4, so any figures in the same proportion
 * answer every question identically — and 2, 4, 8, 16 against 4, 8, 16 do it
 * without ever putting a fraction in front of a player. Those are `cost` and
 * `capacity` in the config; the inches stay beside them as the printed fact.
 *
 * So counting cost is not an approximation of the rule. It is the rule, in the
 * one number somebody at a virtual table can act on.
 *
 * ── What is not decided here ──
 * These functions read state; they never write it. Whether a spell is prepared
 * is the player's choice and is stored on the spell, and whether casting keeps
 * it costs Sorcery at the moment of casting — neither belongs to the geometry.
 */

/**
 * How much of a mind a spell takes up, halved if it has been reduced.
 *
 * Always a whole number, including when halved: an alpha costs 2 so that its
 * half is 1 rather than the 2.25 square inches would give.
 */
export function footprint(spell) {
  const cost = CONFIG.ISUN.spellClasses[spell?.system?.spellClass]?.cost;
  if (!cost) return 0;
  return spell.system.halved ? cost / 2 : cost;
}

/**
 * How much room a Vance of this degree has, or null for none.
 *
 * Carries the printed rectangle alongside the `capacity` that is counted
 * against, so a caller can say what a table would lay out without doing
 * arithmetic in inches.
 *
 * Null rather than a zero capacity: an Apostate is not a Vance with no room,
 * they are somebody the rule does not apply to, and a caller has to tell those
 * apart to know whether to draw anything at all.
 */
export function mindFor(degree) {
  return CONFIG.ISUN.vancianMind[degree] ? { ...CONFIG.ISUN.vancianMind[degree] } : null;
}

/** How many spells this degree may carry at half footprint. */
export function reductionsFor(degree) {
  return CONFIG.ISUN.vancianReductions[degree] ?? 0;
}

/**
 * Is this a spell the Vancian rules apply to?
 *
 * Two ways to be one. The tradition's own spells are, by being what they are.
 * And so is any other spell a Vance has taken the trouble to learn their way:
 * "Vances may wish to learn other spells and use them in their Vancian spell
 * method, storing them in their mind for later" (The Way, p57). That is not a
 * property of the spell but of the character who learned it, so it is recorded
 * on their copy — see `converted` on the spell model.
 *
 * Everything the Vancian rules say then follows for both alike: they occupy
 * the mind, they are prepared, they cast free and cost Sorcery to keep.
 *
 * A spell a Vance simply holds without converting is none of that. It is cast
 * the ordinary way, out of Sorcery, and takes up no room at all.
 */
export function isVancian(item) {
  if (item?.type !== "Spell") return false;
  return isVanceSpell(item) || !!item.system?.converted;
}

/**
 * One of the Vance tradition's own, as against a spell learned into it.
 *
 * The two part company at the moment of casting. A converted spell keeps the
 * way it could always be cast — pay the Sorcery, no preparation, no room taken
 * — and gains the Vancian way beside it. One of the tradition's own has only
 * the one way: "To cast a spell is to expel it from your mind and soul", and a
 * spell that was never put there cannot be expelled from it.
 *
 * The book allows the other conversion too — a Vance may make one of their own
 * spells castable out of Sorcery, at twice the time again — but that is a
 * different act with a different price, and it is not built.
 */
export function isVanceSpell(item) {
  return item?.type === "Spell" && item.system?.spellType === "vance";
}

/**
 * Is this spell in the Vance's mind right now?
 *
 * The question that decides what casting costs, which is not the same question
 * as which deck the spell came from. A spell held in mind "is eager to be cast,
 * so casting it requires no energy or effort from us. Just an action" (The Key,
 * Vance 1st degree). The same spell not held is cast the ordinary way, out of
 * Sorcery — for a converted spell that is a real choice made afresh each time,
 * and for one of the tradition's own it is not a choice at all.
 */
export function heldInMind(item) {
  return isVancian(item) && !!item.system?.prepared;
}

/**
 * The class a spell of this level is placed in when converted.
 *
 * The bands are `CONFIG.ISUN.vancianConversion`, printed in The Way p57. A
 * level past the end of the table takes the last band rather than nothing: a
 * converted spell with no class would count as zero room and be carried free,
 * which is the one answer the rules certainly do not give.
 */
export function classForLevel(level) {
  const bands = CONFIG.ISUN.vancianConversion ?? [];
  if (!bands.length) return "";
  const n = Math.max(0, Number(level) || 0);
  return (bands.find(band => n <= band.upTo) ?? bands.at(-1)).spellClass;
}

/**
 * Is this a spell a Vance could learn their way, but has not?
 *
 * Only the spells that are not already Vancian one way or the other. A Vance
 * spell is prepared because of what it is, and asking to convert one would be
 * offering the character something they already have.
 *
 * Says nothing about whether the character is a Vance — that is the caller's
 * to know, and the caller is the one holding the actor.
 */
export function canConvert(item) {
  return item?.type === "Spell" && !isVancian(item);
}

/**
 * What changes when a spell is learned the Vancian way, or released again.
 *
 * Returned as an update rather than applied, so the one description of the act
 * can be tested without a document to write it to.
 *
 * Learning adds a way to cast the spell; it takes none away. A converted spell
 * can still be cast the way it always could — pay the Sorcery, take up no room
 * — and can now also be held in mind and cast for nothing. Which of the two
 * happens is decided by whether it is prepared at the moment of casting, so
 * this writes no preference either way.
 *
 * It fixes the class from the level, and does not put the spell in mind:
 * preparation "takes about an hour" and is its own act, made against whatever
 * room is free at the time.
 *
 * Releasing clears all three. A spell cast out of Sorcery is not in anybody's
 * mind, has no footprint to halve, and takes no class — and clearing the class
 * rather than keeping it means a spell learned again after a change of level
 * is placed by the band it is in now.
 */
export function conversion(item, learn) {
  /* Nested rather than dotted, so the same description serves both callers:
   * `item.update()` after the fact, and `updateSource()` while the spell is
   * still being created and there is no document to update yet. */
  return { system: learn
    ? { converted: true, spellClass: classForLevel(item?.system?.level),
        prepared: false, halved: false }
    : { converted: false, spellClass: "", prepared: false, halved: false } };
}

/**
 * What a Vance's mind currently holds, and what it has room for.
 *
 * @param {number} degree  the vislae's degree in the order, 0 for none
 * @param {Item[]} spells  every spell the character holds; non-Vancian ignored
 * @returns {object|null}  null when the character is not a Vance
 */
export function mindState(degree, spells) {
  const box = mindFor(degree);
  if (!box) return null;

  const vancian = (spells ?? []).filter(isVancian);
  const prepared = vancian.filter(s => s.system?.prepared);

  const used = prepared.reduce((n, s) => n + footprint(s), 0);
  const reductions = { value: reductionsFor(degree), used: vancian.filter(s => s.system?.halved).length };
  reductions.over = reductions.used > reductions.value;

  return {
    ...box,
    used,
    free: box.capacity - used,
    /* Reported, never enforced. A cap the system computes too low must not stop
     * a player recording what the rules allow — the same footing the ephemera
     * and object limits are on. */
    over: used > box.capacity,
    prepared: prepared.length,
    known: vancian.length,
    reductions,
  };
}

/**
 * Can this spell be prepared as things stand?
 *
 * Answers the row rather than the sheet: it is what the checkbox needs to know
 * to say why it is not offering itself. A spell already prepared is not asked
 * about — unpreparing is always allowed.
 *
 * "We cannot put the same spell into our minds twice (or more) at the same
 * time" (The Key), which needs no check here: prepared is a flag on the one
 * item, so there is no second copy to set it on.
 */
export function canPrepare(spell, mind) {
  if (!mind || !isVancian(spell)) return { allowed: false, reason: "" };
  if (spell.system?.prepared) return { allowed: true, reason: "" };

  const need = footprint(spell);
  if (!need) return { allowed: false, reason: "ISUN.MindNoClass" };
  if (need > mind.capacity) return { allowed: false, reason: "ISUN.MindTooLarge" };
  if (need > mind.free) return { allowed: false, reason: "ISUN.MindNoRoom" };
  return { allowed: true, reason: "" };
}
