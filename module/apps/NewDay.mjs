/**
 * Invisible Sun — the sun comes up on everybody
 *
 * A new day resets every pool, clears the vexes, restores the day's rests and
 * heals a Wound. The sheet has a button for one character; a table has four,
 * and a GM ending a session was opening four sheets to press it four times.
 *
 * So this asks once, for everyone. Every Vislae in the world is listed, because
 * a character can sleep whether or not the person playing them is at the table
 * tonight — but the ones whose player is logged in are ticked to begin with,
 * since that is nearly always the set a GM means.
 *
 * ── What counts as "their player is here" ──
 * An active user who is not a GM and who either has the character assigned to
 * them or owns it. A GM owns every actor in the world, so counting GMs would
 * tick everything the moment a GM was logged in, which is no default at all.
 *
 * Nothing is decided here that the sheet's own button does not decide: this
 * calls the same newDay on each chosen actor. It is the asking that is new.
 */
const { DialogV2 } = foundry.applications.api;

export class NewDay {

  /** Whether some player at the table is playing this character. */
  static #played(actor) {
    return game.users.some(u => u.active && !u.isGM
      && (u.character?.id === actor.id || actor.testUserPermission(u, "OWNER")));
  }

  /**
   * Ask who sleeps, then rest them.
   *
   * @returns {Promise<Actor[]>} the actors rested, empty if none were
   */
  static async open() {
    const vislae = game.actors.filter(a => a.type === "Vislae")
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!vislae.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.NewDayNobody"));
      return [];
    }

    const rows = vislae.map(a => ({ actor: a, played: this.#played(a) }));

    const chosen = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.NewDayTitle"), icon: "fa-solid fa-bed" },
      classes: ["invisible-sun", "new-day-dialog"],
      position: { width: 320 },
      content: this.#content(rows),
      buttons: [
        { action: "rest", label: game.i18n.localize("ISUN.NewDayRest"), default: true,
          icon: "fa-solid fa-bed",
          callback: (event, button) =>
            [...button.form.querySelectorAll("input[name=who]:checked")].map(i => i.value) },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    if (!Array.isArray(chosen) || !chosen.length) return [];

    /* One at a time rather than in one call: newDay reads each actor's own
     * pools and its own health to work out what to write, and there is no
     * shape of updateDocuments that would let it. */
    const rested = [];
    for (const id of chosen) {
      const actor = game.actors.get(id);
      if (!actor) continue;
      await actor.newDay();
      rested.push(actor);
    }

    if (rested.length) {
      ui.notifications?.info(game.i18n.format("ISUN.NewDayRested",
        { count: rested.length, names: rested.map(a => a.name).join(", ") }));
    }
    return rested;
  }

  static #content(rows) {
    const esc = foundry.utils.escapeHTML;
    const list = rows.map(({ actor, played }) => `
      <label class="new-day-row">
        <input type="checkbox" name="who" value="${esc(actor.id)}"${played ? " checked" : ""} />
        <img src="${esc(actor.img ?? "")}" alt="" />
        <span class="new-day-name">${esc(actor.name)}</span>
        ${played ? `<span class="new-day-here">${game.i18n.localize("ISUN.NewDayHere")}</span>` : ""}
      </label>`).join("");

    return `<div class="new-day-body">
      <p class="hint">${game.i18n.localize("ISUN.NewDayHint")}</p>
      <div class="new-day-rows">${list}</div>
      <p class="new-day-count"></p>
    </div>`;
  }

  /** Keep the count honest, and the button from resting nobody. */
  static #live(root) {
    const boxes = [...root.querySelectorAll("input[name=who]")];
    const count = root.querySelector(".new-day-count");
    const rest = root.querySelector('button[data-action="rest"]');

    const update = () => {
      const n = boxes.filter(b => b.checked).length;
      if (rest) rest.disabled = n === 0;
      if (count) {
        count.textContent = n
          ? game.i18n.format("ISUN.NewDayChosen", { count: n })
          : game.i18n.localize("ISUN.NewDayNoneChosen");
      }
    };
    root.addEventListener("change", update);
    update();
  }
}
