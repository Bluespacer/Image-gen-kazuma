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

### Feature A — past-message generation (`past-message-gen.spec.mjs`)

- The camera button is on every message exactly once, including messages added later and after a
  full chat re-render.
- Clicking it on a past message puts an image in **that** message's gallery; no message is appended.
- Swiping right on that image adds a variation to the same gallery (skipped unless User Settings →
  Image Swipe Behavior is "Generate").
- A second click while generating is ignored.
- With Diagnostic Mode on, the review popup appears and **Send** still lands in the clicked message.

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

### Feature A — past-message generation

Use a real chat of 10+ messages where the scene changes (different room or outfit part-way).
Turn on **Include Tracker** if you use Tracker-Enhanced.

- [ ] Open a message's `…` menu: a camera icon ("Kazuma: generate image for this message") sits
      next to ST's paintbrush. Exactly one, on every message, also after switching chats and back.
- [ ] Click it on an **early** message. The image appears in that message, not at the end of chat.
- [ ] The image matches the scene **at that message** (room, outfit), not the current one. With
      Diagnostic Mode on, the review text should describe that message.
- [ ] Same with Include Tracker on: the outfit/location match the tracker of that point in the
      story, not the latest tracker.
- [ ] With "Specific connection profile" as prompt source: same check (history ends at that message).
- [ ] Swipe right on that image: a variation is added to the same message's gallery.
- [ ] If ST's built-in Image Generation extension is also configured (any source), swipe right on
      a Kazuma image: note whether **both** extensions generate. Known limitation, see PR.
- [ ] Click the button, then switch chats before the image arrives: you get a "chat changed"
      warning and nothing is written into the other chat.
- [ ] Quick-gen paintbrush right after an image message: the prompt describes the last real
      message, not an empty scene.
