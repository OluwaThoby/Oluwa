import { isValidCron } from './cron-validation.mjs';

function expandField(field, min, max, isDayOfWeek = false) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [base, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    let start;
    let end;
    if (base === '*') {
      start = min;
      end = max;
    } else if (base.includes('-')) {
      const [a, b] = base.split('-').map(Number);
      start = a;
      end = b;
    } else {
      start = Number(base);
      end = stepText === undefined ? start : max;
    }
    for (let value = start; value <= end; value += step) {
      values.add(isDayOfWeek && value === 7 ? 0 : value);
    }
  }
  return values;
}

function matchesDate(parts, fields) {
  const minute = Number(parts.minute);
  const hour = Number(parts.hour);
  const day = Number(parts.day);
  const month = Number(parts.month);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);

  if (!fields.minute.has(minute) || !fields.hour.has(hour) || !fields.month.has(month)) return false;

  const domMatches = fields.day.has(day);
  const dowMatches = fields.weekday.has(weekday);
  const domWildcard = fields.dayWildcard;
  const dowWildcard = fields.weekdayWildcard;
  const calendarDayMatches = domWildcard ? dowMatches || dowWildcard : dowWildcard ? domMatches : domMatches || dowMatches;
  return calendarDayMatches;
}

/**
 * Return the first UTC instant strictly after the reference time that matches
 * the cron expression in the supplied IANA timezone. UTC scanning handles
 * daylight-saving gaps and repeated hours without inventing local timestamps.
 */
export function nextCronOccurrence(expression, timezone, after = new Date()) {
  if (!isValidCron(expression)) throw new TypeError('Invalid five-field cron expression.');
  if (typeof timezone !== 'string' || !timezone.trim()) throw new TypeError('A timezone is required.');

  const fieldsRaw = expression.trim().split(/\s+/);
  const fields = {
    minute: expandField(fieldsRaw[0], 0, 59),
    hour: expandField(fieldsRaw[1], 0, 23),
    day: expandField(fieldsRaw[2], 1, 31),
    month: expandField(fieldsRaw[3], 1, 12),
    weekday: expandField(fieldsRaw[4], 0, 7, true),
    dayWildcard: fieldsRaw[2].includes('*'),
    weekdayWildcard: fieldsRaw[4].includes('*'),
  };

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const afterMs = after instanceof Date ? after.getTime() : new Date(after).getTime();
  if (!Number.isFinite(afterMs)) throw new TypeError('Invalid reference date.');
  const firstMinute = Math.floor(afterMs / 60000) * 60000 + 60000;
  const startDay = Math.floor(firstMinute / 86400000) * 86400000;
  const minuteValues = [...fields.minute].sort((a, b) => a - b);

  for (let dayOffset = 0; dayOffset <= 366; dayOffset += 1) {
    const utcDay = startDay + dayOffset * 86400000;
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of minuteValues) {
        const candidate = utcDay + hour * 3600000 + minute * 60000;
        if (candidate < firstMinute) continue;
        const parts = Object.fromEntries(
          formatter.formatToParts(new Date(candidate))
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
        );
        if (matchesDate(parts, fields)) return new Date(candidate);
      }
    }
  }

  throw new RangeError('No matching cron occurrence found within the next 366 days.');
}
