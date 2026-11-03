---
name: application-answers
description: Answer job application form questions from the owner's profile (work authorization, sponsorship, education, EEO, consent, location, open questions) without inventing facts. Use when filling a form, when an application stops on questions, or to explain an answer.
---

# Application answers

The engine is `jobfinder/answers.py`: `answer_fields(fields, profile, context)` gives one answer per
field with a confidence (high / medium / low) and the rule that produced it. The profile is
`private/profile.yaml`; saved answers are in the database (`python -m jobfinder answer`).

## Order the engine uses
1. A saved answer for the same question (same key words, word endings and filler ignored; "...with
   Python?" never matches "...with SQL?"). Answers an AI saved are medium confidence: held for the
   owner's OK.
2. A rule (70, in order; legal questions before generic ones). See `references/rules.md`.
3. Nothing: `value: None`. Open questions get `needs_writing: True`.

## Work authorization (an F-1 student on CPT/OPT; always use the owner's actual profile)
| The question asks | Profile field | Typical F-1 answer |
| --- | --- | --- |
| Legally authorized to work in the US? | authorizedToWork | Yes (CPT/OPT) |
| Need sponsorship **now or in the future** (H-1B)? | needsSponsorshipLater | Yes |
| Need sponsorship **to start / currently**? | needsSponsorshipNow | No |
| Authorized **without sponsorship, now or in the future**? | opposite of needsSponsorshipLater | No |
| Authorized without sponsorship (no time given)? | opposite of needsSponsorshipNow, medium confidence | Yes, check |
| Authorized to work in the country where this position is located? | authorizedToWork | Yes |
| US citizen / green card / U.S. person (ITAR/EAR)? | usCitizen / permanentResident / usPerson | No |
| Visa status? | visaStatus | the option closest to "F-1" |
| Currently in a sponsored status (H-1B, O-1, TN, E-3)? | visaStatus | No for F-1 |

## Other families
- **EEO** (gender, race, Hispanic/Latinx, veteran, disability, transgender): blank in the profile =
  "I don't wish to answer" / "Decline". "Hispanic or Latinx?" with "Not" in the profile = No.
- **Consent / certify / "I accept" / privacy acknowledgment / "may use AI tools"**: only when
  `consent: true` in settings; otherwise left for the owner.
- **Texts, WhatsApp, job alerts, marketing**: No unless the profile says yes.
- **Standard declarations** (related to an employee, non-compete, worked here before, client
  relationship): from the profile; not set = "No", held to check.
- **GPA ranges** ("3.0-3.49"): the range holding the GPA. **Graduation windows** ("graduating
  between X and Y", "by June 2030 will you have your Master's"): computed from `graduation`.
- **Education rows** (Greenhouse `school--N`, `degree--N`, `discipline--N`, start/end month/year):
  from school, degree, major, schoolStart, graduation. "M.S." picks "Master's Degree"; no look-alike
  guesses.
- **Residence** ("What U.S. state do you reside in?"), current employer/title, offer deadlines,
  relocation, travel, office preference, salary, start date, how you heard: from the profile.
- **Referral programs**: No unless "how did you hear" says a referral.

## When a form stops on questions
1. Collect every `needs` across the batch (`python -m jobfinder status`).
2. Facts that are in the profile/resume or that the owner told you: save once for every job:
   `python -m jobfinder answer "Exact question as on the form" "Answer"` (add `--job JOB_ID` for one
   job; add `--ai` when you wrote it, so it is held for his OK).
3. Ask the owner only what's left, all at once. Then `python -m jobfinder act APP_ID retry`.
4. Facts that hold everywhere belong in `private/profile.yaml` (`custom:` list of question/answer).

## Open questions ("Why us?", "Tell us about a project")
Write 80-200 words (or the field's limit) in the owner's voice (`../cover-letter-writer/`), from the
resume and the posting, save with `--ai`, and show them to him.

## Never
Invent an employer, date, number or legal fact; answer a legal/visa/EEO question by guessing;
tick consent unless the setting allows it.
