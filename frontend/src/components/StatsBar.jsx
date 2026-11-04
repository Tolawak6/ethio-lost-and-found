function StatsBar({ stats }) {
  const cards = [
    { key: 'inStorage', label: 'Items waiting', tone: 'storage' },
    { key: 'pending', label: 'Claims in review', tone: 'pending' },
    { key: 'returned', label: 'Reunited', tone: 'returned' },
    { key: 'total', label: 'Total logged', tone: 'neutral' },
  ];

  return (
    <section className="stats" aria-label="Lost property summary">
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
