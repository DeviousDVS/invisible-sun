const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ArrayField, StringField, HTMLField, SchemaField, ObjectField } = foundry.data.fields;

import { SheetMixin } from "../SheetMixin.mjs";

/**
 * Invisible Sun — generic item sheet.
 *
 * Renders whatever data model it is handed by walking the schema, so an item
 * type is fully editable the moment its DataModel exists. Types wanting a
 * bespoke layout (Spell, Forte, CharacterArc) subclass this and override PARTS.
 */
export class ISUNItemSheet extends SheetMixin(HandlebarsApplicationMixin(ItemSheetV2)) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["invisible-sun", "sheet", "item"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/item/item-sheet.hbs" }
  };

  /**
   * "weeklyIncome" -> "Weekly Income". Used only where a field declares no
   * label of its own, which is currently all of them.
   */
  static humanizeKey(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, c => c.toUpperCase());
  }

  /** Array-of-string fields are edited as newline-separated text. */
  #stringArrayKeys() {
    const schema = this.document.system?.schema;
    if (!schema) return [];
    return Object.entries(schema.fields)
      .filter(([, f]) => f instanceof ArrayField && f.element instanceof StringField)
      .map(([key]) => key);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    const schema = system?.schema;

    context.htmlFields = [];
    context.listFields = [];
    context.simpleFields = [];

    if (!schema) return context;

    for (const [key, field] of Object.entries(schema.fields)) {
      const value = foundry.utils.getProperty(system, key);
      const entry = {
        key,
        field,
        value,
        name: `system.${key}`,
        label: field.label || ISUNItemSheet.humanizeKey(key)
      };

      if (field instanceof HTMLField) {
        context.htmlFields.push(entry);
      }
      else if (field instanceof ArrayField && field.element instanceof StringField) {
        entry.text = Array.isArray(value) ? value.join("\n") : "";
        context.listFields.push(entry);
      }
      // Nested schemas and free-form objects have no sensible generic widget;
      // the types that use them (CharacterArc, Order) get bespoke sheets.
      else if (field instanceof SchemaField || field instanceof ArrayField || field instanceof ObjectField) {
        continue;
      }
      else {
        context.simpleFields.push(entry);
      }
    }

    return context;
  }

  /**
   * Split the newline-separated textareas back into arrays.
   *
   * This has to happen here rather than in _prepareSubmitData: that method
   * validates with `clean: {copy: false}`, which mutates the data in place, so
   * an ArrayField would already have cast the raw string into a single-element
   * array by the time _prepareSubmitData returned.
   */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    for (const key of this.#stringArrayKeys()) {
      const path = `system.${key}`;
      const raw = foundry.utils.getProperty(submitData, path);
      if (typeof raw !== "string") continue;
      foundry.utils.setProperty(submitData, path, raw.split("\n").map(s => s.trim()).filter(Boolean));
    }

    return submitData;
  }
}
