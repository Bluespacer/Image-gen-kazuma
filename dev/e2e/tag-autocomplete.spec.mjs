// Feature C: tag suggestions in the Diagnostic Mode review box.
// Uses whatever tags.csv is installed in the extension folder; skipped if there is none.
import { test, expect } from "@playwright/test";
import { EXT, GEN_TIMEOUT, addMessages, openST, openScratchChat, setCheckbox, setSelect, trackExtensionErrors } from "./helpers.mjs";

/** A tag from the installed list and a prefix of it, read the same way the extension reads it. */
async function pickTag(page) {
    return page.evaluate(async (ext) => {
        const res = await fetch(`scripts/extensions/third-party/${ext}/tags.csv`);
        if (!res.ok) return null;
        const first = (await res.text()).split(/\r?\n/).find((l) => l.trim());
        const tag = first.split(",")[0].trim();
        return { tag, prefix: tag.slice(0, Math.min(4, tag.length)) };
    }, EXT);
}

let saved;
test.beforeEach(async ({ page }) => {
    await openST(page);
    saved = await page.evaluate(() => {
        const s = SillyTavern.getContext().extensionSettings["Image-gen-kazuma"];
        return { debug: !!s.debugPrompt, auto: s.tagAutocomplete !== false, style: s.tagInsertStyle || "underscores" };
    });
});
test.afterEach(async ({ page }) => {
    if (!saved) return;
    await setCheckbox(page, "kazuma_debug", saved.debug);
    await setCheckbox(page, "kazuma_tag_autocomplete", saved.auto);
    await setSelect(page, "kazuma_tag_insert_style", saved.style);
});

/** Run a quick-gen up to the Diagnostic Mode popup and return its review textarea. */
async function openReview(page) {
    await setCheckbox(page, "kazuma_debug", true);
    await openScratchChat(page);
    await addMessages(page, [{ mes: "She sits by the window, reading." }]);
    await page.locator("#kazuma_quick_gen").dispatchEvent("click");
    const popup = page.locator("dialog.popup[open]").filter({ hasText: "Review generated prompt" });
    await expect(popup).toBeVisible({ timeout: GEN_TIMEOUT });
    return { popup, box: popup.locator(".popup-content textarea") };
}

for (const style of ["underscores", "spaces"]) {
    test(`typing a prefix suggests tags; Enter inserts in "${style}" style`, async ({ page }) => {
        const errors = trackExtensionErrors(page);
        const pick = await pickTag(page);
        test.skip(!pick, "no tags.csv in the extension folder - copy tags.example.csv to tags.csv");
        await setCheckbox(page, "kazuma_tag_autocomplete", true);
        await setSelect(page, "kazuma_tag_insert_style", style);

        const { popup, box } = await openReview(page);
        await box.click();
        await box.press("End");
        await box.pressSequentially(`, ${pick.prefix}`, { delay: 30 });
        const dropdown = popup.locator(".kazuma-tag-dropdown");
        await expect(dropdown).toBeVisible();
        await expect(dropdown.locator(".kazuma-tag-item").first()).toBeVisible();

        const top = await dropdown.locator(".kazuma-tag-item").first().locator("span").first().textContent();
        await box.press("Enter");
        await expect(dropdown).toBeHidden();
        const value = await box.inputValue();
        // The top suggestion went in, spelled per the setting, followed by ", ".
        const raw = top.replace(/ /g, "_");
        const expected = (style === "spaces" ? raw.replace(/_/g, " ") : raw).replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        expect(value.endsWith(`, ${expected}, `)).toBe(true);
        expect(value).not.toContain(`, ${pick.prefix}, `);
        // Popup still open: Enter went to the autocomplete, not to the dialog.
        await expect(popup).toBeVisible();

        // Escape closes the dropdown, not the popup.
        await box.pressSequentially(pick.prefix, { delay: 30 });
        await expect(dropdown).toBeVisible();
        await box.press("Escape");
        await expect(dropdown).toBeHidden();
        await expect(popup).toBeVisible();

        await popup.locator(".popup-button-cancel").click(); // Stop: don't render
        expect(errors).toEqual([]);
    });
}

test("autocomplete off: no dropdown", async ({ page }) => {
    const pick = await pickTag(page);
    test.skip(!pick, "no tags.csv in the extension folder");
    await setCheckbox(page, "kazuma_tag_autocomplete", false);
    const { popup, box } = await openReview(page);
    await box.click();
    await box.press("End");
    await box.pressSequentially(`, ${pick.prefix}`, { delay: 30 });
    await page.waitForTimeout(500);
    await expect(popup.locator(".kazuma-tag-dropdown")).toBeHidden();
    await popup.locator(".popup-button-cancel").click();
});

test("enlarged image view: the editable prompt gets suggestions too", async ({ page }) => {
    const pick = await pickTag(page);
    test.skip(!pick, "no tags.csv in the extension folder");
    await setCheckbox(page, "kazuma_tag_autocomplete", true);
    await setSelect(page, "kazuma_tag_insert_style", "underscores");
    await setCheckbox(page, "kazuma_debug", false);
    await openScratchChat(page);
    await addMessages(page, [{ mes: "She sits by the window, reading." }]);
    const n = await page.evaluate(() => SillyTavern.getContext().chat.length);
    await page.locator("#kazuma_quick_gen").dispatchEvent("click");
    await page.waitForFunction((n) => SillyTavern.getContext().chat.length > n, n, { timeout: GEN_TIMEOUT });
    await expect(page.locator("#kazuma_progress_overlay")).toBeHidden({ timeout: GEN_TIMEOUT });

    await page.locator("#chat .mes").last().locator(".mes_img").first().dispatchEvent("click"); // the magnifier opens zoomed, which hides the prompt
    const code = page.locator(".img_enlarged_title[contenteditable]");
    await expect(code).toBeVisible();
    await code.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Control+End");
    await page.keyboard.type(`, ${pick.prefix}`, { delay: 30 });
    const dropdown = page.locator(".kazuma-tag-dropdown:visible");
    await expect(dropdown).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(dropdown).toHaveCount(0);
    expect(await code.textContent()).toMatch(new RegExp(`, [^,]+, $`));
    expect(await code.textContent()).not.toContain("\n");
    await page.keyboard.press("Escape");
});
