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
 * ── Nothing is spent here ──
 * This proposes. The GM may still refuse it, so deducting now would mean
 * refunding later; the spend happens when the roll is made.
 */
import { ChallengeCard } from "./ChallengeCard.mjs";

const { DialogV2 } = foundry.applications.api;

export class ChallengeResponse {

  /**
   * Open the response dialog and record what the player brings.
   * @returns {Promise<boolean>} whether a response was proposed
   */
  static async open(message, actorId) {
    const data = ChallengeCard.read(message);
    const response = ChallengeCard.responseFor(message, actorId);
    if (!data || !response) return false;

    const actor = fromUuidSync(response.uuid);
    if (!actor) return false;

    const cost = ChallengeCard.poolCost(actor, data.pool, data.maxVex);
    const sortilege = actor.system?.stats?.qualia?.pools?.sortilege?.value ?? 0;

    const skills = actor.items.filter(i => i.type === "Skill")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ id: i.id, name: i.name, level: i.system.level }));

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
        sortilege,
        skills
      });

    const result = await DialogV2.wait({
      window: { title: game.i18n.localize(data.defence ? "ISUN.AnswerDefence" : "ISUN.AnswerChallenge") },
      classes: ["invisible-sun", "challenge-response"],
      position: { width: 420 },
      content,
      buttons: [
        { action: "propose", label: game.i18n.localize("ISUN.Propose"), default: true,
          callback: (_e, button) => new FormDataExtended(button.form).object },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel") }
      ],
      render: (_e, dialog) => this.#live(dialog.element ?? dialog, { ...data, ...cost, sortilege }),
      rejectClose: false
    });

    if (!result || result === "cancel") return false;

    const picked = skills.filter(s => result[`skill.${s.id}`]);
    const beneSpend = this.#clamp(result.bene, cost.bene);
    const sortSpend = this.#clamp(result.sortilege, sortilege);
    const venture = picked.reduce((n, s) => n + s.level, 0) + beneSpend - cost.scourge - cost.vex;

    return ChallengeCard.update(message, actorId, {
      state: "proposed",
      skills: picked.map(s => ({ id: s.id, name: s.name, level: s.level })),
      bene: beneSpend,
      sortilege: sortSpend,
      scourge: cost.scourge,
      vex: cost.vex,
      venture
    });
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
  static #live(root, { challenge, scourge, vex, bene: beneMax, sortilege: sortMax }) {
    if (!root?.querySelector) return;

    const clampInput = (el, max) => {
      let v = Math.max(0, Math.round(Number(el.value) || 0));
      if (Number.isFinite(max)) v = Math.min(v, max);
      if (String(v) !== el.value) el.value = v;
      return v;
    };

    const recalc = () => {
      let venture = -(scourge + vex);
      for (const el of root.querySelectorAll("input.cr-skill:checked")) {
        venture += Number(el.dataset.level) || 0;
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

    root.querySelectorAll("input").forEach(el => {
      el.addEventListener("change", recalc);
      el.addEventListener("input", recalc);
    });
    recalc();
  }
}
