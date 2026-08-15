/**
 * Invisible Sun — declaring a challenge
 *
 * The GM's half of the exchange: which pool the action draws on, how hard it
 * is, how many vex it costs, and who is facing it.
 *
 * Naming the pool is the point. It is the one fact nothing else in the system
 * knows, and it decides three things at once — which scourge applies, which
 * vexes are drawn, and which bene may pay, since "a bene token can be used with
 * any action relevant to that pool" (The Key, p1902).
 */
import { ChallengeCard } from "./ChallengeCard.mjs";

const { DialogV2 } = foundry.applications.api;

export class ChallengeDeclaration {

  /** Open the declaration dialog. GM only. */
  static async open({ pool = "", challenge = 0, label = "", defence = false } = {}) {
    if (!game.user.isGM) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ChallengeGMOnly"));
      return null;
    }

    const candidates = this.#candidates();
    if (!candidates.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ChallengeNoTargets"));
      return null;
    }

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/apps/challenge-declaration.hbs",
      { pools: this.#pools(), candidates, pool, challenge, label, defence });

    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.DeclareChallenge") },
      classes: ["invisible-sun", "challenge-declaration"],
      position: { width: 460 },
      content,
      buttons: [
        { action: "declare", label: game.i18n.localize("ISUN.Declare"), default: true,
          callback: (_e, button) =>
            new foundry.applications.ux.FormDataExtended(button.form).object },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel") }
      ],
      rejectClose: false
    });

    if (!result || result === "cancel") return null;

    const targets = candidates.map(c => c.uuid).filter(uuid => result[`target.${uuid}`]);
    if (!targets.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ChallengeNoTargets"));
      return null;
    }

    return ChallengeCard.declare({
      pool: result.pool,
      challenge: Number(result.challenge) || 0,
      label: result.label || "",
      maxVex: Number(result.maxVex) || 0,
      defence: !!result.defence,
      targets
    });
  }

  /** Every pool an action can draw on, labelled and grouped. */
  static #pools() {
    const out = [];
    for (const [group, keys] of [
      ["certes", CONFIG.ISUN.certesPoolNames],
      ["qualia", CONFIG.ISUN.qualiaPoolNames]
    ]) {
      for (const key of keys ?? []) {
        out.push({ key, group, label: game.i18n.localize(CONFIG.ISUN.poolLabels[key]) });
      }
    }
    return out;
  }

  /**
   * Who can be challenged: every Vislae a connected player owns.
   *
   * Keyed on ownership rather than on the token layer, because a challenge is
   * put to a player, and the scene a token happens to be on is not the same
   * question.
   */
  static #candidates() {
    const out = [];
    for (const actor of game.actors) {
      if (actor.type !== "Vislae") continue;
      const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
      if (!owners.length) continue;
      out.push({
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        players: owners.map(u => u.name).join(", "),
        active: owners.some(u => u.active)
      });
    }
    return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }
}
