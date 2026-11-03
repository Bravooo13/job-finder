# Answer rules, in the order they run

Generated from `jobfinder/answers.py` (id and the test that picks the rule). The first rule whose test matches answers the field.

| # | rule | matches when |
| --- | --- | --- |
| 1 | `resume-file` | `f.type == "file" and bool(s(r"resume\|cv\|curriculum", q))` |
| 2 | `cover-letter-file` | `f.type == "file" and bool(s(r"cover", q))` |
| 3 | `other-file` | `f.type == "file"` |
| 4 | `education-row` | `bool(re.match(r"^(school\|degree\|discipline\|start-month\|start-year\|end-month\|end-year)--\d+$", f.hint or ""))` |
| 5 | `date-of-birth` | `bool(s(r"date of birth\|birth ?date\|\bdob\b\|when were you born", q))` |
| 6 | `degree-by-date` | `is_choice(f) and bool(s(r"\b(will\|do) you (have\|hold\|complete\|earn\|finish)\b.{0,60}\bdegree\b\|\bdegree\b.{0,40}\b(by\|before) [a-z]+ \d{4}", q)) and bool(s(r"\b(19\|20)\d{2}\b", q))` |
| 7 | `full-time-start` | `is_choice(f) and bool(s(r"\b(begin\|start\|available)\b.{0,50}\bfull[- ]time\b.{0,50}\b(before\|by\|after\|in) [a-z]+ \d{4}", q))` |
| 8 | `referred` | `is_choice(f) and bool(s(r"\b(were\|are) you (being )?referred\b\|referral program", q))` |
| 9 | `residence-state` | `not s(r"\b(city\|town)\b", q) and bool(s(r"(what\|which) (u\.? ?s\.? )?state\b.{0,40}\b(reside\|live\|located\|based)\b\|state of (current )?residence\|state (do )?you (currently )?(live\|reside)", q))` |
| 10 | `residence-city` | `not is_choice(f) and bool(s(r"\b(city\|town)\b.{0,30}\b(reside\|live\|located\|based)\b\|\b(reside\|live\|located\|based)\b.{0,40}\b(city\|state)\b\|what city and state\|city ?(and\|&\|/) ?state\|current (city\|residence)\|where (do )?you (` |
| 11 | `residence-country` | `not s(r"authori[sz]ed\|eligib\|legally\|permit\|sponsor", q) and bool(s(r"country\b.{0,40}\b(reside\|resident\|live\|living\|located\|residence\|based)\|\b(reside\|live\|located\|based)\b.{0,40}\bcountry\|country of (residence\|current resi` |
| 12 | `employment-company` | `not is_choice(f) and (bool(re.match(r"^company( name)?$", q)) or (bool(re.match(r"^(company\|employer)", q)) and bool(s(r"company\|employ", f.hint or ""))))` |
| 13 | `employment-title` | `not is_choice(f) and (bool(re.match(r"^(job )?title$", q)) or (bool(re.match(r"^title", q)) and "title" in (f.hint or "")))` |
| 14 | `current-employer` | `bool(s(r"(current\|previous\|most recent\|recent\|present\|last)( or (previous\|most recent\|current\|last))? (employer\|company\|organization)\|who is your (current\|previous\|most recent) employer", q))` |
| 15 | `current-title` | `bool(s(r"(current\|previous\|most recent\|present\|last)( or (previous\|most recent\|current\|last))? (job \|position \|role )?title", q))` |
| 16 | `offer-deadline` | `bool(s(r"(offer\|recruiting\|recruitment\|interview\|application)[- ](process )?deadlines?\|competing offers?\|other (job \|internship )?offers?\|time[- ]sensitive", q))` |
| 17 | `text-messages` | `(is_choice(f) or f.type == "checkbox") and bool(s(r"\b(sms\|text messages?\|texting\|whatsapp)\b", q))` |
| 18 | `marketing-opt-in` | `(is_choice(f) or f.type == "checkbox") and bool(MARKETING.search(q))` |
| 19 | `consent` | `(f.type == "checkbox" or is_choice(f)) and (bool(CONSENT_Q.search(q)) or (bool(f.options) and all(ACK_OPTION.match(o.strip()) for o in _real(f.options))))` |
| 20 | `sponsored-status` | `bool(s(r"(currently\|presently) (in\|on\|hold(ing)?) (one of )?(these\|the following\|a\|any)? ?(sponsored\|employer[- ]sponsored\|work) (visa )?status", q))` |
| 21 | `sponsorship` | `"sponsor" in q and not s(r"without (?:the )?(?:need (?:for\|of) )?(?:any \|visa \|employer \|immigration )?sponsor", q) and bool(s(r"(require\|need\|will you\|do you\|would you\|seek\|request)", q))` |
| 22 | `authorized-without-sponsorship` | `bool(s(r"(authori[sz]ed\|eligible\|permitted\|able\|legally)\b.{0,60}\bwork\b", q)) and "without" in q and "sponsor" in q` |
| 23 | `authorized` | `bool(s(r"(legally )?(authori[sz]ed\|eligible\|permitted\|entitled\|right) to (?:lawfully )?work", q)) or (bool(s(r"work authori[sz]ation", q)) and bool(s(r"(do you\|have\|are you\|valid)", q)))` |
| 24 | `visa-status` | `bool(s(r"(visa\|immigration\|work authori[sz]ation\|citizenship) (status\|type)\|type of (visa\|work authori[sz]ation)\|current visa", q))` |
| 25 | `us-citizen` | `bool(s(r"\b(u\.?s\.?\|united states\|american) citizen", q)) and "country of citizenship" not in q` |
| 26 | `permanent-resident` | `bool(s(r"permanent resident\|green card\|lawful permanent", q))` |
| 27 | `export-control` | `bool(s(r"\b(u\.?s\.? person\|itar\|ear\b\|export control\|deemed export)", q))` |
| 28 | `citizenship-country` | `bool(s(r"country of citizenship\|citizenship\|nationality", q))` |
| 29 | `age` | `bool(s(r"\b(18\|eighteen)\b.{0,30}(years\|age\|older)\|at least 18\|over 18\|legal age", q))` |
| 30 | `location-preference` | `bool(s(r"prefer(red)? (office\|location\|city\|work location)\|location preference\|office preference\|which (of our )?(office\|location\|city)\|office location\|desired (work )?location\|where would you (like\|prefer) to (work\|be based)",` |
| 31 | `relocate` | `"relocat" in q` |
| 32 | `travel` | `bool(s(r"willing(ness)? to travel\|able to travel\|travel (up to\|requirement)\|\btravel\b.{0,20}%", q))` |
| 33 | `first-name` | `not is_choice(f) and bool(s(r"(^\|your )(legal )?first name\|given name\|^first$", q))` |
| 34 | `last-name` | `not is_choice(f) and bool(s(r"(^\|your )(legal )?last name\|surname\|family name\|^last$", q))` |
| 35 | `preferred-name` | `not is_choice(f) and bool(s(r"preferred (first )?name\|nickname\|name you go by", q))` |
| 36 | `full-name` | `not is_choice(f) and bool(s(r"^(full \|legal )?name$\|full name\|your name", q))` |
| 37 | `email` | `not is_choice(f) and f.type != "checkbox" and (f.type == "email" or bool(s(r"e-?mail", q)))` |
| 38 | `phone` | `not is_choice(f) and f.type != "checkbox" and (f.type == "tel" or bool(s(r"phone\|mobile\|cell", q)))` |
| 39 | `linkedin` | `"linkedin" in q` |
| 40 | `github` | `bool(s(r"github\|git hub", q))` |
| 41 | `website` | `bool(s(r"website\|portfolio\|personal (site\|url)", q)) and f.type != "file"` |
| 42 | `street` | `bool(s(r"street\|address line 1\|^address( 1)?$\|mailing address\|home address", q))` |
| 43 | `address2` | `bool(s(r"address line 2\|\bapt\b\|apartment\|suite\|\bunit\b", q))` |
| 44 | `city` | `bool(s(r"^city\|town", q))` |
| 45 | `state` | `bool(s(r"^(state\|province\|region)\|state/province\|state or province", q)) and "united states" not in q` |
| 46 | `zip` | `bool(s(r"zip\|postal", q))` |
| 47 | `country` | `bool(s(r"^country\|country of residence\|country/region", q))` |
| 48 | `location` | `bool(s(r"^location\|current location\|where are you (located\|based)", q))` |
| 49 | `enrolled` | `is_choice(f) and bool(s(r"currently (enrolled\|pursuing\|a student)\|are you (a )?(current )?student", q))` |
| 50 | `school` | `bool(s(r"\b(school\|university\|college\|institution)\b", q)) and not s(r"high school\|graduat", q)` |
| 51 | `degree` | `bool(s(r"degree\|level of education\|highest education", q))` |
| 52 | `major` | `bool(s(r"major\|field of study\|discipline\|concentration\|area of study", q))` |
| 53 | `gpa` | `bool(s(r"\bgpa\b\|grade point", q))` |
| 54 | `graduation` | `bool(s(r"graduat\|completion date\|expected (date\|to complete)\|when do you expect to (complete\|finish)", q))` |
| 55 | `start-date` | `bool(s(r"start date\|when can you start\|available to start\|earliest (start\|date)", q))` |
| 56 | `availability` | `bool(s(r"availability\|which term\|semester\|season", q))` |
| 57 | `salary` | `bool(s(r"salary\|compensation\|pay (expectation\|requirement)\|desired pay", q))` |
| 58 | `hear-about` | `bool(s(r"how did you (hear\|find\|learn)\|where did you (hear\|find\|learn)\|source of (application\|referral)\|referral source", q))` |
| 59 | `worked-here` | `bool(s(r"(worked\|employed) (for\|at\|by\|with) (us\|this company\|[a-z]+) before\|previously (been )?(worked\|employed)\|former employee", q))` |
| 60 | `relatives` | `bool(s(r"related to\|relative\|family member", q)) and bool(s(r"employ\|work", q))` |
| 61 | `non-compete` | `bool(s(r"non-?compete\|non-?solicit\|restrictive (covenant\|agreement)\|post-employment", q))` |
| 62 | `client-relationship` | `bool(s(r"(worked\|work) (for\|with) (one of )?our clients?\|client relationship", q))` |
| 63 | `languages` | `bool(s(r"languages? (do you\|you) (speak\|know)\|language proficiency\|what languages", q))` |
| 64 | `eeo-transgender` | `bool(s(r"transgender\|sex assigned at birth", q))` |
| 65 | `eeo-gender` | `bool(s(r"\bgender\b\|\bsex\b", q))` |
| 66 | `eeo-hispanic` | `bool(s(r"hispanic\|latin[oax]", q))` |
| 67 | `eeo-race` | `bool(s(r"\brac(e\|ial)\b\|ethnicit", q))` |
| 68 | `eeo-veteran` | `bool(s(r"veteran\|military service\|armed forces", q))` |
| 69 | `eeo-disability` | `bool(s(r"disabilit", q))` |
| 70 | `cover-letter-text` | `f.type == "textarea" and bool(s(r"cover letter", q))` |
