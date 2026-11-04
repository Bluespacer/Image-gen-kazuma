// Run: node context-macros.test.mjs
import assert from "node:assert/strict";
import { SUMMARYCEPTION_MACRO, WORLD_INFO_MACRO, summaryceptionText, usesMacro, worldInfoScanInput, worldInfoText } from "./context-macros.js";

// usesMacro: case-insensitive, repeatable (global regex state is reset).
assert.equal(usesMacro("Summary: {{summaryception}}", SUMMARYCEPTION_MACRO), true);
assert.equal(usesMacro("Summary: {{summaryception}}", SUMMARYCEPTION_MACRO), true);
assert.equal(usesMacro("{{WORLD_INFO}}", WORLD_INFO_MACRO), true);
assert.equal(usesMacro("no macros here", WORLD_INFO_MACRO), false);
assert.equal(usesMacro(undefined, WORLD_INFO_MACRO), false);

// Summaryception absent / malformed -> "".
assert.equal(summaryceptionText(undefined), "");
assert.equal(summaryceptionText({}), "");
assert.equal(summaryceptionText({ summaryception: {} }), "");
assert.equal(summaryceptionText({ summaryception: { layers: [] } }), "");
assert.equal(summaryceptionText({ summaryception: { layers: "nope" } }), "");
assert.equal(summaryceptionText({ summaryception: { layers: [null, [{ text: 5 }], [{}]] } }), "");

// Oldest layer first, layer 0 (newest) last; empty snippets skipped.
assert.equal(summaryceptionText({ summaryception: { layers: [
    [{ text: "newest a" }, { text: "newest b" }],
    [{ text: "older" }, { text: "  " }],
    [{ text: "oldest" }],
] } }), "oldest older newest a newest b");
// Same order as carmex's original loop.
assert.equal(summaryceptionText({ summaryception: { layers: [[{ text: "only" }]] } }), "only");

// WI input: newest first.
assert.deepEqual(worldInfoScanInput([{ content: "m1" }, { content: "m2" }, { content: "m3" }]), ["m3", "m2", "m1"]);
assert.deepEqual(worldInfoScanInput(undefined), []);

// WI result shapes.
assert.equal(worldInfoText("plain"), "plain");
assert.equal(worldInfoText({ worldInfoString: "both", worldInfoBefore: "b", worldInfoAfter: "a" }), "both");
assert.equal(worldInfoText({ worldInfoBefore: "b", worldInfoAfter: "a" }), "ba");
assert.equal(worldInfoText(undefined), "");

console.log("context-macros: ok");
