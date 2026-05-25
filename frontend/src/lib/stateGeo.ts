/** Map GeoJSON STNAME values to app state names (LGD / Survey of India dataset). */

const GEO_NAME_ALIASES: Record<string, string> = {
  "andaman and nicobar": "Andaman and Nicobar",
  "andhra pradesh": "Andhra Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  assam: "Assam",
  bihar: "Bihar",
  chandigarh: "Chandigarh",
  chhattisgarh: "Chhattisgarh",
  "dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  delhi: "Delhi",
  goa: "Goa",
  gujarat: "Gujarat",
  haryana: "Haryana",
  "himachal pradesh": "Himachal Pradesh",
  "jammu and kashmir": "Jammu and Kashmir",
  "jammu & kashmir": "Jammu and Kashmir",
  jharkhand: "Jharkhand",
  karnataka: "Karnataka",
  kerala: "Kerala",
  ladakh: "Ladakh",
  lakshadweep: "Lakshadweep",
  "madhya pradesh": "Madhya Pradesh",
  maharashtra: "Maharashtra",
  manipur: "Manipur",
  meghalaya: "Meghalaya",
  mizoram: "Mizoram",
  nagaland: "Nagaland",
  odisha: "Odisha",
  puducherry: "Puducherry",
  punjab: "Punjab",
  rajasthan: "Rajasthan",
  sikkim: "Sikkim",
  "tamil nadu": "Tamil Nadu",
  telangana: "Telangana",
  tripura: "Tripura",
  "uttar pradesh": "Uttar Pradesh",
  uttarakhand: "Uttarakhand",
  "west bengal": "West Bengal",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeKey(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a GeoJSON state name to the app's canonical state label. */
export function normalizeGeoStateName(raw: string): string {
  const key = normalizeKey(raw);
  return GEO_NAME_ALIASES[key] ?? raw.trim();
}

/** Read STNAME (or fallback keys) from a GeoJSON feature's properties. */
export function getGeoFeatureStateName(properties: Record<string, unknown> | null | undefined): string {
  const raw =
    properties?.STNAME ??
    properties?.NAME_1 ??
    properties?.state ??
    properties?.STATE ??
    "";
  return normalizeGeoStateName(String(raw));
}

export function appStateToGeo(state: string): string {
  return state;
}

export function geoStateToApp(geoName: string): string {
  return normalizeGeoStateName(geoName);
}

/** Approximate state centroids [lng, lat] for marker placement. */
export const STATE_CENTROIDS: Record<string, [number, number]> = {
  "Andhra Pradesh": [79.74, 15.91],
  "Arunachal Pradesh": [94.73, 28.22],
  Assam: [92.94, 26.2],
  Bihar: [85.31, 25.1],
  Chhattisgarh: [81.63, 21.28],
  Delhi: [77.1, 28.7],
  Goa: [74.12, 15.3],
  Gujarat: [71.19, 22.26],
  Haryana: [76.09, 29.06],
  "Himachal Pradesh": [77.17, 31.1],
  "Jammu and Kashmir": [75.34, 33.78],
  Jharkhand: [85.28, 23.61],
  Karnataka: [75.71, 15.32],
  Kerala: [76.27, 10.85],
  Ladakh: [77.58, 34.15],
  "Madhya Pradesh": [78.66, 23.47],
  Maharashtra: [75.71, 19.75],
  Manipur: [93.91, 24.66],
  Meghalaya: [91.37, 25.47],
  Mizoram: [92.94, 23.16],
  Nagaland: [94.56, 26.16],
  Odisha: [85.1, 20.95],
  Puducherry: [79.81, 11.94],
  Punjab: [75.34, 31.15],
  Rajasthan: [74.22, 26.9],
  Sikkim: [88.51, 27.53],
  "Tamil Nadu": [78.66, 11.13],
  Telangana: [79.02, 18.11],
  Tripura: [91.99, 23.94],
  "Uttar Pradesh": [80.95, 26.85],
  Uttarakhand: [79.02, 30.07],
  "West Bengal": [87.85, 22.99],
};

export function getCentroid(state: string | null): [number, number] | null {
  if (!state) return null;
  return STATE_CENTROIDS[state] ?? null;
}

/** Spread markers around a centroid when many colleges share a state. */
export function offsetCentroid(
  base: [number, number],
  index: number,
  total: number,
): [number, number] {
  if (total <= 1 || index === 0) return base;
  const [lng, lat] = base;
  const angle = (index * 137.508) * (Math.PI / 180);
  const radius = 0.35 + Math.floor(index / 8) * 0.25;
  return [lng + radius * Math.cos(angle), lat + radius * Math.sin(angle)];
}
