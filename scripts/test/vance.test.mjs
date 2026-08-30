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
                 spellType = "vance", name } = {}) => ({
  type: "Spell",
  name: name ?? `Spell ${++n}`,
  system: { spellClass, prepared, halved, spellType, level: 1 }
});

describe("how much room a spell takes", () => {

  test("each class is the rectangle printed on its card", () => {
    // "alpha class (3 inches by 1.5 inches), beta class (3 by 3), gamma class
    // (3 by 6), or omega class (6 by 6)" (The Key, Vance 1st degree).
    assert.equal(vance.footprint(spell({ spellClass: "alpha" })), 4.5);
    assert.equal(vance.footprint(spell({ spellClass: "beta" })), 9);
    assert.equal(vance.footprint(spell({ spellClass: "gamma" })), 18);
    assert.equal(vance.footprint(spell({ spellClass: "omega" })), 36);
  });

  test("a reduced spell takes half", () => {
    // "we can reduce the occupying space of two of the spells we know to half
    // their original size" (The Key, Vance 2nd degree).
    assert.equal(vance.footprint(spell({ spellClass: "gamma", halved: true })), 9);
    assert.equal(vance.footprint(spell({ spellClass: "omega", halved: true })), 18);
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

  test("3 x 3 at the 1st degree", () => {
    // "The total space we have is represented by a square that is 3 inches by
    // 3 inches" (The Key, Vance 1st degree).
    assert.deepEqual(vance.mindFor(1), { width: 3, height: 3, area: 9 });
  });

  test("the even degrees do not grow", () => {
    // "The storage space we have for spells does not increase" (Vance 2nd,
    // 4th and 6th degrees).
    assert.deepEqual(vance.mindFor(2), vance.mindFor(1));
    assert.deepEqual(vance.mindFor(4), vance.mindFor(3));
    assert.deepEqual(vance.mindFor(6), vance.mindFor(5));
  });

  test("3 x 6 at the 3rd, 6 x 6 at the 5th", () => {
    assert.deepEqual(vance.mindFor(3), { width: 3, height: 6, area: 18 });
    assert.deepEqual(vance.mindFor(5), { width: 6, height: 6, area: 36 });
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
    assert.equal(mind.used, 9);
    assert.equal(mind.free, 9);
    assert.equal(mind.prepared, 1);
    assert.equal(mind.known, 2);
  });

  test("a general spell is not counted, prepared or not", () => {
    // A Vance may hold spells outside their grimoire. Those are not prepared,
    // take up no room, and must not appear against the limit.
    const held = [
      spell({ spellClass: "omega", spellType: "general", prepared: true }),
      spell({ spellClass: "alpha", prepared: true })
    ];
    const mind = vance.mindState(3, held);
    assert.equal(mind.used, 4.5);
    assert.equal(mind.known, 1);
  });

  test("over capacity is reported, never blocked", () => {
    // The same footing as the ephemera and object limits: a cap the system
    // computes too low must not stop a player recording what the rules allow.
    const held = [spell({ spellClass: "omega", prepared: true })];
    const mind = vance.mindState(3, held);
    assert.equal(mind.over, true);
    assert.equal(mind.used, 36);
    assert.equal(mind.free, -18);
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
    // A gamma is 18 and will not fit beside anything in a 3 x 6 mind; halved,
    // it is a beta and leaves room for another.
    const whole = [spell({ spellClass: "gamma", prepared: true }),
                   spell({ spellClass: "beta", prepared: true })];
    assert.equal(vance.mindState(3, whole).over, true);

    const reduced = [spell({ spellClass: "gamma", prepared: true, halved: true }),
                     spell({ spellClass: "beta", prepared: true })];
    const mind = vance.mindState(3, reduced);
    assert.equal(mind.over, false);
    assert.equal(mind.used, 18);
    assert.equal(mind.free, 0);
  });
});

/* ──────────────────────────────────────────────────────────────────
 * Why there is no puzzle mat
 * ────────────────────────────────────────────────────────────────── */

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
