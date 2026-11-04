/**
 * Render smoke tests.
 *
 * Renders the real components (and the whole App) to HTML with React's server
 * renderer. This needs no browser, so it catches import errors, JSX mistakes
 * and crashes in the default render path in CI and offline.
 *
 * Run with: npm test
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
const { default: Filters } = await load('/src/components/Filters.jsx');
const { default: StatsBar } = await load('/src/components/StatsBar.jsx');
const { default: EmptyState } = await load('/src/components/EmptyState.jsx');
const { default: App } = await load('/src/App.jsx');
const { ToastProvider } = await load('/src/context/ToastContext.jsx');
const utils = await load('/src/utils.js');

test.after(() => vite.close());

const item = {
  _id: '6aeaeec76265af388289808b',
  type: 'Found',
  itemName: 'Black leather wallet',
  description: 'Standard black wallet with cards.',
  category: 'Wallet',
  location: 'Merkato, Addis Ababa',
  date: '2026-11-02T08:37:27.310Z',
  status: 'Unclaimed',
  createdAt: '2026-11-04T08:37:27.310Z',
  contactName: 'Selam',
  contactPhone: '+251 91 234 5678',
};

const noop = () => {};

const expectHtml = (label, element, patterns) => {
  const html = renderToString(element);
  for (const [name, pattern] of patterns) {
    assert.match(html, pattern, `${label}: ${name} missing`);
  }
  return html;
};

test('formatDate and timeAgo format useful values', () => {
  assert.equal(utils.formatDate('2026-11-02T08:37:27.310Z'), '02 Nov 2026');
  assert.equal(utils.formatDate(null), '—');
  assert.equal(utils.formatDate('not a date'), '—');
  assert.equal(utils.timeAgo(new Date().toISOString()), 'just now');
  assert.match(utils.timeAgo(new Date(Date.now() - 3 * 86400e3).toISOString()), /^3 days ago$/);
  assert.match(utils.timeAgo(new Date(Date.now() - 3600e3).toISOString()), /^1 hour ago$/);
});

test('imageSrc passes through absolute and prefixed URLs', () => {
  assert.equal(utils.imageSrc('/uploads/a.png'), '/uploads/a.png');
  assert.equal(utils.imageSrc('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  assert.equal(utils.imageSrc('uploads/a.png'), '/uploads/a.png');
  assert.equal(utils.imageSrc(''), '');
});

test('ItemCard shows status, location and formatted date', () => {
  expectHtml('ItemCard', React.createElement(ItemCard, { item, onOpen: noop, onToggleStatus: noop }), [
    ['title', /Black leather wallet/],
    ['found badge', /badge--found/],
    ['open badge', /badge--open/],
    ['location', /Merkato, Addis Ababa/],
    ['date', /02 Nov 2026/],
    ['mark claimed action', /Mark claimed/],
  ]);
});

test('ItemCard renders claimed styling and a reopen action', () => {
  expectHtml(
    'claimed ItemCard',
    React.createElement(ItemCard, { item: { ...item, status: 'Claimed' }, onOpen: noop, onToggleStatus: noop }),
    [
      ['claimed badge', /badge--claimed/],
      ['reopen action', /Reopen/],
    ]
  );
});

test('ItemCard falls back to a placeholder when there is no image', () => {
  const html = expectHtml(
    'placeholder ItemCard',
    React.createElement(ItemCard, { item: { ...item, imageUrl: '' }, onOpen: noop, onToggleStatus: noop }),
    [['placeholder', /card__placeholder/]]
  );
  assert.doesNotMatch(html, /<img/);
});

test('ItemModal renders contacts, reference and safety hint', () => {
  expectHtml('ItemModal', React.createElement(ItemModal, { item, onClose: noop, onToggleStatus: noop, onDelete: noop }), [
    ['title', /Black leather wallet/],
    ['phone link', /href="tel:\+251 91 234 5678"/],
    ['reference', /#(<!-- -->)?89808B/],
    ['safety hint', /details that are not shown here/],
    ['claim action', /Mark as claimed/],
  ]);
});

test('ItemForm renders every required field', () => {
  expectHtml('ItemForm', React.createElement(ItemForm, { categories: ['Wallet', 'Books'], onSubmit: noop, onCancel: noop }), [
    ['type toggle', /I lost something/],
    ['category option', /<option value="Books">Books<\/option>/],
    ['private proof field', /Proof details \(kept private\)/],
    ['file input', /type="file"/],
    ['submit', /Publish report/],
  ]);
});

test('ItemForm switches to edit mode wording', () => {
  expectHtml(
    'edit ItemForm',
    React.createElement(ItemForm, {
      categories: ['Wallet'],
      initialItem: { ...item, date: '2026-11-02T00:00:00.000Z' },
      onSubmit: noop,
      onCancel: noop,
    }),
    [
      ['prefilled name', /value="Black leather wallet"/],
      ['edit submit', /Save changes/],
    ]
  );
});

test('Filters marks the active chip and pluralises the count', () => {
  expectHtml(
    'Filters',
    React.createElement(Filters, {
      filters: { search: '', type: 'Lost', category: '', status: '', location: '' },
      categories: ['Wallet'],
      total: 1,
      onChange: noop,
      onReset: noop,
    }),
    [
      ['active chip', /chip is-active/],
      ['singular count', /1 report</],
    ]
  );
});

test('StatsBar and EmptyState render content', () => {
  expectHtml(
    'StatsBar',
    React.createElement(StatsBar, { stats: { total: 6, lost: 2, found: 4, claimed: 1 } }),
    [
      ['total', />6</],
      ['reunited label', /Reunited/],
    ]
  );

  expectHtml(
    'EmptyState',
    React.createElement(EmptyState, {
      title: 'Nothing on the board yet',
      message: 'Be the first to post.',
      actionLabel: 'Report an item',
      onAction: noop,
    }),
    [
      ['title', /Nothing on the board yet/],
      ['action', />Report an item</],
    ]
  );
});

test('App renders the hero, search and stats shell', () => {
  // Components fetch in effects; SSR only needs the shell to render.
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const html = renderToString(
    React.createElement(ToastProvider, null, React.createElement(App))
  );
  assert.match(html, /Lost something\? Found something\?/);
  assert.match(html, /Search by name, description or place/);
  assert.match(html, /Total reports/);
  assert.match(html, /Safety tip/);
});
