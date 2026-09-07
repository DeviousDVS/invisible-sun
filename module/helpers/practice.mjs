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

/* A Vancian spell — the one practice that is free to cast — and the same
 * question the mind asks when it works out what it is holding. It was answered
 * twice, once here and once there, and then the answer changed: a Vance may
 * learn a general spell their way, and a spell that occupied the mind but still
 * cost Sorcery to cast would have been the result of the two disagreeing.
 * Helpers may import each other, so now there is one of it. */
import { isVancian, isVanceSpell, heldInMind } from "./vance.mjs";
export { isVancian, isVanceSpell, heldInMind };

/**
 * What using this costs in Sorcery.
 *
 * A spell held in mind is nothing: "The spell is eager to be cast, so casting
 * it requires no energy or effort from us. Just an action" (The Key, Vance 1st
 * degree). What it costs is to keep — see `retainCost`.
 *
 * Held in mind, not merely capable of being. A spell a Vance has learned their
 * way keeps the way it could always be cast, and paying its level is that way:
 * conversion adds the mind as an option and takes nothing away, so the same
 * spell costs its level today and nothing tomorrow, according to whether it
 * was prepared. One of the tradition's own has no such choice — it is cast out
 * of mind or not at all, so it never has a price, and `canCast` is what refuses
 * it when there is nothing prepared to cast.
 *
 * A forte ability marked "(no cost)" is nothing either; 74 of the 491 are.
 */
export function costOf(item) {
  if (!item || !COSTS_ITS_LEVEL.has(item.type)) return 0;
  if (item.system?.noCost) return 0;
  if (heldInMind(item) || isVanceSpell(item)) return 0;
  return Math.max(0, item.system?.level ?? 0);
}

/**
 * What holding on to a spell costs, once cast out of the mind.
 *
 * "If we want to retain the ability to cast that spell again without going
 * through the preparation phase, there is a Sorcery cost involved equal to the
 * spell's level" (The Key, Vance 1st degree). Zero for anything else, which has
 * nothing to retain — including a converted spell cast the ordinary way, which
 * was never in the mind to be expelled from it.
 */
export function retainCost(item) {
  return heldInMind(item) ? Math.max(0, item.system?.level ?? 0) : 0;
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
 * cost of an act: a Vance who has not prepared one of their own spells has
 * nothing in mind to cast, and a vislae without the Sorcery cannot pay for the
 * effect.
 *
 * @returns {{allowed: boolean, reason: string, cost: number, pool: number}}
 */
export function canCast(actor, item) {
  const cost = costOf(item);
  const pool = actor?.system?.stats?.qualia?.pools?.sorcery?.value ?? 0;

  /* Only the tradition's own. A converted spell that is not in mind is not
   * unusable — it is a general spell, cast the way it always was, and refusing
   * it would take away the way it could be cast before it was ever converted. */
  if (isVanceSpell(item) && !item.system?.prepared) {
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
 * grimoire. "General" is not printed — it is the absence of a tradition rather
 * than a fifth one.
 *
 * What is printed on top of that is whether the spell has been learned the
 * Vancian way, because that decides how it is held and what it costs, and a
 * general spell that casts free would otherwise be unexplained on the row.
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
  const named = (tradition && tradition !== "general")
    ? game.i18n.format("ISUN.KindSpellOf", {
        tradition: game.i18n.localize(CONFIG.ISUN.spellTypes[tradition] ?? tradition)
      })
    : game.i18n.localize(`ISUN.Kind${key.charAt(0).toUpperCase()}${key.slice(1)}`);

  /* A spell a Vance has learned their way is still a spell of whatever
   * tradition wrote it — the column says which — but it is held and cast as a
   * Vance spell, and that is the more surprising of the two facts. Composed
   * rather than a fifth label, because the spell converted may have come from
   * any of the four decks. */
  return (key === "spell" && item?.system?.converted)
    ? game.i18n.format("ISUN.KindSpellConverted", { kind: named })
    : named;
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
