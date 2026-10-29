# Third-party notices

Job Finder includes code and data from the following projects.

## GeoNames

- Source: https://www.geonames.org/, via the
  [all-the-cities](https://github.com/zeke/all-the-cities) package (MIT)
- Used for: `src/lib/geo/cities.json`, the offline city list that places jobs
  on the map (built by `scripts/build-cities.cjs`)
- License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

## Tectonic

Job Finder doesn't include Tectonic. When you install it from the app, the
official release is downloaded from
[GitHub](https://github.com/tectonic-typesetting/tectonic) (MIT) into
`data/bin`, and Tectonic fetches TeX Live packages on first use. TeX packages
keep their own licenses.

## us-atlas, topojson-client and d3-geo

- Sources: https://github.com/topojson/us-atlas, https://github.com/topojson/topojson-client,
  https://github.com/d3/d3-geo (all ISC, Copyright Mike Bostock)
- Used for: the drawn US map on the Map page (`src/components/map/UsMap.tsx`).
  The state shapes come from the U.S. Census Bureau's cartographic boundary
  files (public domain), packaged by us-atlas.

## Simplify job lists

Job Finder doesn't include these lists. When a search runs, your computer
reads the public `listings.json` files of
[SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships)
and [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
on GitHub. The listings belong to Simplify and the employers; each job links to
the employer's own posting.

## USCIS H-1B Employer Data Hub

Not included. You can download the public data from
[USCIS](https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub)
(a U.S. government work) and import it in Settings.

## Map tiles

The map shows tiles from [CARTO](https://carto.com/attributions) based on
[OpenStreetMap](https://www.openstreetmap.org/copyright) data, credited on the
map itself.

## JobSync

- Source: https://github.com/Gsync/jobsync
- Used for: the UI components in `src/components/ui/` (built on shadcn/ui), the
  base theme in `src/app/globals.css`, HTML entity decoding in
  `src/lib/import/html.ts`, the approach for reading Lever and Ashby job feeds
  in `src/lib/import/providers.ts` and `src/lib/boards/adapters.ts`, and the
  company board lists in `src/lib/boards/directory/greenhouse.json`,
  `lever.json` and `ashby.json`.

```
MIT License

Copyright (c) 2024 gsync

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
