# Image Gen Kazuma (bluespacer fork)

SillyTavern (ST) third-party extension: chat → LLM-written image prompt → ComfyUI → image in chat.
Lineage: Arif-salah/Image-gen-kazuma (original) → Deaquay/Image-gen-kazuma → this fork.
Work here is meant to be offered back to Deaquay as-is, so match Deaquay's style.

## File map

| File | What |
|---|---|
| `index.js` | Everything that touches ST, the DOM or the network. Imports ST's `script.js`, so it **cannot load under node**. Keep diffs to wiring. |
| `loras.js` | Pure LoRA / profile / migration helpers. Tested by `loras.test.mjs`. |
| `prompt-knobs.js` | `PROMPT_FORMATS`, `STYLE_CONSTRAINTS`, `PERSPECTIVES`, `pickInstruction`. Tested by `prompt-knobs.test.mjs`. |
| `example.html` | Settings drawer. Every preset key needs a matching `<option>` (the test enforces it). |
| `style.css` | Extension styles. |
| `server-plugin/` | Optional ST server plugin that lists LoRAs server-side. Own `package.json`. |
| `dev/` | Dev-only tooling (mock ComfyUI / LLM, Playwright e2e). Own `package.json`; downloads git-ignored. |
| `docs/LOCAL_TEST.md` | How to run e2e against a real ST, plus the manual checklist. |

## How generation flows

1. Trigger: quick-gen paintbrush (`#kazuma_quick_gen`), auto-gen on `MESSAGE_RECEIVED`, or the
   settings button. All call `onGeneratePrompt()` bare.
2. `onGeneratePrompt()` builds the instruction (`Task:` / appearance / `Scene:` with optional
   tracker / `Prompt Instructions:` / `Style Constraint:` / `Perspective:` / `Extra Instructions:`).
   - "Use Current Active Preset": `generateQuietPrompt(instruction)`.
   - "Specific connection profile": `buildSystemPromptFromPreset()` + `buildChatHistoryFromPreset()`
     + instruction, sent via `ConnectionManagerRequestService`.
   - `<think>` blocks stripped. Diagnostic Mode (`debugPrompt`) shows an editable review popup.
3. `generateWithComfy(prompt, target)` loads the workflow from ST (`/api/sd/comfy/workflow`),
   `injectParamsIntoWorkflow()` fills `"*input*"`, `"*seed*"`, LoRAs, … and appends LoRA trigger
   words + Positive Prompt Suffix **after** the LLM output.
4. `runGeneration()` POSTs `/api/sd/comfy/generate` (ST server talks to ComfyUI, not the browser).
5. `insertImageToChat(dataUrl, prompt, target, originChatId)`: with `target = { message, element }`
   appends to that message's gallery; without, pushes a new system message "Image Gen Kazuma".
   Bails if the chat changed mid-render (`originChatId`).
6. Swipe right on the last image → `onImageSwiped` → `generateWithComfy(media.title, target)`.
   The enlarged-image view makes the prompt editable (`makePromptEditable`).

## Tests

Plain node scripts with `node:assert` — no framework, no root `package.json`:

```bash
node loras.test.mjs && node prompt-knobs.test.mjs && node server-plugin/loras-route.test.mjs
```

Every new `*.test.mjs` at the repo root is run the same way (`for f in *.test.mjs; do node "$f"; done`).
e2e: see `docs/LOCAL_TEST.md` (`cd dev && npm i && npx playwright test`, `ST_URL` env var).

## Ground rules

- New logic goes in its own `.js` module with **no ST / DOM / browser dependency**, plus a sibling
  `x.test.mjs`. `index.js` only wires it in.
- Surgical `index.js` edits: no reformatting, no drive-by refactors, no renames.
- Additive presets only: never change or remove shipped presets/defaults. New ones are not default.
  Existing user settings must load unchanged.
- No new runtime dependencies (jQuery, toastr, ST `Popup` are already there).
- No personal data anywhere; if a user must be named, use `bluespacer`.
- LF line endings. Conventional commits (`feat:`, `fix:`, `test:`, `docs:`), small.
- Each feature updates README "Changes from upstream" in its own branch.
- PRs go to bluespacer's fork `main`, never to Deaquay or Arif-salah.
