import { ForteTree } from "./ForteTree.mjs";

/**
 * Invisible Sun — picking the next forte ability
 *
 * A forte's tree matters when a character is spending Crux, which is a handful
 * of moments across their life — so it opens on request rather than occupying
 * the sheet. The abilities themselves already appear among the practices once
 * taken, alongside spells and incantations, which is where they are used.
 *
 * The whole tree is shown, not only what is reachable: what a player is saving
 * towards is the point of a tree, and hiding the far end would leave them
 * choosing blind.
 */
const { DialogV2 } = foundry.applications.api;

export class ForteAbilityPicker {

  /**
   * @param {Actor} actor
   * @param {Item}  forte      the character's forte
   * @param {Item[]} abilities every ability of that forte, from the compendium
   */
  static async open(actor, forte, abilities) {
    if (!forte || !abilities?.length) return;
    this.#render(actor, forte, abilities);
  }

  static async #render(actor, forte, abilities) {
    const build = () => {
      const held = actor.items.filter(i => i.type === "ForteAbility");
      const crux = actor.system.advancement?.crux ?? 0;
      const rows = ForteTree.layout(abilities, held, crux);
      return { rows, crux, html: this.#content(forte, rows, crux) };
    };

    const wire = (root) => {
      for (const el of root.querySelectorAll("[data-take]")) {
        el.addEventListener("click", async (event) => {
          event.preventDefault();
          if (el.classList.contains("disabled")) return;
          const { rows } = build();
          const row = rows.find(r => r.id === el.dataset.take);
          const ability = abilities.find(a => a.id === el.dataset.take);
          if (!ability || !row?.available || !row.affordable) return;

          const result = await ForteTree.take(actor, ability, row.cost);
          if (result?.refused === "crux") {
            ui.notifications?.warn(game.i18n.format("ISUN.NotEnoughCrux",
              { need: result.need, have: result.have }));
            return;
          }
          ui.notifications?.info(result.cost === 0
            ? game.i18n.format("ISUN.AbilityTakenFree",
                { name: result.taken, points: result.points })
            : game.i18n.format("ISUN.AbilityTaken",
                { name: result.taken, cost: result.cost, points: result.points }));

          // Taking one opens the paths beyond it, so the tree is rebuilt in
          // place rather than closing — a character with Crux left may well
          // want the next one along.
          const next = build();
          const body = root.querySelector(".forte-picker");
          if (body) {
            body.outerHTML = next.html;
            wire(root);
          }
        });
      }
    };

    await DialogV2.wait({
      window: { title: game.i18n.format("ISUN.FortePickerTitle", { forte: forte.name }),
                resizable: true },
      position: { width: 620, height: 640 },
      content: build().html,
      buttons: [{ action: "close", label: "Close", default: true }],
      render: (event, dlg) => wire(dlg.element),
      rejectClose: false
    });
  }

  static #content(forte, rows, crux) {
    const esc = foundry.utils.escapeHTML;
    const body = rows.map(r => {
      const state = r.owned ? "owned" : r.available ? "available" : "locked";
      const control = r.owned
        ? `<span class="fp-state"><i class="fa-solid fa-check"></i></span>`
        : r.available
          ? `<a class="fp-take${r.affordable ? "" : " disabled"}${r.free ? " free" : ""}" data-take="${r.id}"
                data-tooltip="${r.affordable ? game.i18n.localize("ISUN.TakeAbilityHint")
                                             : game.i18n.localize("ISUN.NotEnoughCruxShort")}">
               ${r.free ? game.i18n.localize("ISUN.ForteFreePick")
                         : `${r.cost} <i class="fa-solid fa-star"></i>`}</a>`
          : `<span class="fp-state locked"><i class="fa-solid fa-lock"></i> ${r.cost}</span>`;

      const needs = r.owned ? ""
        : r.prerequisites.length
          ? `<div class="fp-needs">${game.i18n.localize("ISUN.ForteNeeds")}
               ${r.prerequisites.map(p => `<span class="tag">${esc(p)}</span>`).join("")}</div>`
          : `<div class="fp-needs starting">${game.i18n.localize("ISUN.ForteStarting")}</div>`;

      return `<div class="fp-row ${state} tier-${Math.min(r.tier, 5)}">
          <div class="fp-head">
            <span class="fp-name">${esc(r.name)}</span>
            <span class="fp-level">${esc(r.levelText)}</span>
            <span class="fp-colour">${esc(r.color ?? "")}</span>
            ${control}
          </div>
          ${needs}
        </div>`;
    }).join("");

    return `<div class="forte-picker">
        <p class="fp-crux">${game.i18n.format("ISUN.ForcePickerCrux", { crux })}</p>
        <div class="fp-rows">${body}</div>
      </div>`;
  }
}
