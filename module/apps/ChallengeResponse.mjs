/**
 * Invisible Sun — answering a challenge
 *
 * The player's half. The GM has already fixed what cannot be argued with — the
 * pool, the rating, and how many vex it costs — so this asks only what the
 * character brings: skills, bene, and Sortilege.
 *
 * ── Which pool pays ──
 * The declared pool decides it, and the rule reads the opposite way round from
 * the obvious guess: a bene is not spent *from a pool relevant to the action*,
 * it belongs to a pool and reaches the actions that pool covers — "a bene token
 * can be used with any action relevant to that pool" (The Key, p1902). So an
 * Accuracy challenge can only be paid for with Accuracy bene.
 *
 * Sortilege is the exception, from the same passage: its value is measured in
 * enhancements rather than bene and they "can be used with any action", so it
 * is offered whatever was declared. It buys dice, not venture.
 *
 * ── The Path of Suns ──
 * Whatever the board is worth to this character is read once, here, and carried
 * to the roll rather than read again as the dice land. Scourge and vex are
 * re-read at the last moment because a rest or a fresh Wound may have moved
 * them — but those are the character's own, and this is the table's: the GM can
 * turn a card while this dialog sits open, and the number a player decided
 * against should be the number they get.
 *
 * ── This only collects ──
 * The dialog decides nothing. It hands back what the player chose and
 * ChallengeCard does the spending, the rolling and the recording in one step,
 * so there is no window in which a pool has been debited but the card does not
 * yet say why.
 */
import { SkillPicker } from "./SkillPicker.mjs";
import { SpendPips } from "./SpendPips.mjs";
import { ChallengeCard } from "./ChallengeCard.mjs";
import * as poolRules from "../helpers/pools.mjs";
import * as sooth from "../helpers/sooth.mjs";

const { DialogV2 } = foundry.applications.api;

export class ChallengeResponse {

  /**
   * Ask the player what the character brings to the challenge.
   *
   * @returns {Promise<?{skills: object[], bene: number, sortilege: number}>}
   *   what was chosen, or null if the dialog was dismissed
   */
  static async open(message, actorId) {
    const data = ChallengeCard.read(message);
    const response = ChallengeCard.responseFor(message, actorId);
    if (!data || !response) return null;

    const actor = fromUuidSync(response.uuid);
    if (!actor) return null;

    const cost = ChallengeCard.poolCost(actor, data.pool, data.maxVex);
    /* What one action may be paid with — one bene unless a secret says more. */
    const cap = poolRules.beneCap(actor);
    /* Answering a challenge is not casting, so nothing here already carries
     * enhancements. The field is still a field — this dialog was not asked to
     * grow pips — but the rule applies to it either way. */
    const sortCap = poolRules.sortilegeCap(actor, { enhanced: false });
    /* Held and spendable are different numbers now, and the row shows both: the
     * pips are what may go on this action, the "/ n" is what is in the pool. */
    const sortHeld = actor.system?.stats?.qualia?.pools?.sortilege?.value ?? 0;
    const sortilege = Math.min(sortHeld, sortCap);
    const board = await sooth.ventureFor(actor);

    const skills = actor.items.filter(i => i.type === "Skill")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ id: i.id, name: i.name, level: i.system.level,
                   category: i.system.category }));

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/apps/challenge-response.hbs",
      {
        label: data.label,
        challenge: data.challenge,
        poolLabel: game.i18n.localize(CONFIG.ISUN.poolLabels[data.pool] ?? data.pool),
        pool: data.pool,
        defence: data.defence,
        scourge: cost.scourge,
        vex: cost.vex,
        bene: cost.bene,
        /* Pips to draw, and the cap they answer to. The pool caps it as well:
         * a secret allowing ten does not conjure a tenth bene to spend. */
        beneSpendable: Math.min(cost.bene, cap),
        beneHint: game.i18n.format("ISUN.BeneCapHint", { cap }),
        sortilege: sortHeld,
        sortilegeSpendable: sortilege,
        sortilegeHint: game.i18n.format("ISUN.SortilegeCapHint",
          { cap: sortCap, onEnhanced: poolRules.sortilegeCap(actor, { enhanced: true }) }),
        skills,
        sooth: board.value,
        soothText: board.value ? sooth.signed(board.value) : "",
        soothSources: board.sources.join(", ")
      });

    const result = await DialogV2.wait({
      window: { title: game.i18n.localize(data.defence ? "ISUN.AnswerDefence" : "ISUN.AnswerChallenge") },
      classes: ["invisible-sun", "challenge-response"],
      position: { width: 420 },
      content,
      buttons: [
        { action: "roll", label: game.i18n.localize("ISUN.Roll"), default: true,
          callback: (_e, button) =>
            new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel") }
      ],
      render: (_e, dialog) => {
        const root = dialog.element ?? dialog;
        SkillPicker.wire(root, skills);
        SpendPips.wire(root, ".bene-pips", Math.min(cost.bene, cap));
        /* A fixed ceiling here, unlike the venture dialog's: answering a
         * challenge is not casting, so nothing in front of the player already
         * carries enhancements for Sortilege to be barred from. */
        SpendPips.wire(root, ".enh-pips", sortilege);
        /* The capped figures, not the raw pool: what the running total clamps
         * against should be what the pips will actually let a player spend. */
        this.#live(root, { ...data, ...cost, bene: Math.min(cost.bene, cap),
                           sortilege, skills, sooth: board.value });
      },
      rejectClose: false
    });

    if (!result || result === "cancel") return null;

    /* One name for a single pick, an array for several, and absent for none —
     * so it is normalised before it is walked rather than trusted to be a
     * list. */
    const picked = new Set([result.skills ?? []].flat().filter(Boolean));

    /* Clamped here as well as at the spend. A browser does not enforce `max`
     * on a typed number, and the caller re-reads the pools anyway — but a
     * choice that leaves this method should already be a legal one. */
    return {
      skills: skills.filter(s => picked.has(s.id))
        .map(s => ({ id: s.id, name: s.name, level: s.level })),
      bene: this.#clamp(result.bene, Math.min(cost.bene, cap)),
      sortilege: this.#clamp(result.sortilege, sortilege),
      // The board as it stood when the player answered, and what it was.
      sooth: board.value,
      soothSources: board.sources
    };
  }

  static #clamp(value, max) {
    return Math.max(0, Math.min(Math.round(Number(value) || 0), max));
  }

  /**
   * Keep the running venture honest as the form is filled in.
   *
   * A browser does not enforce `max` on a typed value, so a spend is clamped
   * here as well as when it is recorded — otherwise the preview promises a
   * venture the pool cannot pay for.
   */
  static #live(root, { challenge, scourge, vex, bene: beneMax, sortilege: sortMax,
                       skills = [], sooth = 0 }) {
    if (!root?.querySelector) return;

    /* What is chosen is a row per skill carrying its id, so the level has to
     * be looked up. Built once here rather than read off the rows, so the
     * number that reaches the venture is the one the actor has and not one the
     * markup could be stale about. */
    const levelOf = new Map(skills.map(s => [s.id, s.level]));

    const clampInput = (el, max) => {
      let v = Math.max(0, Math.round(Number(el.value) || 0));
      if (Number.isFinite(max)) v = Math.min(v, max);
      if (String(v) !== el.value) el.value = v;
      return v;
    };

    const recalc = () => {
      let venture = sooth - (scourge + vex);
      for (const el of root.querySelectorAll('.skill-pick input[name="skills"]')) {
        venture += levelOf.get(el.value) ?? 0;
      }
      const beneEl = root.querySelector("input.cr-bene");
      const sortEl = root.querySelector("input.cr-sortilege");
      if (beneEl) venture += clampInput(beneEl, beneMax);
      const dice = 1 + (sortEl ? clampInput(sortEl, sortMax) : 0);

      const target = challenge - venture;
      const set = (sel, text) => { const n = root.querySelector(sel); if (n) n.textContent = text; };
      set(".cr-venture", venture);
      set(".cr-dice", dice);

      const t = root.querySelector(".cr-target");
      if (t) {
        t.textContent = target <= 0 ? game.i18n.localize("ISUN.Auto") : target;
        t.classList.toggle("auto", target <= 0);
        // With no extra dice a target of 10 or more cannot be rolled at all.
        t.classList.toggle("impossible", target >= 10 && dice <= 1);
      }
    };

    /* Listened for on the dialog rather than on each field. The skill rows are
     * built after this runs and rebuilt every time one is added or taken off,
     * so a listener bound to the fields themselves would be bound to elements
     * that no longer exist. */
    root.addEventListener("change", recalc);
    root.addEventListener("input", recalc);
    recalc();
  }
}
