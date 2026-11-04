// Run: node scene-target.test.mjs
import assert from "node:assert/strict";
import { historyWindow, latestTrackerUpTo, resolveSceneIndex } from "./scene-target.js";

const msg = (mes, extra = {}) => ({ mes, ...extra });
const image = () => ({ name: "Image Gen Kazuma", is_system: true, mes: "", extra: { media: [{}] } });

// --- resolveSceneIndex ---
{
    const chat = [msg("greeting"), msg("user says hi"), msg("char replies"), image()];
    // No target: the last message with text. Before, quick-gen right after an image read "".
    assert.equal(resolveSceneIndex(chat), 2);
    assert.equal(resolveSceneIndex(chat, undefined), 2);
    assert.equal(resolveSceneIndex(chat, null), 2);
    // Target is the image message itself (empty mes) -> the message before it.
    assert.equal(resolveSceneIndex(chat, 3), 2);
    // A past message with text is used as is.
    assert.equal(resolveSceneIndex(chat, 1), 1);
    // targetMesId = 0 is a real target, not "unset".
    assert.equal(resolveSceneIndex(chat, 0), 0);
    // Whitespace-only counts as empty.
    assert.equal(resolveSceneIndex([msg("a"), msg("   \n")], 1), 0);
    // Out-of-range / garbage targets fall back to the end, like no target.
    assert.equal(resolveSceneIndex(chat, 99), 2);
    assert.equal(resolveSceneIndex(chat, -1), 2);
    assert.equal(resolveSceneIndex(chat, "x"), 2);
    // String ids (read from a DOM attribute) work.
    assert.equal(resolveSceneIndex(chat, "1"), 1);
    // Nothing with text anywhere.
    assert.equal(resolveSceneIndex([image(), image()]), -1);
    assert.equal(resolveSceneIndex([], 0), -1);
    // Target at 0 with empty text has nothing to walk back to.
    assert.equal(resolveSceneIndex([image(), msg("later")], 0), -1);
}

// Baseline equivalence: with no target and a non-empty last message, the scene is the last
// message, which is what index.js used to read (chat[chat.length - 1].mes).
{
    const chat = [msg("a"), msg("b"), msg("c")];
    assert.equal(chat[resolveSceneIndex(chat)].mes, chat[chat.length - 1].mes);
}

// --- historyWindow ---
{
    const chat = ["m0", "m1", "m2", "m3", "m4"].map(msg);
    const mes = (arr) => arr.map((m) => m.mes);
    // Ends AT endIdx, inclusive.
    assert.deepEqual(mes(historyWindow(chat, 2, 2)), ["m1", "m2"]);
    assert.deepEqual(mes(historyWindow(chat, 0, 10)), ["m0"]);
    assert.deepEqual(mes(historyWindow(chat, 4, 10)), ["m0", "m1", "m2", "m3", "m4"]);
    assert.deepEqual(historyWindow(chat, 3, 0), []);
    assert.deepEqual(historyWindow([], 0, 5), []);
    // Baseline equivalence: ending at the last message is chat.slice(-count).
    for (const n of [1, 3, 5, 9]) assert.deepEqual(historyWindow(chat, chat.length - 1, n), chat.slice(-n));
    // No target -> the end, same as baseline.
    assert.deepEqual(historyWindow(chat, undefined, 2), chat.slice(-2));
}

// --- latestTrackerUpTo ---
{
    const t1 = { Outfit: "coat" };
    const t3 = { Outfit: "pajamas" };
    const chat = [msg("a"), msg("b", { tracker: t1 }), msg("c"), msg("d", { tracker: t3 }), msg("e")];
    assert.equal(latestTrackerUpTo(chat, 4), t3);
    assert.equal(latestTrackerUpTo(chat, 3), t3);
    // A past message gets the tracker of its own time, not the current one.
    assert.equal(latestTrackerUpTo(chat, 2), t1);
    assert.equal(latestTrackerUpTo(chat, 1), t1);
    // Tracker only on a later message -> none.
    assert.equal(latestTrackerUpTo(chat, 0), null);
    // Empty objects and non-objects are not trackers.
    assert.equal(latestTrackerUpTo([msg("a", { tracker: { Outfit: "x" } }), msg("b", { tracker: {} }), msg("c", { tracker: "str" })], 2).Outfit, "x");
    assert.equal(latestTrackerUpTo([], 0), null);

    // Baseline equivalence with index.js's getLatestTracker (copied from 906d44c) for the bare call.
    const baselineGetLatestTracker = (chat) => {
        for (let i = chat.length - 1; i >= 0; i--) {
            const t = chat[i]?.tracker;
            if (t && typeof t === "object" && Object.keys(t).length) return `[Scene state]\n${JSON.stringify(t, null, 2)}\n\n`;
        }
        return "";
    };
    const format = (t) => (t ? `[Scene state]\n${JSON.stringify(t, null, 2)}\n\n` : "");
    for (const c of [chat, [msg("x")], [], [msg("a", { tracker: t1 }), image()]]) {
        assert.equal(format(latestTrackerUpTo(c, c.length - 1)), baselineGetLatestTracker(c));
        assert.equal(format(latestTrackerUpTo(c)), baselineGetLatestTracker(c));
    }
}

console.log("scene-target: ok");
