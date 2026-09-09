/**
 * Invisible Sun — the Maker's Matrix
 *
 * "Makers make. It's what they do. The process is costly in terms of time and
 * money, but the results are extraordinary. The Maker's Matrix is the name given
 * to the system for determining how a Maker creates a magical item" (The Way,
 * p58).
 *
 * The chart on p62 is the whole rule, and it is a state machine: a working level
 * that climbs, a challenge thrown against it, and two ways out of every box. So
 * this is the chart, and nothing else — no dice, no documents, no dialog. What
 * it does is answer "where does this go next", which is the one part of the
 * process that must not be got wrong quietly.
 *
 * The shape of the chart lives in `CONFIG.ISUN.makerMatrix`, one entry a box.
 * This walks it.
 *
 * ── Two readings the chart forces, written down ──
 * The chart is drawn, not stated, and two of its edges are only legible from the
 * diagram itself rather than from the text extracted out of it. Both are pinned
 * by name in scripts/test/matrix.test.mjs so that a later misreading fails
 * rather than quietly changing what the process does.
 *
 *   Side effects rejoin at Add Ingredient. Both the minor and the major boxes
 *   arrow back up into it, which is what makes a catalyst or a stabilizer a
 *   recovery — "catalysts or even stabilizers must be added to continue the
 *   process" — rather than a dead end.
 *
 *   Failing the last challenge is a mishap. The long arrow out of the final
 *   challenge runs the width of the chart into Mishap; it does not fall back
 *   onto the catalyst path. Having added the power source there is no recovery
 *   left to attempt.
 *
 * ── And one the chart gets wrong ──
 * The diamond asks "Does x = Desired Item Level?", and taken literally that is a
 * trap: every failure raises the working level twice, so a process that starts
 * for a level 4 item can step 3 → 5 and never be equal to 4 again. The Maker
 * would then be unable to finish however well they rolled. Read as "has it
 * reached the level", which is what the surrounding text describes — "this
 * process continues until the Maker succeeds at a challenge equal to the level
 * of the desired effect" — it behaves. `atLevel` below is that reading.
 */

/** The chart, or an empty one if a world has somehow cleared it. */
const chart = () => CONFIG.ISUN.makerMatrix ?? {};

/**
 * What level the thing being made actually is.
 *
 * "The effect dictates the level required… This is then modified by the kind of
 * item being made — specifically, how often it can be used before the magic
 * depletes (minimum, level 1)" (The Way, p59).
 *
 * Two levels come out of this and they are not the same number. `level` is what
 * the item ends up being, what it costs in Sorcery, and what the material must
 * match. `inProcess` is what the challenges are actually rolled against, which a
 * Maker can lower by agreeing in advance to live with a flaw. The distinction is
 * the book's: a deliberate side effect changes "its in-process level. This is
 * different from its final level, which does not change".
 *
 * @param {object} spec
 * @param {number} spec.effectLevel   off the Effects by Level table
 * @param {string} spec.kind          a key of CONFIG.ISUN.makerItemKinds
 * @param {number} [spec.minor]       minor side effects taken on purpose
 * @param {number} [spec.major]       major side effects taken on purpose
 * @returns {{level: number, inProcess: number, modifier: number, relief: number}}
 */
export function craftLevel({ effectLevel = 1, kind = "object0to4", minor = 0, major = 0 } = {}) {
  const modifier = CONFIG.ISUN.makerItemKinds?.[kind]?.modifier ?? 0;
  const level = Math.max(1, (Number(effectLevel) || 0) + modifier);

  const worth = CONFIG.ISUN.makerSideEffectRelief ?? {};
  const relief = (Math.max(0, minor) * (worth.minor ?? 0))
               + (Math.max(0, major) * (worth.major ?? 0));

  return { level, modifier, relief, inProcess: Math.max(1, level - relief) };
}

/**
 * How long the work takes, and what hurrying it costs.
 *
 * "Assuming that a Maker has all the materials, ingredients, and so on at hand,
 * the process takes two days per item level, plus one day for every challenge
 * failed… A Maker can attempt to speed up the process, but for every day shaved
 * off the total, all challenges involved are 1 level higher" (The Way, p58).
 *
 * The bonus is returned rather than applied, because it is a price the Maker
 * agrees to before starting and the challenges it raises have not happened yet.
 *
 * @returns {{days: number, challengeBonus: number}}
 */
export function daysFor({ level = 1, failures = 0, shaved = 0 } = {}) {
  const perLevel = CONFIG.ISUN.makerDaysPerLevel ?? 2;
  const full = Math.max(0, level) * perLevel + Math.max(0, failures);
  /* A day cannot be shaved off a day that is not there. Hurrying past the whole
   * length of the work is not a shorter process, it is a different rule. */
  const taken = Math.min(Math.max(0, shaved), Math.max(0, full - 1));
  return { days: full - taken, challengeBonus: taken };
}

/**
 * How many emotion or concept leaves stand in for a component of this level.
 *
 * One, until the book says otherwise: it names a count only where the count is
 * more than one, and the counts climb steeply from level 6.
 */
export function leavesFor(level) {
  return CONFIG.ISUN.makerLeafCosts?.[level] ?? 1;
}

/**
 * A process about to begin.
 *
 * `x` is the chart's working level and starts at 1 — "the first of many
 * challenges, always starting at level 1" — whatever the item's own level is.
 * The item's level is what the material must match and where the process is
 * trying to get to.
 */
export function begin({ level = 1, inProcess = null, shaved = 0 } = {}) {
  return {
    node: "material",
    x: 1,
    level,
    /* What the challenges climb towards. The same as the item's level unless a
     * side effect was taken on purpose to make the work easier. */
    target: inProcess ?? level,
    challengeBonus: Math.max(0, shaved),
    failures: 0,
    sideEffects: [],
    history: []
  };
}

/**
 * What the process is waiting for, and what it needs to be told.
 *
 * Everything a caller needs to draw one step: whether it wants a roll, a
 * component or a decision, the challenge to roll against, and the level the
 * component has to be. Terminal boxes report how it ended and want nothing.
 *
 * @returns {{node: string, needs: string|null, ends: string|null,
 *            challenge: number|null, componentLevel: number|null}}
 */
export function step(state) {
  const box = chart()[state?.node] ?? {};
  return {
    node: state?.node ?? "",
    needs: box.ends ? null : (box.needs ?? null),
    ends: box.ends ?? null,
    challenge: box.at ? challengeFor(state, box.at) : null,
    componentLevel: box.level ? componentLevelFor(state, box.level) : null
  };
}

/** The number a challenge is rolled against, including any price for hurrying. */
function challengeFor(state, at) {
  const base = at === "x+1" ? state.x + 1 : state.x;
  return base + (state.challengeBonus ?? 0);
}

/**
 * What level the component has to be.
 *
 * The material matches the item; everything added along the way matches the
 * working level, which by the time a box is asking has already climbed.
 */
function componentLevelFor(state, level) {
  return level === "final" ? state.level : state.x;
}

/**
 * Take one step through the chart.
 *
 * `answer` is whatever the current box wants: "success" or "failure" from a
 * roll, "added" once a component is in, "yes" or "no" from the Maker. An answer
 * the box does not recognise leaves the state untouched, so a mis-wired caller
 * stalls in place rather than skipping a step nobody performed.
 *
 * Returns a new state; the one passed in is not modified, which is what lets a
 * caller keep the previous step to undo to.
 */
export function advance(state, answer) {
  const box = chart()[state?.node];
  if (!box || box.ends) return state;

  const next = box.next?.[answer];
  if (!next) return state;

  const moved = {
    ...state,
    sideEffects: [...state.sideEffects],
    history: [...state.history, { node: state.node, answer, x: state.x }]
  };

  if (answer === "failure") moved.failures += 1;
  if (state.node === "minorSideEffect") moved.sideEffects.push("minor");
  if (state.node === "majorSideEffect") moved.sideEffects.push("major");

  moved.node = next;

  /* The increment belongs to the box being entered, not the one being left:
   * the chart writes "(x now = x + 1)" inside Add Ingredient, and the level of
   * the ingredient is read after it. See the note in the config. */
  if (chart()[next]?.bumps) moved.x += 1;

  /* The diamond decides itself. Nobody is asked whether the working level has
   * reached the target, so the process never rests there. */
  if (moved.node === "atLevel") {
    const reached = moved.x >= moved.target;
    moved.history.push({ node: "atLevel", answer: reached ? "yes" : "no", x: moved.x });
    moved.node = chart().atLevel.next[reached ? "yes" : "no"];
  }

  return moved;
}

/** Has the process finished, and how? */
export function ended(state) {
  return chart()[state?.node]?.ends ?? null;
}
