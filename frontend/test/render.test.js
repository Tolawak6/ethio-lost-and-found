/**
 * Render smoke tests.
 *
 * Renders the real components (and the whole App) to HTML with React's server
 * renderer. This needs no browser, so it catches import errors, JSX mistakes
 * and crashes in the default render path in CI and offline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const load = (path) => vite.ssrLoadModule(path);

const { default: ItemCard } = await load('/src/components/ItemCard.jsx');
const { default: ItemModal } = await load('/src/components/ItemModal.jsx');
const { default: ItemForm } = await load('/src/components/ItemForm.jsx');
const { default: ClaimForm } = await load('/src/components/ClaimForm.jsx');
const { default: Filters } = await load('/src/components/Filters.jsx');
const { default: StatsBar } = await load('/src/components/StatsBar.jsx');
const { default: EmptyState } = await load('/src/components/EmptyState.jsx');
const { default: TrackClaim } = await load('/src/components/TrackClaim.jsx');
const { default: App } = await load('/src/App.jsx');
const { ToastProvider } = await load('/src/context/ToastContext.jsx');
const utils = await load('/src/utils.js');

test.after(() => vite.close());

const item = {
  _id: '6aeaeec76265af388289808b',
  itemName: 'Black leather wallet',
  category: 'Wallet',
  description: 'Black wallet found on the back seat after the last trip.',
  agency: 'Anbessa City Bus',
  plateNumber: 'AA-3-12345',
  busCode: 'B-118',
  route: 'Merkato – Bole',
  foundOnBoard: 'Back seat',
  foundAt: '2026-11-02T08:37:27.310Z',
  reportedBy: 'Supervisor Tesfaye A.',
  status: 'In Storage',
  storageOffice: 'Lost Property Office, Merkato',
  storageDeadline: new Date(Date.now() + 5 * 864e5).toISOString(),
  createdAt: '2026-11-04T08:37:27.310Z',
};

const noop = () => {};
const reactRe = (s) => s.replace(/<!-- -->/g, '');

const expectHtml = (label, element, patterns) => {
  const html = reactRe(renderToString(element));
  for (const [name, pattern] of patterns) {
    assert.match(html, pattern, `${label}: ${name} missing`);
  }
  return html;
};

test('date helpers format useful values', () => {
  assert.equal(utils.formatDate('2026-11-02T08:37:27.310Z'), '02 Nov 2026');
  assert.equal(utils.formatDate(null), '—');
  assert.equal(utils.formatDate('not a date'), '—');
  assert.equal(utils.timeAgo(new Date().toISOString()), 'just now');
  assert.match(utils.timeAgo(new Date(Date.now() - 3 * 86400e3).toISOString()), /^3 days ago$/);
  assert.match(utils.timeAgo(new Date(Date.now() - 3600e3).toISOString()), /^1 hour ago$/);
});

test('daysUntil counts remaining storage days', () => {
  assert.equal(utils.daysUntil(null), null);
  assert.equal(utils.daysUntil(new Date(Date.now() + 5 * 864e5).toISOString()), 5);
  assert.ok(utils.daysUntil(new Date(Date.now() - 2 * 864e5).toISOString()) < 0);
});

test('status and claim labels are human friendly', () => {
  assert.equal(utils.statusMeta('In Storage').label, 'In storage');
  assert.equal(utils.statusMeta('Claim Pending').tone, 'pending');
  assert.equal(utils.statusMeta(undefined).label, 'Unknown');
  assert.match(utils.claimStatusMeta('Approved').label, /collect/i);
  assert.equal(utils.claimStatusMeta('Collected').tone, 'returned');
});

test('ItemCard shows the bus plate, route and storage deadline', () => {
  expectHtml('ItemCard', React.createElement(ItemCard, { item, onOpen: noop }), [
    ['plate', /AA-3-12345/],
    ['route', /Merkato – Bole/],
    ['date', /02 Nov 2026/],
    ['on board', /Back seat/],
    ['storage badge', /badge--storage/],
    ['claim button', /This is mine/],
    ['deadline warning', /more days/],
  ]);
});

test('ItemCard shows a placeholder when there is no photo', () => {
  const html = expectHtml(
    'placeholder ItemCard',
    React.createElement(ItemCard, { item: { ...item, imageUrl: '' }, onOpen: noop }),
    [['placeholder', /card__placeholder/]]
  );
  assert.doesNotMatch(html, /<img/);
});

test('ItemCard disables claiming for returned items', () => {
  expectHtml(
    'returned ItemCard',
    React.createElement(ItemCard, { item: { ...item, status: 'Returned' }, onOpen: noop }),
    [['returned badge', /badge--returned/], ['disabled button', /disabled/]]
  );
});

test('ItemModal lists where to collect the item', () => {
  expectHtml('ItemModal', React.createElement(ItemModal, { item, onClose: noop, onClaim: noop }), [
    ['title', /Black leather wallet/],
    ['plate', /AA-3-12345/],
    ['bus code', /B-118/],
    ['storage office', /Lost Property Office, Merkato/],
    ['held until', /Held until/],
    ['safety hint', /Bring an ID/],
    ['claim action', /file a claim/],
  ]);
});

test('ItemModal can open straight into the claim form', () => {
  expectHtml(
    'claim-first ItemModal',
    React.createElement(ItemModal, { item, onClose: noop, onClaim: noop, initialClaim: true }),
    [['claim intro', /Claiming: Black leather wallet/], ['proof field', /proves the item is yours/]]
  );
});

test('ItemModal never renders private identifying details', () => {
  const html = expectHtml('private ItemModal', React.createElement(ItemModal, { item, onClose: noop, onClaim: noop }), [
    ['title', /Black leather wallet/],
  ]);
  assert.doesNotMatch(html, /identifyingDetails/);
});

test('ClaimForm renders required claimant fields', () => {
  expectHtml('ClaimForm', React.createElement(ClaimForm, { item, onSubmit: noop, onCancel: noop }), [
    ['name', /Your full name/],
    ['phone', /Phone number/],
    ['proof', /proves the item is yours/],
    ['submit', /Submit claim/],
    ['advice', /Do not include passwords/],
  ]);
});

test('ItemForm renders every staff field', () => {
  expectHtml(
    'ItemForm',
    React.createElement(ItemForm, { categories: ['Wallet', 'Books'], agencies: ['Anbessa City Bus'], onSubmit: noop, onCancel: noop }),
    [
      ['category option', /<option value="Books">Books<\/option>/],
      ['agency option', /Anbessa City Bus<\/option>/],
      ['plate field', /Bus plate number \*/],
      ['private details', /Identifying details \(staff only\)/],
      ['date field', /Date found/],
      ['file input', /type="file"/],
      ['submit', /Add to register/],
    ]
  );
});

test('ItemForm prefills when editing', () => {
  expectHtml(
    'edit ItemForm',
    React.createElement(ItemForm, {
      categories: ['Wallet'],
      agencies: ['Anbessa City Bus'],
      initialItem: { ...item, identifyingDetails: 'blue ID card' },
      onSubmit: noop,
      onCancel: noop,
    }),
    [
      ['prefilled name', /value="Black leather wallet"/],
      ['prefilled plate', /value="AA-3-12345"/],
      ['private details prefilled', /blue ID card/],
      ['edit submit', /Save changes/],
    ]
  );
});

test('Filters promotes plate number search', () => {
  expectHtml(
    'Filters',
    React.createElement(Filters, {
      filters: { search: '', plateNumber: 'AA-3-12345', agency: '', category: '', status: '' },
      categories: ['Wallet'],
      agencies: ['Anbessa City Bus'],
      plates: ['AA-3-12345'],
      total: 1,
      onChange: noop,
      onReset: noop,
    }),
    [
      ['plate label', /Bus plate number/],
      ['plate value', /value="AA-3-12345"/],
      ['suggestions', /plate-suggestions/],
      ['agency filter', /All agencies/],
      ['singular count', /1 item in the register/],
      ['clear button', /Clear all \(1\)/],
    ]
  );
});

test('StatsBar and EmptyState render content', () => {
  expectHtml(
    'StatsBar',
    React.createElement(StatsBar, { stats: { total: 12, inStorage: 6, pending: 2, returned: 4 } }),
    [
      ['items waiting', /Items waiting/],
      ['reunited', /Reunited/],
      ['value', />12</],
    ]
  );

  expectHtml(
    'EmptyState',
    React.createElement(EmptyState, {
      title: 'No items match that search',
      message: 'Try a different plate number.',
      actionLabel: 'Clear filters',
      onAction: noop,
    }),
    [
      ['title', /No items match that search/],
      ['action', /Clear filters/],
    ]
  );
});

test('TrackClaim renders the lookup form', () => {
  expectHtml('TrackClaim', React.createElement(TrackClaim, { onClose: noop }), [
    ['title', /Track a claim/],
    ['reference field', /Claim reference/],
    ['example', /EC-/],
    ['submit', /Check status/],
  ]);
});

test('App renders the passenger hero, search and steps', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const html = reactRe(
      renderToString(React.createElement(ToastProvider, null, React.createElement(App)))
    );
    assert.match(html, /Left something on the bus\?/);
    assert.match(html, /Search by item, route or plate number/);
    assert.match(html, /Bus plate number/);
    assert.match(html, /Track a claim/);
    assert.match(html, /Department sign-in/);
    assert.match(html, /File a claim/);
    assert.match(html, /Merkato Terminal/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
