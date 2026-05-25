/** Map app state names to GeoJSON NAME_1 (geohacker/india dataset). */
export const STATE_TO_GEO: Record<string, string> = {
  Odisha: "Orissa",
  Uttarakhand: "Uttaranchal",
  Telangana: "Andhra Pradesh",
  Ladakh: "Jammu and Kashmir",
};

export const GEO_TO_STATE: Record<string, string> = {
  Orissa: "Odisha",
  Uttaranchal: "Uttarakhand",
};

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

export function appStateToGeo(state: string): string {
  return STATE_TO_GEO[state] ?? state;
}

export function geoStateToApp(geoName: string): string {
  return GEO_TO_STATE[geoName] ?? geoName;
}

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
