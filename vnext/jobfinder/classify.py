"""What a posting says about visas, its level and its state. Ported from v1 (src/lib/classify)."""
from __future__ import annotations

import re
from typing import Optional

NEG = r"(?:not|unable to|cannot|can't|can not|won't|will not|do not|does not|don't|are not able to|is not able to|no longer)"
CITIZEN = [re.compile(x, re.I) for x in [
    r"\b(?:u\.?s\.?|united states)\s+citizen(?:ship)?\s+(?:is\s+)?(?:required|needed|mandatory)",
    r"\bmust\s+(?:be|hold)\s+(?:a\s+)?(?:u\.?s\.?|united states)\s+(?:citizen|citizenship)",
    r"\b(?:only|exclusively)\s+(?:open\s+to\s+)?(?:u\.?s\.?|united states)\s+citizens",
    r"\b(?:u\.?s\.?|united states)\s+citizens?\s+only\b",
    r"\bcitizenship\s+is\s+required",
    r"\b(?:active|current|ability to obtain|eligib\w+ (?:for|to obtain)|obtain and maintain)\s+(?:a\s+|an\s+)?(?:u\.?s\.?\s+)?(?:government\s+)?(?:secret|top secret|ts/sci|ts|security|public trust)\s+clearance",
    r"\b(?:secret|top secret|ts/sci)\s+clearance\s+(?:is\s+)?(?:required|needed)",
    r"\bitar\b[^.]{0,120}\b(?:u\.?s\.? persons?|citizens?|permanent residents?)",
]]
NO_SPONSOR = [re.compile(x, re.I) for x in [
    rf"\b{NEG}\s+(?:currently\s+|presently\s+)?(?:be\s+able\s+to\s+)?sponsor",
    rf"\b{NEG}\s+(?:currently\s+)?(?:be\s+able\s+to\s+)?(?:provide|offer|support|consider|accommodate)\w*\s+(?:any\s+)?(?:[\w-]+\s+){{0,3}}(?:sponsorship|visas?)",
    r"\bwithout\s+(?:current\s+or\s+future\s+|requiring\s+|needing\s+)?(?:employer\s+|visa\s+|immigration\s+)?sponsorship",
    r"\bno\s+(?:visa\s+|h-?1b\s+|immigration\s+|employment\s+)?sponsorship\b",
    r"\bsponsorship\s+(?:is\s+|will\s+)?not\s+(?:be\s+)?(?:available|provided|offered|possible)",
    r"\bus work authorization required\b",
]]
SPONSORS = [re.compile(x, re.I) for x in [
    r"\b(?:visa|h-?1b|immigration|employment)\s+sponsorship\s+(?:is\s+|will\s+be\s+)?(?:available|offered|provided|possible|supported)",
    r"\b(?:able|willing|happy|glad)\s+to\s+sponsor\b",
    r"\bopen to (?:u\.?s\.?\s+)?visa sponsorship\b",
    r"\bwill sponsor\b",
    r"\boffers?\s+(?:visa\s+|h-?1b\s+)?sponsorship\b",
]]
OPT_CPT = [re.compile(x, re.I) for x in [
    r"\bus work authorization not required\b",
    r"\b(?:opt|cpt|stem opt|f-?1)\b[^.]{0,80}\b(?:welcome|eligible|encouraged|accepted|considered|supported|okay|ok)\b",
    r"\b(?:accepts?|open to|welcomes?)\s+(?:candidates\s+(?:on|with)\s+)?(?:opt|cpt|f-?1|international students)",
    r"\binternational students?\s+(?:are\s+)?(?:welcome|encouraged|eligible)",
]]


def _sentence(text: str, m: re.Match) -> str:
    start = max(text.rfind(".", 0, m.start()), text.rfind("\n", 0, m.start())) + 1
    end_dot = text.find(".", m.end())
    end = end_dot + 1 if end_dot != -1 else min(len(text), m.end() + 160)
    return text[start:end].strip()[:300]


def visa(text: str) -> tuple[str, Optional[str]]:
    """(sponsors | opt_cpt | unknown | no_sponsorship | citizens_only, the sentence that decided it)."""
    t = text or ""
    for status, pats in (("citizens_only", CITIZEN), ("no_sponsorship", NO_SPONSOR), ("sponsors", SPONSORS), ("opt_cpt", OPT_CPT)):
        for p in pats:
            m = p.search(t)
            if m:
                return status, _sentence(t, m)
    return "unknown", None


def level(title: str, description: str = "") -> str:
    t = (title or "").lower()
    if re.search(r"\bintern(ship)?\b|\bco-?op\b|summer (analyst|associate)", t):
        return "internship"
    if re.search(r"\b(new grad|graduate|entry|junior|associate|early career|analyst i\b)", t):
        return "entry"
    if re.search(r"\b(senior|sr\.?|staff|principal|lead|director|manager|head)\b", t):
        return "senior"
    years = re.search(r"(\d+)\+?\s*(?:years|yrs)", description or "", re.I)
    if years and int(years.group(1)) >= 5:
        return "senior"
    return "mid"


STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
CITY_STATE = {"chicago": "IL", "new york": "NY", "san francisco": "CA", "seattle": "WA", "boston": "MA", "austin": "TX", "los angeles": "CA", "atlanta": "GA", "denver": "CO"}


def state(location: str) -> Optional[str]:
    loc = location or ""
    if re.search(r"\bremote\b", loc, re.I):
        return "Remote"
    m = re.search(r",\s*([A-Z]{2})\b", loc)
    if m and m.group(1) in STATES:
        return m.group(1)
    low = loc.lower()
    for code, name in STATES.items():
        if name.lower() in low:
            return code
    for city, code in CITY_STATE.items():
        if city in low:
            return code
    return None


# ------------------------------------------------- industry, role type, company (ported from v1)

CLASS_VERSION = 2  # bump when the rules below change: stored jobs are classified again

SUFFIXES = {"inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "pllc",
            "pc", "pa", "sa", "ag", "gmbh", "bv", "nv", "the", "and", "group", "holdings", "holding"}
TRAILING = {"services", "service", "us", "usa", "america", "americas", "north", "international", "global", "technologies",
            "technology", "systems", "solutions", "enterprises", "partners", "com", "na"}


def _words(name: str) -> list[str]:
    import unicodedata
    s = unicodedata.normalize("NFKD", (name or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("&", " and ").replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", " ", s).split()


def company_key(name: Optional[str]) -> str:
    """"GOLDMAN SACHS & CO LLC", "Goldman Sachs" and "goldman-sachs" all become "goldman sachs"."""
    return " ".join(w for w in _words(name or "") if w not in SUFFIXES)


def company_key_variants(name: str) -> list[str]:
    """Looser keys for matching filing names to brand names, most specific first ("amazon com services" -> "amazon")."""
    base = [w for w in _words(name) if w not in SUFFIXES]
    out = [" ".join(base)] if base else []
    t = list(base)
    while len(t) > 1 and t[-1] in TRAILING:
        t.pop()
        out.append(" ".join(t))
    no_com = [w for w in base if w != "com"]
    if no_com and len(no_com) != len(base):
        out.append(" ".join(no_com))
    return list(dict.fromkeys(out))


INDUSTRIES = {
    "quant": "Quant & trading", "finance": "Banking & investing", "fintech": "Fintech & crypto", "insurance": "Insurance",
    "consulting": "Consulting", "tech": "Software & internet", "hardware": "Hardware, robotics & chips", "healthcare": "Healthcare & biotech",
    "aerospace": "Aerospace & defense", "government": "Government & public sector", "education": "Education & research",
    "energy": "Energy & utilities", "consumer": "Retail & consumer", "media": "Media, entertainment & gaming",
    "manufacturing": "Manufacturing & industrial", "realestate": "Real estate & construction", "transport": "Transportation & logistics",
    "telecom": "Telecommunications", "legal": "Legal", "nonprofit": "Nonprofit", "other": "Other",
}
ROLE_TYPES = {
    "data-science": "Data science & ML", "analytics": "Data & business analytics", "quant": "Quant research & trading",
    "finance": "Finance & investing", "consulting": "Consulting & strategy", "economics": "Economics & research",
    "software": "Software & data engineering", "product": "Product", "risk": "Risk, compliance & audit", "accounting": "Accounting",
    "operations": "Operations & supply chain", "marketing": "Marketing & sales", "hardware": "Hardware & engineering", "other": "Other",
}

_KNOWN_LISTS = {
    "quant": "Jane Street|Citadel|Citadel Securities|Hudson River Trading|Two Sigma|DE Shaw|D. E. Shaw|Jump Trading|DRW|IMC Trading|IMC|Optiver|Akuna Capital|Susquehanna|SIG|Tower Research Capital|Virtu Financial|Old Mission Capital|Belvedere Trading|Chicago Trading Company|Peak6|Five Rings|Radix Trading|Headlands Technologies|XTX Markets|Squarepoint Capital|Millennium|Point72|AQR|Renaissance Technologies|WorldQuant|Cubist|Balyasny|Schonfeld|Flow Traders|Maven Securities|Wolverine Trading|Group One Trading|Geneva Trading|Keyrock|Arrowstreet Capital|Man Group|Voleon|Engineers Gate|Quantlab|Vatic Labs|Hehmeyer|Simplex|Trexquant|Graviton Research Capital|Garda Capital|DV Trading",
    "finance": "Goldman Sachs|Morgan Stanley|JPMorgan Chase|J.P. Morgan|JPMorgan|Bank of America|Citi|Citigroup|Wells Fargo|Northern Trust|BMO|BMO Financial Group|State Street|BNY|BNY Mellon|Charles Schwab|Fidelity Investments|Vanguard|BlackRock|William Blair|Lazard|Evercore|Moelis|PJT Partners|Houlihan Lokey|Jefferies|Raymond James|Piper Sandler|Baird|Robert W. Baird|D.A. Davidson|Stifel|Nuveen|Neuberger Berman|GCM Grosvenor|Ariel Investments|Morningstar|Capital One|American Express|Discover|Synchrony|Ally|US Bank|U.S. Bank|PNC|Truist|Fifth Third|KeyBank|Huntington|Citizens|TD|RBC|Barclays|UBS|Deutsche Bank|HSBC|Nomura|Mizuho|MUFG|BNP Paribas|Societe Generale|Macquarie|KKR|Blackstone|Carlyle|Apollo|TPG|Bain Capital|Ares Management|Madison Dearborn|Wintrust|Old National|First Midwest|CME Group|Cboe|Cboe Global Markets|Nasdaq|ICE|Intercontinental Exchange|S&P Global|Moody's|MSCI|FactSet|LPL Financial|Ameriprise|Edward Jones|Northwestern Mutual|Mesirow|Harris Associates|Guggenheim|Invesco|T. Rowe Price|Franklin Templeton|PIMCO|Wellington Management|MFS|Dimensional|Enova International|Enova",
    "fintech": "Stripe|Coinbase|Robinhood|Chime|Chime Financial|Plaid|Affirm|Block|Square|PayPal|Venmo|SoFi|Brex|Ramp|Mercury|Marqeta|Toast|Crypto.com|Kraken|Gemini|Circle|Ripple|Blockstream|Coinflow|Chainalysis|Avant|Klarna|Wise|Revolut|Nubank|Upstart|Carta|Addepar|Betterment|Wealthfront|Acorns|Bilt|Fundbox|Hive Financial Systems",
    "insurance": "Allstate|State Farm|Progressive|Geico|Liberty Mutual|Nationwide|Travelers|Chubb|AIG|Aon|Marsh|Marsh McLennan|Gallagher|Arthur J. Gallagher|Protective|Kemper|CNA|Hartford|The Hartford|MetLife|Prudential|Lincoln Financial|Principal|Zurich|Allianz|Lemonade|Root|Hippo|Oscar Health|Businessolver",
    "consulting": "McKinsey|McKinsey & Company|Boston Consulting Group|BCG|Bain|Bain & Company|Deloitte|PwC|EY|Ernst & Young|KPMG|Accenture|Oliver Wyman|Kearney|A.T. Kearney|L.E.K. Consulting|LEK|Roland Berger|Booz Allen Hamilton|Analysis Group|Cornerstone Research|The Brattle Group|Brattle Group|Charles River Associates|CRA|Compass Lexecon|NERA|NERA Economic Consulting|Bates White|Edgeworth Economics|Keystone Strategy|Huron|Huron Consulting Group|Navigant|Guidehouse|FTI Consulting|AlixPartners|Alvarez & Marsal|West Monroe|Slalom|Capgemini|IBM Consulting|Protiviti|RSM|Grant Thornton|BDO|Crowe|Baker Tilly|ZS|ZS Associates|Trinity Life Sciences|Clarkston Consulting|Gartner|Ippon Technologies|Insight Global|Mercer|Willis Towers Watson|WTW|Korn Ferry",
    "tech": "Google|Alphabet|Meta|Facebook|Apple|Amazon|Microsoft|Netflix|Uber|Lyft|Airbnb|DoorDash|DoorDash USA|Instacart|Pinterest|Snap|Spotify|LinkedIn|Salesforce|Oracle|Adobe|Databricks|Snowflake|Palantir|Figma|Notion|Airtable|Datadog|MongoDB|Atlassian|Shopify|Slack|Zoom|Dropbox|Box|Twilio|Okta|Cloudflare|HubSpot|ServiceNow|Workday|Intuit|Autodesk|VMware|Cisco|IBM|OpenAI|Anthropic|Scale AI|Mercor|C3 AI|C3.ai|Grubhub|Groupon|Braze|Faire|Duolingo|G2|Sprout Social|Relativity|Yelp|Reddit|Discord|Roblox|Asana|Rippling|Gusto|Deel|Vercel|GitHub|GitLab|Hashicorp|Elastic|Confluent|Samsara|Benchling|Ironclad|Verkada|Retool|Linear|Glean|Cohere|Perplexity|Character.AI|Hugging Face|Weights & Biases|Tempus|Tempus AI|ActiveCampaign|Cars.com|Quest Analytics|Cyvl|Zoomlogi|Wurl",
    "hardware": "NVIDIA|Intel|AMD|Qualcomm|Broadcom|Texas Instruments|Micron|Applied Materials|Lam Research|KLA|Tesla|Zipline|Bedrock Robotics|Gecko Robotics|Figure|Figure AI|Hadrian|Hadrian Automation|Gritt Robotics|Fictiv|Anduril|Boston Dynamics|Skydio|Waymo|Cruise|Aurora|Zoox|Motional|Rivian|Lucid|Motorola Solutions|Zebra Technologies|Shure",
    "aerospace": "Lockheed Martin|Raytheon|RTX|Northrop Grumman|General Dynamics|Boeing|L3Harris|BAE Systems|SpaceX|Blue Origin|Relativity Space|Rocket Lab|Northwood Space|MIT Lincoln Laboratory|Leidos|SAIC|CACI|Booz Allen|Contact Government Services|GDIT|General Dynamics Information Technology|Sierra Nevada|Textron|Honeywell Aerospace|Collins Aerospace",
    "healthcare": "Abbott|AbbVie|Baxter|Walgreens|CVS Health|UnitedHealth Group|Optum|Humana|Cigna|Elevance Health|Pfizer|Merck|Johnson & Johnson|Eli Lilly|Bristol Myers Squibb|Amgen|Genentech|Moderna|Medtronic|Stryker|Boston Scientific|GE HealthCare|Epic|Epic Systems|Cerner|Oracle Health|Northwestern Medicine|Rush|Advocate Health|Mayo Clinic|Kaiser Permanente|Flatiron Health|Komodo Health|Verily|Illumina|10x Genomics",
    "consumer": "Walmart|Target|Costco|Home Depot|Lowe's|Kroger|Albertsons|Nike|Procter & Gamble|P&G|PepsiCo|Coca-Cola|Mondelez|Kraft Heinz|McDonald's|Starbucks|Ulta Beauty|Sephora|L'Oreal|Unilever|Colgate-Palmolive|General Mills|Kellogg|Conagra|Hershey|Mars|Nestle|Wayfair|Etsy|eBay|Chewy|Peloton|Allegiant",
    "media": "Disney|Warner Bros. Discovery|NBCUniversal|Paramount|Sony|Electronic Arts|EA|Activision Blizzard|Epic Games|Riot Games|Take-Two|Ubisoft|Nintendo|Netflix Studios|The New York Times|Bloomberg|Tribune|iHeartMedia|Spotify Studios|TikTok|ByteDance|Live Nation",
    "energy": "ExxonMobil|Chevron|Shell|BP|ConocoPhillips|Exelon|ComEd|Duke Energy|NextEra Energy|Southern Company|Dominion Energy|Constellation|Constellation Energy|Invenergy|Enel|Schlumberger|SLB|Halliburton|Baker Hughes|Vistra",
    "manufacturing": "Caterpillar|Deere|John Deere|3M|General Electric|GE|GE Aerospace|Honeywell|Emerson|Illinois Tool Works|ITW|Cummins|Ford|General Motors|GM|Stellantis|Whirlpool|Dow|DuPont|ADM|Archer Daniels Midland|Ingredion|Tate & Lyle|Navistar|Grainger|W.W. Grainger|Parker Hannifin|EquipmentShare",
    "transport": "United Airlines|American Airlines|Delta Air Lines|Southwest Airlines|FedEx|UPS|DHL|Union Pacific|BNSF|CSX|Norfolk Southern|C.H. Robinson|J.B. Hunt|XPO|Flexport|Echo Global Logistics|Coyote Logistics|project44|FourKites|Uber Freight|Convoy",
    "telecom": "AT&T|Verizon|T-Mobile|Comcast|Charter Communications|Lumen|Frontier",
    "realestate": "CBRE|JLL|Jones Lang LaSalle|Cushman & Wakefield|Colliers|Zillow|Redfin|Compass|Opendoor|Equity Residential|Prologis|Simon Property Group|Related Companies|Turner Construction|Clayco|Walsh Group|Pepper Construction",
    "government": "Federal Reserve Bank of Chicago|Federal Reserve|Federal Reserve Board|City of Chicago|State of Illinois|US Government|U.S. Government|Department of Labor|Bureau of Labor Statistics|Census Bureau|CIA|Central Intelligence Agency|FBI|NASA|Argonne National Laboratory|Fermilab|Sandia National Laboratories|Los Alamos National Laboratory|Lawrence Livermore National Laboratory|MITRE|RAND|RAND Corporation|US Gov Early Careers",
    "education": "University of Chicago|Northwestern University|Harvard University|MIT|Stanford University|NORC|NORC at the University of Chicago|Mathematica|Urban Institute|Brookings|Pew Research Center|Chicago Public Schools|Kaplan|Coursera|Chegg|Khan Academy",
    "legal": "Kirkland & Ellis|Sidley Austin|Latham & Watkins|Skadden|Jenner & Block|Mayer Brown|Winston & Strawn|Baker McKenzie|Thomson Reuters|LexisNexis",
    "nonprofit": "Teach For America|United Way|Red Cross|American Red Cross|Feeding America|Gates Foundation|MacArthur Foundation",
}
KNOWN = {company_key(n): ind for ind, names in _KNOWN_LISTS.items() for n in names.split("|")}

_TEXT_RULES = [(ind, re.compile(p, re.I)) for ind, p in [
    ("quant", r"\b(proprietary trading|trading firm|market[- ]mak(?:er|ing)|quantitative trading|hedge fund|systematic (?:trading|investment)|high[- ]frequency|liquidity provider)\b"),
    ("fintech", r"\b(fintech|cryptocurrenc\w*|crypto|blockchain|payments? (?:platform|company)|digital wallet|neobank|stablecoin)\b"),
    ("insurance", r"\b(insurance|insurer|underwriting|actuarial|policyholders?|reinsurance)\b"),
    ("finance", r"\b(investment bank\w*|asset management|wealth management|private equity|capital markets|financial services|commercial bank\w*|lending|credit union|broker[- ]dealer|M&A advisory|investment management)\b"),
    ("consulting", r"\b(consulting firm|management consulting|economic consulting|advisory firm|our clients|expert testimony|litigation support|consultants?)\b"),
    ("aerospace", r"\b(defense|aerospace|national security|department of defense|DoD|missile|satellite|spacecraft|security clearance)\b"),
    ("healthcare", r"\b(patients?|hospitals?|health ?care|clinical|pharmaceutical|biotech\w*|medical device|life sciences|therapeutics)\b"),
    ("hardware", r"\b(semiconductors?|robotics?|hardware|autonomous vehicles?|chips?|firmware|drones?|manufacturing automation)\b"),
    ("tech", r"\b(software|SaaS|cloud|platform|developers?|machine learning platform|internet|app|AI company|open[- ]source)\b"),
    ("government", r"\b(federal agency|government agency|public sector|federal government|state agency|municipal)\b"),
    ("education", r"\b(higher education|K-12|edtech|education technology|school district|research institute|learners|teachers|curriculum|our students)\b"),
    ("energy", r"\b(energy|utility|utilities|oil and gas|renewables?|solar|wind power|power grid|electricity)\b"),
    ("consumer", r"\b(retail\w*|consumer (?:goods|products|brands)|CPG|e-?commerce|shoppers|stores|restaurants?|beverages?)\b"),
    ("media", r"\b(media|entertainment|streaming|games?|gaming|studios?|publishing|broadcast\w*)\b"),
    ("manufacturing", r"\b(manufactur\w+|industrial|factory|factories|plants?|machinery|chemicals?)\b"),
    ("realestate", r"\b(real estate|commercial property|REIT|construction|properties)\b"),
    ("transport", r"\b(logistics|freight|shipping|airlines?|railroad|trucking|supply chain)\b"),
    ("telecom", r"\b(telecommunications?|wireless carrier|broadband|5G network)\b"),
    ("nonprofit", r"\b(non-?profit|501\(c\)\(3\)|charitable|philanthrop\w+|mission-driven)\b"),
]]


def industry_from_naics(code: Optional[str]) -> Optional[str]:
    """The H-1B files give 2-digit NAICS sectors (51 = information, 52 = finance…); only clear ones count."""
    c = str(code or "").strip()
    for prefix, ind in (("5239", "quant"), ("524", "insurance"), ("52", "finance"), ("5411", "legal"), ("5415", "tech"), ("5416", "consulting"),
                        ("51", "tech"), ("62", "healthcare"), ("92", "government"), ("61", "education"), ("21", "energy"), ("22", "energy"),
                        ("44", "consumer"), ("45", "consumer"), ("31", "manufacturing"), ("32", "manufacturing"), ("33", "manufacturing"),
                        ("48", "transport"), ("49", "transport"), ("23", "realestate"), ("53", "realestate")):
        if c.startswith(prefix):
            return ind
    return None


def _industry_from_text(description: str) -> Optional[str]:
    t = description if len(description) <= 6000 else description[:3000] + "\n" + description[-3000:]
    best, best_score = None, 0.0
    for ind, rx in _TEXT_RULES:
        n = len(rx.findall(t))
        score = n * 0.5 if ind == "tech" else n  # generic tech words are everywhere
        if score > best_score:
            best, best_score = ind, score
    return best if best_score >= 2 else None


def industry(company: str, description: str = "", naics: Optional[str] = None) -> str:
    key = company_key(company)
    return (KNOWN.get(key) or KNOWN.get(" ".join(key.split()[:2])) or (_industry_from_text(description) if description else None)
            or industry_from_naics(naics) or "other")


_ROLE_RULES = [(rid, re.compile(p, re.I)) for rid, p in [
    ("finance", r"\b(equity research|investment banking|private equity|asset management|wealth management)\b"),
    ("software", r"^(?!.*\bquant)(?=.*\b(?:engineer|developer|sre|devops)\b)(?!.*\b(?:machine learning|ml|ai|data scien|data analy))"),
    ("quant", r"\b(quant\w*|trader|trading|market mak\w*|algorithmic|systematic)\b"),
    ("economics", r"\b(econom\w+|research assistant|research analyst|policy analyst|statistician|survey|econometric\w*)\b"),
    ("data-science", r"\b(data scien\w+|machine learning|ml engineer|ml|ai|artificial intelligence|deep learning|nlp|computer vision|applied scientist|research scientist|decision scien\w+)\b"),
    ("analytics", r"\b(data analy\w+|analytics|business intelligence|bi|insights?|reporting analyst|business analyst|data & analytics|analytics engineer)\b"),
    ("risk", r"\b(risk|compliance|audit\w*|regulatory|fraud|aml|kyc|credit risk)\b"),
    ("accounting", r"\b(accounting|accountant|tax|controller|bookkeep\w*|cpa)\b"),
    ("finance", r"\b(financ\w+|investment|banking|banker|equity research|wealth|portfolio|asset management|private equity|capital markets|treasury|valuation|m&a|underwrit\w+|credit analyst|fp&a)\b"),
    ("consulting", r"\b(consult\w+|strategy|advisory|associate consultant|management associate)\b"),
    ("product", r"\b(product manag\w+|product analyst|product owner|apm|program manag\w+|product design\w*)\b"),
    ("software", r"\b(software|developer|engineer(ing)? intern|backend|front[- ]?end|full[- ]?stack|data engineer\w*|devops|sre|platform engineer|swe|cloud engineer|web developer)\b"),
    ("operations", r"\b(operations|supply chain|logistics|procurement|sourcing|planning analyst)\b"),
    ("marketing", r"\b(marketing|sales|growth|brand|communications|social media|account executive|business development|customer success)\b"),
    ("hardware", r"\b(hardware|electrical|mechanical|embedded|firmware|robotics|manufacturing engineer|chemical engineer|civil engineer|aerospace engineer)\b"),
]]


def role_type(title: str) -> str:
    return next((rid for rid, rx in _ROLE_RULES if rx.search(title or "")), "other")


# --------------------------------------- job type, workplace, years asked, pay (from the posting text)

def job_type(title: str, description: str = "", lvl: str = "") -> str:
    t, d = (title or "").lower(), (description or "")[:4000].lower()
    if lvl == "internship" or re.search(r"\bintern(ship)?\b|\bco-?op\b", t):
        return "internship"
    if re.search(r"\bpart[- ]time\b", t) or re.search(r"\b(this is a )?part[- ]time (role|position|job)\b", d):
        return "part_time"
    if re.search(r"\b(contract|contractor|temporary|temp|freelance|fixed[- ]term)\b", t) or re.search(r"\b(contract|temporary|fixed[- ]term) (role|position|assignment)\b", d):
        return "contract"
    return "full_time"


def workplace(location: str, description: str = "") -> str:
    loc, d = (location or "").lower(), (description or "")[:6000].lower()
    if re.search(r"\bhybrid\b", loc):
        return "hybrid"
    if re.search(r"\bremote\b", loc) and not re.search(r"\bnot remote\b", loc):
        return "remote"
    if re.search(r"\b(hybrid (role|position|schedule|work|model)|\d days? (a|per) week in (the )?office|in[- ]office \d)", d):
        return "hybrid"
    if re.search(r"\b(fully remote|100% remote|remote[- ]first|work from anywhere|this (role|position) is remote)\b", d):
        return "remote"
    if re.search(r"\b(on-?site|in[- ]office|in person|5 days (a|per) week in)\b", d):
        return "onsite"
    return ""


_YEARS = re.compile(r"\b(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b(?:\s+of)?(?:\s+[\w/&-]+){0,5}?\s+(?:experience|exp\b)", re.I)


def years(description: str) -> Optional[int]:
    """The fewest years of experience the posting asks for, or None when it doesn't say."""
    found = [int(m.group(1)) for m in _YEARS.finditer(description or "") if 0 < int(m.group(1)) <= 15]
    return min(found) if found else None


_PAY = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|K)?(?:\s*(?:-|–|—|to)\s*\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|K)?)?"
                  r"(?:\s*(?:USD|usd))?\s*(?:/|per|an|a)?\s*(hour|hr|year|yr|annum|annually|month|week)?")


def pay(description: str) -> str:
    """A pay range written in the posting ("$45 - $55 an hour", "$120,000 - $150,000 a year"), else ""."""
    for m in _PAY.finditer(description or ""):
        lo = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
        hi = float(m.group(3).replace(",", "")) * (1000 if m.group(4) else 1) if m.group(3) else None
        unit = (m.group(5) or "").lower()
        if not unit:
            unit = "year" if lo >= 20000 else "hour" if 12 <= lo <= 300 and hi else ""
        unit = {"hr": "hour", "yr": "year", "annum": "year", "annually": "year"}.get(unit, unit)
        ok = (unit == "hour" and 12 <= lo <= 400) or (unit == "year" and 20000 <= lo <= 1_000_000) or (unit == "month" and 1500 <= lo <= 40000) or (unit == "week" and 400 <= lo <= 10000)
        if not ok or (hi is not None and hi < lo):
            continue
        fmt = (lambda v: f"${v:,.0f}") if unit != "hour" else (lambda v: f"${v:,.2f}".replace(".00", ""))
        return f"{fmt(lo)}{' – ' + fmt(hi) if hi else ''} a{'n' if unit == 'hour' else ''} {unit}"
    return ""


def full(title: str, company: str, location: str, description: str, naics: Optional[str] = None) -> dict:
    """Everything the dashboard filters on, for one job."""
    lvl = level(title, description)
    return {"industry": industry(company, description, naics), "role_type": role_type(title), "job_type": job_type(title, description, lvl),
            "workplace": workplace(location, description), "years": years(description), "pay": pay(description), "company_key": company_key(company)}
