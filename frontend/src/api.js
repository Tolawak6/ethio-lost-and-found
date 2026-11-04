/**
 * Thin API client.
 *
 * Requests use relative URLs so the same build works behind the Vite dev proxy,
 * in production behind Express, or on any reverse proxy.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const api = {
  listItems: (params) => fetch(`/api/items${buildQuery(params)}`).then(parse),

  getItem: (id) => fetch(`/api/items/${id}`).then(parse),

  getMeta: () => fetch('/api/items/meta').then(parse),

  getStats: () => fetch('/api/items/stats').then(parse),

  createItem: (formData) =>
    fetch('/api/items', { method: 'POST', body: formData }).then(parse),

  updateItem: (id, formData) =>
    fetch(`/api/items/${id}`, { method: 'PUT', body: formData }).then(parse),

  setStatus: (id, status) =>
    fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ status }),
    }).then(parse),

  deleteItem: (id) => fetch(`/api/items/${id}`, { method: 'DELETE' }).then(parse),
};
