export const REMINDER_TIMEZONE = 'Europe/London';
export const REMINDER_TIMEZONE_LABEL = 'UK time (GMT/BST)';

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

export const formatReminderDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

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

export const toReminderDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getZonedParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const toReminderTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getZonedParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

export const getReminderMinutesUntil = (value) => {
  if (!value) return 0;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.round((target.getTime() - Date.now()) / 60000));
};
