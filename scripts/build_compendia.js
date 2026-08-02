const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../source/data');
const PACKS_DIR = path.join(__dirname, '../packs/_source');

const crypto = require('crypto');

function generateId(name, type) {
  return crypto.createHash('md5').update(type + ':' + name).digest('hex').substring(0, 16);
}

function cleanHtml(text) {
  if (!text) return "";
  return `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
}

/**
 * Split a compound ability level into its parts.
 *
 * The books write "4", "4 (+1 die)", "7 (no cost)" and
 * "3 (+1 die if used as an attack)" — the level, a dice bonus and whether it
 * costs Sorcery, all in one string. Mirrors ForteAbilityModel.parseLevel;
 * keep the two in step.
 */
function parseAbilityLevel(raw) {
  const levelText = String(raw ?? '').trim();
  const out = { level: 1, bonusDice: 0, noCost: false, condition: '', levelText };
  if (!levelText) return out;

  const lvl = levelText.match(/^(\d+)/);
  if (lvl) out.level = Number(lvl[1]);

  // "(no cost)" can sit in its own parenthetical beside a dice bonus, as in
  // the lone case of "5 (no cost) (+1 die)".
  if (/no cost/i.test(levelText)) out.noCost = true;

  const dice = levelText.match(/\+(\d+)\s*d(?:ie|ice)\b([^)]*)/i);
  if (dice) {
    out.bonusDice = Number(dice[1]);
    out.condition = dice[2].trim();
  }
  return out;
}

function createItem(name, type, systemData, img) {
  const id = generateId(name, type);
  return {
    _id: id,
    _key: `!items!${id}`,
    name: name,
    type: type,
    img: img || "icons/svg/item-bag.svg",
    system: systemData,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 }
  };
}

function writeItem(packName, item) {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) fs.mkdirSync(packDir, { recursive: true });
  
  // Safe filename
  const safeName = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filePath = path.join(packDir, `${safeName}_${item._id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
}

// Spells
if (fs.existsSync(path.join(SOURCE_DIR, 'spells.json'))) {
  const spellsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'spells.json'), 'utf8'));
  for (const [name, data] of Object.entries(spellsData)) {
    const item = createItem(name, "Spell", {
      level: parseInt(data.level) || 1,
      color: data.color || "",
      depletion: data.depletion || "",
      description: cleanHtml(data.description),
      dice: data.dice || "",
      facets: data.facets || "",
      spellType: "general"
    }, "icons/magic/symbols/rune-sigil-horned-blue.webp");
    writeItem("spells", item);
  }
  console.log(`Processed ${Object.keys(spellsData).length} spells.`);
}

// Incantations
if (fs.existsSync(path.join(SOURCE_DIR, 'incantations.json'))) {
  const incantationsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'incantations.json'), 'utf8'));
  for (const [name, data] of Object.entries(incantationsData)) {
    const item = createItem(name, "Incantation", {
      level: parseInt(data.level) || 1,
      color: data.color || "",
      depletion: data.depletion || "",
      description: cleanHtml(data.description),
      dice: data.dice || "",
      facets: data.facets || ""
    }, "icons/magic/symbols/rune-sigil-green.webp");
    writeItem("incantations", item);
  }
  console.log(`Processed ${Object.keys(incantationsData).length} incantations.`);
}

// Fortes
if (fs.existsSync(path.join(SOURCE_DIR, 'fortes.json'))) {
  const fortesData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'fortes.json'), 'utf8'));
  let abilitiesCount = 0;
  for (const data of fortesData) {
    const forteId = generateId(data.name, "Forte");
    const abilityIds = [];
    const forteItem = createItem(data.name, "Forte", {
      description: cleanHtml(data.description),
      background: cleanHtml(data.background),
      appearance: cleanHtml(data.appearance),
      suggestedArcs: data.character_arcs || "",
      pathToJoy: cleanHtml(data.path_to_joy),
      pathToDespair: cleanHtml(data.path_to_despair),
      source: data.source || "",
      abilities: [],
      // Universal across fortes (The Threshold, p8243) — unlocked only once
      // every other ability is held, and never purchased with Crux.
      secretPower: {
        name: "Journey Into Mystery",
        level: 13,
        description: cleanHtml(
          "Every forte has a secret power. It is not taught, but conceived, and " +
          "cannot be gained until the vislae has gained every other ability their " +
          "forte offers. It opens the way into the Labyrinth, and cannot be used " +
          "unless the vislae knows the Divine Ability secret."),
        requiresSecret: "Divine Ability"
      }
    }, "icons/magic/light/explosion-star-glow-silhouette.webp");

    if (data.abilities && data.abilities.length > 0) {
      for (const ability of data.abilities) {
        // Ability names repeat across fortes ("Vigor" belongs to several), so
        // the id is namespaced by its forte or the second one would overwrite
        // the first — they share a pack.
        const abId = generateId(`${data.name}::${ability.name}`, "ForteAbility");
        const lvl = parseAbilityLevel(ability.level);
        const abItem = createItem(ability.name, "ForteAbility", {
          ...lvl,
          description: cleanHtml(ability.description),
          color: ability.color || "",
          depletion: ability.depletion || "",
          parentForte: data.name,
          forteId: forteId
        }, "icons/skills/melee/strike-slashes-orange.webp");
        abItem._id = abId;
        abItem._key = `!items!${abId}`;
        writeItem("forte-abilities", abItem);
        abilityIds.push(abId);
        abilitiesCount++;
      }
    }

    // Written after its abilities so the forte can carry them in order.
    forteItem.system.abilities = abilityIds;
    writeItem("fortes", forteItem);
  }
  console.log(`Processed ${fortesData.length} fortes and ${abilitiesCount} forte abilities.`);
}

const simpleTypes = [
  { file: 'character-arcs.json', type: 'CharacterArc', pack: 'character-arcs', icon: 'icons/sundries/scrolls/scroll-bound-blue-brown.webp' },
  { file: 'foundations.json', type: 'Foundation', pack: 'foundations', icon: 'icons/environment/settlement/house-city.webp' },
  { file: 'hearts.json', type: 'Heart', pack: 'hearts', icon: 'icons/magic/life/heart-glowing-red.webp' },
  { file: 'orders.json', type: 'Order', pack: 'orders', icon: 'icons/magic/symbols/ring-circle-smoke-blue.webp' },
  { file: 'souls.json', type: 'Soul', pack: 'souls', icon: 'icons/magic/life/ankh-gold-blue.webp' }
];

for (const st of simpleTypes) {
  if (fs.existsSync(path.join(SOURCE_DIR, st.file))) {
    const dataObj = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, st.file), 'utf8'));
    let count = 0;
    
    if (Array.isArray(dataObj)) {
      for (const data of dataObj) {
        const item = createItem(data.name, st.type, {
          description: cleanHtml(data.description)
        }, st.icon);
        writeItem(st.pack, item);
        count++;
      }
    } else {
      for (const [name, data] of Object.entries(dataObj)) {
        const item = createItem(name, st.type, {
          description: typeof data === 'string' ? cleanHtml(data) : cleanHtml(data.description || "")
        }, st.icon);
        writeItem(st.pack, item);
        count++;
      }
    }
    console.log(`Processed ${count} ${st.pack}.`);
  }
}
