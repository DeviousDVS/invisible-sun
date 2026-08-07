import { CompendiumPicker } from "./CompendiumPicker.mjs";

/**
 * Invisible Sun — receiving an incantation
 *
 * An incantation is not bought or looked up. "The character does not get to
 * choose the incantation; instead, the universe... grants them what it wants
 * them to have" (The Way, p106). So the control that adds one draws at random
 * rather than opening a list — the whole point of an acquiescent incantation is
 * that it arrives unasked.
 *
 * Two rules bound it.
 *
 * An incantation is held in the mind the way an ephemera object is held in the
 * hand, and they share one limit: "Ephemera limits apply to the total number of
 * Ephemera a character can hold, which encompasses both physical Ephemera
 * objects and mental Incantations." A character with no room gets nothing, and
 * is told which limit stopped them rather than left wondering why the button
 * did nothing.
 *
 * Choosing is a later privilege. "Your degree determines how many ephemera a
 * vislae can bear at a time, and — at higher degrees — how many of these can be
 * incantations you choose rather than incantations granted to you" (The Key,
 * p36). That capacity is already in the order data: every order grants one
 * conation incantation at 3rd degree and a second at 5th. So the option to
 * choose is offered exactly when the character's degree has earned it, and is
 * absent before — which is the rule, not a UI preference.
 *
 * The GM may always choose, since the rules put the granting in their hands:
 * the universe is "managed by the GM choosing or randomly drawing a card".
 */
const { DialogV2 } = foundry.applications.api;

const PACK = "invisible-sun.incantations";
const FLAG_SCOPE = "invisible-sun";
/** Set on an incantation the character chose, so slots can be counted. */
const FLAG_CONATION = "conation";

export class IncantationGrant {

  /** Open the grant. Returns the incantation received, or null. */
  static async open(actor) {
    const limit = actor.system.limits?.ephemera;
    if (limit && limit.used >= limit.value) {
      ui.notifications?.warn(game.i18n.format("ISUN.EphemeraFull",
        { used: limit.used, max: limit.value }));
      return null;
    }

    const pack = game.packs.get(PACK);
    if (!pack) {
      ui.notifications?.error(game.i18n.format("ISUN.PackMissing", { pack: PACK }));
      return null;
    }
    const index = await pack.getIndex({ fields: ["system.level", "system.color", "system.cost"] });
    const held = new Set(actor.items.filter(i => i.type === "Incantation")
      .map(i => i.name.toLowerCase()));
    // The universe has no reason to grant what the character already holds.
    const pool = [...index].filter(e => !held.has(e.name.toLowerCase()));
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.IncantationsAllHeld"));
      return null;
    }

    // Both derived on the actor, so the sheet and this window cannot disagree.
    const conation = actor.system.limits?.conation ?? { value: 0, used: 0 };
    const earned = conation.used < conation.value;
    const canChoose = earned || game.user.isGM;

    let drawn = pool[Math.floor(Math.random() * pool.length)];
    let result;
    do {
      result = await DialogV2.wait({
        window: { title: game.i18n.localize("ISUN.IncantationGrantTitle"),
                  icon: "fa-solid fa-hand-sparkles" },
        classes: ["invisible-sun", "incantation-grant"],
        position: { width: 480 },
        content: this.#content(drawn, limit, conation, earned),
        buttons: [
          { action: "accept", label: game.i18n.localize("ISUN.IncantationAccept"),
            default: true, icon: "fa-solid fa-check" },
          // Redrawing is the GM's call — a player cannot reroll until they
          // like the answer, which would make it a choice by other means.
          ...(game.user.isGM
            ? [{ action: "again", label: game.i18n.localize("ISUN.IncantationDrawAgain"),
                 icon: "fa-solid fa-dice" }]
            : []),
          ...(canChoose
            ? [{ action: "choose", label: game.i18n.localize("ISUN.IncantationChoose"),
                 icon: "fa-solid fa-hand-pointer" }]
            : []),
          { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (result === "again") drawn = pool[Math.floor(Math.random() * pool.length)];
    } while (result === "again");

    if (result === "choose") return this.#choose(actor);
    if (result !== "accept") return null;

    return this.#grant(actor, drawn.uuid ?? `Compendium.${PACK}.${drawn._id}`, false);
  }

  /** A conation incantation: chosen, and marked so the slot is counted. */
  static async #choose(actor) {
    const added = await CompendiumPicker.open({
      actor,
      pack: PACK,
      type: "Incantation",
      title: game.i18n.localize("ISUN.IncantationChooseTitle"),
      hint: game.i18n.localize("ISUN.IncantationChooseHint"),
      fields: ["level", "color", "cost", "range", "duration"],
      summarise: e => {
        const s = e.system ?? {};
        return [s.level != null ? `level ${s.level}` : "", s.color, s.cost]
          .filter(Boolean).join(" · ");
      }
    });
    for (const item of added) {
      await item.setFlag(FLAG_SCOPE, FLAG_CONATION, true);
    }
    return added[0] ?? null;
  }

  static async #grant(actor, uuid, conation) {
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    const data = doc.toObject();
    delete data._id;
    if (conation) data.flags = { ...(data.flags ?? {}), [FLAG_SCOPE]: { [FLAG_CONATION]: true } };
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications?.info(game.i18n.format("ISUN.IncantationGranted", { name: created.name }));
    return created;
  }

  static #content(entry, limit, conation, earned) {
    const esc = foundry.utils.escapeHTML;
    const s = entry.system ?? {};
    const meta = [s.level != null ? `${game.i18n.localize("ISUN.Lvl")} ${s.level}` : "",
                  s.color, s.cost].filter(Boolean).join(" · ");
    const room = limit
      ? game.i18n.format("ISUN.EphemeraRoom", { used: limit.used, max: limit.value })
      : "";

    return `<div class="incantation-grant-body">
      <p class="hint">${game.i18n.localize("ISUN.IncantationGrantHint")}</p>
      <div class="granted">
        <img src="${esc(entry.img ?? "")}" alt="" />
        <div>
          <div class="granted-name">${esc(entry.name)}</div>
          <div class="granted-meta">${esc(meta)}</div>
        </div>
      </div>
      <p class="limit-note">${esc(room)}</p>
      ${this.#conationNote(conation, earned)}
    </div>`;
  }

  /**
   * Why "Choose instead" is on offer, when it is.
   *
   * A degree that has earned conation slots says so. A GM below that degree
   * still gets the button — the rules put the granting in their hands — but
   * saying "your degree lets 0 of your ephemera be a conation incantation"
   * would be nonsense, so it says what is actually true instead.
   */
  static #conationNote(conation, earned) {
    if (earned) {
      return `<p class="conation-note">${foundry.utils.escapeHTML(
        game.i18n.format("ISUN.ConationAvailable",
          { used: conation.used, slots: conation.value }))}</p>`;
    }
    if (game.user.isGM) {
      return `<p class="conation-note gm">${foundry.utils.escapeHTML(
        game.i18n.localize(conation.value
          ? "ISUN.ConationSpentGM" : "ISUN.ConationNoneGM"))}</p>`;
    }
    return "";
  }
}
