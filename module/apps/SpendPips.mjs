/**
 * Invisible Sun — spending a pool a pip at a time
 *
 * A number field asks a player how many bene they are spending. Pips tell them.
 * The pool on the character sheet is already drawn as pips, and how many are
 * there is something to be counted at a glance rather than read off a digit.
 *
 * The cap is the reason it is worth doing. A character may put one bene on an
 * action unless a secret says otherwise, and drawing exactly the number that
 * can be spent makes the limit something you can see — rather than something
 * discovered when a field refuses the 4 you typed.
 *
 * ── The total is minded, not each row ──
 * The venture dialog offers every pool, because a skill roll declares none. But
 * the cap is on the action and not on a pool — "up to 3 bene from the
 * appropriate stat pool to devote effort to an action" — so three pools holding
 * five bene each, under a cap of three, are still three between them. A fourth
 * pip has to be refused wherever in the dialog it was clicked.
 *
 * Which is why a call names the rows it governs rather than taking the lot.
 * Bene share one ceiling across every pool; Sortilege answers to its own, and
 * spending an enhancement must not eat into what may be paid in bene.
 *
 * ── How it reaches the rest of the dialog ──
 * Each row keeps a hidden input, which is what the form reads and what the
 * running venture already listens to. Setting a value in script fires no event
 * of its own, so one is dispatched: the dialog then recalculates through the
 * same path a typed digit used to take, and neither dialog needed teaching
 * about pips to keep its total honest.
 */
export class SpendPips {

  /**
   * Make one set of pip rows work.
   *
   * Called once per thing being spent, because each has its own ceiling and the
   * rows sharing one are exactly the rows the selector picks out: bene are
   * capped across every pool together, Sortilege against itself.
   *
   * `cap` may be a function, for a ceiling that moves while the dialog is open.
   * Sortilege's does: what it may add depends on whether the action already
   * carries enhancements, and the magic dice on an action are a field the
   * player can still change.
   *
   * @param {HTMLElement} root
   * @param {string} group  selector for the rows sharing a cap
   * @param {number|function} [cap]  the most that may be spent across those rows
   * @returns {{refresh: function}} draws again, for when a moving cap has moved
   */
  static wire(root, group, cap = Infinity) {
    const groups = [...(root?.querySelectorAll?.(group) ?? [])];
    if (!groups.length) return { refresh: () => {} };

    const ceiling = () => (typeof cap === "function" ? Number(cap()) : cap);

    const field = (row) => row.querySelector("input");
    const spent = (row) => Math.max(0, Math.round(Number(field(row)?.value) || 0));
    const total = () => groups.reduce((sum, row) => sum + spent(row), 0);

    /* Filled up to what this row is paying, and dimmed past what it could pay —
     * which depends on the other rows, so every row is redrawn each time. */
    const draw = () => {
      const limit = ceiling();
      const all = total();
      for (const row of groups) {
        const mine = spent(row);
        const room = limit - (all - mine);
        for (const pip of row.querySelectorAll(".spend-pip")) {
          const n = Number(pip.dataset.n);
          pip.classList.toggle("full", n <= mine);
          pip.classList.toggle("beyond", n > room);
        }
      }
    };

    const set = (row, wanted) => {
      const room = ceiling() - (total() - spent(row));
      const value = Math.max(0, Math.min(wanted, room));
      if (value === spent(row)) return;

      field(row).value = value;
      field(row).dispatchEvent(new Event("change", { bubbles: true }));
      draw();
    };

    for (const row of groups) {
      row.addEventListener("click", (event) => {
        const pip = event.target.closest?.(".spend-pip");
        if (!pip || !row.contains(pip)) return;
        event.preventDefault();

        /* Clicking the last pip you have spent takes it back, so a row can be
         * emptied without a second control to do it with. */
        const n = Number(pip.dataset.n);
        set(row, n === spent(row) ? n - 1 : n);
      });
    }

    draw();

    /* Redrawn from outside when the ceiling has moved under it, and anything
     * now over the line is given back rather than left showing as spent. */
    const refresh = () => {
      const limit = ceiling();
      for (const row of groups) {
        if (total() > limit) set(row, Math.max(0, spent(row) - (total() - limit)));
      }
      draw();
    };
    return { refresh };
  }
}
