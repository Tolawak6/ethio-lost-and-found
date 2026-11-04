function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="empty">
      <div className="empty__glyph" aria-hidden="true">🔎</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && (
        <button type="button" className="button button--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
