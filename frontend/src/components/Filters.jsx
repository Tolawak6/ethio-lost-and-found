function Filters({ filters, categories, agencies, plates, onChange, onReset, total }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value, page: 1 });

  const activeCount = ['category', 'agency', 'status', 'plateNumber', 'search'].filter(
    (key) => filters[key]
  ).length;

  return (
    <section className="filters" aria-label="Search the lost property register">
      <div className="filters__search">
        <span aria-hidden="true" className="filters__icon">⌕</span>
        <input
          type="search"
          value={filters.search}
          onChange={set('search')}
          placeholder="Search by item, route or plate number…"
          aria-label="Search lost items"
        />
      </div>

      {/* Plate number is what passengers remember most, so it gets its own row. */}
      <div className="filters__row filters__row--primary">
        <label className="filters__plate">
          <span>Bus plate number</span>
          <input
            type="text"
            value={filters.plateNumber}
            onChange={set('plateNumber')}
            placeholder="AA-3-12345"
            list="plate-suggestions"
            autoComplete="off"
          />
          <datalist id="plate-suggestions">
            {plates.map((plate) => (
              <option key={plate} value={plate} />
            ))}
          </datalist>
        </label>

        <label className="filters__field">
          <span>Agency</span>
          <select value={filters.agency} onChange={set('agency')}>
            <option value="">All agencies</option>
            {agencies.map((agency) => (
              <option key={agency} value={agency}>
                {agency}
              </option>
            ))}
          </select>
        </label>

        <label className="filters__field">
          <span>Category</span>
          <select value={filters.category} onChange={set('category')}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="filters__field">
          <span>Status</span>
          <select value={filters.status} onChange={set('status')}>
            <option value="">Any status</option>
            <option value="In Storage">In storage</option>
            <option value="Claim Pending">Claim in review</option>
            <option value="Returned">Returned</option>
          </select>
        </label>

        {activeCount > 0 && (
          <button type="button" className="button button--ghost button--sm filters__clear" onClick={onReset}>
            Clear all ({activeCount})
          </button>
        )}
      </div>

      <p className="filters__count" aria-live="polite">
        {total === 1 ? '1 item in the register' : `${total} items in the register`}
      </p>
    </section>
  );
}

export default Filters;
