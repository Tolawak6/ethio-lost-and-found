# Ethio Lost & Found

A lost property register for **Addis Ababa bus passengers**.

When a passenger leaves something on a bus, the supervisor hands it to the lost
property department. Staff log the item — photo, bus plate number, route, date,
where on the bus it was found and the office holding it. Passengers search the
public register, file a claim with proof of ownership, and collect the item in
person once the department approves it.

- **Backend** — Node.js, Express 5, Mongoose
- **Frontend** — React 19 + Vite (no UI framework, hand-written CSS)
- **Images** — Cloudinary when configured, otherwise local disk
- **Tests** — `node:test` for both apps, plus server-rendered component tests

---

## How it works

```
Bus supervisor            Lost property department              Passenger
     │                              │                              │
 finds item on the bus ───────────▶ logs it in the register ─────▶ searches by plate/route
                                   (photo, plate, route, date)      finds the item
                                                                         │
                                   reviews the claim ◀──────────── files a claim with proof
                                          │
                              approves ───┴─── rejects
                                          │
                              item marked Returned ─────────────▶ collects it with photo ID
```

**Department side** (behind `STAFF_API_KEY`)
- Publish an item with its bus plate number, route, agency, date and photo
- Record private identifying details that are never shown publicly
- Review the claims passengers file: approve, reject or mark collected
- Closing a claim as *Collected* automatically marks the item *Returned*

**Passenger side** (public, no account)
- Search by bus plate number, route, category or free text
- See where and when the item was found and which office holds it
- File a claim with a phone number and proof of ownership, then get a reference
  code (e.g. `EC-7Q2X9P`) to track the claim later

---

## Quick start

```bash
npm run install:all     # install backend + frontend dependencies
STAFF_API_KEY=office-demo npm run dev
```

Open <http://localhost:5173>. Click **Department sign-in** and use
`office-demo` to add items; browse and claim as a passenger without signing in.

**It runs with zero configuration.** Without `MONGO_URI` the API uses an
in-memory store seeded with demo bus records, and uploads go to
`backend/uploads/`. Data is lost when the server stops.

> The department key is only read from the environment. If it is left empty the
> API stays open (convenient for local demos) and logs a warning in production.

### With MongoDB

```bash
cd backend
cp .env.example .env       # set MONGO_URI and STAFF_API_KEY
npm run dev
```

An empty database is seeded with demo items on first boot
(`SEED_DEMO_DATA=false` disables this).

### Production build

```bash
npm run build            # builds frontend/dist
NODE_ENV=production MONGO_URI=... STAFF_API_KEY=... npm start
```

Express serves the built frontend from `frontend/dist`, so one process on one
port serves the whole product.

---

## API

Base URL: `http://localhost:5000`

### Public

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/items` | Search the register (see parameters below) |
| `GET` | `/api/items/:id` | One item, without private details |
| `GET` | `/api/items/meta` | Categories, agencies, statuses, retention policy |
| `GET` | `/api/items/stats` | Items in storage / in review / returned |
| `GET` | `/api/items/plates` | Plate numbers for search suggestions |
| `POST` | `/api/items/:id/claims` | File a claim → returns a reference code |
| `GET` | `/api/items/claims/:reference` | Track a claim by its reference |
| `GET` | `/api/health` | Liveness + database status |

**Search parameters**

| Parameter | Example | Notes |
| --- | --- | --- |
| `plateNumber` (or `plate`) | `?plateNumber=AA-3-12345` | Case-insensitive exact match |
| `route` | `?route=bole` | Partial match |
| `agency` | `?agency=Anbessa City Bus` | Must match `/api/items/meta` |
| `category` | `?category=Wallet` | Must match `/api/items/meta` |
| `status` | `?status=In Storage` | Storage lifecycle |
| `search` | `?search=wallet` | Item, description, route, plate, bus code |
| `from` / `to` | `?from=2026-01-01` | Range on the date the item was found |
| `page` / `limit` | `?page=2&limit=10` | `limit` capped at 100 |

```json
{
  "items": [
    {
      "_id": "…", "itemName": "Black leather wallet", "category": "Wallet",
      "plateNumber": "AA-3-12345", "route": "Merkato – Bole",
      "foundOnBoard": "Back seat", "foundAt": "2026-11-02T…",
      "status": "In Storage", "storageOffice": "Lost Property Office, Merkato",
      "storageDeadline": "2027-01-31T…"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 6, "totalPages": 1, "hasMore": false }
}
```

### Department (requires the `x-staff-key` header)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/staff/items` | Register including private details + claim counts |
| `GET` | `/api/staff/items/:id/claims` | Claims filed for one item |
| `PATCH` | `/api/staff/claims/:id` | Review a claim (`Approved`/`Rejected`/`Collected`) |
| `POST` | `/api/items` | Publish an item (multipart, optional `image`) |
| `PUT` / `PATCH` | `/api/items/:id` | Full / partial update |
| `DELETE` | `/api/items/:id` | Delete the item, its claims and its image |

A claim moves the item to `Claim Pending`. Marking it `Collected` marks the item
`Returned`; rejecting the last pending claim puts it back `In Storage`.

**Errors** are always JSON:

```json
{ "error": "Validation failed", "fields": { "plateNumber": "Enter a valid plate number, e.g. AA-3-12345" } }
```

`400` bad id/JSON · `401` staff key missing · `404` not found · `409` claim not
allowed · `413` image too large · `415` not an image · `422` validation ·
`429` too many writes · `503` database unavailable

---

## Configuration

Copy `backend/.env.example` → `backend/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGO_URI` | *(empty)* | MongoDB connection string; empty ⇒ in-memory store |
| `STAFF_API_KEY` | *(empty)* | Department key; **required in production** |
| `RETENTION_DAYS` | `90` | How long items are held before disposal |
| `SEED_DEMO_DATA` | on in dev | Demo records for an empty database |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | *(empty)* | Set all three to use Cloudinary |
| `UPLOAD_DIR` | `backend/uploads` | Local image directory |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |

The department key is entered once in the browser and stored in
`localStorage`; it is never bundled into the JavaScript.

---

## Project layout

```
backend/
  app.js                  Express app factory (middleware, routes, static)
  server.js               Entrypoint: pick a store, connect, seed, listen
  config.js               Env parsing + defaults
  models/Item.js          Bus item schema, categories, agencies, lifecycle
  models/Claim.js         Passenger claims + reference codes
  routes/items.js         Public register, claims, department write routes
  routes/staff.js         Department workspace endpoints
  middleware/auth.js      Staff key check (timing-safe)
  middleware/validateItem Validation for items and claims
  store/                  mongoStore | memoryStore behind one interface
  upload.js               Multer + Cloudinary/local storage
  seed.js                 Realistic demo bus records
  tests/                  unit, API and Mongo integration tests
frontend/
  src/App.jsx             Passenger board: hero, search, results, modals
  src/components/         ItemCard, ItemModal, ClaimForm, TrackClaim,
                          StaffPanel, ItemForm, Filters, StatsBar
  src/api.js              Fetch client + staff key storage
  test/render.test.js     Server-render tests (no browser needed)
```

The `store/` layer is why the app runs without MongoDB: `mongoStore` and
`memoryStore` implement the same interface (including schema defaults and the
claim lifecycle), so routes never care which is active.

---

## Tests

```bash
npm test              # both apps
npm run test:api      # 83 backend tests
npm run test:web      # 16 frontend render tests
```

- `backend/tests/unit.test.js` — validation, plate/phone rules, filters, uploads, memory store
- `backend/tests/api.test.js` — full HTTP flow: staff auth, publishing, claiming, review, uploads, rate limiting
- `backend/tests/items.test.js` — the same flows against real MongoDB via `mongodb-memory-server` (auto-skips offline)
- `frontend/test/render.test.js` — renders every component and the app shell

The MongoDB suite downloads a database binary on first run. Where that is not
possible it skips itself, so `npm test` still passes; in CI it runs in full.

CI (`.github/workflows/ci.yml`) runs both suites and the frontend build on every
push and pull request.

---

## Roadmap

- [ ] SMS notification to the claimant when a claim is approved
- [ ] Per-depot accounts instead of one shared department key
- [ ] Automatic match alerts when a newly logged item fits an earlier enquiry
- [ ] Amharic and Afaan Oromoo translations
- [ ] Printable claim forms and a daily handover sheet for the office
- [ ] Report an item that has not been handed in yet (passenger-side lost report)
