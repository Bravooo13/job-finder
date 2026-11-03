# Platform registry

`registry.json` lists every applicant-tracking system and job site vnext knows (75). It is built
by `scripts/build_registry.py`; edit that script and run `python scripts/build_registry.py`, then
`python scripts/build_platform_refs.py` to refresh `skills/ats-platforms/references/`.

## Fields

| Field | Meaning |
| --- | --- |
| `id` | short name used everywhere (`greenhouse`, `workday`) |
| `name` | display name |
| `category` | `ats-enterprise`, `ats-mid`, `ats-smb`, `ats-regional`, `hcm-payroll`, `hourly`, `staffing`, `career-site`, `job-board` |
| `hosts` | regexes matched against a link's host (first match wins, in file order) |
| `example` | a typical job link with `{placeholders}` |
| `feed` | `{type, url, notes}`: how to list jobs without a login (`json-get`, `json-post`, `json`, `xml`, `html`, `none`) |
| `apply` | `{flow, signIn, notes}`: flow `single-page`, `multi-step`, `redirect`, `in-app`, `easy-apply`, `indeed-apply`, `chat`, `varies`; sign-in `none` / `optional` / `required` |
| `automation` | `full` (fill and submit by settings), `fill` (owner signs in and submits), `manual` (owner applies) |
| `confidence` | `verified` (tested live), `documented` (public docs), `pattern` (seen in URLs; confirm first) |
| `notes` | anything else worth knowing |

## Adding a platform

1. Add an entry in `scripts/build_registry.py` with `confidence: "pattern"`.
2. Listing jobs: a feed in `jobfinder/feeds.py`, registered in `FEEDS`, and its host in `BOARD_PATTERNS`.
3. Applying on several pages or behind a sign-in: a `Site` in `jobfinder/apply/sites.py`.
4. A detection test with a real link in `tests/test_platforms.py`.
5. After it works live, set `confidence: "verified"` and write what you learned into
   `LESSONS` in `scripts/build_platform_refs.py`.
