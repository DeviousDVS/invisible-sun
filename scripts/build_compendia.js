/**
 * Build the compendium JSON from the structured game data.
 *
 * Stage 2 of four:
 *
 *   source/books/*.pdf  --extract_*.py-->  source/data/*.json
 *   source/data/*.json  --THIS SCRIPT-->   packs/_source/<pack>/*.json
 *   packs/_source       --compile_packs-->  packs/<pack>  (LevelDB)
 *   packs               --verify_packs-->   diffed back against the source
 *
 * Deterministic: ids are hashed from name and type, so running it twice
 * produces byte-identical output and a re-run shows up as an empty diff. That
 * is the check worth making after editing source/data — if anything unexpected
 * moves, the edit did more than intended.
 *
 * Safe to run at any time; it touches no database and needs no Foundry.
 *
 * Usage:  npm run packs:build
 */
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

const SMALL_WORDS = new Set(['a','an','and','the','of','with','to','in','for','or','from']);
function titleCase(s) {
  if (!/[a-z]/.test(s)) {
    return s.toLowerCase().split(/\s+/).map((w, i, arr) =>
      (i > 0 && i < arr.length - 1 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
  }
  return s;
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

// Packs emptied so far this run. A source entry that is renamed or dropped
// would otherwise leave its old file behind and the item would keep appearing
// in the compendium, so each pack is cleared the first time it is written to.
const clearedPacks = new Set();

function writeItem(packName, item) {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) fs.mkdirSync(packDir, { recursive: true });
  if (!clearedPacks.has(packName)) {
    for (const f of fs.readdirSync(packDir)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(packDir, f));
    }
    clearedPacks.add(packName);
  }

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
      note: cleanHtml(data.note || ""),
      spellType: data.spellType || "general"
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
      facets: data.facets || "",
      // Assigned by scripts/categorise_incantations.py, so a conation
      // incantation can be asked for by type rather than by name.
      categories: data.categories ?? [],
      note: cleanHtml(data.note || "")
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
          forteId: forteId,
          unlocks: ability.unlocks ?? []
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

/**
 * What a degree ability entitles its holder to, read out of its own prose.
 *
 * "Your degree determines how many ephemera a vislae can bear at a time, and —
 * at higher degrees — how many of these can be incantations you choose rather
 * than incantations granted to you" (The Key, p36). The books state those
 * numbers in words, inside the ability's description, and each ability restates
 * the total rather than an increment.
 *
 * This runs here, once, rather than in ISUNActor at derivation time. Reading
 * the ladder rather than hardcoding a table is still right — a GM who edits an
 * order should be followed — but doing it against live text meant a reworded or
 * translated description silently dropped a character's caps back to the base.
 * Extracting at build time keeps the benefit and moves the fragility to a place
 * where it is visible: verify_packs and check.mjs both see the result, and an
 * ability whose numbers stop parsing shows up as a diff rather than as a
 * quietly weaker character.
 */
const DEGREE_GRANTS = (() => {
  const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const word = m => NUMBERS[m?.[1]?.toLowerCase()] ?? 0;
  const EPHEMERA = /\b(one|two|three|four|five|six)\s+ephemera\b/i;
  const INCANTATIONS = /only\s+(one|two|three|four|five|six)\s+of these can be incantations/i;
  const CONATION = /\b(one|two|three|four|five|six)\b[^.]*conation/i;
  return text => ({
    ephemera:     word(String(text ?? '').match(EPHEMERA)),
    incantations: word(String(text ?? '').match(INCANTATIONS)),
    conation:     word(String(text ?? '').match(CONATION)),
  });
})();

// Orders
if (fs.existsSync(path.join(SOURCE_DIR, 'orders.json'))) {
  const ordersData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'orders.json'), 'utf8'));
  let granting = 0;
  for (const data of ordersData) {
    const named = list => (list ?? []).map(a => {
      const description = cleanHtml(a.description);
      const grants = DEGREE_GRANTS(description);
      if (grants.ephemera || grants.incantations || grants.conation) granting++;
      return { name: a.name, description, grants };
    });
    const item = createItem(data.name, "Order", {
      description: cleanHtml(data.description),
      otherNames: data.other_names || "",
      philosophy: cleanHtml(data.philosophy),
      relationships: cleanHtml(data.relationships),
      pathToJoy: cleanHtml(data.path_to_joy),
      pathToDespair: cleanHtml(data.path_to_despair),
      degrees: (data.degrees ?? []).map(d => ({
        degree: d.degree,
        title: d.title,
        cruxCost: d.crux_cost,
        requirement: cleanHtml(d.requirement),
        abilities: named(d.abilities)
      })),
      sidebars: (data.sidebars ?? []).map(cleanHtml),
      startingAbilities: named(data.starting_abilities),
      startingNote: cleanHtml(data.starting_note),
      apostateAbilities: named(data.abilities),
      apostateNote: cleanHtml(data.abilities_note)
    }, "icons/magic/symbols/ring-circle-smoke-blue.webp");
    writeItem("orders", item);
  }
  console.log(`Processed ${ordersData.length} orders (${granting} abilities carrying a degree grant).`);
}

// Objects of power and ephemera, both from their card decks. They share a
// card layout and so share an extractor; the two differ in that an object of
// power has a kind (artifact, relic, kindled) and cites where it is written up.
for (const [file, pack, type, icon] of [
  ['objects-of-power.json', 'objects-of-power', 'ObjectOfPower', 'icons/commodities/treasure/token-gold-gem-red.webp'],
  ['ephemera.json', 'ephemera', 'Ephemera', 'icons/commodities/materials/bowl-liquid-white.webp'],
]) {
  const p = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of data) {
    const common = {
      level: parseInt(c.level) || 1,
      description: cleanHtml(c.description),
      form: c.form || "",
      dice: c.dice || "",
      depletion: c.depletion === "—" ? "" : (c.depletion || ""),
      color: c.color || "",
      note: cleanHtml(c.note || "")
    };
    const system = type === 'ObjectOfPower'
      ? { ...common, objectType: (c.kind || 'object').toLowerCase(),
          effectDepletion: c.effectDepletion || "", reference: c.reference || "" }
      // Ephemera are typed conflux/charm/cypher/oddity, which the cards do not
      // print. They stay at the schema default until that is sourced.
      : { ...common, ephemeraType: "conflux" };
    writeItem(pack, createItem(c.name, type, system, icon));
  }
  console.log(`Processed ${data.length} ${pack}.`);
}

// Skills. A starting library rather than a closed list — the game has no
// definitive set and players invent their own — so these are here to be
// dragged onto a sheet and then edited freely.
if (fs.existsSync(path.join(SOURCE_DIR, 'skills.json'))) {
  const skillsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'skills.json'), 'utf8'));
  const icons = {
    action: "icons/skills/melee/blade-tips-triple-bent-white.webp",
    narrative: "icons/skills/social/diplomacy-handshake.webp",
    development: "icons/skills/trades/academics-book-study-runes.webp"
  };
  for (const c of skillsData) {
    writeItem("skills", createItem(c.name, "Skill", {
      // A library entry is the skill at its first level; taking it is what
      // sets a character's own rating.
      level: 1,
      description: cleanHtml(c.description || ""),
      category: c.category || "action",
      weaponType: c.weaponType || "",
      weaponRange: c.weaponRange || "",
      defenseKey: c.defenseKey || "",
      aliases: c.aliases ?? []
    }, icons[c.category] || icons.action));
  }
  console.log(`Processed ${skillsData.length} skills.`);
}

// The Sooth Deck. The cards carry only a name, a value and either the suns
// they shift or a royalty rank; the meanings, divination, narrative hooks and
// royalty effects come from the write-ups in The Gate.
if (fs.existsSync(path.join(SOURCE_DIR, 'sooth.json'))) {
  const soothData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'sooth.json'), 'utf8'));
  for (const c of soothData) {
    writeItem("sooth", createItem(c.name, "SoothCard", {
      family: c.family || "",
      value: c.value ?? 0,
      rank: (c.rank || "").toLowerCase(),
      enhancedSun: c.enhancedSun || "",
      diminishedSun: c.diminishedSun || "",
      effectText: cleanHtml(c.effectText || ""),
      meanings: c.meanings || "",
      divination: cleanHtml(c.divination || ""),
      gameNarrative: cleanHtml(c.gameNarrative || ""),
      joy: cleanHtml(c.joy || ""),
      despair: cleanHtml(c.despair || ""),
      description: cleanHtml(c.description || ""),
      quote: c.quote || "",
      familyLine: c.familyLine || ""
    }, "icons/sundries/gaming/playing-cards.webp"));
  }
  console.log(`Processed ${soothData.length} sooth cards.`);
}

// Weaver aggregates, from the Weaver Aggregates card deck
if (fs.existsSync(path.join(SOURCE_DIR, 'aggregates.json'))) {
  const aggData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'aggregates.json'), 'utf8'));
  for (const data of aggData) {
    const item = createItem(data.name, "Thread", {
      description: cleanHtml(data.description),
      defaultDuration: data.default_duration || "",
      defaultRange: data.default_range || "",
      qualities: data.qualities ?? [],
      absences: data.absences ?? []
    }, "icons/svg/net.svg");
    writeItem("threads", item);
  }
  console.log(`Processed ${aggData.length} aggregates.`);
}

// Secrets — character, house and changery.
//
// A secret's level is what it costs in Acumen, one point per level, so `cost`
// is written out from the level rather than being a second source of truth.
// Changery secrets carry the bodily change they wait on; the other two kinds
// leave that empty.
/* Secrets that raise a limit rather than merely describing one.
 *
 * The actor sums system.grants.limits across everything it owns
 * (ISUNActor._prepareLimits) and shows the result on the Inventory tab, but no
 * item in any pack had ever set it — 778 items, all zeros — so the whole path
 * was live code with nothing flowing through it.
 *
 * Only one secret belongs here. Reading every candidate in the three packs that
 * carrying types found nothing else: the orders' "we can safely possess three
 * ephemera" is the base limit, already in CONFIG.ISUN.limits and raised by
 * degree, so granting it again would double it.
 *
 * Power Room is deliberately absent. "The objects here do not count against
 * your limit" is an exemption for objects stored in it, not five more a
 * character may carry, and modelling it as a grant would allow eight on the
 * person. It needs per-object state, as the kindled exemption already has.
 */
const SECRET_GRANTS = {
  // "two additional objects of power above and beyond the normal limit of
  // three at a time" (The Way, p90).
  "Magical Management": { limits: { objectsOfPower: 2 } },
};

if (fs.existsSync(path.join(SOURCE_DIR, 'secrets.json'))) {
  const secretsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'secrets.json'), 'utf8'));
  const grantsApplied = new Set();
  const icons = {
    character: "icons/svg/eye.svg",
    house: "icons/environment/settlement/house-manor.webp",
    changery: "icons/magic/life/cross-worn-green.webp",
  };
  for (const c of secretsData) {
    const grants = SECRET_GRANTS[c.name];
    if (grants) grantsApplied.add(c.name);
    writeItem("secrets", createItem(c.name, "Secret", {
      level: c.level ?? 1,
      cost: `${c.level ?? 1} Acumen`,
      bonusDice: c.bonusDice ?? 0,
      description: cleanHtml(c.description || ""),
      secretType: c.kind || "character",
      changeRequired: c.changeRequired || "",
      source: c.source || "",
      page: c.page ?? null,
      ...(grants ? { grants } : {}),
    }, icons[c.kind] || icons.character));
  }
  // A grant keyed to a name that no longer exists applies to nobody, and does
  // so silently — the limit simply reads low, which is what it did before.
  for (const name of Object.keys(SECRET_GRANTS)) {
    if (!grantsApplied.has(name)) {
      console.warn(`  warning: SECRET_GRANTS names no secret: ${name}`);
    }
  }
  console.log(`Processed ${secretsData.length} secrets `
    + `(${grantsApplied.size} carrying a limit grant).`);
}

// Character arcs
if (fs.existsSync(path.join(SOURCE_DIR, 'character-arcs.json'))) {
  const arcsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'character-arcs.json'), 'utf8'));

  // A beat reads "Naming the Secret. 1 Acumen reward. You give your goal a
  // name..." — the reward is stated inline, so lift it into its own field while
  // keeping the whole text as the description.
  const beat = text => {
    const t = String(text ?? '').trim();
    if (!t) return { description: '', reward: '', completed: false };
    const m = t.match(/(\d+\s+Acumen[^.]*|1\s+Joy[^.]*|1\s+Despair[^.]*)/i);
    return { description: cleanHtml(t), reward: m ? m[1].trim() : '', completed: false };
  };

  for (const data of arcsData) {
    const item = createItem(titleCase(data.name), "CharacterArc", {
      description: cleanHtml(data.description),
      cost: data.cost || '',
      status: 'planned',
      opening: beat(data.opening),
      steps: (data.steps ?? []).map(beat),
      climax: beat(data.climax),
      resolution: beat(data.resolution)
    }, 'icons/sundries/scrolls/scroll-bound-blue-brown.webp');
    writeItem("character-arcs", item);
  }
  console.log(`Processed ${arcsData.length} character-arcs.`);
}

// Hearts, Foundations and Souls. These were treated as "simple" types and only
// their description was carried across, so every mechanical field the models
// define — a heart's starting stats and skill options, a foundation's income
// and house, a soul's gift and cost — was dropped on the way into the packs.
// The models and the source data were both complete; only this step was not.
const identityTypes = [
  {
    file: 'foundations.json', type: 'Foundation', pack: 'foundations',
    icon: 'icons/environment/settlement/house-city.webp',
    map: d => ({
      description: cleanHtml(d.description),
      weeklyIncome: d.weekly_income ?? 0,
      initialSavings: d.initial_savings ?? 0,
      startingHiddenKnowledge: d.starting_hidden_knowledge ?? 0,
      houseType: d.house?.type ?? "",
      houseLevel: d.house?.level ?? 0,
      // Four foundations grant a flat number of connections; the other four
      // grant an amount that depends on the house, which the book states in
      // prose. The model carries both, so the value is routed by its type.
      connectionsCount: typeof d.connections === "number" ? d.connections : 0,
      connectionsText: typeof d.connections === "string" ? d.connections : "",
      specialRules: cleanHtml(d.special || ""),
      initialMotivations: cleanHtml(d.initial_motivations || ""),
      suggestedArcs: d.suggested_character_arcs ?? []
    })
  },
  {
    file: 'hearts.json', type: 'Heart', pack: 'hearts',
    icon: 'icons/magic/life/heart-glowing-red.webp',
    map: d => ({
      alternativeName: d.alternative_name || "",
      description: cleanHtml(d.description),
      summary: d.summary || "",
      adjectives: d.adjectives ?? [],
      startingCertes: d.starting_stats?.certes ?? 0,
      startingQualia: d.starting_stats?.qualia ?? 0,
      // Six points to divide between the two, whichever heart is taken.
      startingPoolPoints: d.starting_stats?.pool_points_to_divide ?? 6,
      cardFamily: (d.card_family || "").replace(/\.$/, ""),
      associatedAnimal: (d.associated_animal || "").replace(/\.$/, ""),
      associatedObject: (d.associated_object || "").replace(/\.$/, ""),
      skillsOptions: d.starting_skills_options ?? [],
      skillsGranted: d.starting_skills_granted ?? 2,
      skillsLevel: d.starting_skills_level ?? 1
    })
  },
  {
    file: 'souls.json', type: 'Soul', pack: 'souls',
    icon: 'icons/magic/life/ankh-gold-blue.webp',
    map: d => ({
      description: cleanHtml(d.description),
      symbolImage: d.symbol_image || "",
      guardianGift: cleanHtml(d.guardian_gift || ""),
      cost: d.cost || "",
      revelationPenalty: cleanHtml(d.revelation_penalty || "")
    })
  }
];

for (const st of identityTypes) {
  const file = path.join(SOURCE_DIR, st.file);
  if (!fs.existsSync(file)) continue;
  const dataObj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = Array.isArray(dataObj)
    ? dataObj.map(d => [d.name, d])
    : Object.entries(dataObj).map(([name, d]) => [name, typeof d === 'string' ? { description: d } : d]);

  for (const [name, data] of entries) {
    writeItem(st.pack, createItem(name, st.type, st.map(data), st.icon));
  }
  console.log(`Processed ${entries.length} ${st.pack}.`);
}

/* ── Icon check ───────────────────────────────────────────
 * A missing icon is invisible here and shows up much later as a 404 in a
 * player's console, so the paths are verified against Foundry's own icons when
 * they can be found. Set FOUNDRY_PUBLIC if the install lives elsewhere; the
 * check is skipped rather than guessed at when it cannot be located. */
const publicDir = process.env.FOUNDRY_PUBLIC
  || ["/home/ubuntu/foundryvtt/resources/app/public",
      "/opt/foundryvtt/resources/app/public"].find(p => fs.existsSync(p));

if (publicDir) {
  const seen = new Map();
  for (const pack of fs.readdirSync(PACKS_DIR)) {
    const dir = path.join(PACKS_DIR, pack);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const img = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).img;
      if (img) seen.set(img, (seen.get(img) ?? 0) + 1);
    }
  }
  const missing = [...seen].filter(([img]) =>
    !img.startsWith('systems/') && !fs.existsSync(path.join(publicDir, img)));
  if (missing.length) {
    console.error(`\n${missing.length} icon(s) do not exist in Foundry's icon set:`);
    for (const [img, n] of missing) console.error(`  ${img}  (${n} items)`);
    process.exitCode = 1;
  } else {
    console.log(`All ${seen.size} distinct icons exist.`);
  }
} else {
  console.log('Icon check skipped: set FOUNDRY_PUBLIC to enable it.');
}
