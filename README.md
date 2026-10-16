# Gunpla Library

A clean English catalog and personal collection tracker. Plain HTML, CSS, and JavaScript; no dependency installation or build step.

## Use

- Search by kit name, grade, series, or model code. `Nu` also finds `ν`.
- Click **Collect** to mark a kit owned, then choose **Unbuilt**, **Building**, or **Completed**.
- Click the heart to add a kit to the wishlist independently of ownership.
- Open a kit for source information and exact-version instruction links.
- **Add a kit** creates a personal entry when the catalog is missing a release.
- **Backup & library info**, also accessible through **Sources & coverage** in the footer, exports and imports your personal data.

## Data storage

Personal records are stored in this browser's localStorage, under `gunpla-library.v1`. They do not sync across devices or browser profiles. A hosted site and localhost are separate browser storage locations. Export a JSON backup to move a collection; import merges records and asks before replacing matching kit states. Clearing browser/site data removes local records.

The repository contains public source metadata. Personal collection records stay in your browser and are not committed to GitHub. Website access depends on the hosting configuration.

## Source coverage

Snapshot: 16 October 2026. Includes 3,816 Bandai Spirits Gunpla category records, Gundam-related entries from the official Bandai manual library, and additional Dalong records. After matching, the snapshot contains 4,621 catalog records and 2,996 linked instructions. Counts include accessories. This is broad coverage, not a certified complete list of every historical, regional, or limited release.

Official manual links open Bandai's kit detail page; community links open Dalong's information page with the manual section. Instructions are linked on their source websites and are not rehosted. Some Japanese source names and unclassified series are retained. Exact normalized Japanese names are matched; uncertain matches remain separate, so some duplicate releases may remain.

Sources:
- https://www.bandaispirits.co.jp/products/search/result.php?category=1
- https://manual.bandai-hobby.net/
- https://www.dalong.net/reviews/about_e.htm

Images load from Bandai where available and use a placeholder when unavailable. Fonts load from Google Fonts with a system fallback. The geometric header illustration is an original SVG.

## Run locally

From this folder, run `npm run dev` and open `http://localhost:4173`.
Alternatively: `python3 -m http.server 4173 --directory dist`.

Run checks with `npm test` (Node 18+). The source checks cover backup validation, URL safety, filters, and catalog integrity.

## Updating catalog data

The hosted app does not automatically refresh its catalog. The `scripts` folder contains the source importers used for this snapshot. They cache fetched pages under `scripts/cache/`. The official importer currently follows the source pagination limits observed for this snapshot; recheck those limits when updating. Run the official importer before the community importer. These scripts require Python 3 and internet access, and do not read your collection.
