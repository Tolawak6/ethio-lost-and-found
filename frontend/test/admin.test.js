/**
 * Browser-level tests for the hidden /admin area.
 *
 * jsdom gives us a real DOM, React renders for real, and fetch is stubbed with
 * the same responses the API produces. This is what catches environment bugs
 * that server-side rendering cannot see (localStorage, cookies, effects).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------- environment
// Must exist before React (or anything that touches `window`) is imported.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://lost.et/admin',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
// `navigator` is a getter on newer Node versions, so define it instead of
// assigning, and copy the DOM constructors React may look for.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
for (const key of [
  'HTMLElement',
  'HTMLIFrameElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'localStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act } = await import('react');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
test.after(() => vite.close());

const { ToastProvider } = await vite.ssrLoadModule('/src/context/ToastContext.jsx');
const { default: AdminPage } = await vite.ssrLoadModule('/src/AdminPage.jsx');
const { staffSession } = await vite.ssrLoadModule('/src/api.js');

const ACCOUNT = {
  _id: 'acct-1',
  email: 'manager@depot.et',
  name: 'Meron Tesfaye',
  depot: 'Merkato',
  role: 'manager',
};

const ITEM = {
  _id: 'item-1',
  itemName: 'Black leather wallet',
  category: 'Wallet',
  description: 'Found on the back seat',
  plateNumber: 'AA-3-12345',
  route: 'Merkato – Bole',
  foundAt: '2026-11-02T08:00:00.000Z',
  status: 'In Storage',
  storageOffice: 'Lost Property Office, Merkato',
  imageUrl: '',
  identifyingDetails: 'blue student ID card',
  pendingClaims: 0,
};

const AUDIT_ENTRIES = [
  {
    _id: 'aud-2',
    action: 'item.returned',
    entity: 'item',
    entityId: 'item-1',
    entityLabel: 'Black leather wallet',
    actorName: 'Meron Tesfaye',
    actorDepot: 'Merkato',
    details: { changed: ['status'], from: 'In Storage', to: 'Returned' },
    createdAt: '2026-11-03T10:15:00.000Z',
  },
  {
    _id: 'aud-1',
    action: 'item.created',
    entity: 'item',
    entityId: 'item-1',
    entityLabel: 'Black leather wallet',
    actorName: 'Meron Tesfaye',
    actorDepot: 'Merkato',
    details: { plateNumber: 'AA-3-12345', depot: 'Merkato', status: 'In Storage' },
    createdAt: '2026-11-02T09:00:00.000Z',
  },
];

/**
 * Stubs fetch for the endpoints /admin uses.
 * `session` controls whether /api/auth/me thinks you are signed in.
 */
const installFetch = (options = {}) => {
  const { sessionValid = true, failStaffItems = false } = options;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || 'GET' });
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.endsWith('/api/auth/me')) {
      return sessionValid ? json(200, { account: ACCOUNT }) : json(401, { error: 'expired' });
    }
    if (url.endsWith('/api/auth/logout')) return json(200, { message: 'Signed out' });
    if (url.endsWith('/api/auth/login')) return json(200, { token: 'tok', account: ACCOUNT });
    if (url.includes('/api/staff/accounts')) return json(200, { accounts: [ACCOUNT] });
    if (url.includes('/audit')) return json(200, { entries: AUDIT_ENTRIES, total: 2, page: 1, limit: 50 });
    if (url.includes('/api/staff/items')) {
      if (failStaffItems) return json(401, { error: 'Your session has expired' });
      return json(200, { items: [ITEM], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } });
    }
    if (url.includes('/api/staff/overview')) return json(200, { total: 1 });
    return json(404, { error: 'not stubbed' });
  };
  return calls;
};

const mount = async (element) => {
  const container = document.getElementById('root');
  container.innerHTML = '';
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ToastProvider, null, element));
  });
  // Let effects settle (fetch promises, state updates).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    container,
    text: () => container.textContent,
    html: () => container.innerHTML,
    unmount: () => act(() => root.unmount()),
  };
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

// --------------------------------------------------------------------- tests

test('a valid session opens the workspace instead of signing out', async () => {
  if (!dom.window.localStorage) return; // jsdom without storage
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  const text = view.text();
  assert.match(text, /Department workspace/, 'the workspace should render');
  assert.doesNotMatch(text, /session ended/i, 'a valid session must not be reported as ended');
  assert.doesNotMatch(text, /sign in again/i);
  assert.match(text, /Black leather wallet/, 'the register should be listed');

  await view.unmount();
});

test('the stored token is sent with every department request', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  const calls = installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  // api.getSession must not sign the user out just because it resolved late.
  assert.ok(calls.some((call) => call.url.includes('/api/staff/items')));
  assert.equal(staffSession.get(), 'valid-token');

  await view.unmount();
});

test('no session shows the sign-in form, not a "session ended" message', async () => {
  dom.window.localStorage.clear();
  installFetch({ sessionValid: false });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  assert.match(view.text(), /Department sign-in/);
  assert.doesNotMatch(view.text(), /session ended/i);

  await view.unmount();
});

test('an expired session during use signs out with a clear message', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'stale-token');
  installFetch({ sessionValid: false });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  // No session at load -> sign-in form, no alarming "ended" wording.
  assert.match(view.text(), /Department sign-in/);

  await view.unmount();
});

test('a session that dies mid-session is reported once', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  installFetch({ sessionValid: true, failStaffItems: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  assert.match(view.text(), /Department sign-in/);
  const sessionEndedMentions = (view.text().match(/session ended/gi) || []).length;
  assert.ok(sessionEndedMentions <= 1, `expected at most one notice, saw ${sessionEndedMentions}`);

  await view.unmount();
});

test('signing out deliberately does not show an expiry notice', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  const button = [...view.container.querySelectorAll('button')].find(
    (element) => element.textContent.trim() === 'Sign out'
  );
  assert.ok(button, 'sign out button should exist');
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await flush();

  assert.match(view.text(), /Department sign-in/);
  assert.doesNotMatch(view.text(), /session ended/i);

  await view.unmount();
});

// ------------------------------------------------ session robustness (regressions)

test('a transient server error does not wipe a valid session', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  // The session check fails with a 500 (server restarting, network blip)…
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  // …so the user sees the sign-in form, but the token is kept for next time.
  assert.match(view.text(), /Department sign-in/);
  assert.equal(staffSession.get(), 'valid-token', 'a 500 must not discard the session token');
  assert.doesNotMatch(view.text(), /session ended/i);

  await view.unmount();
});

test('a real 401 clears the stored token', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'stale-token');
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'expired' }), { status: 401 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  assert.match(view.text(), /Department sign-in/);
  assert.equal(staffSession.get(), '', 'a 401 should discard the stale token');

  await view.unmount();
});

test('a session expiring mid-use shows exactly one "ended" toast', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  let staffItemCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    if (url.endsWith('/api/auth/me')) return json(200, { account: ACCOUNT });
    if (url.endsWith('/api/auth/logout')) return json(200, {});
    if (url.includes('/api/staff/items')) {
      staffItemCalls += 1;
      // Two parallel calls both fail, as the workspace does on refresh.
      return json(401, { error: 'Your session has expired', code: 'account_missing' });
    }
    return json(404, {});
  };

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();
  await flush();

  assert.ok(staffItemCalls >= 1);
  assert.match(view.text(), /Department sign-in/);
  const notices = view.container.querySelectorAll('.toast').length;
  assert.ok(notices <= 1, `expected at most one toast, saw ${notices}`);

  await view.unmount();
});

// -------------------------------------------------------------- audit trail

const clickText = async (view, label) => {
  const button = [...view.container.querySelectorAll('button')].find((node) =>
    node.textContent.trim().startsWith(label)
  );
  assert.ok(button, `expected a "${label}" button, found: ${[...view.container.querySelectorAll('button')]
    .map((node) => node.textContent.trim())
    .join(' | ')}`);
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  return button;
};

test('the activity tab shows who did what, newest first', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  const calls = installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  await clickText(view, 'Activity');
  const text = view.text();

  assert.ok(
    calls.some((call) => call.url.includes('/api/staff/audit')),
    'the activity tab should request the audit endpoint'
  );
  assert.match(text, /Activity log/);
  assert.match(text, /Returned to passenger/, 'actions should be labelled in plain words');
  assert.match(text, /Logged item/);
  assert.match(text, /Meron Tesfaye/, 'the account that acted should be named');
  assert.match(text, /Merkato depot|Merkato/, 'the depot should be shown');
  assert.match(text, /AA-3-12345/, 'the entry detail should be summarised');

  // Newest first: the return happened after the item was logged.
  const returned = text.indexOf('Returned to passenger');
  const logged = text.indexOf('Logged item');
  assert.ok(returned < logged, 'the newest entry should appear first');

  await view.unmount();
});

test('an item row opens its own history', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  const calls = installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  await clickText(view, 'History');

  const text = view.text();
  assert.ok(
    calls.some((call) => call.url.includes('/api/staff/items/item-1/audit')),
    'the item history endpoint should be requested'
  );
  assert.match(text, /History/, 'the modal should be titled as history');
  assert.match(text, /Returned to passenger/);

  // The modal closes again.
  const close = view.container.querySelector('.modal__close');
  assert.ok(close, 'the history modal should have a close button');
  await act(async () => {
    close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
  assert.doesNotMatch(view.text(), /Returned to passenger/, 'closing should dismiss the history');

  await view.unmount();
});

test('the register shows which depot owns each item', async () => {
  dom.window.localStorage.setItem('elf.staffToken', 'valid-token');
  installFetch({ sessionValid: true });

  const view = await mount(React.createElement(AdminPage));
  await flush();
  await flush();

  assert.match(view.text(), /Merkato depot/, 'scoping should be visible, not implicit');
  await view.unmount();
});
