// Shared e2e helpers. Nothing here may depend on the mocks: the same tests run against a real
// SillyTavern + ComfyUI + LLM by setting ST_URL.
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

export const EXT = "Image-gen-kazuma";
/** Generous: a real ComfyUI render plus a real LLM call. */
export const GEN_TIMEOUT = Number(process.env.KAZUMA_GEN_TIMEOUT || 180_000);

/**
 * Console errors and page errors that come from this extension. ST itself logs plenty of errors
 * we don't own (offline Horde, missing optional plugins), so filter to ours.
 */
export function trackExtensionErrors(page) {
    const errors = [];
    const ours = (s) => /Image-gen-kazuma|kazuma/i.test(s);
    page.on("pageerror", (e) => { if (ours(`${e.message}\n${e.stack || ""}`)) errors.push(`pageerror: ${e.message}`); });
    page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        const where = m.location()?.url || "";
        // The optional LoRA server plugin 404s when not installed; the extension falls back by design.
        if (/kazuma-loras/.test(where) || /kazuma-loras/.test(text)) return;
        if (ours(text) || ours(where)) errors.push(`console: ${text} @ ${where}`);
    });
    return errors;
}

export async function openST(page) {
    await page.goto("/");
    await page.waitForFunction(() => window.SillyTavern?.getContext?.().characters?.length > 0, null, { timeout: 60_000 });
    // The extension appends its drawer once settings HTML has loaded.
    await expect(page.locator("#kazuma_enable")).toHaveCount(1, { timeout: 30_000 });
}

/**
 * Open ST_CHARACTER (default: the first character) in a NEW chat named "kazuma-e2e-<time>", so the
 * tests never touch an existing conversation. On a real install, delete those chats afterwards.
 */
export async function openScratchChat(page) {
    const name = process.env.ST_CHARACTER || "";
    await page.evaluate(async (name) => {
        const c = SillyTavern.getContext();
        const idx = name ? c.characters.findIndex((x) => x.name === name) : 0;
        if (idx < 0) throw new Error(`ST_CHARACTER "${name}" not found`);
        await c.selectCharacterById(idx);
    }, name);
    await page.waitForFunction(() => SillyTavern.getContext().chat?.length > 0, null, { timeout: 30_000 });
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        await c.executeSlashCommandsWithOptions("/newchat");
        await c.executeSlashCommandsWithOptions(`/renamechat kazuma-e2e-${Date.now()}`);
    });
    await expect(page.locator("#chat .mes")).not.toHaveCount(0);
}

/** Append messages to the open chat without calling the LLM, and render them. */
export async function addMessages(page, messages) {
    await page.evaluate(async (messages) => {
        const c = SillyTavern.getContext();
        for (const m of messages) {
            const msg = {
                name: m.is_user ? c.name1 : c.name2, is_user: !!m.is_user, is_system: false,
                send_date: new Date().toISOString(), mes: m.mes, extra: {}, ...m,
            };
            c.chat.push(msg);
            c.addOneMessage(msg);
        }
        await c.saveChat();
    }, messages);
}

/** Every #kazuma_* id the extension's code references. */
export function referencedIds(file = new URL("../../index.js", import.meta.url)) {
    const src = readFileSync(file, "utf8");
    return [...new Set([...src.matchAll(/#(kazuma_[A-Za-z0-9_]+)/g)].map((m) => m[1]))];
}

/** Set extension settings through its own UI controls, so the change takes the real code path. */
export async function setCheckbox(page, id, on) {
    await page.evaluate(([id, on]) => { $(`#${id}`).prop("checked", on).trigger("change"); }, [id, on]);
}
