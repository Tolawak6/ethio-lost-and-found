function Filters({ filters, categories, onChange, onReset, total }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

  const activeCount = ['type', 'category', 'status', 'location', 'search'].filter(
    (key) => filters[key]
  ).length;

  return (
    <section className="filters" aria-label="Search and filter reports">
      <div className="filters__search">
        <span aria-hidden="true" className="filters__icon">⌕</span>
        <input
          type="search"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search by name, description or place…"
          aria-label="Search reports"
        />
      </div>

      <div className="filters__row">
        <div className="chips" role="group" aria-label="Type">
          {[
            { value: '', label: 'All' },
            { value: 'Lost', label: 'Lost' },
            { value: 'Found', label: 'Found' },
          ].map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              className={`chip${filters.type === option.value ? ' is-active' : ''}`}
              onClick={() => onChange({ ...filters, type: option.value, page: 1 })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select value={filters.category} onChange={set('category')} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          <option value="Unclaimed">Open</option>
          <option value="Claimed">Claimed</option>
        </select>

        <input
          type="text"
          value={filters.location}
          onChange={set('location')}
          placeholder="Location"
          aria-label="Filter by location"
        />

        {activeCount > 0 && (
          <button type="button" className="button button--ghost button--sm" onClick={onReset}>
            Clear ({activeCount})
          </button>
        )}
      </div>

      <p className="filters__count" aria-live="polite">
        {total === 1 ? '1 report' : `${total} reports`}
      </p>
    </section>
  );
}

export default Filters;
