/**
 * Invisible Sun — what it takes to use a magical practice
 *
 * "Above and beyond whatever Sorcery cost is required to create the effect
 * (which is almost always equal to the practice's level), any character can add
 * 1 to the venture of a magical action by spending 1 bene" (The Way, p8).
 *
 * Almost always, so the exceptions are named here rather than assumed: a forte
 * ability may state no cost, and a Vancian spell costs nothing to cast at all —
 * a Vance pays only to keep it.
 *
 * ── What is here and what is not ──
 * These functions answer questions; they change nothing. Whether a practice can
 * be used, what it would cost, and how many dice it brings are all decidable
 * from the item and the character, and are worth deciding somewhere a test can
 * reach. Spending the Sorcery, rolling, and asking a Vance whether to hold on
 * to the spell all belong to the sheet, which has the dialogs.
 */

/** Practices whose Sorcery cost is their level. */
const COSTS_ITS_LEVEL = new Set(["Spell", "Incantation", "ForteAbility", "MinorMagic"]);

/** A Vancian spell — the one practice that is free to cast. */
export function isVancian(item) {
  return item?.type === "Spell" && item.system?.spellType === "vance";
}

/**
 * What using this costs in Sorcery.
 *
 * A Vancian spell is nothing: "The spell is eager to be cast, so casting it
 * requires no energy or effort from us. Just an action" (The Key, Vance 1st
 * degree). What it costs is to keep — see `retainCost`.
 *
 * A forte ability marked "(no cost)" is nothing either; 74 of the 491 are.
 */
export function costOf(item) {
  if (!item || !COSTS_ITS_LEVEL.has(item.type)) return 0;
  if (isVancian(item)) return 0;
  if (item.system?.noCost) return 0;
  return Math.max(0, item.system?.level ?? 0);
}

/**
 * What holding on to a Vancian spell costs, once cast.
 *
 * "If we want to retain the ability to cast that spell again without going
 * through the preparation phase, there is a Sorcery cost involved equal to the
 * spell's level" (The Key, Vance 1st degree). Zero for anything else, which
 * has nothing to retain.
 */
export function retainCost(item) {
  return isVancian(item) ? Math.max(0, item.system?.level ?? 0) : 0;
}

/**
 * How many magic dice the practice itself brings.
 *
 * Spells and incantations print theirs as prose — "+1 die", "+2 dice", and once
 * "+1 die if the object is in a being's possession" — so the number is read out
 * of the sentence. Forte abilities carry theirs as a number already.
 *
 * A conditional one is counted, because the condition is the player's to judge
 * and the dialog lets them take it back. Counting it as nothing would hide a
 * die they are owed more often than it would prevent one they are not.
 */
export function magicDiceOf(item) {
  if (!item) return 0;
  if (item.type === "ForteAbility") return Math.max(0, item.system?.bonusDice ?? 0);
  const match = /([+-]?\d+)\s*(?:die|dice)/i.exec(item.system?.dice ?? "");
  return match ? Math.max(0, Number(match[1])) : 0;
}

/**
 * Whether the practice may be used at all, and why not.
 *
 * Two things stop it outright, and both are refusals rather than warnings —
 * unlike the ephemera and object limits, which report and let the table decide.
 * The difference is that those are caps on what may be held and these are the
 * cost of an act: a Vance who has not prepared a spell has nothing in mind to
 * cast, and a vislae without the Sorcery cannot pay for the effect.
 *
 * @returns {{allowed: boolean, reason: string, cost: number, pool: number}}
 */
export function canCast(actor, item) {
  const cost = costOf(item);
  const pool = actor?.system?.stats?.qualia?.pools?.sorcery?.value ?? 0;

  if (isVancian(item) && !item.system?.prepared) {
    return { allowed: false, reason: "ISUN.CastNotPrepared", cost, pool };
  }
  if (cost > pool) {
    return { allowed: false, reason: "ISUN.CastNotEnoughSorcery", cost, pool };
  }
  return { allowed: true, reason: "", cost, pool };
}

/**
 * The range a depletion roll checks against, or null if there is no roll.
 *
 * Depletion is printed as a number and a moment: "0 (check each round)",
 * "0–1 (check each use)", "0–4 (check each hour)". The number is the range a
 * d10 has to land in; the parenthesis says when to throw it, and that is the
 * table's business rather than the sheet's.
 *
 * Anchored at the start, which is the whole of the difference between a
 * depletion and a condition. Two entries read "Ends automatically when you
 * suffer 5 points of cumulative cold damage" — an unanchored pattern finds the
 * 5 and offers a depletion roll of 5 that the book never wrote. Of 541 entries
 * across the packs, 370 begin with a number and are rolled; the other 171 end
 * on a sunrise, a sunset or a condition and are never rolled at all.
 *
 * The dash matters as much as the anchor. Every ranged entry in the packs is
 * written with an en dash and not one with a hyphen, so a pattern accepting
 * only "-" read "1–3" as 1 and "0–1" as 0 — understating depletion on every
 * ranged item in the game.
 *
 * @returns {{low: number, high: number}|null}
 */
export function depletionRange(depletion) {
  if (typeof depletion !== "string") return null;
  const match = depletion.match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?/);
  if (!match) return null;

  const low = Number(match[1]);
  return { low, high: match[2] !== undefined ? Number(match[2]) : low };
}

/**
 * What to call this kind of practice.
 *
 * A spell names its tradition, because the four are not interchangeable and one
 * list mixes them: a Vance may hold general spells beside the ones in their
 * grimoire, and only the Vancian ones are prepared and cast free. "General" is
 * not printed — it is the absence of a tradition rather than a fifth one.
 *
 * Here rather than in the sheet because the chat card names a practice too, and
 * the table and the card should not disagree about what a thing is.
 */
export function kindLabelFor(item, kind = "") {
  const key = kind || {
    Spell: "spell", Incantation: "incantation",
    ForteAbility: "forte", MinorMagic: "minor"
  }[item?.type] || "";
  if (!key) return "";

  const tradition = key === "spell" ? (item?.system?.spellType ?? "general") : "";
  if (tradition && tradition !== "general") {
    return game.i18n.format("ISUN.KindSpellOf", {
      tradition: game.i18n.localize(CONFIG.ISUN.spellTypes[tradition] ?? tradition)
    });
  }
  return game.i18n.localize(`ISUN.Kind${key.charAt(0).toUpperCase()}${key.slice(1)}`);
}

/**
 * The challenge a practice faces, from what the player is aiming at.
 *
 * "The challenge is the level of the target modified by defenses or other
 * factors… if you're casting a charm on an unsuspecting person, you use their
 * level as the challenge" (The Way, p7).
 *
 * Nothing targeted is a challenge of zero, which is the commoner case by far:
 * "You don't need to roll to see if a practice takes effect if you're casting
 * it on yourself… on a being that wants it to take effect… it has no direct
 * effect on any being or object". The dialog shows the number either way, so a
 * GM who wants one can type it.
 *
 * Read from the targeting reticle rather than from selection: what a token is
 * doing and what it is aiming at are different questions, and only one of them
 * is asked by pressing T.
 */
export function challengeFor(user = game.user) {
  const target = [...(user?.targets ?? [])][0];
  return Math.max(0, target?.actor?.system?.level ?? 0);
}
