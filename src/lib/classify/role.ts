// What kind of work a job is, from its title (and a job board's own category when given).

export const ROLE_TYPES = [
  { id: "data-science", label: "Data science & ML" },
  { id: "analytics", label: "Data & business analytics" },
  { id: "quant", label: "Quant research & trading" },
  { id: "finance", label: "Finance & investing" },
  { id: "consulting", label: "Consulting & strategy" },
  { id: "economics", label: "Economics & research" },
  { id: "software", label: "Software & data engineering" },
  { id: "product", label: "Product" },
  { id: "risk", label: "Risk, compliance & audit" },
  { id: "accounting", label: "Accounting" },
  { id: "operations", label: "Operations & supply chain" },
  { id: "marketing", label: "Marketing & sales" },
  { id: "hardware", label: "Hardware & engineering" },
  { id: "other", label: "Other" },
] as const;

export type RoleTypeId = (typeof ROLE_TYPES)[number]["id"];

export function roleTypeLabel(id: string | null | undefined): string {
  return ROLE_TYPES.find((r) => r.id === id)?.label ?? "Other";
}

const RULES: [RoleTypeId, RegExp][] = [
  ["finance", /\b(equity research|investment banking|private equity|asset management|wealth management)\b/i],
  ["software", /^(?!.*\bquant)(?=.*\b(?:engineer|developer|sre|devops)\b)(?!.*\b(?:data|machine learning|ml)\s+(?:scien|analy))/i],
  ["quant", /\b(quant\w*|trader|trading|market mak\w*|algorithmic|systematic)\b/i],
  ["economics", /\b(econom\w+|research assistant|research analyst|policy analyst|statistician|survey|econometric\w*)\b/i],
  ["data-science", /\b(data scien\w+|machine learning|ml engineer|\bml\b|ai\b|artificial intelligence|deep learning|nlp|computer vision|applied scientist|research scientist|decision scien\w+)\b/i],
  ["analytics", /\b(data analy\w+|analytics|business intelligence|\bbi\b|insights?|reporting analyst|business analyst|data & analytics|analytics engineer)\b/i],
  ["risk", /\b(risk|compliance|audit\w*|regulatory|fraud|aml|kyc|credit risk)\b/i],
  ["accounting", /\b(accounting|accountant|tax|controller|bookkeep\w*|cpa)\b/i],
  ["finance", /\b(financ\w+|investment|banking|banker|equity research|wealth|portfolio|asset management|private equity|capital markets|treasury|valuation|m&a|underwrit\w+|credit analyst|fp&a)\b/i],
  ["consulting", /\b(consult\w+|strategy|advisory|associate consultant|management associate)\b/i],
  ["product", /\b(product manag\w+|product analyst|product owner|apm|program manag\w+|product design\w*)\b/i],
  ["software", /\b(software|developer|engineer(ing)? intern|backend|front[- ]?end|full[- ]?stack|data engineer\w*|devops|sre|platform engineer|swe|cloud engineer|web developer)\b/i],
  ["operations", /\b(operations|supply chain|logistics|procurement|sourcing|planning analyst)\b/i],
  ["marketing", /\b(marketing|sales|growth|brand|communications|social media|account executive|business development|customer success)\b/i],
  ["hardware", /\b(hardware|electrical|mechanical|embedded|firmware|robotics|manufacturing engineer|chemical engineer|civil engineer|aerospace engineer)\b/i],
];

const SIMPLIFY: Record<string, RoleTypeId> = {
  "ai/ml/data": "data-science",
  "data science, ai & machine learning": "data-science",
  quant: "quant",
  "quantitative finance": "quant",
  software: "software",
  "software engineering": "software",
  product: "product",
  "product management": "product",
  hardware: "hardware",
  "hardware engineering": "hardware",
};

export function classifyRole(title: string, category?: string | null): RoleTypeId {
  for (const [id, re] of RULES) if (re.test(title)) return id;
  const fromCategory = category ? SIMPLIFY[category.trim().toLowerCase()] : undefined;
  return fromCategory ?? "other";
}
