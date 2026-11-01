// 845 → "845", 12 400 → "12,4K", 1 250 000 → "1,2M"
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const fmt = (v: number) => v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  if (n < 1_000_000) return (n < 10_000 ? fmt(n / 1000) : Math.round(n / 1000).toString()) + 'K';
  return fmt(n / 1_000_000) + 'M';
}
