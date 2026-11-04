# Ethio Lost & Found

A community lost-and-found board for Ethiopia. People report items they **lost**
or **found**, search what others have posted, and arrange a safe handover.

- **Backend** — Node.js + Express 5 + Mongoose
- **Frontend** — React 19 + Vite (no UI framework, hand-written CSS)
- **Images** — Cloudinary when configured, otherwise local disk
- **Tests** — `node:test` for both apps, plus server-rendered component smoke tests

---

## Quick start

```bash
npm run install:all     # install backend + frontend dependencies
npm run dev             # API on :5000, web app on :5173
```

Open <http://localhost:5173>.

**It runs with zero configuration.** If `MONGO_URI` is not set the API uses an
in-memory store pre-filled with demo records, and uploads go to
`backend/uploads/`. Data is lost when the server stops — set up MongoDB (below)
when you want persistence.

### With MongoDB

```bash
cd backend
cp .env.example .env       # then edit MONGO_URI
npm run dev
```

On first boot an empty database is seeded with a few demo items
(set `SEED_DEMO_DATA=false` to disable).

### Production build

```bash
npm run build            # builds frontend/dist
NODE_ENV=production MONGO_URI=... npm start
```

The API serves the built frontend from `frontend/dist`, so one process (and one
port) serves everything.

---

## Features

| Area | What it does |
| --- | --- |
| Board | Responsive card grid with photos, Lost/Found and Open/Claimed badges |
| Search | Debounced full-text search over name, description and location |
| Filters | Type, category, status and location, combined with pagination |
| Reporting | Lost/Found toggle, category picker, date, photo upload, contact info |
| Claims | One-click "mark claimed" / reopen, with `resolvedAt` tracked |
| Editing | Inline edit modal, image replacement cleans up the old file |
| Privacy | `hiddenDetails` ("proof of ownership") is never returned by the API |
| Safety | Guidance to verify ownership and meet in public places |
| UX | Toasts, skeleton loading, empty states, retryable error banner, keyboard-dismissable modals |
| A11y | Labelled inputs, `aria-invalid` errors, `aria-live` counts, focus-safe modals, reduced-motion support |

---

## API

Base URL: `http://localhost:5000`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + database status |
| `GET` | `/api/items` | List items (see query parameters) |
| `GET` | `/api/items/:id` | Single item |
| `GET` | `/api/items/meta` | Categories, statuses, types |
| `GET` | `/api/items/stats` | Total / lost / found / claimed counts |
| `POST` | `/api/items` | Create (multipart/form-data, optional `image`) |
| `PUT` | `/api/items/:id` | Full update (all required fields) |
| `PATCH` | `/api/items/:id` | Partial update (e.g. `{ "status": "Claimed" }`) |
| `DELETE` | `/api/items/:id` | Delete, removing the stored image too |

**List query parameters**

| Parameter | Example | Notes |
| --- | --- | --- |
| `search` | `?search=wallet` | Case-insensitive, regex-safe |
| `type` | `?type=Lost` | `Lost` or `Found` |
| `category` | `?category=Wallet` | Must match `/api/items/meta` |
| `status` | `?status=Claimed` | `Unclaimed` or `Claimed` |
| `location` | `?location=bole` | Partial match |
| `from` / `to` | `?from=2026-01-01` | Date range on the item date |
| `page` / `limit` | `?page=2&limit=10` | `limit` capped at 100 |

Response shape:

```json
{
  "items": [ { "_id": "…", "itemName": "Black leather wallet", "status": "Unclaimed", "…": "…" } ],
  "pagination": { "page": 1, "limit": 20, "total": 6, "totalPages": 1, "hasMore": false }
}
```

**Errors** are always JSON:

```json
{ "error": "Validation failed", "fields": { "itemName": "itemName is required" } }
```

`400` bad id/JSON · `404` not found · `413` image too large · `415` not an image ·
`422` validation · `429` too many writes · `503` database unavailable.

---

## Configuration

Copy `backend/.env.example` → `backend/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGO_URI` | *(empty)* | MongoDB connection string; empty ⇒ in-memory store |
| `MONGO_DB_NAME` | from URI | Optional database override |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | *(empty)* | Set all three to upload to Cloudinary |
| `UPLOAD_DIR` | `backend/uploads` | Local image directory |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `SEED_DEMO_DATA` | on in dev | Seed demo records into an empty DB |

---

## Project layout

```
backend/
  app.js                  Express app factory (middleware, routes, static)
  server.js               Entrypoint: pick a store, connect, seed, listen
  config.js               Env parsing + defaults
  models/Item.js          Mongoose schema, categories, statuses, indexes
  routes/items.js         REST routes, backed by the store interface
  middleware/             Validation, async wrapper, JSON error handler
  store/                  mongoStore | memoryStore behind one small interface
  upload.js               Multer + Cloudinary/local storage
  tests/                  unit, API and Mongo integration tests
frontend/
  src/App.jsx             Board, filters, pagination, modals
  src/components/         ItemCard, ItemModal, ItemForm, Filters, StatsBar…
  src/context/            Toast notifications
  src/api.js              Fetch wrapper with typed errors
  test/render.test.js     Server-render smoke tests (no browser needed)
```

The `store/` layer is why the app runs without MongoDB: `mongoStore` and
`memoryStore` implement the same interface, so routes never care which is active.

---

## Tests

```bash
npm test              # both apps
npm run test:api      # 55 backend tests
npm run test:web      # 11 frontend render tests
```

- `backend/tests/unit.test.js` — validation, filters, uploads, memory store
- `backend/tests/api.test.js` — full HTTP flow incl. uploads and rate limiting
- `backend/tests/items.test.js` — same flows against real MongoDB via
  `mongodb-memory-server`; auto-skips when the binary can't be downloaded
- `frontend/test/render.test.js` — server-renders every component and the app shell

CI (`.github/workflows/ci.yml`) runs both suites and the frontend build on every push and pull request.

---

## Roadmap

- [ ] Moderation / admin review before a report goes live
- [ ] Email or SMS notifications when a possible match is posted
- [ ] Accounts so posters can manage their own reports
- [ ] Amharic and Afaan Oromoo translations
- [ ] Map view of where items were lost or found
