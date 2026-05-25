/**
 * Build india-states.geojson from LGD state boundaries + POK merged into J&K.
 *
 * Sources:
 * - LGD_States.geojsonl (india-geodata admin/states release)
 * - pok-alhasan.geojson (DataMeet / Survey of India composite boundary)
 *
 * Usage: npm run build:india-map
 */

import { execSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import union from "@turf/union";
import simplify from "@turf/simplify";
import rewind from "@turf/rewind";
import { featureCollection } from "@turf/helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, "..");
const OUT_PATH = join(FRONTEND_ROOT, "public/maps/india-states.geojson");
const CACHE_DIR = join(__dirname, ".cache");
const SIMPLIFY_TOLERANCE = 0.008;

const LGD_URL =
  "https://github.com/yashveeeeeeer/india-geodata/releases/download/admin/states/LGD_States.geojsonl.7z";
const POK_URL =
  "https://raw.githubusercontent.com/datameet/maps/master/Country/disputed/pok-alhasan.geojson";

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function extract7z(archive, destDir) {
  mkdirSync(destDir, { recursive: true });
  execSync(`7z x -y -o"${destDir}" "${archive}"`, { stdio: "inherit" });
}

function readGeojsonl(path) {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  return lines.map((line) => JSON.parse(line));
}

function isJammuKashmir(name) {
  const n = name.toUpperCase().replace(/&/g, "AND").replace(/\s+/g, " ");
  return n.includes("JAMMU") && n.includes("KASHMIR");
}

function flattenBbox(feature) {
  const pts = [];
  const walk = (c) => {
    if (typeof c[0] === "number") {
      pts.push(c);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(feature.geometry.coordinates);
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return {
    lon: [Math.min(...lons), Math.max(...lons)],
    lat: [Math.min(...lats), Math.max(...lats)],
  };
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  const lgdArchive = join(CACHE_DIR, "LGD_States.geojsonl.7z");
  const lgdDir = join(CACHE_DIR, "lgd");
  const lgdPath = join(lgdDir, "LGD_States.geojsonl");
  const pokPath = join(CACHE_DIR, "pok-alhasan.geojson");

  await download(LGD_URL, lgdArchive);
  extract7z(lgdArchive, lgdDir);
  await download(POK_URL, pokPath);

  const features = readGeojsonl(lgdPath);
  const pokData = JSON.parse(readFileSync(pokPath, "utf8"));
  const pokFeature = pokData.features[0];

  console.log(`Loaded ${features.length} LGD state features`);

  let jkIndex = -1;
  for (let i = 0; i < features.length; i++) {
    if (isJammuKashmir(features[i].properties.STNAME ?? "")) {
      jkIndex = i;
      break;
    }
  }
  if (jkIndex < 0) throw new Error("Jammu & Kashmir feature not found in LGD data");

  console.log("J&K before merge:", flattenBbox(features[jkIndex]));

  const merged = union(featureCollection([features[jkIndex], pokFeature]));
  if (!merged) throw new Error("Failed to union J&K with POK");
  merged.properties = { ...features[jkIndex].properties, STNAME: "Jammu & Kashmir" };
  features[jkIndex] = merged;

  console.log("J&K after merge:", flattenBbox(features[jkIndex]));

  const ladakh = features.find((f) =>
    (f.properties.STNAME ?? "").toUpperCase().includes("LADAKH"),
  );
  if (ladakh) console.log("Ladakh bbox:", flattenBbox(ladakh));

  const processed = features.map((f) => {
    const s = simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false });
    return rewind(s, { reverse: true });
  });

  writeFileSync(OUT_PATH, JSON.stringify(featureCollection(processed)));

  const sizeMb = (readFileSync(OUT_PATH).length / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${OUT_PATH} (${sizeMb} MB, ${processed.length} features)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
