/**
 * Invisible Sun — Handlebars Helpers & Template Preloading
 */

/**
 * Register custom Handlebars helpers used in .hbs templates.
 */
export function registerHandlebarsHelpers() {

  /* Removed ifEquals, eq, unlessEquals as they are built-in */

  /** Loop N times: {{#times 5}}...{{/times}}, index available as {{@index}}.
   *  The surrounding context is preserved — passing a fresh {index} object
   *  instead would hide outer values like poolName from the block body. */
  Handlebars.registerHelper("times", function (n, block) {
    let out = "";
    for (let i = 0; i < n; i++) {
      out += block.fn(this, { data: { index: i } });
    }
    return out;
  });

  /** Get sun CSS colour from colour key: {{sunColor "green"}} */
  Handlebars.registerHelper("sunColor", function (colorKey) {
    const suns = CONFIG.ISUN?.suns || {};
    const sun = suns[colorKey?.toLowerCase?.()];
    return sun ? sun.color : "#888";
  });

  /** Produce a colour-badge CSS class: {{colorClass "Green"}} → "color-green" */
  Handlebars.registerHelper("colorClass", function (colorString) {
    if (!colorString) return "";
    return `color-${colorString.toLowerCase()}`;
  });

  /** Capitalize first letter: {{capitalize "hello"}} → "Hello" */
  Handlebars.registerHelper("capitalize", function (str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  /** Truncate string: {{truncate description 80}} */
  Handlebars.registerHelper("truncate", function (str, len) {
    if (!str) return "";
    if (str.length <= len) return str;
    return str.substring(0, len) + "…";
  });

  /** Add two numbers: {{add a b}} */
  Handlebars.registerHelper("add", function (a, b) {
    return (Number(a) || 0) + (Number(b) || 0);
  });

  /** Subtract: {{subtract a b}} */
  Handlebars.registerHelper("subtract", function (a, b) {
    return (Number(a) || 0) - (Number(b) || 0);
  });

  /** Greater-than-or-equal: {{#if (gte a b)}} */
  Handlebars.registerHelper("gte", function (a, b) {
    return Number(a) >= Number(b);
  });
  /** Greater than: {{#if (gt a b)}} — the sibling of gte and lt. */
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));


  /** Less-than: {{#if (lt a b)}} */
  Handlebars.registerHelper("lt", function (a, b) {
    return Number(a) < Number(b);
  });

  /** Pool remaining: {{poolRemaining pool}} gives max - value */
  Handlebars.registerHelper("poolRemaining", function (pool) {
    if (!pool) return 0;
    return Math.max(0, (pool.max || 0) - (pool.value || 0));
  });

  /** Stringify for debugging: {{json someObject}} */
  Handlebars.registerHelper("json", function (obj) {
    return JSON.stringify(obj, null, 2);
  });

  /**
   * A rich-text editor: {{isunEditor "system.biography"}}
   *
   * Replaces Foundry's own {{editor}}, which cannot work on an ApplicationV2
   * sheet. That helper emits `<a class="editor-edit">` and nothing more —
   * a plain anchor whose click was bound by FormApplication#activateListeners,
   * a method ApplicationV2 does not have and never calls. The markup rendered,
   * the button drew, and clicking it did nothing on any sheet in the system.
   *
   * `<prose-mirror>` is the supported replacement: a custom element that builds
   * its own toggle button and binds its own listeners in connectedCallback, so
   * it works wherever it is dropped. `toggled` is the old `button=true` — show
   * the prose, open the editor when the button is pressed.
   *
   * The enriched text comes from the sheet context (see SheetMixin), because a
   * toggled editor renders that rather than the raw value when it is closed,
   * and enriching it is asynchronous.
   */
  Handlebars.registerHelper("isunEditor", function (target, options) {
    const root = options.data.root;
    const value = foundry.utils.getProperty(root, target) ?? "";
    const enriched = root.enriched?.[target] ?? value;
    const editor = foundry.applications.elements.HTMLProseMirrorElement.create({
      name: target,
      value,
      enriched,
      toggled: true,
      // An observer sees the prose but gets no button to change it.
      disabled: !(options.hash.editable ?? root.editable ?? false),
      documentUUID: root.document?.uuid ?? root.actor?.uuid ?? root.item?.uuid
    });
    if (options.hash.class) editor.classList.add(options.hash.class);
    return new Handlebars.SafeString(editor.outerHTML);
  });

  /* Removed concat, toLowerCase, and or as they are built-in */
}

/**
 * Pre-load Handlebars partial templates for fast rendering.
 */
export async function preloadHandlebarsTemplates() {
  const loadTpl = foundry.applications?.handlebars?.loadTemplates || loadTemplates;
  return loadTpl([
    // Actor partials
    "systems/invisible-sun/templates/partials/header-bar.hbs",
    "systems/invisible-sun/templates/partials/stat-pool.hbs",
    "systems/invisible-sun/templates/partials/stat-pool-row.hbs",
    "systems/invisible-sun/templates/partials/wound-tracker.hbs",
    "systems/invisible-sun/templates/partials/skill-list.hbs",
    "systems/invisible-sun/templates/apps/venture-dialog.hbs",
    "systems/invisible-sun/templates/apps/compendium-browser.hbs",
    "systems/invisible-sun/templates/partials/character-arc-tracker.hbs",
    "systems/invisible-sun/templates/partials/inventory-list.hbs",
    "systems/invisible-sun/templates/partials/cap-badge.hbs",
    "systems/invisible-sun/templates/partials/order.hbs",
    "systems/invisible-sun/templates/partials/practices.hbs",
    "systems/invisible-sun/templates/partials/secrets.hbs",
    "systems/invisible-sun/templates/partials/connections.hbs",
    "systems/invisible-sun/templates/partials/narrative.hbs",
    "systems/invisible-sun/templates/partials/entry-list.hbs",
  ]);
}
