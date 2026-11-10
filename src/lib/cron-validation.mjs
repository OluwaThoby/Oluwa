const CRON_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function isValidCronField(field, min, max) {
  if (!field) return false;

  return field.split(',').every((part) => {
    if (!part) return false;

    const pieces = part.split('/');
    if (pieces.length > 2) return false;

    const [base, stepText] = pieces;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText)) return false;
      const step = Number(stepText);
      if (step < 1 || step > max - min + 1) return false;
    }

    if (base === '*') return true;

    if (base.includes('-')) {
      const range = base.split('-');
      if (range.length !== 2 || !range.every((value) => /^\d+$/.test(value))) {
        return false;
      }
      const start = Number(range[0]);
      const end = Number(range[1]);
      return start >= min && end <= max && start <= end;
    }

    if (!/^\d+$/.test(base)) return false;
    const value = Number(base);
    return value >= min && value <= max;
  });
}

export function isValidCron(expression) {
  if (typeof expression !== 'string' || expression.length > 120) return false;
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5 && fields.every((field, index) => {
    const [min, max] = CRON_RANGES[index];
    return isValidCronField(field, min, max);
  });
}
