# Cloud session brief — Image Gen Kazuma fork

You are working on bluespacer's fork of **Image Gen Kazuma**, a SillyTavern (ST) extension that turns
chat into ComfyUI images. The fork is based on **Deaquay's** fork, which is far ahead of the original
(`Arif-salah/Image-gen-kazuma`). Your job: add three features (plus one optional), each on its own
branch, ported from two other forks where noted.

Read this whole brief before touching code.

---

## 0. Where this runs, and what that means for you

- **You (cloud session):** build, unit-test, and smoke-test against **mocks**. No GPU, no real
  ComfyUI, no real LLM, no access to bluespacer's machine.
- **bluespacer (local, Windows):** real end-to-end testing — ST in Docker/WSL2, ComfyUI on the
  Windows host, real models, real chats.

Consequences:
1. You cannot judge image quality or prompt quality. Don't claim to. Say what you verified and how.
2. **Everything you can make automatable for the local run, make automatable.** Write browser e2e
   tests (Playwright) that you validate here against the mock harness, and that bluespacer then runs
   unchanged against his real ST by setting an env var (§8).
3. What can't be automated goes into `docs/LOCAL_TEST.md` as a manual checklist. bluespacer may also
   hand that checklist to a local Claude session that drives his browser.

---

## 1. Setup

```bash
git remote add deaquay  https://github.com/Deaquay/Image-gen-kazuma.git
git remote add carmex   https://github.com/carmex1012/Image-gen-kazuma.git
git remote add alpkabac https://github.com/alpkabac/Image-gen-kazuma.git
git fetch --all
```

- **Baseline:** `deaquay/main` @ `906d44c` (2026-11-02, "Easily editable image prompts for
  regeneration/swipes"). Confirm `origin/main` equals it before branching.
- **Reference sources (read, do not merge):**
  - `carmex/chat` — 85 commits, Aug 18–24 2026. Commit messages are all "Update index.js" /
    "Add files via upload", so read the final file state, not the history.
  - `alpkabac/main` — 21 commits, Apr 2026. Diverged early from upstream and does **not** share
    Deaquay's architecture. Port ideas and self-contained functions, never whole files.
- **Existing tests** — plain node scripts using `node:assert`, not `node:test`, no package.json.
  All pass at baseline:
  ```bash
  node loras.test.mjs && node prompt-knobs.test.mjs && node server-plugin/loras-route.test.mjs
  ```
- **Branches**, each cut from `main` independently (not stacked), each ending in a PR against
  **bluespacer's fork `main`** — never against Deaquay or Arif-salah:
  - `feat/past-message-gen` (Feature A — priority)
  - `feat/detailed-prompts` (Feature B)
  - `feat/tag-autocomplete` (Feature C)
  - `feat/context-macros` (Feature D — optional, only if time remains)
- If the person starting this session names only one feature, do only that one.

### First commit, on `main`: `CLAUDE.md`
A short `CLAUDE.md` (≤ 80 lines) so later sessions don't re-derive the architecture: file map, how
generation flows (prompt → `onGeneratePrompt` → `generateWithComfy` → `runGeneration` →
`insertImageToChat`), how to run tests, the ground rules below. Commit it before branching.

---

## 2. Codebase map (`index.js` @ 906d44c, ~2,025 lines)

| Area | Where |
|---|---|
| Settings defaults | `defaultSettings` near top; `loadSettings()` ~L169 |
| Context-preset system prompt + history | `buildSystemPromptFromPreset()` ~L431, `buildChatHistoryFromPreset()` ~L463 |
| Tracker lookup | `getLatestTracker(chat)` ~L770 — always scans from chat end |
| Prompt generation | `onGeneratePrompt()` ~L778 — takes **no arguments**; reads `chat[chat.length-1].mes` |
| Format / style / perspective presets | `prompt-knobs.js` (`PROMPT_FORMATS`, `STYLE_CONSTRAINTS`, `PERSPECTIVES`) |
| Diagnostic Mode review popup (textarea) | inside `onGeneratePrompt`, ~L853–870 |
| Send to ComfyUI | `generateWithComfy(prompt, target)` ~L889; `target = { message, element }` |
| Swipe-to-vary | `onImageSwiped()` ~L970 — only fires when `message.name === "Image Gen Kazuma"` |
| Insert image | `insertImageToChat()` ~L1056 — with `target` appends to that message's gallery; without, pushes a new system message named "Image Gen Kazuma" |
| Editable prompt in enlarged view | `makePromptEditable()` ~L1136 (a `contentEditable` `<code>`, not a textarea) |
| Init / event wiring | `jQuery(async () => …)` ~L1163; quick-gen paintbrush `createChatButton()` ~L1305 |
| Settings UI | `example.html` |

Generation is routed through the ST server (`/api/sd/comfy/*`), not the browser.

---

## 3. Ground rules

### Mergeability (the overriding goal)
Every feature branch must be submittable **as-is** as a PR to `Deaquay/Image-gen-kazuma` (Deaquay in
turn intends to merge into Arif-salah's original). So:

1. **Match Deaquay's conventions**, including test style: new logic goes in a separate `.js` file
   that exports functions and has no dependency on ST, the DOM or the browser (like `loras.js`,
   `prompt-knobs.js`), with a sibling `*.test.mjs` run as `node x.test.mjs`. `index.js` imports ST's
   `script.js` and can't load under node, so keep its diffs to wiring.
2. **Minimal, surgical `index.js` edits.** No reformatting, no drive-by refactors, no renames.
3. **Additive presets only.** "Don't overwrite" means don't change or remove Deaquay's *shipped*
   presets and defaults (e.g. the existing `booru_tags` format). New presets are added alongside
   them and are **not** selected by default. Existing user settings must load unchanged.
4. **No new runtime dependencies.** jQuery, toastr, ST's `Popup` are already available. No
   `package.json` at repo root; dev tooling lives in `dev/` with its own.
5. **No personal data** in code, defaults, comments, tests or fixtures. Where a user must be named,
   use `bluespacer`.
6. **LF line endings** (Deaquay normalized them; `.gitattributes`).
7. **Conventional commits** (`feat:`, `fix:`, `test:`, `docs:`), small and reviewable.
8. **Update `README.md`'s "Changes from upstream" section** for each feature, in its own branch.
9. When `prompt-knobs.js` gains a preset, `example.html` must gain the matching `<option>` —
   `prompt-knobs.test.mjs` enforces this. Keep it green.

---

## 4. Feature A — Generate an image for any past message  (`feat/past-message-gen`) — **priority**

### Goal
A button on every chat message that generates an image for **that** message, using the chat as it
stood at that point — not the latest message.

### Reference
`carmex/chat:index.js` — `showGenerateDialog(targetMesId)`, the `.kazuma_msg_gen_btn` hover
injection, and the `customOptions.targetMesId` plumbing through `onGeneratePrompt`,
`buildSystemPromptFromPreset`, `buildChatHistoryFromPreset`. Port the **plumbing**, not the
injection method or the popup.

### Design (decided — implement this)
1. **Button placement — follow ST's own convention**, not carmex's `mouseenter` injection. ST's
   built-in image extension puts `.sd_message_gen` statically in `#message_template
   .extraMesButtons` and uses a delegated click handler. Do the same on init:
   - prepend a `.kazuma_msg_gen_btn` (`fa-solid fa-camera`, title "Kazuma: generate image for this
     message") to `#message_template .mes_buttons .extraMesButtons`, **and** to every already
     rendered `#chat .mes .extraMesButtons` (template changes don't affect existing DOM);
   - one `$(document).on("click", ".kazuma_msg_gen_btn", …)` reading `mesid` from the closest `.mes`.
   - Verify selectors against current ST `public/index.html` before relying on them.
2. **Target resolution, in a new module** (e.g. `scene-target.js`, tested):
   - `resolveSceneIndex(chat, targetMesId?)` → walk backwards from `targetMesId ?? chat.length-1`
     to the first message with non-empty `mes`. This also fixes a baseline bug: today, after an
     image is inserted as its own message, the quick-gen button reads that message's empty `mes`.
   - `historyWindow(chat, endIdx, count)` → the slice ending **at** `endIdx` (inclusive).
   - `latestTrackerUpTo(chat, endIdx)` → newest tracker at or before `endIdx`. carmex did **not**
     do this; without it a past-message image gets the *current* tracker (wrong clothes, wrong room).
3. **Plumbing:** `onGeneratePrompt(opts = {})` gains an optional `targetMesId`. With no argument
   behaviour must be identical to baseline (auto-gen, quick-gen and the diagnostic popup all call
   it bare). Thread `targetMesId` into both preset builders and the tracker lookup.
4. **Where the image goes:** into the **clicked message's own gallery** (pass `target = { message:
   chat[id], element }` to `generateWithComfy`). This matches ST's built-in button. Don't append a
   new message at the end of chat.
5. **Swipe-to-vary on those images:** `onImageSwiped` currently requires `message.name === "Image
   Gen Kazuma"`. Add a marker to the media object in `insertImageToChat` (e.g. `kazuma: true`) and
   accept either condition. Use the marker, not `source === "generated"` alone — ST's built-in
   image extension also writes `source: "generated"` and also listens for overswipe, so a looser
   check would double-generate for users with both enabled.
6. **No extra popup.** One click generates. Diagnostic Mode, if on, still shows its review popup
   before sending to ComfyUI — that path must keep working.
7. **Busy guard:** if a generation is already running, toast and ignore the click.
8. The existing `originChatId` check in `insertImageToChat` must still apply.

### Acceptance
- Unit tests for the three helpers, including: target is the image message itself (empty `mes`) →
  resolves to the message before it; `targetMesId = 0`; tracker only on a later message → none.
- Bare `onGeneratePrompt()` produces the same instruction text as baseline for the same chat
  (assert via a small extracted builder, or document why not testable).
- Button appears on new **and** existing messages, not duplicated on re-render or chat switch.
- e2e (§8): clicking the button on message N puts an image in message N's gallery.

---

## 5. Feature B — Better default prompts  (`feat/detailed-prompts`)

### Findings already made (don't re-research)
- **No fork has detailed Booru prompting.** Every fork's Booru format is a single sentence.
- The only substantially richer prompt is carmex's `DEFAULT_SYSTEM_PROMPT` (≈1,300 words,
  `carmex/chat:index.js`). It targets **natural-language** models (SDXL prose, Flux, Krea), not tags.
- alpkabac adds one useful idea: an anti-roleplay guard at the top of the instruction ("This is a
  separate task. Do not continue the story, write dialogue or roleplay."). It matters on the "Use
  Current Active Preset" path, where the chat preset's RP instructions bleed in.
- bluespacer's own single-subject Booru prompt (Appendix A) is the most detailed Booru guidance
  available and is the base for `booru_1p`.

### Deliverables
Add **new** entries to `PROMPT_FORMATS` in `prompt-knobs.js` (+ matching `<option>`s in
`example.html`). Do not edit or remove existing entries. Users who want different wording can use
the existing "Custom" format box, or edit `prompt-knobs.js`.

1. **`booru_1p`** — "Illustrious / Pony (Booru, 1 person)". Appendix A, verbatim **except**:
   - **Drop step 2** (copy CHARACTER PREFIX / LoRA syntax). Deaquay appends per-LoRA trigger words
     and the Positive Prompt Suffix *after* the LLM runs; asking the LLM to emit them too
     duplicates them. Leave a one-line code comment saying so.
   - Map input names to what Deaquay actually sends: "CHARACTER DESCRIPTION" → the
     `{{char}}'s appearance:` line; "SCENE STATE" → the `[Scene state]` tracker block. Say "if
     present" for both — either can be absent.
   - Keep step 10 (indoors-only) and step 11 (`masterpiece`) as written.
2. **`booru_2p`** — "Illustrious / Pony (Booru, 2 people, BREAK)". Same vocabularies and rules as
   `booru_1p`, but output is **three segments separated by ` BREAK `**:
   - Segment 1, shared: subject-count tags (`1girl, 1boy` / `2girls` / `2boys`), the interaction
     and its pose tags, framing + optional angle, indoors + room tags, `masterpiece`.
   - Segment 2: person A only — static appearance, visible outfit, emotion tags, gaze.
   - Segment 3: person B only — same fields.
   - Rules: never put a person's attributes in the other person's segment; person A = `{{char}}`,
     person B = `{{user}}` unless the scene makes another character the second subject.
   - This is a first draft; bluespacer will tune it. Add a README note that `BREAK` only works if
     the workflow's text encoder understands it — ComfyUI's stock encoder treats it as a plain
     word; a BREAK-aware node (e.g. smZ "CLIP Text Encode++") is needed.
3. **`natural_detailed`** — "Natural language (detailed review)". Built from carmex's prompt using
   the keep/drop map in Appendix B. Must read correctly when appended after Deaquay's own `Task:`,
   `Scene:`, `Perspective:` lines (don't duplicate those).
4. **Anti-roleplay guard:** prepend alpkabac's guard as the first line of the instruction built in
   `onGeneratePrompt`, behind a new setting `antiRoleplayGuard` (default **on**; only affects the
   current-preset path). One checkbox in `example.html` next to the AI Role select.

### Acceptance
- `prompt-knobs.test.mjs` passes (option/preset sync).
- New tests: `booru_1p` and `booru_2p` contain every vocabulary list from Appendix A and don't
  mention LoRA syntax; `booru_2p` instructs exactly two `BREAK` separators.
- Existing users' selected format is untouched after upgrade; new formats aren't the default.

---

## 6. Feature C — Tag autocomplete from bluespacer's own list  (`feat/tag-autocomplete`)

### Goal
While the user writes or edits a prompt, suggest tags from a personal list. The LLM is not
involved — this is a typing aid only.

### Reference
`alpkabac/main:index.js`, the `/* --- TAG AUTOCOMPLETE SYSTEM --- */` block (~L108–400):
`loadTagData`, `lowerBound`, `searchTags`, `formatTagForComfy`, `TAG_CAT_COLORS`,
`attachAutocomplete`. Self-contained and good; port it largely as is.

### CSV format (bluespacer will conform his file to this)
No header. One tag per line: `tag,category,post_count,"alias1,alias2"`,
e.g. `long_hair,0,5351430,"longhair"`. Category: 0 general, 1 artist, 3 copyright, 4 character,
5 meta. Aliases column optional. For a personal list, `post_count` acts as a ranking weight.

### Design
1. Split into `tag-search.js` (CSV parse, index build, `searchTags`, formatting — tested) and a
   thin `attachAutocomplete` in `index.js` (DOM).
2. **File location:** `tags.csv` in the extension folder, **git-ignored**, loaded lazily on first
   focus of a host field. Ship `tags.example.csv` (~30 lines, valid format) and document copying it.
   Missing file → feature silently off, one console warning, no toasts.
3. **Underscore handling is a setting.** alpkabac converts `_` → space and escapes `(`/`)` on
   insert. bluespacer's Illustrious prompts use underscores. Add `tagInsertStyle`: `underscores`
   (default) | `spaces`. Paren-escaping stays on in both modes.
4. **Host fields, in priority order:**
   1. the **Diagnostic Mode review textarea** (`onGeneratePrompt`, ~L860) — the review-before-send
      step bluespacer uses; this is the main target;
   2. the enlarged-view editable prompt (`makePromptEditable`): a `contentEditable <code>`, while
      alpkabac's code uses `.val()`/`selectionStart`. Either adapt via `Selection`/`Range`, or swap
      the `<code>` for a textarea when made editable. Pick the smaller change; say which in the PR;
   3. the Positive Prompt Suffix and per-LoRA trigger-word fields, if they're textareas/inputs.
5. One settings checkbox: "Tag autocomplete" (default on).
6. **Out of scope:** alpkabac's "manual prompt" mode (typing a prompt from scratch, skipping the
   LLM). Don't port it.

### Acceptance
- Tests: CSV with quoted aliases, missing aliases column, CRLF line endings, empty lines; prefix
  beats alias beats substring; ordering by count; both insert styles; parens escaped.
- 20k-line synthetic CSV indexes in < 500 ms under node (sanity check, not a hard gate).
- e2e (§8): with Diagnostic Mode on, typing a prefix in the review textarea shows suggestions;
  Enter inserts the tag in the configured style.

---

## 7. Feature D — Context macros (`feat/context-macros`) — optional, lowest priority

Only if A–C are done. carmex supports two extra placeholders in the image-gen context preset's
system prompt; Deaquay has neither:
- `{{summaryception}}` — reads the Summaryception extension's summary from
  `chatMetadata.summaryception.layers` (carmex `getSummaryceptionText()`, ~20 lines). Must return
  `""` when that extension isn't installed: a soft dependency, not a requirement. Note in README
  that it reads that extension's internal storage and may break if its format changes.
- `{{world_info}}` — active lorebook entries via ST's `getWorldInfoPrompt` (carmex ~L952).

Resolve both only if the placeholder appears (World Info lookup isn't free). For past-message
generation (Feature A), note in the PR that these reflect the *current* state, not the state at
message N.

---

## 8. Testing

Timebox the harness (step 2) to ~45 min; if ST won't boot here, ship unit tests plus the e2e
scripts unvalidated, and say so.

1. **Unit tests** for every new module (required).
2. **Mock harness** in `dev/` (scripts committed; downloads git-ignored):
   - Clone ST `release` shallow, `npm ci`, symlink this repo into
     `public/scripts/extensions/third-party/Image-gen-kazuma`.
   - `dev/mock-comfy.mjs`: minimal ComfyUI fake — `/object_info/*`, `/prompt`, `/history/:id`,
     `/view` returning a fixed 64×64 PNG. Find the exact routes by reading ST's server code for its
     `/api/sd/comfy/*` proxy, not by guessing.
   - `dev/mock-llm.mjs`: OpenAI-compatible `/v1/chat/completions` returning a fixed prompt.
3. **e2e tests** in `dev/e2e/` (Playwright, own `dev/package.json`):
   - Read `ST_URL` (default `http://localhost:8000`) and optional `ST_USER`/`ST_PASS` from env.
     Never commit credentials.
   - Baseline checks for every branch: no console errors on load; every `#kazuma_*` id referenced in
     `index.js` exists in the DOM (carmex's fork shipped with 16 missing — guard against that).
   - Per-feature checks as listed in each Acceptance section.
   - Must not depend on mock-only behaviour, so the same command works against bluespacer's real
     setup: `ST_URL=http://localhost:8000 npx playwright test`. Tests that need a real image
     should wait generously (real renders take 10–60 s).
   - Headless browser download may be blocked by the network allowlist here — try once, don't fight
     it. If blocked, still write the tests and mark them unvalidated.
4. **`docs/LOCAL_TEST.md`**, in two parts:
   - *Automated:* how to install and run the e2e suite on Windows against the real ST.
   - *Manual / visual:* what bluespacer must judge by eye per feature — prompt quality per format,
     `booru_2p` separation, image lands in the right message, swipe works on past-message images.
     Written as a checklist a local Claude session driving his browser could also follow.

### bluespacer's local environment (for LOCAL_TEST.md)
- ST runs in Docker under WSL2; ComfyUI runs on the Windows host; extensions live on the host.
- Because generation goes through the ST server, the ComfyUI URL in settings must be
  `http://host.docker.internal:8188` (not `127.0.0.1`), and ComfyUI needs `--listen`.
- The LoRA list is fetched browser-side; if empty, the bundled `server-plugin/` fixes it.
- Playwright runs on Windows and reaches ST at the Docker-published port (normally
  `http://localhost:8000`).

---

## 9. Definition of done

- One PR per feature against bluespacer's fork `main`, each with: behaviour, files touched, tests
  added, what was validated vs. unvalidated here, known limitations, link to its LOCAL_TEST.md
  section, and a line confirming it's suitable to offer to Deaquay as-is (or what would need to
  change first).
- All tests pass on every branch. `git diff main --stat` on `index.js` kept small.
- A final message: what's done, what was skipped and why, what bluespacer must check locally.

---

## Appendix A — bluespacer's single-subject Booru prompt (base for `booru_1p`)

```
You output a flat, comma-separated booru tag string for WAI-Illustrious SDXL.
Output only the tag string. No prose, no markdown, no explanations, no line breaks.

Your input text contains three sections: CHARACTER PREFIX, CHARACTER DESCRIPTION, and SCENE STATE.
Build the output in this exact order:

1. `1girl, solo`.
2. Copy the CHARACTER PREFIX line verbatim (LoRA syntax + trigger words).
3. Female static appearance from CHARACTER DESCRIPTION: hair color, hair length, eye color, body type. Always identify the female as the primary subject.
4. Visible outfit only (top to bottom) from the female's Outfit field in SCENE STATE. Do not include underwear or intimate clothing unless it is visibly exposed in the scene.
5. 1–5 emotion tags selected from: angry, blank_eyes, blush, clenched_teeth, crying, embarrassed, evil_smile, glaring, grin, hand_on_own_face, hands_on_own_cheeks, happy, heavy_breathing, laughing, light_smile, nervous, open_mouth, parted_lips, raised_eyebrows, saliva, scared, sleepy, smile, smug, streaming_tears, surprised, tears, tongue_out, wide-eyed
6. Exactly 1 gaze tag from: averting_eyes, closed_eyes, sideways_glance, looking_at_viewer, looking_away, looking_back, looking_down, looking_to_the_side, looking_up
7. Pose tags as applicable from: arched_back, arm_support, bent_over, breast_press, crossed_arms, crossed_legs, doggystyle, face-to-face, hands_up, hugging_own_legs, lying, missionary, on_back, on_one_knee, on_side, on_stomach, outstretched_arm, own_hands_clasped, own_hands_together, reclining, sitting, sitting_on_lap, sleeping, spread_arms, spread_legs, standing, standing_on_one_leg, straddling, stretching, under_covers
8. Any additional focus or action tags that capture the key narrative detail of the scene.
9. Exactly 1 framing tag from: portrait, cowboy_shot, upper_body, full_body, profile. Optionally 1 angle tag if non-neutral (omit for eye-level): from_above, from_behind, from_below, from_side
10. Always output `indoors` plus 1–2 specific room tags derived from the Location field (e.g. `bedroom`, `castle_interior`). Never use corridor, hallway, staircase, or outdoor tags. Never add any person, crowd, or character to the background tags.
11. masterpiece

Rules:
- Always anchor to the female character as the primary subject.
- Only include tags that apply to the current scene.
- Aim for concise output (~50 tags or fewer).
```

---

## Appendix B — carmex prompt: keep / drop map (for `natural_detailed`)

Source: `const DEFAULT_SYSTEM_PROMPT` in `carmex/chat:index.js`.

**Keep** (light edits for length and grammar are fine):
- `CORE INSTRUCTION` paragraph (output only the final prompt, nothing before/after).
- All `REVIEW STEPS` bullets: Abstract-to-Concrete, Technical Contradiction Check, Concurrent Action
  Audit, Garment State Validation, Character Detail Symmetry, Anatomical Pre-Flag, Gaze Geometry
  Check, Color Contrast Audit, Abstract Shape Translation, Motion Verb Conversion, Visibility
  Geometry Check, Light Source Color Cast, Skin Flush & Color Intensity, Angle-Descriptor
  Re-Verification, No Sensory Hallucination, Color Stack Prohibition, Texture Integration, and the
  content-preservation bullet.
- All `PROMPT STRUCTURE` bullets: Film Blocking Order, Spatial Hierarchy and Depth Layering,
  Subject Count and Overlap Check, Description formatting, Angle-Based Descriptor Culling (fix its
  dangling "Step 6" reference — there is no numbered step 6).

**Don't port:**
- The header block (`Character Information=`, `{{char_*}}`, `{{group_info}}`, `Tracker=`, `Task=`,
  `Scene=`, `Style Constraint=`, `Perspective=`) — Deaquay supplies these itself.
- The `Rules=` paragraph, including its `{{// … }}` comment and `<professional_legality>` block.
  bluespacer will add his own rules by hand during local testing.
- `{{summaryception}}` — handled by Feature D if implemented.
