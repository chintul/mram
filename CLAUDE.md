# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm start` — serve production build
- No test runner or linter configured

## Architecture

Next.js 16 app (App Router) with React 19, Tailwind CSS v4, TypeScript. Single-page tool that exports Mongolian geographic data as KML files for use in AlpineQuest Pro.

**UI (`app/page.tsx`)** — Client component. Users select from 7 data layers (aimags, soums, protected areas, protection zones, land parcels, mining conservation, CMCS mining licenses), then export selected layers as a single `.kml` file. All UI text is in Mongolian.

**API route (`app/api/data/route.ts`)** — Single `GET /api/data?layer=<name>` endpoint that proxies external GIS sources and normalizes them to GeoJSON. Three data sources:
- **geoBoundaries.org** — administrative boundaries (aimags ADM1, soums ADM2)
- **egazar.gov.mn** — government GeoServer WFS (protected areas, protection zones, land parcels, mining conservation)
- **cmcs.mrpam.gov.mn** — mining cadastre system; paginated grid API for license IDs, then batch-fetches HTML detail pages and parses embedded Esri geometry via regex

Feature properties are normalized to `shapeName`, `description`, and `type` across all sources.

**KML conversion (`app/lib/geojson-to-kml.ts`)** — Converts multi-layer GeoJSON to KML with per-layer styles (color, line width). Handles Polygon and MultiPolygon geometries.

## Key Details

- `maxDuration = 60` on the API route (Vercel hobby plan limit). CMCS layer fetches 2,800+ licenses in batches of 25 concurrent requests — this is the slowest layer.
- Path alias: `@/*` maps to project root.
- Tailwind v4 uses `@import "tailwindcss"` and `@theme inline` syntax in `globals.css` — no `tailwind.config` file.
