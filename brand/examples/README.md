# Few-shot examples

Drop your best past posts here as raw, self-contained `.html` files (the same format
`generatePostHTML` produces — one `<html>` file per post, canvas `#post` element included).

`generatePostHTML` in `scripts/automate.js` loads up to 3 files from this directory
(alphabetical order) and passes them to Claude as reference examples — to match their visual
density and rhythm, not to copy their content or concept.

If this directory is empty, generation proceeds exactly as before — no examples are injected
and nothing breaks.

Keep file names descriptive, e.g. `electrician-case-study-ig.html`, `3am-email-test-fb.html`.
