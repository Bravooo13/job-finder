# Job Finder Helper (Chrome extension)

Connects Chrome to Job Finder on this computer.

- **LinkedIn and Handshake:** a Job Finder panel on job search pages. "Grab
  jobs on this page" reads each job at a human pace (a short pause between
  jobs) and sends it to Found jobs with its industry, visa wording and the
  company's own application link. "Save the job I'm viewing" saves one.
- **Any careers page:** toolbar icon → "Grab jobs from this page".
- **Applications** (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, or any
  form from the toolbar): "Fill this application" answers from Job Finder's
  *My answers*, attaches your resume and cover letter, and colors each field:
  green from your answers, yellow to check, red needs you. "Write answers with
  AI" drafts open questions. You review and press Submit yourself; then "I
  submitted it" marks the job applied.
- **Auto apply**: every half minute the helper asks Job Finder for an
  application you queued (Apply → Auto apply). It opens the form in a
  background tab, fills it the same way, and submits it or leaves it for you,
  following your Auto apply settings. While it works, Chrome shows "Job Finder
  Helper started debugging this browser": the helper uses Chrome's debugger to
  press keys in dropdowns that ignore scripts and to let dropdowns open in a
  background tab. Turn it off with the switch in the toolbar popup.

## Install

1. Start Job Finder (http://localhost:3737).
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. **Load unpacked** → choose this `extension` folder.
4. Pin "Job Finder Helper" from the puzzle-piece menu.

After pulling a new version, press the reload icon on the extension's card.
Version 0.2.0 (Auto apply) asks for three more permissions: tabs, alarms and
debugger.

## How it works

`background.js` relays requests to the Job Finder API (web pages can't reach
localhost). `common.js` holds shared helpers and the floating panel; each file
in `sites/` handles one kind of page. Agents can trigger the same actions with
`window.postMessage({ jobFinder: "grab", options }, "*")` and read progress
from `<html data-job-finder-status>`; see ../CLAUDE.md.

The helper only talks to Job Finder (localhost:3737), the page you're on, and
the application tabs Auto apply opens.
LinkedIn's terms don't allow automated collection, so it reads only pages you
open, one job at a time. Use it for your own job search.
