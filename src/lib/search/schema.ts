import { z } from "zod";
import { PROVIDERS } from "@/lib/boards/types";

/** "a, b\nc" → ["a", "b", "c"] without duplicates. */
export function splitList(value: string): string[] {
  return Array.from(
    new Map(
      value
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => [s.toLowerCase(), s]),
    ).values(),
  );
}

export const searchFormSchema = z.object({
  name: z.string().trim().min(1, "Name this search").max(120),
  titles: z.string().max(3000),
  keywords: z.string().max(5000),
  excludeWords: z.string().max(2000),
  locations: z.string().max(2000),
  includeRemote: z.boolean(),
  levels: z.array(z.enum(["internship", "entry", "any"])).min(1, "Pick at least one level"),
  sources: z.array(z.enum(PROVIDERS)).min(1, "Pick at least one job board type"),
  companyScope: z.enum(["all", "mine"]),
  resumeId: z.string(),
  minScore: z.number().int().min(0).max(100),
  scheduleHour: z.number().int().min(-1).max(23), // -1 = no schedule
});

export type SearchFormValues = z.infer<typeof searchFormSchema>;

export const DEFAULT_EXCLUDES = ["senior", "staff", "principal", "director", "manager", "lead"];

export const TITLE_PRESETS: { label: string; titles: string[] }[] = [
  {
    label: "Data & analytics",
    titles: ["data scientist", "data analyst", "data analytics", "analytics", "business intelligence", "machine learning", "research analyst"],
  },
  {
    label: "Quant & finance",
    titles: ["quantitative research", "quantitative analyst", "quantitative trading", "financial analyst", "investment analyst", "risk analyst", "economic analyst"],
  },
  {
    label: "Business & consulting",
    titles: ["business analyst", "consultant", "strategy analyst", "operations analyst", "product analyst"],
  },
  {
    label: "Software",
    titles: ["software engineer", "data engineer", "machine learning engineer", "backend engineer", "full stack engineer"],
  },
];

// Skills and topics the "suggest from resume" button looks for.
export const KEYWORD_VOCABULARY = [
  "Python", "SQL", "R", "Java", "C++", "C#", "JavaScript", "TypeScript", "Go", "Scala", "MATLAB", "SAS", "Stata", "Julia",
  "Pandas", "NumPy", "SciPy", "scikit-learn", "Sklearn", "TensorFlow", "PyTorch", "Keras", "XGBoost", "Spark", "PySpark",
  "Hadoop", "Airflow", "dbt", "Snowflake", "BigQuery", "Redshift", "Databricks", "AWS", "GCP", "Azure", "Docker", "Kubernetes",
  "Git", "Linux", "Tableau", "Power BI", "Looker", "Excel", "VBA", "Matplotlib", "Seaborn", "Plotly", "Jupyter", "LaTeX",
  "machine learning", "deep learning", "NLP", "natural language processing", "computer vision", "statistics", "statistical modeling",
  "regression", "classification", "clustering", "time series", "forecasting", "A/B testing", "experimentation", "causal inference",
  "econometrics", "optimization", "feature engineering", "data visualization", "data cleaning", "ETL", "data pipelines",
  "random forest", "LSTM", "SVM", "KNN", "Naive Bayes", "neural networks", "reinforcement learning", "large language models", "LLM",
  "financial modeling", "DCF", "valuation", "risk management", "portfolio", "derivatives", "fixed income", "equities", "trading",
  "accounting", "due diligence", "market research", "real estate", "economics", "finance", "healthcare", "consulting",
  "product analytics", "dashboards", "React", "Node.js", "REST", "APIs", "HTML", "CSS",
];
