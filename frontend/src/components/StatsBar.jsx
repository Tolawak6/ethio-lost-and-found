function StatsBar({ stats }) {
  const cards = [
    { key: 'total', label: 'Total reports', tone: 'neutral' },
    { key: 'lost', label: 'Lost', tone: 'lost' },
    { key: 'found', label: 'Found', tone: 'found' },
    { key: 'claimed', label: 'Reunited', tone: 'claimed' },
  ];

  return (
    <section className="stats" aria-label="Community summary">
      {cards.map((card) => (
        <div key={card.key} className={`stat stat--${card.tone}`}>
          <span className="stat__value">{stats ? stats[card.key] ?? 0 : '–'}</span>
          <span className="stat__label">{card.label}</span>
        </div>
      ))}
    </section>
  );
}

export default StatsBar;
