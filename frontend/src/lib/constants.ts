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
