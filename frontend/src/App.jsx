import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from './api';
import { useToast } from './context/ToastContext';
import ItemCard from './components/ItemCard';
import ItemModal from './components/ItemModal';
import ItemForm from './components/ItemForm';
import Filters from './components/Filters';
import StatsBar from './components/StatsBar';
import EmptyState from './components/EmptyState';
import { debounce } from './utils';

const DEFAULT_FILTERS = {
  search: '',
  type: '',
  category: '',
  status: '',
  location: '',
  page: 1,
};

const DEFAULT_CATEGORIES = ['Electronics', 'Wallet', 'Keys', 'Documents', 'ID & Cards', 'Books', 'Clothing', 'Bags', 'Jewelry', 'Pets', 'Other'];

export default function App() {
  const toast = useToast();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [activeItem, setActiveItem] = useState(null);
  const [editing, setEditing] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(0);

  // Debounce text search so typing does not hammer the API.
  const applySearch = useMemo(
    () => debounce((value) => setFilters((current) => ({ ...current, search: value, page: 1 })), 350),
    []
  );

  useEffect(() => {
    applySearch(searchInput);
  }, [searchInput, applySearch]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getMeta(), api.getStats()])
      .then(([meta, summary]) => {
        if (cancelled) return;
        if (Array.isArray(meta?.categories) && meta.categories.length) setCategories(meta.categories);
        setStats(summary);
      })
      .catch(() => {
        /* non fatal: the board still works with defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const refreshStats = useCallback(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  const afterMutation = useCallback(
    (message) => {
      toast.success(message);
      loadItems();
      refreshStats();
    },
    [loadItems, refreshStats, toast]
  );

  const handleCreate = async (formData) => {
    setSubmitting(true);
    try {
      await api.createItem(formData);
      setComposerOpen(false);
      setFilters(DEFAULT_FILTERS);
      setSearchInput('');
      afterMutation('Report published — thank you!');
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) {
        toast.error(Object.values(err.fields)[0]);
      } else {
        toast.error(err.message || 'Could not publish the report');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (formData) => {
    setSubmitting(true);
    try {
      const updated = await api.updateItem(editing._id, formData);
      setEditing(null);
      setActiveItem(updated);
      afterMutation('Report updated');
    } catch (err) {
      toast.error(err.message || 'Could not update the report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item) => {
    const nextStatus = item.status === 'Claimed' ? 'Unclaimed' : 'Claimed';
    try {
      const updated = await api.setStatus(item._id, nextStatus);
      setActiveItem((current) => (current && current._id === updated._id ? updated : current));
      afterMutation(nextStatus === 'Claimed' ? 'Marked as claimed 🎉' : 'Report reopened');
    } catch (err) {
      toast.error(err.message || 'Could not change the status');
    }
  };

  const handleDelete = async (item) => {
    try {
      await api.deleteItem(item._id);
      setActiveItem(null);
      afterMutation('Report deleted');
    } catch (err) {
      toast.error(err.message || 'Could not delete the report');
    }
  };

  const { items, pagination } = data;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">⌖</span>
            <div>
              <p className="brand__name">Ethio Lost &amp; Found</p>
              <p className="brand__tag">Reuniting people with what matters</p>
            </div>
          </div>

          <div className="hero__copy">
            <h1>Lost something? Found something?</h1>
            <p>
              A free community board for Addis Ababa and beyond. Post what you lost or found,
              search what others have reported, and arrange a safe handover.
            </p>
            <div className="hero__actions">
              <button type="button" className="button button--primary" onClick={() => setComposerOpen(true)}>
                + Report an item
              </button>
              <a className="button button--ghost" href="#board">
                Browse reports
              </a>
            </div>
          </div>

          <StatsBar stats={stats} />
        </div>
      </header>

      <main className="main" id="board">
        <div className="main__toolbar">
          <Filters
            filters={{ ...filters, search: searchInput }}
            categories={categories}
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

        {error && (
          <div className="notice notice--error">
            <div>
              <strong>Could not load reports.</strong>
              <p>
                {error.status === 503 || error.message?.includes('fetch')
                  ? 'The API or database is unavailable. Start MongoDB and the backend, then retry.'
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
            title={filters.search || filters.category || filters.type ? 'No matching reports' : 'Nothing on the board yet'}
            message={
              filters.search || filters.category || filters.type
                ? 'Try a different search, or clear the filters to see everything.'
                : 'Be the first to post a lost or found item in your area.'
            }
            actionLabel={filters.search || filters.category || filters.type ? 'Clear filters' : 'Report an item'}
            onAction={() => {
              if (filters.search || filters.category || filters.type) {
                setFilters(DEFAULT_FILTERS);
                setSearchInput('');
              } else {
                setComposerOpen(true);
              }
            }}
          />
        )}

        {items.length > 0 && (
          <div className="grid">
            {items.map((item) => (
              <ItemCard key={item._id} item={item} onOpen={setActiveItem} onToggleStatus={handleToggleStatus} />
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
        <p>Ethio Lost &amp; Found · built for the community</p>
        <p className="footer__hint">
          Safety tip: meet in a public place and verify ownership with details that are not listed publicly.
        </p>
      </footer>

      {activeItem && !editing && (
        <ItemModal
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDelete}
          onEdit={(item) => {
            setActiveItem(null);
            setEditing(item);
          }}
        />
      )}

      {(composerOpen || editing) && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit report' : 'New report'}>
          <div className="modal__panel modal__panel--form">
            <button
              type="button"
              className="modal__close"
              onClick={() => {
                setComposerOpen(false);
                setEditing(null);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="modal__title">{editing ? 'Edit report' : 'Report a lost or found item'}</h2>
            <ItemForm
              categories={categories}
              initialItem={editing}
              submitting={submitting}
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={() => {
                setComposerOpen(false);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
