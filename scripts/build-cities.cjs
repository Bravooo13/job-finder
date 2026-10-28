// Builds src/lib/geo/cities.json, the offline city list used to place jobs on
// the map. Source: GeoNames (CC BY 4.0) via the all-the-cities package.
//
//   npm install --no-save all-the-cities@3.1.0 && node scripts/build-cities.cjs
const fs = require("node:fs");
const path = require("node:path");
const cities = require("all-the-cities");

const rows = cities
  .filter((c) => (c.country === "US" ? c.population >= 2000 : c.population >= 15000))
  .filter((c) => !/^PPL(H|Q|W|X)$/.test(c.featureCode)) // drop historical/abandoned places
  .sort((a, b) => b.population - a.population)
  .map((c) => [
    c.name,
    c.country,
    c.adminCode,
    Math.round(c.loc.coordinates[1] * 1e4) / 1e4,
    Math.round(c.loc.coordinates[0] * 1e4) / 1e4,
    c.population,
  ]);

const out = path.join(__dirname, "..", "src", "lib", "geo", "cities.json");
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`Wrote ${rows.length} cities to ${path.relative(process.cwd(), out)}`);
