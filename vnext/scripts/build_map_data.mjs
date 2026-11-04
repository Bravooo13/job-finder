// Builds the dashboard's map data once (the outputs are committed; run again only to refresh them):
//   dashboard/geo/us-states.json  state outlines drawn in Albers USA at 975x610 (us-atlas, ISC)
//   dashboard/geo/us-cities.json  US cities with their spot on that drawing (GeoNames, CC BY 4.0)
// Needs v1's node_modules (d3-geo, topojson-client, us-atlas) and src/lib/geo/cities.json:
//   node vnext/scripts/build_map_data.mjs   (from the Job-Finder folder)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const v1 = join(here, "..", "..");
const require = createRequire(join(v1, "package.json"));
const { geoAlbersUsa, geoPath } = await import(require.resolve("d3-geo"));
const { feature, mesh } = await import(require.resolve("topojson-client"));
const topo = require("us-atlas/states-albers-10m.json");
const rows = JSON.parse(readFileSync(join(v1, "src/lib/geo/cities.json"), "utf8"));
const out = join(here, "..", "dashboard", "geo");

const NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };
const CODE = Object.fromEntries(Object.entries(NAMES).map(([c, n]) => [n, c]));

const path = geoPath().digits(1);
const states = feature(topo, topo.objects.states).features
  .filter((f) => CODE[f.properties.name])
  .map((f) => ({ code: CODE[f.properties.name], name: f.properties.name, d: path(f), c: path.centroid(f).map((v) => Math.round(v * 10) / 10) }));
const borders = path(mesh(topo, topo.objects.states, (a, b) => a !== b));
writeFileSync(join(out, "us-states.json"), JSON.stringify({ width: 975, height: 610, states, borders }));

// A city can be found by its name alone ("Denver") only when it is the biggest place with that name
// anywhere; "London" or "Cambridge" need their state.
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const top = new Map();
for (const r of rows) { const k = fold(r[0]); if (!top.has(k) || top.get(k)[5] < r[5]) top.set(k, r); }
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const cities = [];
for (const r of rows) {
  if (r[1] !== "US") continue;
  const p = projection([r[4], r[3]]);
  if (!p) continue;
  cities.push([r[0], r[2], Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, r[5], top.get(fold(r[0])) === r ? 1 : 0]);
}
writeFileSync(join(out, "us-cities.json"), JSON.stringify(cities));
console.log(`${states.length} states, ${cities.length} cities`);
