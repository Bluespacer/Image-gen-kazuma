// Feature D: {{summaryception}} and {{world_info}} in the image gen context preset's system prompt.
// That prompt is only sent on the "Specific connection profile" path, so this needs a Connection
// Manager profile: ST_PROFILE (name), else your first one. With none, the test is skipped - unless
// KAZUMA_E2E_CREATE_PROFILE=1 (dev harness), which creates "kazuma-e2e" from the current connection.
import { test, expect } from "@playwright/test";
import { GEN_TIMEOUT, addMessages, flushSettings, openST, openScratchChat, setCheckbox, setSelect } from "./helpers.mjs";

const PRESET = "kazuma-e2e-macros";

async function findProfile(page) {
    let id = await page.evaluate((name) => {
        const ps = SillyTavern.getContext().extensionSettings.connectionManager?.profiles || [];
        return (name ? ps.find((p) => p.name === name) : ps[0])?.id || null;
    }, process.env.ST_PROFILE || "");
    if (!id && process.env.KAZUMA_E2E_CREATE_PROFILE === "1") {
        await page.evaluate(() => SillyTavern.getContext().executeSlashCommandsWithOptions("/profile-create kazuma-e2e"));
        id = await page.evaluate(() => SillyTavern.getContext().extensionSettings.connectionManager.profiles.find((p) => p.name === "kazuma-e2e")?.id);
    }
    return id;
}

let saved;
test.afterEach(async ({ page }) => {
    if (!saved) return;
    await page.evaluate(([saved, PRESET]) => {
        const s = SillyTavern.getContext().extensionSettings["Image-gen-kazuma"];
        delete s.imageGenPresets[PRESET];
        s.imageGenPreset = saved.preset;
        s.connectionProfile = saved.profile;
        $("#kazuma_profile").val(saved.profile);
    }, [saved, PRESET]);
    await setSelect(page, "kazuma_profile_strategy", saved.strategy);
    await setCheckbox(page, "kazuma_debug", saved.debug);
    await flushSettings(page);
});

test("summaryception and world_info placeholders are resolved in the system prompt", async ({ page }) => {
    await openST(page);
    const profileId = await findProfile(page);
    test.skip(!profileId, "no Connection Manager profile (set ST_PROFILE)");

    saved = await page.evaluate(() => {
        const s = SillyTavern.getContext().extensionSettings["Image-gen-kazuma"];
        return { preset: s.imageGenPreset, profile: s.connectionProfile, strategy: s.profileStrategy || "current", debug: !!s.debugPrompt };
    });
    await page.evaluate(([PRESET, profileId]) => {
        const s = SillyTavern.getContext().extensionSettings["Image-gen-kazuma"];
        s.imageGenPresets[PRESET] = { name: PRESET, systemPrompt: "S:[{{summaryception}}] W:[{{world_info}}] END", includeLastMessages: 2, includeCharInfo: false };
        s.imageGenPreset = PRESET;
        s.connectionProfile = profileId;
    }, [PRESET, profileId]);
    await setSelect(page, "kazuma_profile_strategy", "specific");
    await setCheckbox(page, "kazuma_debug", false);

    await openScratchChat(page);
    await addMessages(page, [{ mes: "She sits by the window, reading." }]);
    // Summaryception's storage shape: layer 0 newest, higher layers older.
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chatMetadata.summaryception = { layers: [[{ text: "Newest summary." }], [{ text: "Oldest summary." }]] };
        await c.saveMetadata?.();
    });
    // Record what is sent, then let the real request through.
    await page.evaluate(() => {
        const svc = SillyTavern.getContext().ConnectionManagerRequestService;
        const original = svc.sendRequest.bind(svc);
        window.__kazumaSent = null;
        svc.sendRequest = (profile, messages, ...rest) => { window.__kazumaSent = messages; return original(profile, messages, ...rest); };
    });

    await page.locator("#kazuma_quick_gen").dispatchEvent("click");
    await page.waitForFunction(() => window.__kazumaSent, null, { timeout: GEN_TIMEOUT });
    const system = await page.evaluate(() => window.__kazumaSent.find((m) => m.role === "system")?.content);
    expect(system).toMatch(/^S:\[Oldest summary\. Newest summary\.\] W:\[[\s\S]*\] END$/);
    expect(system).not.toContain("{{");
    await expect(page.locator("#kazuma_progress_overlay")).toBeHidden({ timeout: GEN_TIMEOUT });
});
