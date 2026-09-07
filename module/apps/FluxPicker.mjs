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
 *
 * ── And a hundred and first ──
 * The charts are suggestions, and the rule is that the GM determines the effect.
 * So there is a line for one the charts did not think of: free text, and which
 * of the three intensities it counts as. It carries no effects — the ten entries
 * that apply themselves do so because an importer could read them without
 * ambiguity, and a sentence typed at the table has had no such reading.
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
          callback: (event, button) => {
            const picked = button.form.querySelector("input[name=pick]:checked")?.value ?? null;
            if (picked !== "custom") return picked;
            /* An object rather than a uuid, because there is nothing to look
             * this one up by. */
            return {
              custom: true,
              text: button.form.querySelector(".flux-custom-text")?.value ?? "",
              intensity: button.form.querySelector(".flux-custom-intensity")?.value ?? ""
            };
          } },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    if (chosen?.custom) {
      const text = String(chosen.text ?? "").trim();
      /* The button will not let this through empty, but a dialog dismissed by
       * its close box comes back here too. */
      if (!text) return null;
      return { uuid: null, text, intensity: chosen.intensity, effects: [] };
    }
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

      <!-- Outside the list, so no search and no chart filter can take it away:
           it is not one of the hundred and is never the thing being looked for.
           A div rather than a label, because a label wrapping three controls
           makes the whole row a hit area for the first of them. -->
      <div class="flux-row flux-custom">
        <input type="radio" name="pick" value="custom" />
        <input type="text" class="flux-custom-text"
               placeholder="${game.i18n.localize("ISUN.FluxCustomPlaceholder")}" />
        <select class="flux-custom-intensity">
          ${Object.keys(CONFIG.ISUN.fluxIntensities).map(key =>
            `<option value="${esc(key)}"${key === intensity ? " selected" : ""}>${esc(label(key))}</option>`).join("")}
        </select>
      </div>
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
    // Scoped to the list: the custom line is a .flux-row too and is not one of
    // the hundred, so it is never what a filter is filtering.
    const rows = [...root.querySelectorAll(".flux-rows .flux-row")];
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

    /* Taking nothing, or taking a blank line, are not things to let happen —
     * the same reason the compendium picker will not add nothing. */
    const custom = root.querySelector(".flux-custom-text");
    const take = root.querySelector('button[data-action="take"]');
    const sync = () => {
      const picked = root.querySelector("input[name=pick]:checked");
      const blank = picked?.value === "custom" && !custom.value.trim();
      if (take) take.disabled = !picked || blank;
    };

    /* Typing in it is choosing it. Anything else would have a GM write the line
     * and then wonder why Take was still refusing them. */
    custom.addEventListener("input", () => {
      if (custom.value.trim()) root.querySelector('input[name=pick][value="custom"]').checked = true;
      sync();
    });
    root.addEventListener("change", sync);
    sync();
  }
}
