// Feature A: the per-message camera button generates for THAT message, into its own gallery.
import { test, expect } from "@playwright/test";
import { GEN_TIMEOUT, addMessages, openST, openScratchChat, setCheckbox, trackExtensionErrors } from "./helpers.mjs";

const BTN = ".kazuma_msg_gen_btn";

/** media count per chat message, plus how many of them are ours. */
const mediaState = (page) => page.evaluate(() => SillyTavern.getContext().chat.map((m) => ({
    name: m.name, media: m.extra?.media?.length || 0, ours: (m.extra?.media || []).filter((x) => x.kazuma).length,
})));

let debugWas;
test.beforeEach(async ({ page }) => {
    await openST(page);
    // Diagnostic Mode would stop at its review popup; restore whatever the user had afterwards.
    debugWas = await page.locator("#kazuma_debug").isChecked();
    await setCheckbox(page, "kazuma_debug", false);
    await openScratchChat(page);
    await addMessages(page, [
        { is_user: true, mes: "I light the lantern and look around the cabin." },
        { mes: "The cabin is small, with a wood stove and a red quilt on the bed." },
        { is_user: true, mes: "I step outside into the snow." },
        { mes: "Snow falls over the pine forest; the lantern glows in the dark." },
    ]);
});
test.afterEach(async ({ page }) => {
    if (debugWas !== undefined) await setCheckbox(page, "kazuma_debug", debugWas);
});

test("button is on every message exactly once, and survives a chat reload", async ({ page }) => {
    const count = await page.locator("#chat .mes").count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
        await expect(page.locator("#chat .mes").nth(i).locator(BTN)).toHaveCount(1);
    }
    // A message rendered after init comes from the template, so it has one too.
    await addMessages(page, [{ is_user: true, mes: "one more" }]);
    await expect(page.locator("#chat .mes").last().locator(BTN)).toHaveCount(1);

    // Re-render the whole chat (what a chat switch does) - still one each, no duplicates.
    await page.evaluate(() => SillyTavern.getContext().reloadCurrentChat());
    await expect(page.locator("#chat .mes")).toHaveCount(count + 1);
    const perMessage = await page.locator("#chat .mes").evaluateAll((els, sel) => els.map((e) => e.querySelectorAll(sel).length), BTN);
    expect(new Set(perMessage)).toEqual(new Set([1]));
});

test("clicking the button on message N puts the image in message N's gallery", async ({ page }) => {
    const errors = trackExtensionErrors(page);
    const before = await mediaState(page);
    const n = before.length - 3; // the cabin reply: a past message, not the last one

    await page.locator(`#chat .mes[mesid="${n}"] ${BTN}`).dispatchEvent("click");
    await page.waitForFunction((n) => (SillyTavern.getContext().chat[n].extra?.media?.length || 0) > 0, n, { timeout: GEN_TIMEOUT });

    const after = await mediaState(page);
    expect(after.length).toBe(before.length); // no new "Image Gen Kazuma" message appended
    expect(after[n].ours).toBe(1);
    after.forEach((m, i) => { if (i !== n) expect(m.media).toBe(before[i].media); });
    await expect(page.locator(`#chat .mes[mesid="${n}"] .mes_img`).first()).toBeVisible();
    expect(errors).toEqual([]);
});

test("swipe right on a past-message image makes a variation in the same gallery", async ({ page }) => {
    const overswipe = await page.evaluate(() => SillyTavern.getContext().powerUserSettings.image_overswipe);
    test.skip(overswipe !== "generate", `User Settings > Image Swipe Behavior is "${overswipe}", not "generate"`);

    const n = (await mediaState(page)).length - 3;
    await page.locator(`#chat .mes[mesid="${n}"] ${BTN}`).dispatchEvent("click");
    await page.waitForFunction((n) => (SillyTavern.getContext().chat[n].extra?.media?.length || 0) === 1, n, { timeout: GEN_TIMEOUT });
    // Let the first generation fully finish (progress overlay gone) before swiping.
    await expect(page.locator("#kazuma_progress_overlay")).toBeHidden({ timeout: GEN_TIMEOUT });

    await page.locator(`#chat .mes[mesid="${n}"] .mes_img_swipe_right`).dispatchEvent("click");
    await page.waitForFunction((n) => (SillyTavern.getContext().chat[n].extra?.media?.length || 0) === 2, n, { timeout: GEN_TIMEOUT });
    expect((await mediaState(page))[n].ours).toBe(2);
});

test("a second click while generating is ignored", async ({ page }) => {
    const n = (await mediaState(page)).length - 1;
    const btn = page.locator(`#chat .mes[mesid="${n}"] ${BTN}`);
    await btn.dispatchEvent("click");
    await btn.dispatchEvent("click");
    await page.waitForFunction((n) => (SillyTavern.getContext().chat[n].extra?.media?.length || 0) > 0, n, { timeout: GEN_TIMEOUT });
    await expect(page.locator("#kazuma_progress_overlay")).toBeHidden({ timeout: GEN_TIMEOUT });
    expect((await mediaState(page))[n].ours).toBe(1);
});

test("Diagnostic Mode still shows its review popup, and Send lands in message N", async ({ page }) => {
    await setCheckbox(page, "kazuma_debug", true);
    const n = (await mediaState(page)).length - 3;
    await page.locator(`#chat .mes[mesid="${n}"] ${BTN}`).dispatchEvent("click");

    const popup = page.locator("dialog.popup[open]").filter({ hasText: "Review generated prompt" });
    await expect(popup).toBeVisible({ timeout: GEN_TIMEOUT });
    await expect(popup.locator(".popup-content textarea")).not.toHaveValue("");
    await popup.locator(".popup-button-ok").click();

    await page.waitForFunction((n) => (SillyTavern.getContext().chat[n].extra?.media?.length || 0) > 0, n, { timeout: GEN_TIMEOUT });
    expect((await mediaState(page))[n].ours).toBe(1);
});
