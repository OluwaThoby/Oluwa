export function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : Number.NaN;
}

export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}
