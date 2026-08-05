/**
 * Invisible Sun — the skills a heart starts you with
 *
 * "Skills: Choose two skills from this list. You have 1 level in each of those
 * two skills" (The Key, p5841). Unlike a foundation's income and house, this is
 * a choice, so it is asked rather than assigned — the heart says how many and
 * from where, the player says which.
 *
 * The skills come from the compendium so they arrive with their category and
 * any weapon or defence keys intact. A heart's list is not always worded the
 * way the skill library is — the Empath's "Understanding people's motives" is
 * the library's "Understanding motives" — so lookup goes through the aliases
 * the library carries for exactly this.
 */
const { DialogV2 } = foundry.applications.api;

const FLAG_SCOPE = "invisible-sun";
const FLAG_KEY = "grantedByHeart";

export class HeartSkills {

  /** Every skill in the library, keyed by name and by each alias. */
  static async #library() {
    const pack = game.packs.get("invisible-sun.skills");
    if (!pack) return new Map();
    const docs = await pack.getDocuments();
    const map = new Map();
    for (const doc of docs) {
      map.set(doc.name.toLowerCase(), doc);
      for (const alias of doc.system.aliases ?? []) map.set(alias.toLowerCase(), doc);
    }
    return map;
  }

  /** Remove the skills a previous heart granted, so a swap does not stack them. */
  static async clearFrom(actor, heartId) {
    const stale = actor.items
      .filter(i => i.type === "Skill" && i.getFlag(FLAG_SCOPE, FLAG_KEY) === heartId)
      .map(i => i.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale);
    return stale.length;
  }

  /**
   * Ask which of the heart's skills to take, and grant them.
   * @returns {number} how many were granted.
   */
  static async offer(actor, heart) {
    const options = heart.system.skillsOptions ?? [];
    const wanted = heart.system.skillsGranted ?? 2;
    const level = heart.system.skillsLevel ?? 1;
    if (!options.length || !wanted) return 0;

    const library = await this.#library();
    const held = new Set(actor.items.filter(i => i.type === "Skill")
      .map(i => i.name.toLowerCase()));

    const rows = options.map((name, i) => {
      const doc = library.get(name.toLowerCase());
      const already = held.has(name.toLowerCase())
        || (doc && held.has(doc.name.toLowerCase()));
      return `<label class="heart-skill${already ? " held" : ""}">
          <input type="checkbox" name="pick" value="${i}"
                 ${already ? 'disabled data-held="1"' : ""} />
          <span class="skill-name">${foundry.utils.escapeHTML(name)}</span>
          <span class="skill-cat">${foundry.utils.escapeHTML(doc?.system.category ?? "")}</span>
          ${already ? `<span class="skill-held">already known</span>` : ""}
        </label>`;
    }).join("");

    const picked = await DialogV2.wait({
      window: { title: `${heart.name} — choose ${wanted} skills` },
      content: `<div class="heart-skills">
          <p>${foundry.utils.escapeHTML(heart.name)} starts you with ${wanted}
             of these, at level ${level}.</p>
          <div class="heart-skill-list">${rows}</div>
          <p class="remaining" data-wanted="${wanted}"></p>
        </div>`,
      buttons: [
        { action: "take", label: "Take these", default: true, icon: "fa-solid fa-check",
          callback: (event, button) => [...button.form.querySelectorAll("input[name=pick]:checked")]
            .map(i => Number(i.value)) },
        { action: "later", label: "Choose later", icon: "fa-solid fa-clock" }
      ],
      render: (event, dialog) => this.#live(dialog.element, wanted),
      rejectClose: false
    });

    if (!Array.isArray(picked) || !picked.length) return 0;

    const created = [];
    for (const idx of picked.slice(0, wanted)) {
      const name = options[idx];
      const doc = library.get(name?.toLowerCase());
      // A heart may name a skill the library does not carry; it is still a
      // legitimate skill, so it is created from the name alone.
      const data = doc
        ? doc.toObject()
        : { name, type: "Skill", system: { category: "narrative" } };
      delete data._id;
      data.system = { ...data.system, level };
      data.flags = { ...(data.flags ?? {}), [FLAG_SCOPE]: { [FLAG_KEY]: heart.id } };
      created.push(data);
    }

    await actor.createEmbeddedDocuments("Item", created);
    return created.length;
  }

  /** Hold the selection to the number the heart grants. */
  static #live(root, wanted) {
    // A skill already on the sheet stays disabled throughout; only the ones
    // genuinely available are opened and closed as the count changes.
    const selectable = [...root.querySelectorAll("input[name=pick]:not([data-held])")];
    const note = root.querySelector(".remaining");
    const take = root.querySelector('button[data-action="take"]');

    const update = () => {
      const chosen = selectable.filter(b => b.checked).length;
      // Once enough are picked the rest go quiet, so the limit shows itself
      // rather than being enforced by a complaint after the fact.
      for (const b of selectable) b.disabled = !b.checked && chosen >= wanted;
      note.textContent = chosen >= wanted ? "" : `Choose ${wanted - chosen} more.`;
      if (take) take.disabled = chosen !== wanted;
    };
    root.addEventListener("change", update);
    update();
  }
}
