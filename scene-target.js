/**
 * Which part of the chat an image is generated from. Lives in its own module so
 * scene-target.test.mjs can import it - index.js pulls in SillyTavern's script.js and will not
 * load under node.
 *
 * Generating "for message N" means using the chat as it stood at N: the scene text, the history
 * window and the tracker all stop there. With no target, N is the last message, which is exactly
 * what generating for "now" always did.
 */

/** Clamp a target to a valid index; anything missing or out of range means "the last message". */
function endIndex(chat, targetMesId) {
    const last = (chat?.length || 0) - 1;
    const id = Number(targetMesId);
    if (targetMesId === undefined || targetMesId === null || !Number.isInteger(id) || id < 0 || id > last) return last;
    return id;
}

/**
 * Index of the message whose text describes the scene: walk back from the target (or the end) to
 * the first message with non-empty text. Image-only messages - including the ones this extension
 * inserts - have an empty `mes` and would otherwise hand the LLM nothing to work with.
 * Returns -1 when no message has any text.
 */
export function resolveSceneIndex(chat, targetMesId) {
    for (let i = endIndex(chat, targetMesId); i >= 0; i--) {
        const mes = chat[i]?.mes;
        if (typeof mes === "string" && mes.trim()) return i;
    }
    return -1;
}

/** The last `count` messages ending at `endIdx`, inclusive. `count <= 0` is no history. */
export function historyWindow(chat, endIdx, count) {
    if (!chat?.length || !(count > 0)) return [];
    const end = endIndex(chat, endIdx);
    return chat.slice(Math.max(0, end - count + 1), end + 1);
}

/**
 * Newest tracker (SillyTavern-Tracker-Enhanced stores it on the message) at or before `endIdx`.
 * A tracker on a later message describes a later moment - other clothes, another room - so it
 * must not leak back into an image of an earlier one. Returns the tracker object or null.
 */
export function latestTrackerUpTo(chat, endIdx) {
    if (!chat?.length) return null;
    for (let i = endIndex(chat, endIdx); i >= 0; i--) {
        const t = chat[i]?.tracker;
        if (t && typeof t === "object" && Object.keys(t).length) return t;
    }
    return null;
}
