/**
 * Invisible Sun — logging a Playwright page into a world
 *
 * Shared because there are two callers and there was very nearly a third, and
 * because the shape of the join page is not ours to rely on: Foundry 14.366
 * replaced the user dropdown with a text input and an autocomplete, which broke
 * `selectOption("select[name=userid]")` in both scripts at once.
 *
 * So this asks the page what it is rather than assuming. It handles the select
 * and the text input, and a version that offered neither would fail here with a
 * sentence saying so instead of a Playwright timeout thirty seconds later.
 */

/**
 * Log in and wait for the world to be ready.
 *
 * @param {import("playwright").Page} page
 * @param {object}  options
 * @param {string}  options.user       the user to join as
 * @param {string}  [options.password]
 * @param {string}  [options.base]     defaults to http://localhost:30000
 * @param {number}  [options.timeout]  how long to wait for `game.ready`
 */
export async function join(page, { user, password = "", base = "http://localhost:30000",
                                   timeout = 90_000 } = {}) {
  await page.goto(`${base}/join`, { waitUntil: "networkidle" });
  await nameTheUser(page, user);
  await page.fill("input[name=password]", password);
  await page.click("button[name=join]");

  try {
    await page.waitForURL("**/game", { timeout: 30_000 });
  } catch {
    const message = await page.locator("#notifications").textContent().catch(() => "");
    throw new Error(`Login failed for "${user}". ${message?.trim() || "still on the join page"}`);
  }
  await page.waitForFunction(() => window.game?.ready === true, { timeout });
  return page;
}

/**
 * Put the user's name into whatever control the join page is offering.
 *
 * Up to 14.365 that is a `<select>` of every user in the world. From 14.366 it
 * is a text input with autocompletion — the name is typed, and typing it in
 * full is enough, so the suggestion list does not have to be driven.
 */
async function nameTheUser(page, user) {
  const field = page.locator("[name=userid]").first();
  await field.waitFor({ state: "attached", timeout: 20_000 });
  const tag = await field.evaluate(el => el.tagName.toLowerCase());

  if (tag === "select") {
    await field.selectOption({ label: user });
    return;
  }
  if (tag === "input") {
    await field.fill(user);
    /* Blur, so an autocomplete that commits its value on change has done so
     * before the form is submitted. */
    await field.press("Tab");
    return;
  }
  throw new Error(`The join page offers a <${tag}> for the user, which this `
    + `script does not know how to fill. Foundry has changed the login form.`);
}
