# Local testing

Cloud sessions can only test against mocks (`dev/mock-comfy.mjs`, `dev/mock-llm.mjs`). Image and
prompt quality, real renders and real chats have to be checked on a real install. This file has two
parts: an automated e2e suite you run against your own SillyTavern, and a manual checklist for what
only a person (or a local Claude session driving the browser) can judge.

Setup assumed below: SillyTavern in Docker under WSL2, ComfyUI on the Windows host, extension folder
on the host, Playwright on Windows.

## Before you start (real install)

- In the extension settings, the ComfyUI URL must be `http://host.docker.internal:8188` (not
  `127.0.0.1`): generation goes through the ST server, which runs inside the container.
- ComfyUI must be started with `--listen` so the container can reach it.
- If the LoRA list is empty, install the bundled `server-plugin/` (see README).
- Pick a workflow and checkpoint once in the UI, and check one image generates by hand.
- The connection the prompt LLM uses must be working (send one normal chat message first).

## Part 1 — Automated (Playwright)

Run from PowerShell on Windows, in the extension folder:

```powershell
cd dev
npm install
npx playwright install chromium
$env:ST_URL = "http://localhost:8000"
npx playwright test
```

Optional environment variables:

| Variable | Default | Use |
|---|---|---|
| `ST_URL` | `http://localhost:8000` | Your SillyTavern, at the Docker-published port. |
| `ST_USER`, `ST_PASS` | unset | Basic-auth credentials if you enabled them. Never commit these. |
| `ST_CHARACTER` | first character | Character the tests open. |
| `KAZUMA_GEN_TIMEOUT` | `180000` | Milliseconds to wait for one prompt + render. |

What the suite does to your data: each test that needs a chat opens `ST_CHARACTER` and starts a
**new** chat named `kazuma-e2e-<timestamp>`, adds a few messages to it without calling the LLM,
and generates images into it. Existing chats are not touched. Delete the `kazuma-e2e-*` chats
afterwards from the chat list.

Results: `npx playwright show-report` opens the HTML report; failures keep a screenshot and a trace.

### Baseline checks (every branch)

- `baseline.spec.mjs` — no console/page errors from the extension on load; every `#kazuma_*` id
  referenced in `index.js` exists in the DOM. Two ids are known missing at the Deaquay baseline
  (`kazuma_import_btn`, `kazuma_import_file`, a dead legacy import binding) and are allowlisted.

### Feature B — detailed prompts (`detailed-prompts.spec.mjs`)

- The three new formats are in the Prompt Instructions select, after the shipped ones.
- The anti-roleplay checkbox exists and mirrors the saved setting.
- Picking a new format saves it; the test then restores your previous choice.

### Dev harness (cloud / Linux only)

```bash
dev/setup.sh    # clone ST release, npm ci, symlink this repo, seed it to use the mocks
dev/start.sh    # mock ComfyUI :8188, mock LLM :5001, ST :8000
cd dev && npx playwright test
```

## Part 2 — Manual / visual checklist

Write down pass/fail and a one-line note per item. A local Claude session driving the browser can
follow the same list; it should take a screenshot for every visual item.

### Baseline

- [ ] Open the extension drawer: every section renders, no blank selects, no console errors (F12).
- [ ] Quick-gen paintbrush next to the send button produces an image in a new "Image Gen Kazuma" message.
- [ ] Swiping right on that image produces a variation in the same gallery.

### Feature B — detailed prompts

Turn on **Diagnostic Mode** so every generated prompt is shown before it is sent. Use the same
two or three chat moments for every format, so they're comparable.

- [ ] After upgrading, your previously selected Prompt Instructions format is still selected.
- [ ] **Booru, 1 person**: output is one line of comma-separated tags, no prose. Order: `1girl, solo`,
      appearance, outfit, 1–5 emotion tags, exactly one gaze tag, pose, framing (+ angle),
      `indoors` + room, `masterpiece`. No LoRA syntax and no trigger words in the LLM output (they
      are added afterwards; check the final prompt in the enlarged image view has them once).
- [ ] Booru 1p with Character Appearance empty and Include Tracker off: still sensible tags, no
      "CHARACTER DESCRIPTION" / "SCENE STATE" text leaking into the output.
- [ ] **Booru, 2 people, BREAK**: exactly two ` BREAK ` separators. Segment 1 has the count tags
      (`1girl, 1boy` …), interaction/pose, framing, room, `masterpiece`; segment 2 only {{char}}'s
      hair/outfit/emotion/gaze; segment 3 only {{user}}'s. Note any attribute in the wrong segment.
- [ ] Booru 2p image, with a BREAK-aware encoder (smZ "CLIP Text Encode++") in the workflow: the two
      people keep their own hair/outfit colors. Then with stock CLIPTextEncode: expect bleed.
- [ ] **Natural language (detailed review)**: output is one prose prompt with no headers, bullets,
      step names or commentary. Compare to *Natural Prose* on the same scene.
- [ ] **Anti-roleplay guard**, with *Use Current Active Preset* and a roleplay chat preset: with the
      guard on, the model writes a prompt; turn it off and note whether it answers in character.
