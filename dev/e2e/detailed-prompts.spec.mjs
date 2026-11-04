// Feature B: new formats are selectable and the anti-roleplay guard toggle exists.
// Prompt quality is judged by eye - see docs/LOCAL_TEST.md.
import { test, expect } from "@playwright/test";
import { openST, setSelect, trackExtensionErrors } from "./helpers.mjs";

test("new prompt formats and the guard toggle are in the settings", async ({ page }) => {
    const errors = trackExtensionErrors(page);
    await openST(page);
    const values = await page.locator("#kazuma_prompt_style option").evaluateAll((os) => os.map((o) => o.value));
    for (const v of ["booru_1p", "booru_2p", "natural_detailed"]) expect(values).toContain(v);
    // Shipped options are still there, in front of the new ones.
    expect(values.slice(0, 3)).toEqual(["standard", "booru_tags", "natural_language"]);
    await expect(page.locator("#kazuma_anti_rp_guard")).toHaveCount(1);
    // The checkbox mirrors the saved setting (default on).
    const saved = await page.evaluate(() => SillyTavern.getContext().extensionSettings["Image-gen-kazuma"].antiRoleplayGuard);
    expect(await page.locator("#kazuma_anti_rp_guard").isChecked()).toBe(saved !== false);
    expect(errors).toEqual([]);
});

test("picking a new format saves it, and the previous choice can be restored", async ({ page }) => {
    await openST(page);
    const before = await page.locator("#kazuma_prompt_style").inputValue();
    await setSelect(page, "kazuma_prompt_style", "booru_2p");
    expect(await page.evaluate(() => SillyTavern.getContext().extensionSettings["Image-gen-kazuma"].promptStyle)).toBe("booru_2p");
    await setSelect(page, "kazuma_prompt_style", before);
    expect(await page.evaluate(() => SillyTavern.getContext().extensionSettings["Image-gen-kazuma"].promptStyle)).toBe(before);
});
