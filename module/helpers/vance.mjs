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
 * ── Why an area and not a puzzle ──
 * The book means this literally: a Vance lays cards of four sizes out inside a
 * rectangle, "arranged as the Vance sees fit". That reads like a packing
 * problem, and it is not one. Every spell class and every container is a whole
 * multiple of 1.5 inches — in those units the pieces are 2x1, 2x2, 4x2 and 4x4
 * and the containers 2x2, 2x4 and 4x4 — so nothing can fit by area yet fail to
 * be arranged. `scripts/test/vance.test.mjs` proves that by packing all 245
 * area-legal combinations rather than taking it on trust.
 *
 * So comparing areas is not an approximation of the rule. It is the rule,
 * stated in the one number a player can act on.
 *
 * ── What is not decided here ──
 * These functions read state; they never write it. Whether a spell is prepared
 * is the player's choice and is stored on the spell, and whether casting keeps
 * it costs Sorcery at the moment of casting — neither belongs to the geometry.
 */

/** A spell's footprint in square inches, halved if it has been reduced. */
export function footprint(spell) {
  const spec = CONFIG.ISUN.spellClasses[spell?.system?.spellClass];
  if (!spec) return 0;
  const area = spec.width * spec.height;
  return spell.system.halved ? area / 2 : area;
}

/**
 * The rectangle a Vance of this degree has to fill, or null for none.
 *
 * Null rather than a zero-sized box: an Apostate is not a Vance with no room,
 * they are somebody the rule does not apply to, and a caller has to tell those
 * apart to know whether to draw anything at all.
 */
export function mindFor(degree) {
  const box = CONFIG.ISUN.vancianMind[degree];
  return box ? { ...box, area: box.width * box.height } : null;
}

/** How many spells this degree may carry at half footprint. */
export function reductionsFor(degree) {
  return CONFIG.ISUN.vancianReductions[degree] ?? 0;
}

/**
 * Is this a spell the Vancian rules apply to?
 *
 * A Vance may hold general spells alongside their grimoire, and those are not
 * prepared, take up no room, and must not be counted. Only the tradition's own
 * spells are, and only ones that state a class — a Vancian spell with no class
 * recorded is a data gap, and counting it as zero would silently let a Vance
 * carry it for free.
 */
export function isVancian(item) {
  return item?.type === "Spell" && item.system?.spellType === "vance";
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
    free: box.area - used,
    /* Reported, never enforced. A cap the system computes too low must not stop
     * a player recording what the rules allow — the same footing the ephemera
     * and object limits are on. */
    over: used > box.area,
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
  if (need > mind.area) return { allowed: false, reason: "ISUN.MindTooLarge" };
  if (need > mind.free) return { allowed: false, reason: "ISUN.MindNoRoom" };
  return { allowed: true, reason: "" };
}
