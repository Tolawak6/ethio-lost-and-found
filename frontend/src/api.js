/**
 * Thin API client.
 *
 * Requests use relative URLs so the same build works behind the Vite dev proxy,
 * in production behind Express, or on any reverse proxy.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const STAFF_TOKEN_STORAGE = 'elf.staffToken';

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

/**
 * Session token storage. The server also sets an httpOnly cookie, so the app
 * works even when localStorage is unavailable; the token is kept so API calls
 * can carry it explicitly as well.
 */
export const staffSession = {
  get: () => {
    try {
      return window.localStorage.getItem(STAFF_TOKEN_STORAGE) || '';
    } catch {
      return '';
    }
  },
  set: (value) => {
    try {
      if (value) window.localStorage.setItem(STAFF_TOKEN_STORAGE, value);
      else window.localStorage.removeItem(STAFF_TOKEN_STORAGE);
    } catch {
      /* storage may be blocked */
    }
  },
  clear: () => staffSession.set(''),
};

const staffHeaders = (extra = {}) => {
  const token = staffSession.get();
  return token ? { ...extra, authorization: `Bearer ${token}` } : extra;
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

  // --- authentication -----------------------------------------------------
  signIn: async (credentials) => {
    const payload = await fetch('/api/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify(credentials),
    }).then(parse);
    if (payload?.token) staffSession.set(payload.token);
    return payload;
  },

  signOut: async () => {
    staffSession.clear();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* signing out locally is enough */
    }
  },

  /** Resolves the current account, or null when there is no session. */
  getSession: async () => {
    try {
      const payload = await fetch('/api/auth/me', {
        headers: staffHeaders(),
        credentials: 'same-origin',
      }).then(parse);
      return payload?.account || null;
    } catch (err) {
      if (err.status === 401) {
        staffSession.clear();
        return null;
      }
      throw err;
    }
  },

  changePassword: (currentPassword, newPassword) =>
    fetch('/api/auth/password', {
      method: 'POST',
      headers: staffHeaders(JSON_HEADERS),
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(parse),

  staffAccounts: () => fetch('/api/staff/accounts', { headers: staffHeaders() }).then(parse),

  createStaffAccount: (account) =>
    fetch('/api/staff/accounts', {
      method: 'POST',
      headers: staffHeaders(JSON_HEADERS),
      body: JSON.stringify(account),
    }).then(parse),

  setStaffActive: (id, active) =>
    fetch(`/api/staff/accounts/${id}`, {
      method: 'PATCH',
      headers: staffHeaders(JSON_HEADERS),
      body: JSON.stringify({ active }),
    }).then(parse),
};
