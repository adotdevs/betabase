const REMINDER_TIMEZONE = 'Europe/London';
const REMINDER_TIMEZONE_LABEL = 'UK time (GMT/BST)';

const getZonedParts = (date, timeZone = REMINDER_TIMEZONE) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach(({ type, value }) => {
    if (type !== 'literal') {
      map[type] = value;
    }
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second || 0),
  };
};

const pad2 = (value) => String(value).padStart(2, '0');

const parseReminderDateTimeInUk = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedParts(new Date(utcMs));
    const currentMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMs += targetMs - currentMs;
  }

  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getUkDayBounds = (referenceDate = new Date()) => {
  const parts = getZonedParts(referenceDate);
  const dateKey = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const startOfToday = parseReminderDateTimeInUk(dateKey, '00:00');
  const endOfToday = parseReminderDateTimeInUk(dateKey, '23:59');

  if (endOfToday) {
    endOfToday.setSeconds(59, 999);
  }

  return { startOfToday, endOfToday };
};

const formatReminderDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: REMINDER_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
};

const toReminderDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getZonedParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

const toReminderTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getZonedParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

module.exports = {
  REMINDER_TIMEZONE,
  REMINDER_TIMEZONE_LABEL,
  parseReminderDateTimeInUk,
  getUkDayBounds,
  formatReminderDateTime,
  toReminderDateInput,
  toReminderTimeInput,
};
