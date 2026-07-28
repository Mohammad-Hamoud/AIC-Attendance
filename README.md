# AIC Time & Attendance

Prototype time & attendance system for **Savola Foods — Afia International Company, Jeddah**.

A browser-only React application that models the company's attendance rules end to end: it
computes worked time from raw device punches, applies the PRD business rules (BR-01..BR-16),
tracks casual-labour timesheets and salaries, validates canteen/gate access, produces the
reporting pack, and merges the four real system exports into a single attendance workbook.

The app runs entirely client-side against a deterministic demo dataset for **June 2026**
(period day 0 = Mon 2026-06-01, 30 days). No backend or database is required.

## Getting started

```bash
npm install
npm run dev      # start the dev server
```

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Run oxlint |

## Project layout

```
index.html            # Vite entry document
src/
  main.tsx            # React root
  App.tsx             # Role gate, top bar and page navigation
  store.tsx           # App-wide state: config, data, computed results, edits, audit trail
  index.css           # Savola Foods brand system (lime/slate/orange)
  domain/
    model.ts          # Domain types, shift catalogue, time utilities
    engine.ts         # Attendance calculation engine (BR-01..BR-16)
    alerts.ts         # Authority-misuse monitor (non-blocking HR alerts)
    merge.ts          # Multi-system report merge (FR-45)
    xlsx.ts           # Fast .xlsx sheet reader (fflate + direct XML scan)
    seed.ts           # Deterministic June 2026 demo dataset
    i18n.ts           # Bilingual EN/AR dictionary (FR-37)
  pages/
    Landing.tsx       # Role selection (NFR-07 RBAC)
    Dashboard.tsx     # Real-time dashboards and analytics (FR-44)
    Attendance.tsx    # Line-manager portal, corrections, day-off grants (FR-33/38/39)
    Casuals.tsx       # Casual master data, timesheets, incentives (FR-28..32)
    Access.tsx        # Canteen/gate green-red validation (FR-26/27, BR-15)
    Reports.tsx       # Report pack with CSV export (FR-39..43)
    Merge.tsx         # Report merge upload page (FR-45)
    Admin.tsx         # HR admin console: Ramadan, holidays, shifts, policy (FR-34)
    ModRequest.tsx    # In-app modification request widget
    sort.tsx          # Reusable table column sorting
api/
  modification-request.ts   # Serverless function: files a request as a GitHub issue
public/                     # favicon and icon assets
```

## Roles

Users pick a role on the landing screen:

- **HR Operations** — full access to every screen.
- **Line Manager / Supervisor** — own team only: corrections and team reports.

## Report merge

The merge screen (FR-45) accepts the four real system exports, auto-detects each one, and
generates a single accurate attendance workbook following the TAS column design:

- **TAS** (HR Works) — main attendance, one row per employee per day
- **Car Gate** — vehicle gate movements
- **Leaves** — approved leave records
- **Active list** — current employee roster

## Internationalisation

The interface is fully bilingual (English / Arabic) with right-to-left layout for Arabic,
switchable at any time from the top bar.

## Deployment

Configured for Netlify (`netlify.toml`): `npm run build` publishing `dist/`, with an SPA
fallback so every route serves `index.html`. The modification-request endpoint under `api/`
requires a `GITHUB_TOKEN` environment variable with issue-write access.

## Tests

The Vitest suite encodes every worked example from the PRD (BR-04, BR-06, FR-10, FR-14,
FR-15, FR-16, FR-18, FR-30, FR-31) as a test case, per §11.1 of the PRD, alongside merge,
store and authority-monitor tests.
