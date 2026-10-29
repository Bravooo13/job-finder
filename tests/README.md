# Tests

`npm test` runs the unit tests in `tests/unit` with Node's test runner and
[tsx](https://tsx.is). They cover the pure logic that matters most and breaks
quietly: how application questions are answered, visa wording, posted dates,
Found-jobs filters and reading careers pages. None of them touch the database
or the network.

`tests/tsconfig.json` maps `@/…` to `src/` and stubs `server-only`.

For a full check before deploying, also run `npm run typecheck`, `npm run lint`
and `npm run build`, then open the main pages (see CLAUDE.md, "Checking your
work").

## End-to-end

`tests/e2e/extension_e2e.py` loads the real extension in Chromium and checks
the grab API, the LinkedIn grabber on a mock LinkedIn page, and the form
filler on a mock Greenhouse form (work-authorization answers, EEO decline,
resume upload, consent left alone, never submits). It writes to the database,
so point it at a dev server running on a scratch copy; the file's header shows
how.
