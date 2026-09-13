/**
 * Invisible Sun — lint configuration.
 *
 * Deliberately narrow. The rules here are the ones that catch a mistake rather
 * than express a preference: an identifier that does not exist, a variable
 * assigned and never read, a promise dropped on the floor. Formatting is not
 * policed — this codebase has a voice, and a linter is a poor editor of prose.
 *
 * The globals are the point. Foundry supplies a large ambient API and none of
 * it is imported, so without this list every `game`, `CONFIG` and `foundry`
 * reads as undefined and the useful rule — no-undef, the one that catches a
 * typo'd API call before a player does — has to be turned off to get a clean
 * run. Declaring them is what keeps it on.
 *
 * Usage:  npm run lint
 */

/** What Foundry puts on window, and the system may use without importing. */
const foundryGlobals = {
  // Core namespaces and singletons
  foundry: "readonly",
  game: "readonly",
  ui: "readonly",
  canvas: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Hooks: "readonly",

  // Document classes
  Actor: "readonly",
  Item: "readonly",
  ChatMessage: "readonly",
  User: "readonly",
  Folder: "readonly",
  Macro: "readonly",
  Scene: "readonly",
  JournalEntry: "readonly",
  RollTable: "readonly",
  ActiveEffect: "readonly",
  TokenDocument: "readonly",
  Combat: "readonly",
  Combatant: "readonly",

  // Dice and helpers
  Roll: "readonly",
  Die: "readonly",
  fromUuid: "readonly",
  fromUuidSync: "readonly",
  getDocumentClass: "readonly",
  renderTemplate: "readonly",
  loadTemplates: "readonly",

  // Bundled libraries
  Handlebars: "readonly",

  // Deprecated but still referenced in places core has not yet removed
  FormDataExtended: "readonly"
};

export default [
  {
    files: ["**/*.mjs"],
    ignores: ["node_modules/**", "packs/**", "source/**"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...foundryGlobals,
        // Node, for the tooling under scripts/
        process: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        FormData: "readonly",
        HTMLElement: "readonly",
        // Setting a form value in script fires nothing, so the pip rows raise
        // their own change and the dialog recalculates as if it were typed.
        Event: "readonly",
        // The importer reads PDFs and writes images in the browser.
        Blob: "readonly",
        File: "readonly",
        Uint8Array: "readonly"
      }
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      /* Catches a mistake. */
      "no-undef": "error",
      "no-unused-vars": ["error", {
        args: "none",              // handlers take (event, target) and often use one
        varsIgnorePattern: "^_",
        caughtErrors: "none"
      }],
      "no-dupe-keys": "error",
      "no-dupe-class-members": "error",
      "no-unreachable": "error",
      "no-self-compare": "error",
      "no-constant-condition": "error",
      "no-fallthrough": "error",
      "require-atomic-updates": "off",   // noisy on await-then-assign, mostly false

      /* An unhandled promise is how a failed write becomes a silent no-op —
       * which this project has been bitten by more than once. */
      "no-async-promise-executor": "error",
      "require-await": "off",            // an async method may exist to match an interface

      /* Expresses a preference; left off on purpose. */
      "no-console": "off",
      "prefer-const": "off"
    }
  }
];
