/**
 * Invisible Sun — what a pool brings to an action before anyone chooses anything
 *
 * Naming the pool an action draws on is what makes scourge and vex reachable at
 * all: both are properties of a pool rather than of a character, and neither can
 * be applied until something says which pool is in play.
 *
 * Two things come off a venture, and they are not alike:
 *
 *   Scourge  "subtract 1 from your venture for every action drawing on this
 *            pool" (The Key, p2242). It is not spent and it cannot be declined —
 *            it is simply the state the pool is in.
 *   Vex      "the opposite of a bene: spent to subtract 1 from a venture, and
 *            the GM decides when" (The Key, p2241). It is consumed when applied,
 *            and refreshing the pool clears whatever is left.
 *
 * ── What is here and what is not ──
 * These functions answer questions; they change nothing. Deducting the vex and
 * writing it back belongs to whoever is making the roll, because only they know
 * whether the roll actually happened.
 *
 * This was a pair of statics on ChallengeCard, which meant the rule lived in a
 * window and only the window that owned it could reach it — so the dialog a
 * player opens for themselves applied neither. The rule is the same rule
 * wherever the roll starts from.
 */

/**
 * Which stat a pool belongs to.
 *
 * Null rather than a guess for a name that is neither, so a typo shows up as
 * "no such pool" instead of quietly reading Sorcery's scourge off Accuracy.
 *
 * @returns {"certes"|"qualia"|null}
 */
export function groupOf(poolKey) {
  const key = String(poolKey ?? "").toLowerCase();
  if (CONFIG.ISUN.certesPoolNames.includes(key)) return "certes";
  if (CONFIG.ISUN.qualiaPoolNames.includes(key)) return "qualia";
  return null;
}

/**
 * A pool on an actor, with everything needed to write back to it.
 *
 * @returns {{group: string, key: string, pool: object, path: string}|null}
 */
export function find(actor, poolKey) {
  const key = String(poolKey ?? "").toLowerCase();
  const group = groupOf(key);
  if (!group) return null;

  const pool = actor?.system?.stats?.[group]?.pools?.[key];
  return pool ? { group, key, pool, path: `system.stats.${group}.pools.${key}` } : null;
}

/**
 * The scourge and vex a pool brings, and the bene it could pay.
 *
 * `scourgeTotal` is read rather than `scourge`, because a pool carries scourges
 * from four scopes at once — its own, all-Certes, all-Qualia, and those derived
 * from Wounds and Anguish — and ISUNActor has already summed them.
 *
 * The vex returned is the lesser of the ceiling asked for and what the pool
 * actually holds. A GM who says "spend two" against a pool holding one gets
 * one, because there is no such thing as owing a vex.
 *
 * @param {Actor}  actor
 * @param {string} poolKey
 * @param {number} [options.maxVex]  The ceiling. Zero means none is applied.
 * @returns {{scourge: number, vex: number, bene: number}}
 */
export function costOf(actor, poolKey, { maxVex = 0 } = {}) {
  const found = find(actor, poolKey);
  if (!found) return { scourge: 0, vex: 0, bene: 0 };

  return {
    scourge: found.pool.scourgeTotal ?? 0,
    vex: Math.min(Math.max(0, Math.round(Number(maxVex) || 0)), found.pool.vex ?? 0),
    bene: found.pool.value ?? 0
  };
}

/**
 * The most bene this character may put on one action.
 *
 * A cap on the act, not on the pool: "up to 3 bene from the appropriate stat
 * pool to devote effort to an action" is three for the action however many
 * pools are in front of you, and however many each of them holds.
 *
 * Nothing enforces that Magnificent Endeavor requires Expansive Endeavor. That
 * is a rule about buying the secret, not about spending under it, and a
 * character who somehow holds the second without the first is a thing for a GM
 * to notice rather than for a dialog to refuse.
 */
export function beneCap(actor) {
  let cap = CONFIG.ISUN.beneLimit ?? 1;
  const raises = CONFIG.ISUN.beneSecrets ?? {};

  for (const item of actor?.items ?? []) {
    if (item.type !== "Secret") continue;
    const raised = raises[String(item.name ?? "").trim().toLowerCase()];
    if (raised > cap) cap = raised;
  }
  return cap;
}

/** Whether this character holds a secret of the given name. */
function holdsSecret(actor, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  for (const item of actor?.items ?? []) {
    if (item.type === "Secret" && String(item.name ?? "").trim().toLowerCase() === wanted) return true;
  }
  return false;
}

/**
 * The most enhancements Sortilege may put on one action.
 *
 * Two answers rather than one, because the rule turns on what is being aided:
 * an ordinary action takes one, and something that already carries enhancements
 * takes none at all. Advanced Sortilege raises each by one.
 *
 * @param {Actor}   actor
 * @param {boolean} [options.enhanced]  the action already has enhancements —
 *                                      a practice, which brings its own dice
 */
export function sortilegeCap(actor, { enhanced = false } = {}) {
  const limits = CONFIG.ISUN.sortilegeLimits ?? {};
  const which = holdsSecret(actor, CONFIG.ISUN.sortilegeSecret) ? limits.advanced : limits.base;
  return (enhanced ? which?.enhanced : which?.plain) ?? 0;
}
