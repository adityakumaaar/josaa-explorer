export const CATEGORIES = ["General", "EWS", "OBC-NCL", "SC", "ST"] as const;

export const INSTITUTE_TYPES = ["IIT", "NIT", "IIIT", "GFTI"] as const;

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

export const INST_TYPE_COLORS: Record<string, string> = {
  IIT: "bg-blue-100 text-blue-800",
  NIT: "bg-emerald-100 text-emerald-800",
  IIIT: "bg-violet-100 text-violet-800",
  GFTI: "bg-amber-100 text-amber-800",
};

export const BRANCH_TYPES: { label: string; keywords: string[] }[] = [
  { label: "Computer Science & IT", keywords: ["computer", "software", "information technology", "data science", "artificial intelligence", "machine learning"] },
  { label: "Electronics & Electrical", keywords: ["electronics", "electrical", "communication", "vlsi", "instrumentation", "signal"] },
  { label: "Mechanical & Industrial", keywords: ["mechanical", "industrial", "production", "manufacturing", "automobile", "automotive"] },
  { label: "Civil & Environmental", keywords: ["civil", "environmental", "construction", "structural", "transportation"] },
  { label: "Chemical & Materials", keywords: ["chemical", "materials", "metallurgy", "metallurgical", "polymer", "ceramic", "textile", "pulp", "paper"] },
  { label: "Architecture & Planning", keywords: ["architecture", "planning", "design"] },
  { label: "Biotechnology & Life Sciences", keywords: ["bio", "biotechnology", "biomedical", "pharmaceutical", "life science", "food", "agricultural"] },
  { label: "Mathematics & Sciences", keywords: ["mathematics", "physics", "chemistry", "applied science"] },
  { label: "Mining & Earth Sciences", keywords: ["mining", "geology", "geophysics", "petroleum", "ocean", "earth"] },
  { label: "Aerospace & Naval", keywords: ["aerospace", "aeronautical", "naval", "marine", "ocean engineering"] },
  { label: "Energy & Nuclear", keywords: ["energy", "nuclear", "power", "renewable"] },
];
