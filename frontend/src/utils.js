/** Formats an ISO date as "12 Mar 2025". */
export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** "3 days ago", "just now", ... */
export const timeAgo = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [
    ['minute', 60],
    ['hour', 60],
    ['day', 24],
    ['week', 7],
    ['month', 4.345],
    ['year', 12],
  ];
  let amount = seconds / 60;
  let label = 'minute';
  for (let i = 0; i < units.length; i += 1) {
    const [name, factor] = units[i];
    label = name;
    if (i === units.length - 1 || amount < units[i + 1][1]) break;
    amount /= units[i + 1][1];
  }
  const rounded = Math.max(1, Math.round(amount));
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
};

/** Resolves an image URL against the API host and adds a safe fallback. */
export const imageSrc = (url) => {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) return url;
  return `/${url}`;
};

export const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
