/**
 * Thin API client.
 *
 * Requests use relative URLs so the same build works behind the Vite dev proxy,
 * in production behind Express, or on any reverse proxy.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const STAFF_KEY_STORAGE = 'elf.staffKey';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields || {};
  }
}

const parse = async (response) => {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.fields);
  }
  return payload;
};

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

/** The department key is kept in the browser only, never in the bundle. */
export const staffKey = {
  get: () => {
    try {
      return window.localStorage.getItem(STAFF_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  },
  set: (value) => {
    try {
      if (value) window.localStorage.setItem(STAFF_KEY_STORAGE, value);
      else window.localStorage.removeItem(STAFF_KEY_STORAGE);
    } catch {
      /* storage may be blocked */
    }
  },
  clear: () => staffKey.set(''),
};

/** Sends the staff key only when one is stored. */
const staffHeaders = (extra = {}) => {
  const key = staffKey.get();
  return key ? { ...extra, 'x-staff-key': key } : extra;
};

export const api = {
  // --- public -------------------------------------------------------------
  listItems: (params) => fetch(`/api/items${buildQuery(params)}`).then(parse),

  getItem: (id) => fetch(`/api/items/${id}`).then(parse),

  getMeta: () => fetch('/api/items/meta').then(parse),

  getStats: () => fetch('/api/items/stats').then(parse),

  getPlates: () => fetch('/api/items/plates').then(parse),

  fileClaim: (itemId, claim) =>
    fetch(`/api/items/${itemId}/claims`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(claim),
    }).then(parse),

  getClaimStatus: (reference) =>
    fetch(`/api/items/claims/${encodeURIComponent(reference.toUpperCase())}`).then(parse),

  // --- department ---------------------------------------------------------
  staffItems: (params) =>
    fetch(`/api/staff/items${buildQuery(params)}`, { headers: staffHeaders() }).then(parse),

  staffOverview: () => fetch('/api/staff/overview', { headers: staffHeaders() }).then(parse),

  staffItemClaims: (itemId) =>
    fetch(`/api/staff/items/${itemId}/claims`, { headers: staffHeaders() }).then(parse),

  createItem: (formData) =>
    fetch('/api/items', { method: 'POST', headers: staffHeaders(), body: formData }).then(parse),

  updateItem: (id, formData) =>
    fetch(`/api/items/${id}`, { method: 'PUT', headers: staffHeaders(), body: formData }).then(parse),

  setStatus: (id, status) =>
    fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: staffHeaders(JSON_HEADERS),
      body: JSON.stringify({ status }),
    }).then(parse),

  deleteItem: (id) =>
    fetch(`/api/items/${id}`, { method: 'DELETE', headers: staffHeaders() }).then(parse),

  reviewClaim: (claimId, status, reviewNote) =>
    fetch(`/api/staff/claims/${claimId}`, {
      method: 'PATCH',
      headers: staffHeaders(JSON_HEADERS),
      body: JSON.stringify({ status, reviewNote }),
    }).then(parse),

  /** Verifies a stored staff key against a protected endpoint. */
  checkStaffKey: async () => {
    const res = await fetch('/api/staff/overview', { headers: staffHeaders() });
    return res.ok;
  },
};
