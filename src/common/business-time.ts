export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dateTimeParts(date: Date) {
  const parts = Object.fromEntries(
    businessDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function isValidBusinessDateKey(dateKey: string) {
  return parseDateKey(dateKey) !== null;
}

export function businessDateKey(date: Date) {
  const parts = dateTimeParts(date);
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

export function businessWeekday(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new RangeError('Data de negócio inválida');
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function businessMinutes(date: Date) {
  const parts = dateTimeParts(date);
  return parts.hour * 60 + parts.minute;
}

export function businessDateTime(dateKey: string, time: string) {
  const date = parseDateKey(dateKey);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!date || !match) throw new RangeError('Data ou horário de negócio inválido');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const targetAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let timestamp = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateTimeParts(new Date(timestamp));
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const adjustment = targetAsUtc - representedAsUtc;
    if (adjustment === 0) break;
    timestamp += adjustment;
  }

  return new Date(timestamp);
}

export function businessDayBounds(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new RangeError('Data de negócio inválida');
  const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const nextDateKey = [
    String(nextDate.getUTCFullYear()).padStart(4, '0'),
    String(nextDate.getUTCMonth() + 1).padStart(2, '0'),
    String(nextDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return {
    start: businessDateTime(dateKey, '00:00'),
    end: businessDateTime(nextDateKey, '00:00'),
  };
}
