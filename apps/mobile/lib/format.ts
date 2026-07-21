/**
 * Display formatting. Indian numbering and ₹ throughout — the product is
 * India-first (see the state/budget lists in @influnet/core).
 */
export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`;
}

/**
 * Compact money for chart labels, where "₹1,50,000" would not fit under a bar.
 * Same Indian units as formatCount — lakh and crore, not millions.
 */
export function formatCompactCurrency(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '₹0';
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${Math.round(value / 1_000)}K`;
  return `₹${value}`;
}

/** Compact follower counts: 12.4K, 1.2M. */
export function formatCount(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** "2h ago" / "3d ago" — relative until a week out, then a date. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Turn a stage key like `advance_payment` into "Advance payment". */
export function humanizeStage(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
