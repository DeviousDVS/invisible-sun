/**
 * Invisible Sun — the Vance's mind
 *
 * Every case cites the rule it is holding the code to. The load-bearing one is
 * the last suite: it proves by exhaustive packing that comparing areas is the
 * same test as arranging the cards, which is the reason there is no puzzle mat.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { stubFoundry, unstubFoundry } from "./foundry-stub.mjs";
import * as vance from "../../module/helpers/vance.mjs";

before(() => stubFoundry());
after(() => unstubFoundry());

/** A spell, described by only what a case needs. */
let n = 0;
const spell = ({ spellClass = "alpha", prepared = false, halved = false,
                 spellType = "vance", converted = false, level = 1, name } = {}) => ({
  type: "Spell",
  name: name ?? `Spell ${++n}`,
  system: { spellClass, prepared, halved, spellType, converted, level }
});

describe("how much room a spell takes", () => {

  test("each class doubles the one below it", () => {
    // "alpha class (3 inches by 1.5 inches), beta class (3 by 3), gamma class
    // (3 by 6), or omega class (6 by 6)" (The Key, Vance 1st degree) — a ratio
    // of 1 : 2 : 4 : 8, which is what these numbers keep.
    assert.equal(vance.footprint(spell({ spellClass: "alpha" })), 2);
    assert.equal(vance.footprint(spell({ spellClass: "beta" })), 4);
    assert.equal(vance.footprint(spell({ spellClass: "gamma" })), 8);
    assert.equal(vance.footprint(spell({ spellClass: "omega" })), 16);
  });

  test("a reduced spell takes half", () => {
    // "we can reduce the occupying space of two of the spells we know to half
    // their original size" (The Key, Vance 2nd degree).
    assert.equal(vance.footprint(spell({ spellClass: "gamma", halved: true })), 4);
    assert.equal(vance.footprint(spell({ spellClass: "omega", halved: true })), 8);
  });

  test("nothing a mind can hold is ever a fraction", () => {
    // The reason an alpha costs 2 and not 1. In square inches a halved alpha is
    // 2.25, and the sheet would be showing quarters of a card nobody can see.
    for (const cls of Object.keys(CONFIG.ISUN.spellClasses)) {
      for (const halved of [false, true]) {
        const n = vance.footprint(spell({ spellClass: cls, halved }));
        assert.equal(n, Math.round(n), `${cls}${halved ? " halved" : ""} is ${n}`);
      }
    }
  });

  test("halving moves a spell exactly one class down", () => {
    // Not stated as a rule, but it is what the numbers do, and it is why the
    // area arithmetic stays exact rather than accumulating halves.
    for (const [big, small] of [["omega", "gamma"], ["gamma", "beta"], ["beta", "alpha"]]) {
      assert.equal(vance.footprint(spell({ spellClass: big, halved: true })),
                   vance.footprint(spell({ spellClass: small })), `${big} halved is ${small}`);
    }
  });

  test("a spell with no class recorded takes nothing, and is refused", () => {
    // A data gap, not a free spell: canPrepare turns it away rather than
    // letting a Vance carry it for nothing.
    const s = spell({ spellClass: "" });
    assert.equal(vance.footprint(s), 0);
    const mind = vance.mindState(1, []);
    assert.equal(vance.canPrepare(s, mind).allowed, false);
    assert.equal(vance.canPrepare(s, mind).reason, "ISUN.MindNoClass");
  });
});

describe("the mind grows with the degree", () => {

  test("3 x 3 at the 1st degree — two alphas, or one beta", () => {
    // "The total space we have is represented by a square that is 3 inches by
    // 3 inches" (The Key, Vance 1st degree).
    assert.deepEqual(vance.mindFor(1), { width: 3, height: 3, capacity: 4 });
    assert.equal(vance.mindFor(1).capacity,
      2 * CONFIG.ISUN.spellClasses.alpha.cost, "a 3 x 3 mind is two alphas");
  });

  test("the even degrees do not grow", () => {
    // "The storage space we have for spells does not increase" (Vance 2nd,
    // 4th and 6th degrees).
    assert.deepEqual(vance.mindFor(2), vance.mindFor(1));
    assert.deepEqual(vance.mindFor(4), vance.mindFor(3));
    assert.deepEqual(vance.mindFor(6), vance.mindFor(5));
  });

  test("3 x 6 at the 3rd, 6 x 6 at the 5th", () => {
    assert.deepEqual(vance.mindFor(3), { width: 3, height: 6, capacity: 8 });
    assert.deepEqual(vance.mindFor(5), { width: 6, height: 6, capacity: 16 });
  });

  test("no degree is no mind at all, not an empty one", () => {
    // An Apostate has no degrees. The sheet reads null as "draw nothing".
    assert.equal(vance.mindFor(0), null);
    assert.equal(vance.mindState(0, [spell()]), null);
  });

  test("only alpha and beta fit at the 1st degree", () => {
    // "the spells must be selected from those we can fit into our minds (alpha
    // or beta class) at the 1st degree" (The Key). Nothing states this as its
    // own rule here — it falls out of the geometry, which is the point.
    const mind = vance.mindState(1, []);
    for (const cls of ["alpha", "beta"]) {
      assert.equal(vance.canPrepare(spell({ spellClass: cls }), mind).allowed, true, cls);
    }
    for (const cls of ["gamma", "omega"]) {
      const answer = vance.canPrepare(spell({ spellClass: cls }), mind);
      assert.equal(answer.allowed, false, cls);
      assert.equal(answer.reason, "ISUN.MindTooLarge");
    }
  });
});

describe("what the mind is holding", () => {

  test("only prepared spells take up room", () => {
    const held = [spell({ spellClass: "beta", prepared: true }), spell({ spellClass: "beta" })];
    const mind = vance.mindState(3, held);
    assert.equal(mind.used, 4);
    assert.equal(mind.free, 4);
    assert.equal(mind.prepared, 1);
    assert.equal(mind.known, 2);
  });

  test("a general spell is not counted, prepared or not", () => {
    // A Vance may hold spells outside their grimoire and cast them the ordinary
    // way. Those are not prepared, take up no room, and must not appear against
    // the limit — unless the Vance has learned them their way, which is the
    // case below.
    const held = [
      spell({ spellClass: "omega", spellType: "general", prepared: true }),
      spell({ spellClass: "alpha", prepared: true })
    ];
    const mind = vance.mindState(3, held);
    assert.equal(mind.used, 2);
    assert.equal(mind.known, 1);
  });

  test("a general spell learned the Vancian way is counted like any other", () => {
    // "Vances may wish to learn other spells and use them in their Vancian
    // spell method, storing them in their mind for later" (The Way, p57).
    const held = [
      spell({ spellClass: "beta", spellType: "general", converted: true, prepared: true }),
      spell({ spellClass: "alpha", prepared: true })
    ];
    const mind = vance.mindState(3, held);
    assert.equal(mind.used, 6);
    assert.equal(mind.known, 2);
  });

  test("a converted spell counts against the halving allowance too", () => {
    // The allowance is over "the spells we know", and a converted spell is one
    // of them: nothing in the reduction rule turns on which deck it came from.
    const held = [spell({ spellClass: "gamma", spellType: "general",
                          converted: true, halved: true })];
    assert.equal(vance.mindState(2, held).reductions.used, 1);
  });

  test("over capacity is reported, never blocked", () => {
    // The same footing as the ephemera and object limits: a cap the system
    // computes too low must not stop a player recording what the rules allow.
    const held = [spell({ spellClass: "omega", prepared: true })];
    const mind = vance.mindState(3, held);
    assert.equal(mind.over, true);
    assert.equal(mind.used, 16);
    assert.equal(mind.free, -8);
  });

  test("unpreparing is always allowed, even when over", () => {
    const s = spell({ spellClass: "omega", prepared: true });
    const mind = vance.mindState(3, [s]);
    assert.equal(vance.canPrepare(s, mind).allowed, true);
  });

  test("a spell that fits the mind but not the room left says so", () => {
    const held = [spell({ spellClass: "beta", prepared: true }),
                  spell({ spellClass: "beta", prepared: true })];
    const mind = vance.mindState(3, held);
    const answer = vance.canPrepare(spell({ spellClass: "alpha" }), mind);
    assert.equal(answer.allowed, false);
    assert.equal(answer.reason, "ISUN.MindNoRoom", "not MindTooLarge — it would fit an empty mind");
  });
});

describe("reductions", () => {

  test("two more at each of the 2nd, 4th and 6th degrees", () => {
    assert.equal(vance.reductionsFor(1), 0);
    assert.equal(vance.reductionsFor(2), 2);
    assert.equal(vance.reductionsFor(4), 4);
    assert.equal(vance.reductionsFor(6), 6);
  });

  test("the odd degrees grant none of their own", () => {
    assert.equal(vance.reductionsFor(3), vance.reductionsFor(2));
    assert.equal(vance.reductionsFor(5), vance.reductionsFor(4));
  });

  test("counted across every Vancian spell, not only the prepared ones", () => {
    // "two of the spells we know" — knowing, not holding in mind. A reduction
    // spent on a shelved spell is still spent.
    const held = [spell({ spellClass: "gamma", halved: true }),
                  spell({ spellClass: "beta", halved: true, prepared: true })];
    const mind = vance.mindState(3, held);
    assert.equal(mind.reductions.used, 2);
    assert.equal(mind.reductions.value, 2);
    assert.equal(mind.reductions.over, false);
  });

  test("going over the allowance is reported", () => {
    const held = [spell({ spellClass: "gamma", halved: true }),
                  spell({ spellClass: "gamma", halved: true })];
    assert.equal(vance.mindState(1, held).reductions.over, true);
  });

  test("a reduced spell buys room", () => {
    // A gamma costs 8 and fills a 3 x 6 mind on its own; halved, it is a beta
    // at 4 and leaves room for another.
    const whole = [spell({ spellClass: "gamma", prepared: true }),
                   spell({ spellClass: "beta", prepared: true })];
    assert.equal(vance.mindState(3, whole).over, true);

    const reduced = [spell({ spellClass: "gamma", prepared: true, halved: true }),
                     spell({ spellClass: "beta", prepared: true })];
    const mind = vance.mindState(3, reduced);
    assert.equal(mind.over, false);
    assert.equal(mind.used, 8);
    assert.equal(mind.free, 0);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Why one number is allowed to stand in for the cards
 * ────────────────────────────────────────────────────────────────── */

describe("cost is the printed size in different units", () => {

  /* The sheet counts `cost` and `capacity`, which are not inches. That is only
   * legitimate while they stay in exact proportion to what the book prints, so
   * this pins them together: a class or a mind added with a rectangle and no
   * cost, or a cost that does not match its rectangle, fails here rather than
   * silently charging a Vance the wrong amount. */

  const ratios = (entries) => entries.map(([, spec]) =>
    (spec.cost ?? spec.capacity) / (spec.width * spec.height));

  test("every spell class costs the same per square inch", () => {
    const r = ratios(Object.entries(CONFIG.ISUN.spellClasses));
    assert.equal(new Set(r).size, 1, `ratios differ: ${r.join(", ")}`);
  });

  test("every mind holds the same per square inch", () => {
    const r = ratios(Object.entries(CONFIG.ISUN.vancianMind));
    assert.equal(new Set(r).size, 1, `ratios differ: ${r.join(", ")}`);
  });

  test("and spells and minds use the one scale between them", () => {
    // The whole point: a spell measured on one scale and a mind on another
    // would give answers no table could reproduce with the cards.
    const [spells] = new Set(ratios(Object.entries(CONFIG.ISUN.spellClasses)));
    const [minds] = new Set(ratios(Object.entries(CONFIG.ISUN.vancianMind)));
    assert.equal(spells, minds);
  });
});

describe("area is the same test as arrangement", () => {

  /* The book has a Vance lay cards of four sizes inside a rectangle, "arranged
   * as the Vance sees fit", which reads like a packing problem. It is not one.
   *
   * Everything is a whole multiple of 1.5in, so in those units the pieces are
   * 2x1, 2x2, 4x2 and 4x4 and the containers 2x2, 2x4 and 4x4. This packs every
   * combination that fits by area and asserts that all of them can be arranged.
   * If a future book adds a class that breaks the pattern, this fails, and the
   * area shortcut has to be revisited rather than quietly becoming wrong. */

  /* 0.75in, not 1.5in: a halved alpha is 3 x 0.75, and a grid too coarse to
   * express it would be proving something easier than the real question. */
  const UNIT = 0.75;
  const containers = [1, 3, 5].map(d => {
    const m = vance.mindFor(d);
    return { name: `${m.width}x${m.height}`, w: m.width / UNIT, h: m.height / UNIT };
  });

  /* Every footprint a mind can be asked to hold: each class, and each class
   * halved. Halving takes the longer side, which is what puts a reduced spell
   * on the next class down.
   *
   * Deduplicated by shape, because that is what packing cares about and the
   * names collide anyway — a halved gamma and a beta are the same rectangle. */
  const shapes = new Map();
  for (const [name, spec] of Object.entries(CONFIG.ISUN.spellClasses)) {
    const w = spec.width / UNIT, h = spec.height / UNIT;
    const half = w > h ? [w / 2, h] : [w, h / 2];
    for (const [label, dims] of [[name, [w, h]], [`${name}/2`, half]]) {
      const key = [Math.min(...dims), Math.max(...dims)].join("x");
      if (!shapes.has(key)) shapes.set(key, { name: label, w: dims[0], h: dims[1] });
    }
  }
  const pieces = [...shapes.values()];

  /** Can these pieces be laid inside the container? Exhaustive, largest first. */
  function packable(items, W, H) {
    const grid = Array.from({ length: H }, () => Array(W).fill(false));
    const sorted = [...items].sort((a, b) => b.w * b.h - a.w * a.h);
    const fits = (x, y, w, h) => {
      if (x + w > W || y + h > H) return false;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j][i]) return false;
      return true;
    };
    const mark = (x, y, w, h, v) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = v;
    };
    const place = (k) => {
      if (k === sorted.length) return true;
      const { w: pw, h: ph } = sorted[k];
      const orients = pw === ph ? [[pw, ph]] : [[pw, ph], [ph, pw]];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const [w, h] of orients) {
        if (!fits(x, y, w, h)) continue;
        mark(x, y, w, h, true);
        if (place(k + 1)) return true;
        mark(x, y, w, h, false);
      }
      return false;
    };
    return place(0);
  }

  for (const c of containers) {
    test(`every load that fits a ${c.name} mind by area can be arranged`, () => {
      const cap = c.w * c.h;
      const failures = [];
      let tested = 0;

      const walk = (start, chosen, area) => {
        if (chosen.length) {
          tested += 1;
          if (!packable(chosen, c.w, c.h)) failures.push(chosen.map(p => p.name).join(" + "));
        }
        for (let i = start; i < pieces.length; i++) {
          const a = pieces[i].w * pieces[i].h;
          if (area + a > cap) continue;
          chosen.push(pieces[i]);
          walk(i, chosen, area + a);
          chosen.pop();
        }
      };
      walk(0, [], 0);

      assert.ok(tested > 0, "the search found nothing to test");
      assert.deepEqual(failures, [],
        "these fit by area but cannot be laid out, so the area shortcut is unsound");
    });
  }
});

describe("learning a spell that is not a Vance's own", () => {

  // "A spell can be placed within a Vancian spell class using these
  // guidelines: Level 1–3 alpha class, Level 4–5 beta class, Level 6–7 gamma
  // class, Level 8–10 omega class" (The Way, p57).
  test("each band takes the class the book gives it", () => {
    const expected = {
      1: "alpha", 2: "alpha", 3: "alpha",
      4: "beta",  5: "beta",
      6: "gamma", 7: "gamma",
      8: "omega", 9: "omega", 10: "omega"
    };
    for (const [level, cls] of Object.entries(expected)) {
      assert.equal(vance.classForLevel(Number(level)), cls, `level ${level}`);
    }
  });

  test("the bands are three, two, two, three and not four fours", () => {
    // The one thing a formula would get wrong. Written out so that a table
    // edited into even bands fails here rather than quietly misplacing every
    // spell of level 4 and up.
    assert.equal(vance.classForLevel(3), "alpha");
    assert.equal(vance.classForLevel(4), "beta");
    assert.equal(vance.classForLevel(5), "beta");
    assert.equal(vance.classForLevel(6), "gamma");
    assert.equal(vance.classForLevel(7), "gamma");
    assert.equal(vance.classForLevel(8), "omega");
  });

  test("a level off the end of the table still lands somewhere", () => {
    // The deck runs 1 to 10, so neither happens in play. A spell with no class
    // would count as no room at all, which is the one answer the rules
    // certainly do not give.
    assert.equal(vance.classForLevel(0), "alpha");
    assert.equal(vance.classForLevel(99), "omega");
    assert.equal(vance.classForLevel(undefined), "alpha");
  });

  test("every band names a class that exists", () => {
    // The table is a GM's to edit, and a class the config does not define would
    // give a footprint of zero — a spell carried for nothing.
    for (const band of CONFIG.ISUN.vancianConversion) {
      assert.ok(CONFIG.ISUN.spellClasses[band.spellClass],
        `${band.spellClass} is not a spell class`);
    }
  });

  test("the bands ascend, so the first match is the right one", () => {
    // classForLevel takes the first band the level fits. Out of order, a
    // level-9 spell would be placed in whichever band happened to come first.
    const tops = CONFIG.ISUN.vancianConversion.map(b => b.upTo);
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b));
  });

  test("a converted spell is one the Vancian rules apply to", () => {
    assert.equal(vance.isVancian(spell({ spellType: "general" })), false);
    assert.equal(vance.isVancian(spell({ spellType: "general", converted: true })), true);
    assert.equal(vance.isVancian(spell({ spellType: "vance" })), true);
    assert.equal(vance.isVancian({ type: "Incantation", system: { converted: true } }), false);
  });

  test("but only one of the tradition's own is a Vance spell", () => {
    // The two part company at the moment of casting: a converted spell can be
    // cast out of Sorcery and one of the tradition's own cannot.
    assert.equal(vance.isVanceSpell(spell({ spellType: "vance" })), true);
    assert.equal(vance.isVanceSpell(spell({ spellType: "general", converted: true })), false);
    assert.equal(vance.isVanceSpell(spell({ spellType: "general" })), false);
  });

  test("held in mind is a fact about now, not about the deck", () => {
    // What decides the price of casting. A spell that could be held and is not
    // is cast the way any other spell of its level is.
    assert.equal(vance.heldInMind(spell({ spellType: "vance", prepared: true })), true);
    assert.equal(vance.heldInMind(spell({ spellType: "vance" })), false);
    assert.equal(vance.heldInMind(spell({ spellType: "general", converted: true, prepared: true })), true);
    assert.equal(vance.heldInMind(spell({ spellType: "general", converted: true })), false);
    // Never, for a spell nobody has learned that way — the tick would be
    // meaningless and must not be read as holding anything.
    assert.equal(vance.heldInMind(spell({ spellType: "general", prepared: true })), false);
  });

  test("only a spell that is not already Vancian is offered the conversion", () => {
    assert.equal(vance.canConvert(spell({ spellType: "general" })), true);
    assert.equal(vance.canConvert(spell({ spellType: "weaver" })), true);
    assert.equal(vance.canConvert(spell({ spellType: "vance" })), false,
      "one of their own is Vancian by being what it is");
    assert.equal(vance.canConvert(spell({ spellType: "general", converted: true })), false);
    assert.equal(vance.canConvert({ type: "Gear", system: {} }), false);
  });

  test("learning fixes the class from the level and puts nothing in mind", () => {
    // Preparation "takes about an hour" and is its own act, made against
    // whatever room is free at the time — and until it happens the spell is
    // cast the way it always was.
    const { system } = vance.conversion(spell({ spellType: "general", level: 6 }), true);
    assert.equal(system.converted, true);
    assert.equal(system.spellClass, "gamma");
    assert.equal(system.prepared, false);
    assert.equal(system.halved, false);
  });

  test("releasing takes back the class as well as the conversion", () => {
    // A spell cast out of Sorcery has no footprint. Clearing the class rather
    // than keeping it means a spell learned again after a change of level is
    // placed by the band it is in now.
    const held = spell({ spellType: "general", spellClass: "omega",
                         converted: true, prepared: true, halved: true, level: 9 });
    const { system } = vance.conversion(held, false);
    assert.equal(system.converted, false);
    assert.equal(system.spellClass, "");
    assert.equal(system.prepared, false);
    assert.equal(system.halved, false);
  });

  test("a released spell leaves the mind it was taking up", () => {
    // The whole point of the release: the room comes back.
    const learned = spell({ spellType: "general", spellClass: "beta",
                            converted: true, prepared: true });
    assert.equal(vance.mindState(1, [learned]).used, 4);

    const { system } = vance.conversion(learned, false);
    Object.assign(learned.system, system);
    assert.equal(vance.mindState(1, [learned]).used, 0);
  });

  test("a converted spell can be prepared, and is refused the same way", () => {
    const learned = spell({ spellType: "general", spellClass: "beta", converted: true });
    assert.equal(vance.canPrepare(learned, vance.mindState(1, [])).allowed, true);

    // A 3 x 3 mind holds 4; a beta is 4 and an alpha will not follow it in.
    const full = vance.mindState(1, [spell({ spellClass: "beta", prepared: true })]);
    assert.equal(vance.canPrepare(learned, full).reason, "ISUN.MindNoRoom");
  });
});
