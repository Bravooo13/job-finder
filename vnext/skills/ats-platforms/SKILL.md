---
name: ats-platforms
description: How each applicant-tracking system and job site works for finding and applying (Workday, Greenhouse, Lever, Ashby, iCIMS, Taleo, Oracle, SuccessFactors, SmartRecruiters and 60+ more) - feeds, form flow, sign-in, what can be automated. Use when a job link is on a platform you need to handle, or to add a platform.
---

# ATS platforms

The registry is `platforms/registry.json` (75 platforms). Each entry: `id`, `name`, `category`
(ats-enterprise, ats-mid, ats-smb, hcm-payroll, job-board, ...), `hosts` (regexes), `example` link,
`feed` (how to list jobs without a login), `apply` (flow, sign-in, notes), `automation` and
`confidence`.

- **automation**: `full` = fill and submit by the owner's settings; `fill` = fill page by page, the
  owner signs in and submits; `manual` = the owner applies (job sites such as LinkedIn and Indeed).
- **confidence**: `verified` (tested live), `documented` (public docs), `pattern` (from URLs seen in
  the wild; check the first time).

```bash
python -m jobfinder platform URL   # which platform, the form URL, why, and any skip reason
```

## Detail per platform
`references/{id}.md` for greenhouse, lever, ashby, workday, smartrecruiters, icims, taleo, oracle,
successfactors, jobvite, workable, bamboohr, linkedin, handshake; `references/all-platforms.md` for
the full table and every other entry. Regenerate them after editing the registry:
`python scripts/build_platform_refs.py`.

## Market share (large US employers, 2026)
Workday about 46%, Greenhouse 24%, Oracle 8%, Lever 5%, Phenom 3%, Ashby 2%, SuccessFactors 2%,
SmartRecruiters 1%; startups are mostly Greenhouse, Lever and Ashby. So: Greenhouse/Lever/Ashby run
fully automatic; Workday is the big one that needs the owner's sign-in once per company.

## Adding or fixing a platform
1. Add the entry to `scripts/build_registry.py` (or edit `platforms/registry.json` directly) with
   `confidence: pattern` until you have seen it work.
2. Finding jobs: a feed in `jobfinder/feeds.py` (see `../job-search/references/feeds.md`).
3. Applying: single-page forms need nothing new; multi-page ones get a `Site` in
   `jobfinder/apply/sites.py` (`needs_sign_in`, `next_page`, `is_last_page`, `may_submit`).
4. A test in `tests/test_platforms.py` with a real example link.
