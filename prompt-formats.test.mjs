// Run: node prompt-formats.test.mjs
// The detailed formats (booru_1p, booru_2p, natural_detailed) and the anti-roleplay guard.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANTI_ROLEPLAY_GUARD, PROMPT_FORMATS } from "./prompt-knobs.js";

const { booru_1p, booru_2p, natural_detailed } = PROMPT_FORMATS;

// Additive only: the shipped formats are all still there, and none of them became a new one.
for (const k of ["standard", "booru_tags", "natural_language", "krea2", "krea2mini2", "krea2anima"]) {
    assert.ok(PROMPT_FORMATS[k], `shipped format ${k} removed`);
}
for (const k of ["booru_1p", "booru_2p", "natural_detailed"]) {
    assert.ok(typeof PROMPT_FORMATS[k] === "string" && PROMPT_FORMATS[k].length > 200, `${k} missing`);
}
// New formats are not the default: defaultSettings still selects "standard".
const indexJs = readFileSync(new URL("./index.js", import.meta.url), "utf8");
assert.match(indexJs, /promptStyle: "standard",/);

// Every vocabulary list from bluespacer's single-subject prompt, verbatim (spec Appendix A).
const VOCAB = [
    "angry, blank_eyes, blush, clenched_teeth, crying, embarrassed, evil_smile, glaring, grin, hand_on_own_face, hands_on_own_cheeks, happy, heavy_breathing, laughing, light_smile, nervous, open_mouth, parted_lips, raised_eyebrows, saliva, scared, sleepy, smile, smug, streaming_tears, surprised, tears, tongue_out, wide-eyed",
    "averting_eyes, closed_eyes, sideways_glance, looking_at_viewer, looking_away, looking_back, looking_down, looking_to_the_side, looking_up",
    "arched_back, arm_support, bent_over, breast_press, crossed_arms, crossed_legs, doggystyle, face-to-face, hands_up, hugging_own_legs, lying, missionary, on_back, on_one_knee, on_side, on_stomach, outstretched_arm, own_hands_clasped, own_hands_together, reclining, sitting, sitting_on_lap, sleeping, spread_arms, spread_legs, standing, standing_on_one_leg, straddling, stretching, under_covers",
    "portrait, cowboy_shot, upper_body, full_body, profile",
    "from_above, from_behind, from_below, from_side",
];
for (const [name, text] of [["booru_1p", booru_1p], ["booru_2p", booru_2p]]) {
    for (const list of VOCAB) assert.ok(text.includes(list), `${name} lacks vocabulary: ${list.slice(0, 40)}...`);
    // LoRA syntax and trigger words are appended after the LLM runs; the LLM must not emit them.
    assert.doesNotMatch(text, /lora|<lora:|CHARACTER PREFIX|trigger/i, `${name} mentions LoRA syntax`);
    // Inputs mapped to what this extension actually sends, both optional.
    assert.ok(text.includes("{{char}}'s appearance:"), `${name}: character description source`);
    assert.ok(text.includes("[Scene state]"), `${name}: scene state source`);
    assert.match(text, /if present/);
    assert.ok(text.includes("masterpiece") && text.includes("indoors"), `${name}: indoors/masterpiece steps`);
}
// booru_1p kept steps 10 (indoors only) and 11 (masterpiece) of the original, renumbered after
// dropping step 2.
assert.ok(booru_1p.includes("1. `1girl, solo`."));
assert.match(booru_1p, /\n9\. Always output `indoors`/);
assert.match(booru_1p, /\n10\. masterpiece/);
assert.doesNotMatch(booru_1p, /BREAK/);

// booru_2p: exactly two BREAK separators, three segments, A/B assignment, no cross-contamination.
assert.match(booru_2p, /exactly two BREAK separators/);
const template = booru_2p.split("\n").find((l) => l.startsWith("SEGMENT 1"));
assert.equal(template, "SEGMENT 1 BREAK SEGMENT 2 BREAK SEGMENT 3");
assert.equal(template.match(/ BREAK /g).length, 2);
assert.ok(booru_2p.includes("`1girl, 1boy`") && booru_2p.includes("`2girls`") && booru_2p.includes("`2boys`"));
assert.ok(booru_2p.includes("Person A is {{char}}. Person B is {{user}}"));
assert.match(booru_2p, /Never put a person's attributes in the other person's segment/);

// natural_detailed: everything the keep-list names, nothing it drops (spec Appendix B).
for (const step of [
    "CORE INSTRUCTION", "Abstract-to-Concrete", "Technical Contradiction Check", "Concurrent Action Audit",
    "Garment State Validation", "Character Detail Symmetry", "Anatomical Pre-Flag", "Gaze Geometry Check",
    "Color Contrast Audit", "Abstract Shape Translation", "Motion Verb Conversion", "Visibility Geometry Check",
    "Light Source Color Cast", "Skin Flush & Color Intensity", "Angle-Descriptor Re-Verification",
    "No Sensory Hallucination", "Color Stack Prohibition", "Texture Integration", "Content Preservation",
    "Film Blocking Order", "Spatial Hierarchy and Depth Layering", "Subject Count and Overlap Check",
    "Description Formatting", "Angle-Based Descriptor Culling",
]) assert.ok(natural_detailed.includes(step), `natural_detailed lacks ${step}`);
// Header block, Rules paragraph and macros are this extension's job (or dropped on purpose).
assert.doesNotMatch(natural_detailed, /Step 6|\{\{tracker\}\}|\{\{scene\}\}|\{\{summaryception\}\}|\{\{\/\/|Rules=|Task=|Scene=|professional_legality|Character Information/);

// The guard is one line, and only the current-preset path prepends it (wired in index.js).
assert.equal(ANTI_ROLEPLAY_GUARD, "This is a separate task. Do not continue the story, write dialogue or roleplay.");
assert.match(indexJs, /antiRoleplayGuard: true,/);
assert.match(indexJs, /!useOwnProfile && s\.antiRoleplayGuard !== false && ANTI_ROLEPLAY_GUARD,/);
const html = readFileSync(new URL("./example.html", import.meta.url), "utf8");
assert.ok(html.includes('id="kazuma_anti_rp_guard"'));

console.log("prompt-formats: ok");
