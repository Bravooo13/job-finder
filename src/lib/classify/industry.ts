// Which industry a job is in, from (best first) the industry a job site reports,
// a list of well-known companies, a NAICS code, and words in the description.

import { companyKey } from "./company";

export const INDUSTRIES = [
  { id: "quant", label: "Quant & trading" },
  { id: "finance", label: "Banking & investing" },
  { id: "fintech", label: "Fintech & crypto" },
  { id: "insurance", label: "Insurance" },
  { id: "consulting", label: "Consulting" },
  { id: "tech", label: "Software & internet" },
  { id: "hardware", label: "Hardware, robotics & semiconductors" },
  { id: "healthcare", label: "Healthcare & biotech" },
  { id: "aerospace", label: "Aerospace & defense" },
  { id: "government", label: "Government & public sector" },
  { id: "education", label: "Education & research" },
  { id: "energy", label: "Energy & utilities" },
  { id: "consumer", label: "Retail & consumer" },
  { id: "media", label: "Media, entertainment & gaming" },
  { id: "manufacturing", label: "Manufacturing & industrial" },
  { id: "realestate", label: "Real estate & construction" },
  { id: "transport", label: "Transportation & logistics" },
  { id: "telecom", label: "Telecommunications" },
  { id: "legal", label: "Legal" },
  { id: "nonprofit", label: "Nonprofit" },
  { id: "other", label: "Other" },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export function industryLabel(id: string | null | undefined): string {
  return INDUSTRIES.find((i) => i.id === id)?.label ?? "Unknown";
}

// Well-known employers. Keys are companyKey() forms.
const KNOWN: Record<string, IndustryId> = {};
function known(industry: IndustryId, names: string) {
  for (const n of names.split("|")) KNOWN[companyKey(n)] = industry;
}
known(
  "quant",
  "Jane Street|Citadel|Citadel Securities|Hudson River Trading|Two Sigma|DE Shaw|D. E. Shaw|Jump Trading|DRW|IMC Trading|IMC|Optiver|Akuna Capital|Susquehanna|SIG|Tower Research Capital|Virtu Financial|Old Mission Capital|Belvedere Trading|Chicago Trading Company|Peak6|Five Rings|Radix Trading|Headlands Technologies|XTX Markets|Squarepoint Capital|Millennium|Point72|AQR|Renaissance Technologies|WorldQuant|Cubist|Balyasny|Schonfeld|Flow Traders|Maven Securities|Wolverine Trading|Group One Trading|Geneva Trading|Keyrock|Arrowstreet Capital|Man Group|Voleon|Engineers Gate|Quantlab|Vatic Labs|Hehmeyer|Simplex|Trexquant|Graviton Research Capital|Garda Capital",
);
known(
  "finance",
  "Goldman Sachs|Morgan Stanley|JPMorgan Chase|J.P. Morgan|JPMorgan|Bank of America|Citi|Citigroup|Wells Fargo|Northern Trust|BMO|BMO Financial Group|State Street|BNY|BNY Mellon|Charles Schwab|Fidelity Investments|Vanguard|BlackRock|William Blair|Lazard|Evercore|Moelis|PJT Partners|Houlihan Lokey|Jefferies|Raymond James|Piper Sandler|Baird|Robert W. Baird|D.A. Davidson|Stifel|Nuveen|Neuberger Berman|GCM Grosvenor|Ariel Investments|Morningstar|Capital One|American Express|Discover|Synchrony|Ally|US Bank|U.S. Bank|PNC|Truist|Fifth Third|KeyBank|Huntington|Citizens|TD|RBC|Barclays|UBS|Deutsche Bank|HSBC|Nomura|Mizuho|MUFG|BNP Paribas|Societe Generale|Macquarie|KKR|Blackstone|Carlyle|Apollo|TPG|Bain Capital|Ares Management|Madison Dearborn|Wintrust|Old National|First Midwest|CME Group|Cboe|Cboe Global Markets|Nasdaq|ICE|Intercontinental Exchange|S&P Global|Moody's|MSCI|FactSet|LPL Financial|Ameriprise|Edward Jones|Northwestern Mutual|Mesirow|Harris Associates|Guggenheim|Invesco|T. Rowe Price|Franklin Templeton|PIMCO|Wellington Management|MFS|Dimensional|Enova International|Enova",
);
known(
  "fintech",
  "Stripe|Coinbase|Robinhood|Chime|Chime Financial|Plaid|Affirm|Block|Square|PayPal|Venmo|SoFi|Brex|Ramp|Mercury|Marqeta|Toast|Crypto.com|Kraken|Gemini|Circle|Ripple|Blockstream|Coinflow|Chainalysis|Avant|Klarna|Wise|Revolut|Nubank|Upstart|Carta|Addepar|Betterment|Wealthfront|Acorns|Bilt|Fundbox",
);
known("insurance", "Allstate|State Farm|Progressive|Geico|Liberty Mutual|Nationwide|Travelers|Chubb|AIG|Aon|Marsh|Marsh McLennan|Gallagher|Arthur J. Gallagher|Protective|Kemper|CNA|Hartford|The Hartford|MetLife|Prudential|Lincoln Financial|Principal|Zurich|Allianz|Lemonade|Root|Hippo|Oscar Health|Businessolver");
known(
  "consulting",
  "McKinsey|McKinsey & Company|Boston Consulting Group|BCG|Bain|Bain & Company|Deloitte|PwC|EY|Ernst & Young|KPMG|Accenture|Oliver Wyman|Kearney|A.T. Kearney|L.E.K. Consulting|LEK|Roland Berger|Booz Allen Hamilton|Analysis Group|Cornerstone Research|The Brattle Group|Brattle Group|Charles River Associates|CRA|Compass Lexecon|NERA|NERA Economic Consulting|Bates White|Edgeworth Economics|Keystone Strategy|Huron|Huron Consulting Group|Navigant|Guidehouse|FTI Consulting|AlixPartners|Alvarez & Marsal|West Monroe|Slalom|Capgemini|IBM Consulting|Protiviti|RSM|Grant Thornton|BDO|Crowe|Baker Tilly|ZS|ZS Associates|Trinity Life Sciences|Clarkston Consulting|Gartner|Ippon Technologies|Insight Global|Mercer|Willis Towers Watson|WTW|Korn Ferry",
);
known(
  "tech",
  "Google|Alphabet|Meta|Facebook|Apple|Amazon|Microsoft|Netflix|Uber|Lyft|Airbnb|DoorDash|DoorDash USA|Instacart|Pinterest|Snap|Spotify|LinkedIn|Salesforce|Oracle|Adobe|Databricks|Snowflake|Palantir|Figma|Notion|Airtable|Datadog|MongoDB|Atlassian|Shopify|Slack|Zoom|Dropbox|Box|Twilio|Okta|Cloudflare|HubSpot|ServiceNow|Workday|Intuit|Autodesk|VMware|Cisco|IBM|OpenAI|Anthropic|Scale AI|Mercor|C3 AI|Grubhub|Groupon|Braze|Faire|Duolingo|G2|Sprout Social|Relativity|Avant|Yelp|Reddit|Discord|Roblox|Asana|Rippling|Gusto|Deel|Vercel|GitHub|GitLab|Hashicorp|Elastic|Confluent|Samsara|Benchling|Ironclad|Verkada|Retool|Linear|Glean|Cohere|Perplexity|Character.AI|Hugging Face|Weights & Biases|Tempus|Tempus AI|ActiveCampaign|Cars.com|Morningstar Tech|Quest Analytics|Cyvl|Zoomlogi",
);
known("hardware", "NVIDIA|Intel|AMD|Qualcomm|Broadcom|Texas Instruments|Micron|Applied Materials|Lam Research|KLA|Tesla|Zipline|Bedrock Robotics|Gecko Robotics|Figure|Figure AI|Hadrian|Hadrian Automation|Gritt Robotics|Fictiv|Anduril|Boston Dynamics|Skydio|Waymo|Cruise|Aurora|Zoox|Motional|Rivian|Lucid|Motorola Solutions|Zebra Technologies|Shure");
known("aerospace", "Lockheed Martin|Raytheon|RTX|Northrop Grumman|General Dynamics|Boeing|L3Harris|BAE Systems|SpaceX|Blue Origin|Relativity Space|Rocket Lab|Northwood Space|MIT Lincoln Laboratory|Leidos|SAIC|CACI|Booz Allen|Contact Government Services|GDIT|General Dynamics Information Technology|Sierra Nevada|Textron|Honeywell Aerospace|Collins Aerospace");
known("healthcare", "Abbott|AbbVie|Baxter|Walgreens|CVS Health|UnitedHealth Group|Optum|Humana|Cigna|Elevance Health|Pfizer|Merck|Johnson & Johnson|Eli Lilly|Bristol Myers Squibb|Amgen|Genentech|Moderna|Medtronic|Stryker|Boston Scientific|GE HealthCare|Epic|Epic Systems|Cerner|Oracle Health|Northwestern Medicine|Rush|Advocate Health|Mayo Clinic|Kaiser Permanente|Flatiron Health|Komodo Health|Verily|Illumina|10x Genomics");
known("consumer", "Walmart|Target|Costco|Home Depot|Lowe's|Kroger|Albertsons|Nike|Procter & Gamble|P&G|PepsiCo|Coca-Cola|Mondelez|Kraft Heinz|McDonald's|Starbucks|Ulta Beauty|Sephora|L'Oreal|Unilever|Colgate-Palmolive|General Mills|Kellogg|Conagra|Hershey|Mars|Nestle|Wayfair|Etsy|eBay|Chewy|Peloton|Allegiant");
known("media", "Disney|Warner Bros. Discovery|NBCUniversal|Paramount|Sony|Electronic Arts|EA|Activision Blizzard|Epic Games|Riot Games|Take-Two|Ubisoft|Nintendo|Netflix Studios|The New York Times|Bloomberg|Tribune|iHeartMedia|Spotify Studios|TikTok|ByteDance");
known("energy", "ExxonMobil|Chevron|Shell|BP|ConocoPhillips|Exelon|ComEd|Duke Energy|NextEra Energy|Southern Company|Dominion Energy|Constellation|Constellation Energy|Invenergy|Enel|Schlumberger|SLB|Halliburton|Baker Hughes|Vistra");
known("manufacturing", "Caterpillar|Deere|John Deere|3M|General Electric|GE|GE Aerospace|Honeywell|Emerson|Illinois Tool Works|ITW|Cummins|Ford|General Motors|GM|Stellantis|Whirlpool|Dow|DuPont|ADM|Archer Daniels Midland|Ingredion|Tate & Lyle|Navistar|Grainger|W.W. Grainger|Parker Hannifin|EquipmentShare");
known("transport", "United Airlines|American Airlines|Delta Air Lines|Southwest Airlines|FedEx|UPS|DHL|Union Pacific|BNSF|CSX|Norfolk Southern|C.H. Robinson|J.B. Hunt|XPO|Flexport|Echo Global Logistics|Coyote Logistics|project44|FourKites|Uber Freight|Convoy");
known("telecom", "AT&T|Verizon|T-Mobile|Comcast|Charter Communications|Lumen|Frontier");
known("realestate", "CBRE|JLL|Jones Lang LaSalle|Cushman & Wakefield|Colliers|Zillow|Redfin|Compass|Opendoor|Equity Residential|Prologis|Simon Property Group|Related Companies|Turner Construction|Clayco|Walsh Group|Pepper Construction");
known("government", "Federal Reserve Bank of Chicago|Federal Reserve|Federal Reserve Board|City of Chicago|State of Illinois|US Government|U.S. Government|Department of Labor|Bureau of Labor Statistics|Census Bureau|CIA|Central Intelligence Agency|FBI|NASA|Argonne National Laboratory|Fermilab|Sandia National Laboratories|Los Alamos National Laboratory|Lawrence Livermore National Laboratory|MITRE|RAND|RAND Corporation|US Gov Early Careers");
known("education", "University of Chicago|Northwestern University|Harvard University|MIT|Stanford University|NORC|NORC at the University of Chicago|Mathematica|Urban Institute|Brookings|Pew Research Center|Chicago Public Schools|Kaplan|Coursera|Chegg|Khan Academy");
known("legal", "Kirkland & Ellis|Sidley Austin|Latham & Watkins|Skadden|Jenner & Block|Mayer Brown|Winston & Strawn|Baker McKenzie|Thomson Reuters|LexisNexis");
known("nonprofit", "Teach For America|United Way|Red Cross|American Red Cross|Feeding America|Gates Foundation|MacArthur Foundation");

// LinkedIn, Handshake and other job sites report an industry name; map it to ours.
const SOURCE_RULES: [RegExp, IndustryId][] = [
  [/capital markets|trading|hedge fund|market mak|proprietary/i, "quant"],
  [/insurance/i, "insurance"],
  [/banking|investment|financial services|finance|venture capital|private equity|asset management|wealth|accounting/i, "finance"],
  [/consult|business services|professional services|research services|think tank/i, "consulting"],
  [/aviation|aerospace|defense|space|armed forces|military/i, "aerospace"],
  [/hospital|health|medical|pharma|biotech|life sciences|clinical|wellness/i, "healthcare"],
  [/semiconductor|computer hardware|electronics|robot|automotive|appliances/i, "hardware"],
  [/software|internet|it services|information technology|technology|computer|data|saas|ai\b|artificial intelligence/i, "tech"],
  [/government|public policy|public administration|international affairs|law enforcement|legislative|political/i, "government"],
  [/education|higher ed|e-learning|research|university|school/i, "education"],
  [/oil|gas|energy|utilit|renewable|electric power|mining/i, "energy"],
  [/retail|consumer|food|beverage|apparel|fashion|cosmetic|restaurant|hospitality|travel|leisure|sporting goods/i, "consumer"],
  [/media|entertainment|broadcast|publishing|music|film|gaming|games|newspapers|sports/i, "media"],
  [/manufactur|industrial|machinery|chemical|construction equipment|mechanical/i, "manufacturing"],
  [/real estate|construction|architecture|building/i, "realestate"],
  [/transport|logistics|airline|shipping|freight|supply chain|truck/i, "transport"],
  [/telecom|wireless/i, "telecom"],
  [/law practice|legal/i, "legal"],
  [/non-?profit|philanthrop|civic|social|religious/i, "nonprofit"],
];

export function industryFromSource(text: string | null | undefined): IndustryId | null {
  if (!text?.trim()) return null;
  for (const [re, id] of SOURCE_RULES) if (re.test(text)) return id;
  return null;
}

/** NAICS codes (from H-1B filings) to industries. */
export function industryFromNaics(code: string | number | null | undefined): IndustryId | null {
  const c = String(code ?? "").trim();
  if (!c) return null;
  if (/^5239/.test(c)) return "quant";
  if (/^524/.test(c)) return "insurance";
  if (/^52/.test(c)) return "finance";
  if (/^5416|^5419|^5412/.test(c)) return "consulting";
  if (/^5411/.test(c)) return "legal";
  if (/^5413|^236|^237|^238|^531/.test(c)) return "realestate";
  if (/^5112|^5132|^518|^519|^5415|^5182|^541511|^541512/.test(c)) return "tech";
  if (/^3344|^3341|^3342|^3345|^3363|^3361/.test(c)) return "hardware";
  if (/^3364|^928/.test(c)) return "aerospace";
  if (/^62|^3254|^3391|^5417/.test(c)) return "healthcare";
  if (/^92/.test(c)) return "government";
  if (/^61/.test(c)) return "education";
  if (/^21|^22|^324/.test(c)) return "energy";
  if (/^44|^45|^311|^312|^315|^316|^722|^721/.test(c)) return "consumer";
  if (/^51|^71/.test(c)) return "media";
  if (/^31|^32|^33/.test(c)) return "manufacturing";
  if (/^48|^49/.test(c)) return "transport";
  if (/^517/.test(c)) return "telecom";
  if (/^813/.test(c)) return "nonprofit";
  return null;
}

// Words in a description (usually the "About us" part) that point to an industry.
const TEXT_RULES: [IndustryId, RegExp][] = [
  ["quant", /\b(proprietary trading|trading firm|market[- ]mak(?:er|ing)|quantitative trading|hedge fund|systematic (?:trading|investment)|high[- ]frequency|liquidity provider)\b/gi],
  ["fintech", /\b(fintech|cryptocurrenc\w*|crypto|blockchain|payments? (?:platform|company)|digital wallet|neobank|stablecoin)\b/gi],
  ["insurance", /\b(insurance|insurer|underwriting|actuarial|policyholders?|reinsurance)\b/gi],
  ["finance", /\b(investment bank\w*|asset management|wealth management|private equity|capital markets|financial services|commercial bank\w*|lending|credit union|broker[- ]dealer|M&A advisory|investment management)\b/gi],
  ["consulting", /\b(consulting firm|management consulting|economic consulting|advisory firm|our clients|expert testimony|litigation support|consultants?)\b/gi],
  ["aerospace", /\b(defense|aerospace|national security|department of defense|DoD|missile|satellite|spacecraft|security clearance)\b/gi],
  ["healthcare", /\b(patients?|hospitals?|health ?care|clinical|pharmaceutical|biotech\w*|medical device|life sciences|therapeutics)\b/gi],
  ["hardware", /\b(semiconductors?|robotics?|hardware|autonomous vehicles?|chips?|firmware|drones?|manufacturing automation)\b/gi],
  ["tech", /\b(software|SaaS|cloud|platform|developers?|machine learning platform|internet|app|AI company|open[- ]source)\b/gi],
  ["government", /\b(federal agency|government agency|public sector|federal government|state agency|municipal)\b/gi],
  ["education", /\b(university|universities|college|students|research institute|school district|academic)\b/gi],
  ["energy", /\b(energy|utility|utilities|oil and gas|renewables?|solar|wind power|power grid|electricity)\b/gi],
  ["consumer", /\b(retail\w*|consumer (?:goods|products|brands)|CPG|e-?commerce|shoppers|stores|restaurants?|beverages?)\b/gi],
  ["media", /\b(media|entertainment|streaming|games?|gaming|studios?|publishing|broadcast\w*)\b/gi],
  ["manufacturing", /\b(manufactur\w+|industrial|factory|factories|plants?|machinery|chemicals?)\b/gi],
  ["realestate", /\b(real estate|commercial property|REIT|construction|properties)\b/gi],
  ["transport", /\b(logistics|freight|shipping|airlines?|railroad|trucking|supply chain)\b/gi],
  ["telecom", /\b(telecommunications?|wireless carrier|broadband|5G network)\b/gi],
  ["nonprofit", /\b(non-?profit|501\(c\)\(3\)|charitable|philanthrop\w+|mission-driven)\b/gi],
];

function fromText(description: string): IndustryId | null {
  const text = description.length > 6000 ? `${description.slice(0, 3000)}\n${description.slice(-3000)}` : description;
  let best: IndustryId | null = null;
  let bestScore = 0;
  for (const [id, re] of TEXT_RULES) {
    const hits = text.match(re)?.length ?? 0;
    // Generic tech words are everywhere; make them count less.
    const score = id === "tech" ? hits * 0.5 : hits;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

export interface IndustryInput {
  company: string;
  description?: string | null;
  sourceIndustry?: string | null;
  naics?: string | null;
}

export function classifyIndustry(input: IndustryInput): IndustryId {
  const key = companyKey(input.company);
  return (
    KNOWN[key] ??
    KNOWN[key.split(" ").slice(0, 2).join(" ")] ??
    industryFromSource(input.sourceIndustry) ??
    industryFromNaics(input.naics) ??
    (input.description ? fromText(input.description) : null) ??
    "other"
  );
}
