/** Formats an ISO date as "12 Mar 2025". */
export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Formats a date and time, e.g. "12 Mar 2025, 14:05". */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(value)}, ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

/** "3 days ago", "just now", … */
export const timeAgo = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(seconds / 86400);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  return formatDate(value);
};

/** Days left in the department's storage window (negative means expired). */
export const daysUntil = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
};

/** Resolves an image URL against the API host. */
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

/** Status → { label, tone } used for badges across the UI. */
export const STATUS_META = {
  'In Storage': { label: 'In storage', tone: 'storage' },
  'Claim Pending': { label: 'Claim in review', tone: 'pending' },
  Returned: { label: 'Returned', tone: 'returned' },
  Disposed: { label: 'Disposed', tone: 'disposed' },
};

export const statusMeta = (status) => STATUS_META[status] || { label: status || 'Unknown', tone: 'storage' };

export const CLAIM_STATUSES = ['Pending', 'Approved', 'Rejected', 'Collected'];

export const claimStatusMeta = (status) => {
  switch (status) {
    case 'Approved':
      return { label: 'Approved — collect it at the office', tone: 'returned' };
    case 'Rejected':
      return { label: 'Not approved', tone: 'disposed' };
    case 'Collected':
      return { label: 'Collected', tone: 'returned' };
    default:
      return { label: 'Under review', tone: 'pending' };
  }
};
