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

### Feature C — tag autocomplete (`tag-autocomplete.spec.mjs`)

Needs a `tags.csv` in the extension folder (skipped otherwise). The tests read its first tag and
type the first four characters of it.

- With Diagnostic Mode on, typing a prefix in the review box shows suggestions; Enter inserts the
  top one followed by `, `, in both insert styles; the popup stays open.
- Escape closes the dropdown, not the popup.
- With the setting off, no dropdown.
- The editable prompt in the enlarged image view gets suggestions, and Enter doesn't add a newline.

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

### Feature C — tag autocomplete

Copy your own list to `tags.csv` in the extension folder first (see README for the format).

- [ ] F12 console on first focus of the review box: one "Tag autocomplete: N tags loaded" line
      with the right N. Rename `tags.csv` away and reload: one warning, no toasts, nothing breaks.
- [ ] Diagnostic Mode review box: type 2+ characters of a tag you know. Your tags appear, most-used
      first; an alias you defined finds its tag. Arrow keys move, Enter/Tab insert, Escape closes.
- [ ] Insert style **underscores**: `long_hair`; switch to **spaces**: `long hair`. A tag with
      parentheses comes out as `name_\(series\)` in both.
- [ ] Editing in the middle of a tag list (caret before an existing `, `) doesn't leave `,,`.
- [ ] Enlarged image view (click a generated image): the prompt box gets suggestions; then
      "Regenerate with this prompt" uses the edited text.
- [ ] Positive Prompt Suffix and a LoRA's trigger-words field: suggestions appear there too.
- [ ] With a big list (20k+ lines): no noticeable lag on first focus or while typing.
- [ ] Phone / narrow window: dropdown is readable and doesn't run off-screen.
