/**
 * Utility formatters for Currency and Quantities.
 * Safely handles number, string (from Decimal JSON serialization), undefined, or null.
 */

export function formatQuantity(qty?: number | string | null): string {
  if (qty == null) return '0';
  const num = typeof qty === 'number' ? qty : parseFloat(String(qty));
  if (isNaN(num)) return '0';
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(3)).toString();
}

export function formatCurrency(val?: number | string | null): string {
  if (val == null) return '0đ';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return `${Math.round(isNaN(num) ? 0 : num).toLocaleString('vi-VN')}đ`;
}
