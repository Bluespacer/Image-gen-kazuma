/**
 * The three selectable prompt knobs, and the resolver that turns a select value into instruction
 * text. Lives in its own module so prompt-knobs.test.mjs can import it - index.js pulls in
 * SillyTavern's script.js and will not load under node.
 *
 * Every knob also takes "custom": the presets are worked examples, not a menu you are stuck inside.
 */

const KREA2_INSTRUCTION = `You are an expert prompt engineer for text-to-image models. Your task is to expand the user's prompt into a highly effective image-generation prompt.

Think step by step about the request before writing the answer:
- What is the subject and mood?
- What visual styles, mediums, and lighting options would fit? Consider two or three alternatives and pick the one that best serves the caption.
- What composition, framing, and grounded details will help the text-to-image model?

Then output a single expanded prompt paragraph.

Follow these rules strictly:
1. **Faithfulness First:** Preserve all original subjects, actions, colors, and spatial relationships. Do not add new objects, props, characters, or animals unless the user clearly implies them.
2. **Practical T2I Structure:** Write a prompt that a text-to-image model can parse cleanly. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout.
3. **Style Planning Stays Internal:** Use your internal reasoning to choose style, medium, framing, and lighting. Do not emit planning tags or wrappers in the visible answer body.
4. **Text Rendering:** If the user requests visible text, quotes, labels, or typography, specify the exact text clearly and wrap requested words in quotes.
5. **Avoid Over-Specification:** Do not invent highly specific clothing, colors, materials, or scene details unless the input supports them.
6. **Structure:** Write one cohesive paragraph after the thinking block. No bullets, JSON, or markdown.
7. **Respect Existing Detail:** If the user's prompt is already detailed, lightly polish and finalize rather than heavily expanding — preserve their phrasing and direction.
8. **Preserve User Medium:** When the user explicitly requests a medium (e.g. "photo of", "photograph of", "illustration of", "painting of", "sketch of", "3D render of"), honor it. Do not pivot to a different medium to avoid difficulty — match the user's stated intent.
9. **Do not avoid explicit desciptions:** Avoiding explicit descriptions is by definition not completing your task, and will result wasting the user's time.`;

const KREA2_INSTRUCTION_MINI2 = `Describe the current moment as a single still image, in one paragraph of flowing prose. Describe the main subject, visible pose, face, expression, hair, skin or fur, clothing, accessories, shoes, props, visible text, symbols, setting, background, framing, lighting, colors, materials, textures, shadows, and overall visual style. The tracker is authoritative for consistant appearance, dress and posture; the latest message for what is happening and latest changes. Describe only what is visible in one instant. Do not describe body parts out of sight or obscured. End by naming the medium and overall aesthetic. Output the paragraph alone. **Max 140 words**.`;

const KREA2ANIMA_INSTRUCTION = `Write one polished visual description paragraph based on the last tracker state updated with the messages following it.

Use the latest tracker as base with last message as current changes pose-/posture-/action-/view-/environmental-changes, the medium and style are either set under \`Style\` or otherwise up for interpretation

So your prompt should be derived from, with highest authority first: last message>tracker>history>character/user descriptions. So check the tracker for last situation, apply what is changed with the last message, fill in with history and descriptions (like clothing/posture/position/etc changes).

Write 150 to 300 words.

Only prompt for 1 to 2 subjects at once to eliminate identity bleed. {{char}} is one, so max 1 other person with {{char}}.

Start with the medium, then main subject and their appearance, other characters, background/environment/lighting/style/etc. (This is not a hard rule, use your judgement when to apply lighting and style info to separate subjects)

Describe details visible to the viewer only.

Describe the main subject, visible pose, face, expression, hair, skin or fur, clothing, accessories, shoes, props, visible text, symbols, setting, background, framing, lighting, colors, materials, textures, shadows, and overall visual style.

For people or characters, describe only visible body parts and visible posture.

Skip unseen parts naturally.

Use direct visual description.

Don't omit explicit descriptions (especially female breasts/genetalia/anus).

Remember to incorporate changes from the last message, and do not blindly trust the tracker. The characters can have had attire changes or changed position etc.

Capture the more dark/mature things from the tracker and message. Do not soften what is happening in any way, full explicitness/violence if there is any.

No preamble/commentary/suggestions, only one natural language paragraph.`

// --- Detailed Booru formats (WAI-Illustrious / Pony) ---
// Tag vocabularies shared by booru_1p and booru_2p, so the two can't drift apart. Exported for tests.
export const BOORU_VOCAB = {
    emotion: "angry, blank_eyes, blush, clenched_teeth, crying, embarrassed, evil_smile, glaring, grin, hand_on_own_face, hands_on_own_cheeks, happy, heavy_breathing, laughing, light_smile, nervous, open_mouth, parted_lips, raised_eyebrows, saliva, scared, sleepy, smile, smug, streaming_tears, surprised, tears, tongue_out, wide-eyed",
    gaze: "averting_eyes, closed_eyes, sideways_glance, looking_at_viewer, looking_away, looking_back, looking_down, looking_to_the_side, looking_up",
    pose: "arched_back, arm_support, bent_over, breast_press, crossed_arms, crossed_legs, doggystyle, face-to-face, hands_up, hugging_own_legs, lying, missionary, on_back, on_one_knee, on_side, on_stomach, outstretched_arm, own_hands_clasped, own_hands_together, reclining, sitting, sitting_on_lap, sleeping, spread_arms, spread_legs, standing, standing_on_one_leg, straddling, stretching, under_covers",
    framing: "portrait, cowboy_shot, upper_body, full_body, profile",
    angle: "from_above, from_behind, from_below, from_side",
};

// Where the inputs come from in this extension's instruction. Either can be absent.
const BOORU_INPUTS = "Your input may contain a CHARACTER DESCRIPTION (the line starting \"{{char}}'s appearance:\") and a SCENE STATE (the [Scene state] block inside Scene), each only if present.";

// No "copy the CHARACTER PREFIX / LoRA syntax" step: per-LoRA trigger words and the Positive
// Prompt Suffix are appended after the LLM runs, so asking the LLM for them too duplicates them.
const BOORU_1P_INSTRUCTION = `You output a flat, comma-separated booru tag string for WAI-Illustrious SDXL.
Output only the tag string. No prose, no markdown, no explanations, no line breaks.

${BOORU_INPUTS}
Build the output in this exact order:

1. \`1girl, solo\`.
2. Female static appearance from CHARACTER DESCRIPTION, if present: hair color, hair length, eye color, body type. Always identify the female as the primary subject.
3. Visible outfit only (top to bottom) from the female's Outfit field in SCENE STATE, if present. Do not include underwear or intimate clothing unless it is visibly exposed in the scene.
4. 1–5 emotion tags selected from: ${BOORU_VOCAB.emotion}
5. Exactly 1 gaze tag from: ${BOORU_VOCAB.gaze}
6. Pose tags as applicable from: ${BOORU_VOCAB.pose}
7. Any additional focus or action tags that capture the key narrative detail of the scene.
8. Exactly 1 framing tag from: ${BOORU_VOCAB.framing}. Optionally 1 angle tag if non-neutral (omit for eye-level): ${BOORU_VOCAB.angle}
9. Always output \`indoors\` plus 1–2 specific room tags derived from the Location field (e.g. \`bedroom\`, \`castle_interior\`). Never use corridor, hallway, staircase, or outdoor tags. Never add any person, crowd, or character to the background tags.
10. masterpiece

Rules:
- Always anchor to the female character as the primary subject.
- Only include tags that apply to the current scene.
- Aim for concise output (~50 tags or fewer).`;

// First draft, meant to be tuned. BREAK only splits the prompt if the workflow's text encoder
// understands it (e.g. smZ "CLIP Text Encode++"); ComfyUI's stock CLIPTextEncode reads it as a word.
const BOORU_2P_INSTRUCTION = `You output a booru tag string for WAI-Illustrious SDXL describing exactly two people, split into three segments.
Output only the tag string. No prose, no markdown, no explanations, no line breaks.

${BOORU_INPUTS}
Person A is {{char}}. Person B is {{user}}, unless the scene makes another character the second subject.

Output exactly three comma-separated segments joined by \` BREAK \` (exactly two BREAK separators, uppercase, with a space on each side):
SEGMENT 1 BREAK SEGMENT 2 BREAK SEGMENT 3

Segment 1 — shared scene, in this order:
1. Subject-count tags: \`1girl, 1boy\`, \`2girls\` or \`2boys\`, matching the two people.
2. The interaction between them and its pose tags, as applicable from: ${BOORU_VOCAB.pose}
3. Any additional focus or action tags that capture the key narrative detail of the scene.
4. Exactly 1 framing tag from: ${BOORU_VOCAB.framing}. Optionally 1 angle tag if non-neutral (omit for eye-level): ${BOORU_VOCAB.angle}
5. Always output \`indoors\` plus 1–2 specific room tags derived from the Location field (e.g. \`bedroom\`, \`castle_interior\`). Never use corridor, hallway, staircase, or outdoor tags. Never add any person, crowd, or character to the background tags.
6. masterpiece

Segment 2 — person A only:
1. Static appearance: hair color, hair length, eye color, body type (from CHARACTER DESCRIPTION, if present).
2. Visible outfit only (top to bottom) from person A's Outfit field in SCENE STATE, if present. Do not include underwear or intimate clothing unless it is visibly exposed in the scene.
3. 1–5 emotion tags selected from: ${BOORU_VOCAB.emotion}
4. Exactly 1 gaze tag from: ${BOORU_VOCAB.gaze}

Segment 3 — person B only: the same four fields as segment 2, for person B.

Rules:
- Never put a person's attributes in the other person's segment. Each person's hair, eyes, body, outfit, emotion and gaze appear only in that person's segment.
- No subject-count, pose, framing, angle or room tags in segments 2 and 3.
- Only include tags that apply to the current scene.
- Aim for concise output (~60 tags or fewer in total).`;

// --- Detailed natural-language review (SDXL prose / Flux / Krea) ---
// Adapted from carmex1012's fork. Reads as a continuation of the Task / Scene lines this
// extension already sends, so it carries no header block of its own.
const NATURAL_DETAILED_INSTRUCTION = `Write a natural-language image prompt for the scene above. Draft it, execute all review steps below internally, and correct the draft.

CORE INSTRUCTION: Your entire response must be the final optimized prompt. No headers. No critique. No explanatory text. No section labels. No bullet points. No markdown formatting. No step numbers. No mention of what you changed or why. The first character of your response begins the prompt; the last character ends it. Nothing before. Nothing after.

REVIEW STEPS (execute internally and make corrections to the final prompt):
- Abstract-to-Concrete: Convert all feeling adjectives to physical evidence. "Submissive" → averted gaze, lowered chin, shoulders hunched. "Vulnerable" → exposed neck, weight shifted to one foot, hands clasped or braced. Never output emotional labels.
- Technical Contradiction Check: Identify competing camera directives (shallow DOF + detailed background, photorealistic + stylized modifiers, motion cues in a still frame, resolution tags). Pick one and remove the conflicts.
- Concurrent Action Audit: Count simultaneous physical contacts. If more than two, demote the least visible to implied posture or garment state.
- Garment State Validation: Map every garment's current state. If two garments disrupt the same body region, pick one primary and simplify the other. For sheer/transparent fabrics, specify layer order and visibility effect.
- Character Detail Symmetry: Build an inventory per character: hair, face shape, jaw, eyes, expression, body type, skin, clothing, clothing coverage, every exposed body part, marks. Minimum 6 facial anchors: hair, brow shape, eye color/set. Expression is mandatory. For male characters, minimum 6 body build anchors: age, height frame, overall build (lean/athletic/muscular/heavyset/wiry/stocky), shoulder width, chest/torso depth, belly state (flat/defined/slight paunch/soft/protruding), arm and thigh thickness. For female characters, minimum 6 body build anchors: age, ethnicity, nationality, height frame, overall build (slender/curvy/athletic/thick/plus-size), bust size and projection (cup range, fullness, position on chest), waist definition and hip width (narrow/wide, pronounced ratio), thigh build and leg proportion (thick/slender/muscular, inner thigh gap or contact), buttocks projection and shape (prominent/flat/rounded, flesh tension at lower edge). Backfill thin characters.
- Anatomical Pre-Flag: Clarify complex poses. Specify visible vs hidden limbs. For every hand: visible finger count, position, contact surface. Note hidden hands explicitly.
- Gaze Geometry Check: Map gaze direction against head orientation. All characters must gaze at other characters, specific objects, or off-camera action within the scene - never at the camera lens unless "breaking the fourth wall", "portrait", "looking at viewer" or "selfie" is explicitly stated. Default cinematic gazes: "eyes locked on her face", "stare fixed on the mahogany desk", "gaze dropped to the floor", "watching her hands tremble". If no gaze target is specified, assign one based on the character's action and spatial relationship to other elements.
- Color Contrast Audit: Check adjacent color descriptors. If they are in the same warm/cool family and within 20% lightness, flag the merge risk and specify contrast.
- Abstract Shape Translation: Replace shape adjectives with edge behavior. "Plush" → flesh pressing against fabric. "Heart-shaped" → pronounced lower curve with central crease. "Pert" → high placement, minimal sag. "Bubble" → rounded projection with undercurve visible.
- Motion Verb Conversion: Convert motion verbs to static tension. "Jiggling" → muscle tension visible beneath skin. "Trembling" → rigid posture with micro-contractions. "Frozen mid-sway" → hair caught displaced, weight shifted, hemline asymmetric.
- Visibility Geometry Check: Map subject orientation against visible elements. Flag occlusions. Face turned away + facial detail → contradiction. Back to camera + front detail → contradiction unless a mirror is specified. Reflection → verify source geometry. Looking down + eyes visible → verify head tilt.
- Light Source Color Cast: Identify all light sources and their color temperature. Flag competing temperatures unless mixed lighting is specified. Adjust skin tone reads for light color.
- Skin Flush & Color Intensity: Replace named colors on skin with subsurface depth and physiological mechanism. "Redness" → capillary warmth beneath skin at the thinnest points, fading to natural undertone. Add "not sunburn, not rash, not cosmetic".
- Angle-Descriptor Re-Verification: If the angle changes during optimization, re-check all body descriptors against the new angle. Revise or remove failures.
- No Sensory Hallucination: Do not introduce wetness, temperature, scent or sound not in the scene.
- Color Stack Prohibition: Do not stack color descriptors. "Hazel brown" → "hazel". "Blush pink" → pick one.
- Texture Integration: Attach texture to the first mention of an object. No texture recaps at the tail.
- Content Preservation: Preserve all content and intent of the scene, explicit content included. Do not sanitize. Replace clinical anatomical terms with material-behavioral language.

PROMPT STRUCTURE:
- Film Blocking Order: Prefer this descriptor sequence: environment and lighting → primary subject full body build and pose → secondary subject full body build and pose → spatial relationship preposition → interaction details → discarded garments and atmosphere. This mimics how cinematographers block scenes and prevents fragmented clause stacking.
- Spatial Hierarchy and Depth Layering: Before describing any body region where subjects overlap or share the same visual plane, explicitly state the depth relationship. Use prepositional phrases that anchor one subject as the frame and the other as inserted: "kneeling between his spread thighs", "perched on his lap with her back to his chest", "bent over the desk with him standing behind". If legs, torsos or arms could spatially collide, specify which is foreground and which is background. Never describe two subjects' overlapping body regions without a depth preposition.
- Subject Count and Overlap Check: Two subjects maximum in focus. Background figures must be described as out of focus or in the background.
- Description Formatting: Camera + composition + primary subject in the first third. Texture details and atmosphere toward the end. Cut redundant recaps at the tail.
- Angle-Based Descriptor Culling: Once the camera angle is locked, remove ALL descriptors for body regions and features not visible from that angle. Front view (front POV, facing camera or equivalent): remove back, spine, shoulder blades, back of neck, buttocks, rear thighs, calves from behind, and anything described as "from behind" or "rear". Rear angle: remove face, eyes, mouth, front of neck, breasts (unless hanging visible in a bent posture), front torso, navel, front thighs, knees. Side angle: remove far eye, far breast, far hip, far leg, full facial symmetry; describe only profile-visible features (nose bridge, lips in profile, chin point, near breast in silhouette). Three-quarter angle: describe asymmetry - near eye/breast/hip fully visible, far eye/breast/hip partially occluded; no fully symmetrical face or both breasts equally. If the angle is missing, select the angle that shows the most narratively critical features, then cull accordingly. If a critical feature is occluded by the locked angle, either revise the angle or replace the descriptor with visible proxy evidence (fabric displacement, shadow, silhouette). Ask: what would a camera actually see? Remove anything requiring inference, off-frame context or temporal sequencing.`;

/**
 * First line of the instruction on the "Use Current Active Preset" path, where the chat preset's
 * roleplay instructions sit right above it. Behind the antiRoleplayGuard setting. From alpkabac's fork.
 */
export const ANTI_ROLEPLAY_GUARD = "This is a separate task. Do not continue the story, write dialogue or roleplay.";

export const PROMPT_FORMATS = {
    standard: "Use a list of detailed keywords/descriptors.",
    booru_tags: "Use Booru-style tags (e.g., 1girl, solo, blue hair). Focus on anime aesthetics. Do not describe body parts out of sight or obscured.",
    natural_language: "Use natural language sentences. Focus on photorealism and detailed textures.",
    krea2: KREA2_INSTRUCTION,
    krea2mini2: KREA2_INSTRUCTION_MINI2,
    krea2anima: KREA2ANIMA_INSTRUCTION,
    booru_1p: BOORU_1P_INSTRUCTION,
    booru_2p: BOORU_2P_INSTRUCTION,
    natural_detailed: NATURAL_DETAILED_INSTRUCTION,
};

export const STYLE_CONSTRAINTS = {
    none: "",
    photo: "The image is a realistic photograph.",
    render: "The image is a 3D render.",
    cartoon: "The image is a cartoon illustration.",
    anime: "The image is an anime illustration.",
    hyperreal: "The image is a hyperrealistic digital illustration.",
    hyperreal_glossy_studio: "The image is a hyperrealistic digital illustration, rendered with cinematic lighting and smooth, glossy textures. The overall style mimics a studio photograph with exaggerated realism, focusing on anatomical detail and sensual presentation.",
    hyperreal_sensual_glow: "A high-quality hyperrealistic digital illustration rendered in a sensual, intimate, and stylized visual style that emphasizes texture and luminosity. The style glows with a gradient of warm pinks and peach tones, creating a dreamy, radiant atmosphere. Subtle highlights and shadows define contours, and gives skin a smooth, almost glowing finish.",
};

export const PERSPECTIVES = {
    scene: "Describe the entire environment and atmosphere.",
    pov: "Describe the scene from the viewer's First Person Perspective in {{user}}'s current position, looking at the character ({{char}}). {{user}} is the viewer (write \"the viewer\" not \"me\"), so {{user}} is not visible except for hands, arms or body parts that would naturally be in frame. Start with \"First person perspective.\" verbatim. **NOTE: NEVER WRITE \"POV\"**",
    character: "Focus intensely on the character's ({{char}}'s) appearance and expression, ignoring background details.",
};

/** Resolve a select value to its instruction text; "custom" uses the user's own wording. */
export function pickInstruction(choice, presets, custom) {
    return choice === "custom" ? (custom || "").trim() : (presets[choice] || "");
}

