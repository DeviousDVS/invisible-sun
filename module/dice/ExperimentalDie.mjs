/**
 * Invisible Sun — The Experimental Die
 *
 * "The Experimental Die ... looks just like a normal Invisible Sun die except
 * that it has nine blank faces. The only face with a symbol indicates flux.
 * This means that it never contributes to successes, only to flux. Rolling
 * flux on the Experimental Die is just like rolling it on any other magical
 * die, and using the die means that it increases the chance for greater flux."
 * (The Nightside, p518)
 *
 * It is a d10 in every physical respect, so it is a Die of ten faces. What
 * makes it different is how the result is read, which is the roller's job: the
 * marked face is the only one that means anything.
 *
 * An Invisible Sun die reads 0-9, and Foundry's dice roll 1..faces, so the
 * tenth face is the 0 — and on a magic die a 0 is flux. The marked face is
 * therefore face 10.
 */
export class ExperimentalDie extends foundry.dice.terms.Die {
  constructor(termData = {}) {
    super({ ...termData, faces: 10 });
  }

  /** Rolled as `1de`. */
  static DENOMINATION = "e";

  /** The face Foundry reports for the one marked side. */
  static FLUX_FACE = 10;

  /** How many of this term's active dice came up flux. */
  get fluxCount() {
    return this.results.filter(r => r.active && r.result === ExperimentalDie.FLUX_FACE).length;
  }
}
