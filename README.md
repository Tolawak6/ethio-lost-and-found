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

**Department side** — hidden at **`/admin`**, email + password sign-in
- Publish an item with its bus plate number, route, agency, date and photo
- Record private identifying details that are never shown publicly
- Review the claims passengers file: approve, reject or mark collected
- Closing a claim as *Collected* automatically marks the item *Returned*
- Managers create a separate account per depot and can disable accounts
- **Each depot sees only its own items** — plus rows logged before depots existed
- **Activity log** — who signed in, logged, edited, reviewed or handed back each
  item, newest first; every item row has its own **History** button

There is **no link to `/admin` anywhere on the public site** — staff reach it by
typing the URL. Access is still enforced by the API on every request, so hiding
the page is convenience, not the security boundary.

**Passenger side** (public, no account)
- Search by bus plate number, route, category or free text
- See where and when the item was found and which office holds it
- File a claim with a phone number and proof of ownership, then get a reference
  code (e.g. `EC-7Q2X9P`) to track the claim later

---

## Quick start

```bash
npm run install:all     # install backend + frontend dependencies
npm run dev
```

- Public register: <http://localhost:5173>
- Department area: <http://localhost:5173/admin>

In development a first manager account is created automatically:
**`admin@lostandfound.et` / `changeme123`**. Change it before deploying — see
[Department accounts](#department-accounts).

**It runs with zero configuration.** Without `MONGO_URI` the API uses an
in-memory store seeded with demo bus records, and uploads go to
`backend/uploads/`. Data is lost when the server stops.

> The department key is only read from the environment. If it is left empty the
> API stays open (convenient for local demos) and logs a warning in production.

### With MongoDB

```bash
cd backend
cp .env.example .env       # set MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
npm run dev
```

An empty database is seeded with demo items on first boot
(`SEED_DEMO_DATA=false` disables this).

### Production build

```bash
npm run build
NODE_ENV=production MONGO_URI=... SESSION_SECRET=... npm start
```

Express serves the built frontend from `frontend/dist` (including the `/admin`
deep link), so one process on one port serves the whole product.

### Department accounts

Accounts are individual — never a shared password — so every change can be
traced back to a depot.

1. **First account** — created on boot from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   when the database has no staff accounts. It is a **manager**.
2. **More accounts** — a manager adds them in **`/admin` → Accounts**, or from
   the command line:

   ```bash
   npm run create-staff -- --email hana@depot.et --name "Hana T." \
     --password "a-long-password" --depot Merkato
   ```

3. **Passwords** — stored as salted scrypt hashes, never in plain text.
   Everyone can change their own under **Accounts → Your password**.
4. **Disabling** — a manager can disable an account; existing sessions for it
   stop working immediately.

Sessions are signed HMAC tokens (12 h by default) held in an `httpOnly` cookie,
with the token also usable as a bearer header for scripts. In development the
signing secret is generated once and kept in `backend/.session-secret`
(gitignored), so restarting the server — or saving a file under `node --watch` —
does **not** sign you out. In production set `SESSION_SECRET` explicitly.

### Depots and the audit trail

Every item records the depot that logged it, and a non-manager account only sees
and edits its own depot's items. Items with no depot (logged before scoping
existed) stay visible to everyone, so nothing is lost when the rule is rolled
out. Managers see every depot.

The workspace records an append-only trail for:

| Action | Recorded as |
| --- | --- |
| Signing in | `session.signed_in` |
| Publishing an item | `item.created` |
| Editing an item | `item.updated` (with a field-by-field before → after) |
| Marking an item returned | `item.returned` |
| Deleting an item | `item.deleted` |
| Approving / rejecting / handing over a claim | `claim.reviewed` / `claim.collected` |
| Creating, disabling or enabling an account | `account.created` / `account.disabled` / `account.enabled` |
| Changing a password | `account.password_changed` |

Each row keeps a snapshot of the account name, email and depot at the time, so
the trail stays readable after an account is renamed or removed. A depot account
only ever reads its own depot's entries. The same log is available per item, so
one item's whole story — including the claim decisions made against it — reads as
a single list.

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

### Authentication

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{ email, password }` → session token + account |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/auth/me` | Current account (used by `/admin` on load) |
| `POST` | `/api/auth/password` | Change your own password |

Sign-in is rate limited to 10 attempts per 15 minutes per IP. A wrong password
and an unknown email return the same response.

### Department (sign-in required)

Send `Authorization: Bearer <token>`, or rely on the `staff_session` cookie.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/staff/items` | Register including private details + claim counts |
| `GET` | `/api/staff/items/:id/claims` | Claims filed for one item |
| `PATCH` | `/api/staff/claims/:id` | Review a claim (`Approved`/`Rejected`/`Collected`) |
| `GET` | `/api/staff/audit` | Department activity log, newest first (depot-scoped) |
| `GET` | `/api/staff/items/:id/audit` | One item's history, including claim decisions |
| `GET` | `/api/staff/accounts` | List accounts — **managers only** |
| `POST` | `/api/staff/accounts` | Create an account — **managers only** |
| `PATCH` | `/api/staff/accounts/:id` | Enable/disable an account — **managers only** |
| `POST` | `/api/items` | Publish an item (multipart, optional `image`) |
| `PUT` / `PATCH` | `/api/items/:id` | Full / partial update |
| `DELETE` | `/api/items/:id` | Delete the item, its claims and its image |

A claim moves the item to `Claim Pending`. Marking it `Collected` marks the item
`Returned`; rejecting the last pending claim puts it back `In Storage`.

A non-manager account is scoped to its own depot: the register, the overview
counters, the activity log and the item history all hide other depots' rows, and
editing another depot's item returns `403 This item belongs to another depot`.
Items logged before depot scoping existed (no `depot`) stay visible to everyone.

**Errors** are always JSON:

```json
{ "error": "Validation failed", "fields": { "plateNumber": "Enter a valid plate number, e.g. AA-3-12345" } }
```

`400` bad id/JSON · `401` not signed in / bad credentials · `403` not a manager ·
`404` not found · `409` claim not allowed · `413` image too large · `415` not an
image · `422` validation · `429` too many writes or sign-in attempts ·
`503` database unavailable

---

## Configuration

Copy `backend/.env.example` → `backend/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGO_URI` | *(empty)* | MongoDB connection string; empty ⇒ in-memory store |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | *(empty)* | First manager account, created when no staff exist |
| `ADMIN_NAME` / `ADMIN_DEPOT` | `Department staff` / *(empty)* | Details for that account |
| `SESSION_SECRET` | dev secret file | Signing key for session tokens — **set in production** |
| `SESSION_HOURS` | `12` | How long a sign-in lasts |
| `RETENTION_DAYS` | `90` | How long items are held before disposal |
| `SEED_DEMO_DATA` | on in dev | Demo records for an empty database |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | *(empty)* | Set all three to use Cloudinary |
| `UPLOAD_DIR` | `backend/uploads` | Local image directory |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |

Session tokens are signed with `SESSION_SECRET`. If it is not set, development
keeps a generated secret in `backend/.session-secret` so restarts no longer sign
everyone out; production warns and falls back to a per-boot secret, which is why
setting `SESSION_SECRET` there matters.

---

## Project layout

```
backend/
  app.js                  Express app factory (middleware, routes, static)
  server.js               Entrypoint: pick a store, connect, seed, listen
  config.js               Env parsing + defaults
  models/Item.js          Bus item schema, categories, agencies, lifecycle
  models/Claim.js         Passenger claims + reference codes
  models/AuditEntry.js    Append-only trail of department actions
  audit.js                Helpers for writing that trail
  routes/items.js         Public register, claims, department write routes
  routes/staff.js         Department workspace + account management
  routes/auth.js          Sign-in, sign-out, session, password change
  auth/passwords.js       scrypt hashing and constant-time verification
  auth/tokens.js          Signed session tokens (HMAC-SHA256)
  auth/bootstrap.js       Creates the first manager account
  auth/secret.js          Session secret (env, or a persisted dev secret)
  models/Staff.js         Department accounts (login happens at /admin)
  middleware/auth.js      Session check (token or cookie)
  scripts/createStaff.js  CLI: npm run create-staff
  middleware/validateItem Validation for items and claims
  store/                  mongoStore | memoryStore behind one interface
  upload.js               Multer + Cloudinary/local storage
  seed.js                 Realistic demo bus records
  tests/                  unit, API and Mongo integration tests
frontend/
  src/App.jsx             Passenger board: hero, search, results, modals
  src/AdminPage.jsx       Hidden /admin route: session gate + workspace
  src/components/         ItemCard, ItemModal, ClaimForm, TrackClaim,
                          DepartmentWorkspace, AuditTrail, AccountsPanel,
                          AdminSignIn, ItemForm, Filters, StatsBar
  src/api.js              Fetch client + session storage
  test/render.test.js     Server-render tests (no browser needed)
  test/admin.test.js      Browser-level /admin and audit tests (jsdom)
```

The `store/` layer is why the app runs without MongoDB: `mongoStore` and
`memoryStore` implement the same interface (including schema defaults and the
claim lifecycle), so routes never care which is active.

---

## Tests

```bash
npm test              # both apps
npm run test:api      # 116 backend tests
npm run test:web      # 34 frontend tests (SSR + jsdom)
```

- `backend/tests/unit.test.js` — validation, plate/phone rules, filters, uploads, memory store
- `backend/tests/auth.test.js` — hashing, tokens, sign-in, sessions, account management
- `backend/tests/api.test.js` — full HTTP flow: auth, publishing, claiming, review, uploads, rate limiting, depot scoping and the audit trail
- `backend/tests/items.test.js` — the same flows against real MongoDB via `mongodb-memory-server` (auto-skips offline)
- `frontend/test/render.test.js` — renders every component and the app shell
- `frontend/test/admin.test.js` — drives the real `/admin` UI in jsdom: session handling, the register, depot labels and the activity log

The MongoDB suite downloads a database binary on first run. Where that is not
possible it skips itself, so `npm test` still passes; in CI it runs in full.

CI (`.github/workflows/ci.yml`) runs both suites and the frontend build on every
push and pull request.

---

## Roadmap

- [ ] SMS notification to the claimant when a claim is approved
- [x] Per-depot accounts and depot scoping
- [x] Audit log of who signed in, changed or returned each item
- [ ] Automatic match alerts when a newly logged item fits an earlier enquiry
- [ ] Amharic and Afaan Oromoo translations
- [ ] Printable claim forms and a daily handover sheet for the office
- [ ] Report an item that has not been handed in yet (passenger-side lost report)
