/**
 * Extra placeholders for the image gen context preset's system prompt:
 *   {{summaryception}} - the Summaryception extension's running summary of this chat
 *   {{world_info}}     - World Info / lorebook entries activated by the recent messages
 * Both are soft dependencies: missing extension or no entries -> empty string. Pure helpers here;
 * index.js does the lookups, and only when the placeholder is actually in the prompt.
 * Ported from carmex1012's fork.
 */

export const SUMMARYCEPTION_MACRO = /\{\{summaryception\}\}/gi;
export const WORLD_INFO_MACRO = /\{\{world_info\}\}/gi;

/** Does the text use this placeholder? (Lookups aren't free, so skip them when it doesn't.) */
export function usesMacro(text, macro) {
    macro.lastIndex = 0;
    const hit = macro.test(String(text || ""));
    macro.lastIndex = 0;
    return hit;
}

/**
 * Summaryception keeps its summary in chat metadata as layers of snippets: layer 0 is the newest,
 * finest-grained, higher layers are older summaries of summaries. Read oldest-first so the text
 * runs in story order. This is that extension's internal storage, not an API - if it changes
 * shape, this returns "" rather than throwing.
 */
export function summaryceptionText(chatMetadata) {
    const layers = chatMetadata?.summaryception?.layers;
    if (!Array.isArray(layers) || !layers.length) return "";
    const ordered = [...layers.slice(1).reverse(), layers[0]];
    const snippets = [];
    for (const layer of ordered) {
        if (!Array.isArray(layer)) continue;
        for (const sn of layer) if (typeof sn?.text === "string" && sn.text.trim()) snippets.push(sn.text.trim());
    }
    return snippets.join(" ");
}

/** ST's World Info scanner wants plain strings, newest first. */
export function worldInfoScanInput(history) {
    return (history || []).map((m) => String(m?.content ?? "")).reverse();
}

/** The text of a getWorldInfoPrompt() result, whatever shape this ST version returns. */
export function worldInfoText(result) {
    if (typeof result === "string") return result;
    return result?.worldInfoString || `${result?.worldInfoBefore || ""}${result?.worldInfoAfter || ""}`;
}
