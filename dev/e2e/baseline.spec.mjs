// Checks every branch must pass, whatever feature it adds.
import { test, expect } from "@playwright/test";
import { openST, referencedIds, trackExtensionErrors } from "./helpers.mjs";

test("loads without extension errors", async ({ page }) => {
    const errors = trackExtensionErrors(page);
    await openST(page);
    await page.waitForTimeout(3_000); // let async init (lists, profiles) settle
    expect(errors).toEqual([]);
});

// Known gaps already present at the Deaquay baseline (906d44c): index.js binds a legacy
// workflow-import button that example.html no longer has. Listed so new gaps still fail; remove
// an entry once it is fixed upstream.
const KNOWN_MISSING = ["kazuma_import_btn", "kazuma_import_file"];

test("every #kazuma_* id referenced in index.js exists in the DOM", async ({ page }) => {
    await openST(page);
    // The quick-gen button is injected by a retry loop; wait for it.
    await expect(page.locator("#kazuma_quick_gen")).toHaveCount(1, { timeout: 15_000 });
    const missing = [];
    for (const id of referencedIds().filter((id) => !KNOWN_MISSING.includes(id))) {
        if (await page.locator(`#${id}`).count() !== 1) missing.push(id);
    }
    expect(missing).toEqual([]);
});
