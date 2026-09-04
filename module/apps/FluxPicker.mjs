/**
 * Invisible Sun — choosing what a flux did
 *
 * "The GM determines the flux effect" (The Way, p13). Determines, not rolls:
 * the three charts are a hundred suggestions, and which one fits the moment is
 * a judgement. So this is a list to pick from and never a die.
 *
 * The chart matching the flux is offered first, because the intensity is what
 * the dice already decided and it is a much shorter list — seventeen entries
 * for a grand flux against thirty-five for a minor. But the whole hundred are a
 * checkbox away, since the rule says the GM determines the effect and does not
 * say they may only determine it from one page.
 *
 * The pack is read through its index. Only the entry chosen is instantiated.
 */
const { DialogV2 } = foundry.applications.api;

export const PACK = "invisible-sun.flux";

export class FluxPicker {

  /**
   * @param {object} config
   * @param {string} config.intensity  minor, major or grand
   * @param {Actor}  [config.actor]    who it happened to, for the title
   * @returns {Promise<object|null>} the chosen entry, or null
   */
  static async open({ intensity, actor = null }) {
    const pack = game.packs.get(PACK);
    if (!pack) {
      ui.notifications?.error(game.i18n.format("ISUN.PackMissing", { pack: PACK }));
      return null;
    }

    const index = await pack.getIndex({
      fields: ["system.intensity", "system.description", "system.effects"] });
    const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const entries = [...index].map(e => ({
      uuid: e.uuid ?? `Compendium.${PACK}.Item.${e._id}`,
      intensity: e.system?.intensity ?? "",
      text: strip(e.system?.description) || e.name,
      /* Carried through so choosing an effect can apply it. Empty for the
       * ninety entries the importer found nothing unambiguous in. */
      effects: e.system?.effects ?? []
    })).sort((a, b) => a.text.localeCompare(b.text));

    if (!entries.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.FluxNoCharts"));
      return null;
    }

    const title = actor
      ? game.i18n.format("ISUN.FluxPickerForTitle", { name: actor.name })
      : game.i18n.localize("ISUN.FluxPickerTitle");

    const chosen = await DialogV2.wait({
      window: { title, icon: "isun-flux-icon" },
      classes: ["invisible-sun", "flux-picker"],
      position: { width: 620, height: 640 },
      content: this.#content(entries, intensity),
      buttons: [
        { action: "take", label: game.i18n.localize("ISUN.FluxPickerTake"), default: true,
          icon: "fa-solid fa-check",
          callback: (event, button) =>
            button.form.querySelector("input[name=pick]:checked")?.value ?? null },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    return typeof chosen === "string" ? entries.find(e => e.uuid === chosen) ?? null : null;
  }

  static #content(entries, intensity) {
    const esc = foundry.utils.escapeHTML;
    const label = (key) => game.i18n.localize(CONFIG.ISUN.fluxIntensities[key] ?? key);

    const rows = entries.map(e => `
      <label class="flux-row" data-intensity="${esc(e.intensity)}">
        <input type="radio" name="pick" value="${esc(e.uuid)}" />
        <span class="flux-text">${esc(e.text)}</span>
        <span class="flux-chart ${esc(e.intensity)}">${esc(label(e.intensity))}</span>
      </label>`).join("");

    return `<div class="flux-picker-body" data-showing="${esc(intensity)}">
      <p class="hint">${game.i18n.format("ISUN.FluxPickerHint",
        { intensity: esc(label(intensity)) })}</p>
      <div class="flux-controls">
        <input type="search" class="flux-search" placeholder="${game.i18n.localize("ISUN.Search")}" />
        <label class="flux-all">
          <input type="checkbox" name="all" /> ${game.i18n.localize("ISUN.FluxShowAllCharts")}
        </label>
      </div>
      <div class="flux-rows">${rows}</div>
    </div>`;
  }

  /**
   * Filtering, done in place.
   *
   * Rows are hidden rather than rebuilt so that a chosen radio survives a
   * change of filter — a GM who ticks an entry, then searches for something
   * else and changes their mind, still has their first pick.
   */
  static #live(root) {
    const body = root.querySelector(".flux-picker-body");
    const search = root.querySelector(".flux-search");
    const all = root.querySelector("input[name=all]");
    const rows = [...root.querySelectorAll(".flux-row")];
    const showing = body.dataset.showing;

    const apply = () => {
      const needle = search.value.trim().toLowerCase();
      for (const row of rows) {
        const mine = all.checked || row.dataset.intensity === showing;
        const found = !needle || row.textContent.toLowerCase().includes(needle);
        row.classList.toggle("hidden", !(mine && found));
      }
    };
    search.addEventListener("input", apply);
    all.addEventListener("change", apply);
    apply();
  }
}
