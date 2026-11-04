import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from './api';
import { useToast } from './context/ToastContext';
import ItemCard from './components/ItemCard';
import ItemModal from './components/ItemModal';
import Filters from './components/Filters';
import StatsBar from './components/StatsBar';
import EmptyState from './components/EmptyState';
import TrackClaim from './components/TrackClaim';
import StaffPanel from './components/StaffPanel';
import { debounce } from './utils';

const DEFAULT_FILTERS = {
  search: '',
  plateNumber: '',
  agency: '',
  category: '',
  status: '',
  page: 1,
};

const FALLBACK = {
  categories: ['Electronics', 'Wallet', 'Keys', 'Documents', 'ID & Cards', 'Books', 'Clothing', 'Bags', 'Jewelry', 'Pets', 'Other'],
  agencies: ['Anbessa City Bus', 'Sheger Mass Transport', 'Addis Ababa Light Rail', 'Minibus (Blue/White)', 'Other'],
};

export default function App() {
  const toast = useToast();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(FALLBACK);
  const [plates, setPlates] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [claimIntent, setClaimIntent] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const requestId = useRef(0);

  const applySearch = useMemo(
    () => debounce((value) => setFilters((current) => ({ ...current, search: value, page: 1 })), 350),
    []
  );

  useEffect(() => {
    applySearch(searchInput);
  }, [searchInput, applySearch]);

  const refreshMeta = useCallback(() => {
    Promise.all([api.getMeta(), api.getStats(), api.getPlates()])
      .then(([metaPayload, summary, platePayload]) => {
        if (metaPayload?.categories?.length) setMeta(metaPayload);
        setStats(summary);
        setPlates(platePayload?.plates || []);
      })
      .catch(() => {
        /* the board still works with fallbacks */
      });
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const loadItems = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.listItems(filters);
      if (id !== requestId.current) return;
      setData({ items: payload.items, pagination: payload.pagination });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err);
      setData({ items: [], pagination: null });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const refreshAll = useCallback(() => {
    loadItems();
    refreshMeta();
  }, [loadItems, refreshMeta]);

  const openItem = (item, options = {}) => {
    setActiveItem(item);
    setClaimIntent(Boolean(options.claim));
  };

  const handleClaim = async (item, claim) => {
    setClaiming(true);
    try {
      const result = await api.fileClaim(item._id, claim);
      refreshAll();
      return result;
    } catch (err) {
      if (err.status === 409) toast.error(err.message);
      else if (err.fields && Object.keys(err.fields).length) toast.error(Object.values(err.fields)[0]);
      else toast.error(err.message || 'Could not submit the claim');
      return null;
    } finally {
      setClaiming(false);
    }
  };

  const hasFilters = ['search', 'plateNumber', 'agency', 'category', 'status'].some((key) => filters[key]);
  const { items, pagination } = data;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__inner">
          <div className="hero__bar">
            <div className="brand">
              <span className="brand__mark" aria-hidden="true">⌖</span>
              <div>
                <p className="brand__name">Ethio Lost &amp; Found</p>
                <p className="brand__tag">Addis Ababa bus lost property</p>
              </div>
            </div>
            <div className="hero__links">
              <button type="button" className="link-button link-button--light" onClick={() => setTrackingOpen(true)}>
                Track a claim
              </button>
              <button type="button" className="link-button link-button--light" onClick={() => setStaffOpen(true)}>
                Department sign-in
              </button>
            </div>
          </div>

          <div className="hero__copy">
            <h1>Left something on the bus?</h1>
            <p>
              Bus supervisors hand lost items to the lost property office. Search the register below
              by bus plate number, route or item — then file a claim online and collect it in person.
            </p>
            <div className="hero__actions">
              <a className="button button--primary" href="#board">
                Search the register
              </a>
              <button type="button" className="button button--ghost" onClick={() => setTrackingOpen(true)}>
                Track my claim
              </button>
            </div>
          </div>

          <StatsBar stats={stats} />
        </div>
      </header>

      <main className="main" id="board">
        <div className="main__toolbar">
          <Filters
            filters={{ ...filters, search: searchInput }}
            categories={meta.categories}
            agencies={meta.agencies}
            plates={plates}
            total={pagination?.total ?? items.length}
            onChange={(next) => {
              setFilters(next);
              setSearchInput(next.search);
            }}
            onReset={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchInput('');
            }}
          />
        </div>

        <div className="how-it-works">
          <div>
            <span className="how-it-works__step">1</span>
            <p><strong>Search</strong> by plate, route or item</p>
          </div>
          <div>
            <span className="how-it-works__step">2</span>
            <p><strong>File a claim</strong> with proof it is yours</p>
          </div>
          <div>
            <span className="how-it-works__step">3</span>
            <p><strong>Collect</strong> it at the office with your ID</p>
          </div>
        </div>

        {error && (
          <div className="notice notice--error">
            <div>
              <strong>Could not load the register.</strong>
              <p>
                {error.status === 503 || error.message?.includes('fetch')
                  ? 'The service is unavailable right now. Please try again in a moment.'
                  : error.message}
              </p>
            </div>
            <button type="button" className="button button--ghost button--sm" onClick={loadItems}>
              Retry
            </button>
          </div>
        )}

        {loading && !items.length && (
          <div className="grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="skeleton" />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title={hasFilters ? 'No items match that search' : 'The register is empty'}
            message={
              hasFilters
                ? 'Try a different plate number or check the spelling. Items are usually logged within 24 hours of being handed in.'
                : 'Items handed in by bus supervisors will appear here.'
            }
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchInput('');
            }}
          />
        )}

        {items.length > 0 && (
          <div className="grid">
            {items.map((item) => (
              <ItemCard key={item._id} item={item} onOpen={openItem} />
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav className="pager" aria-label="Pagination">
            <button
              type="button"
              className="button button--ghost button--sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              ← Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              className="button button--ghost button--sm"
              disabled={!pagination.hasMore || loading}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next →
            </button>
          </nav>
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div>
            <p className="footer__title">Ethio Lost &amp; Found</p>
            <p className="footer__hint">
              Items are held for 90 days at the depot office, then disposed of according to
              department policy.
            </p>
          </div>
          <div className="footer__contact">
            <p><strong>Lost Property Office</strong></p>
            <p>Merkato Terminal, Addis Ababa</p>
            <p>Mon–Sat, 8:30 – 17:30</p>
          </div>
        </div>
      </footer>

      {activeItem && (
        <ItemModal
          item={activeItem}
          initialClaim={claimIntent}
          submitting={claiming}
          onClose={() => {
            setActiveItem(null);
            setClaimIntent(false);
          }}
          onClaim={handleClaim}
        />
      )}

      {trackingOpen && <TrackClaim onClose={() => setTrackingOpen(false)} />}

      {staffOpen && (
        <StaffPanel
          categories={meta.categories}
          agencies={meta.agencies}
          onClose={() => setStaffOpen(false)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
