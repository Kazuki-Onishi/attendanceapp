const pad = (value: number) => String(value).padStart(2, '0');
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export type ParsedRange = { start: string; end: string } | null;

const normaliseRaw = (input: string): string => {
  let result = input.trim();
  result = result.replace(/：/g, ':').replace(/[～~ー―〜]/g, '-');
  result = result.replace(/時(?=\d)/g, ':').replace(/時/g, ':00');
  if (!/-/.test(result)) {
    result = result.replace(/(\d)\s+(\d)/, '$1-$2');
  }
  return result.replace(/\s+/g, '');
};

const RANGE_REGEX = /^(\d{1,2})(?::?(\d{2}))?-(\d{1,2})(?::?(\d{2}))?$/;

const toTime = (hours: number, minutes: number) =>
  `${pad(clamp(hours, 0, 23))}:${pad(clamp(minutes, 0, 59))}`;

export function parseTimeRange(raw: string): ParsedRange {
  if (!raw) {
    return null;
  }

  const normalized = normaliseRaw(raw);
  const match = normalized.match(RANGE_REGEX);

  if (!match) {
    return null;
  }

  const [startHoursRaw, startMinutesRaw, endHoursRaw, endMinutesRaw] = match.slice(1);
  const startHours = Number.parseInt(startHoursRaw, 10);
  const startMinutes = startMinutesRaw ? Number.parseInt(startMinutesRaw, 10) : 0;
  const endHours = Number.parseInt(endHoursRaw, 10);
  const endMinutes = endMinutesRaw ? Number.parseInt(endMinutesRaw, 10) : 0;

  if (
    Number.isNaN(startHours) ||
    Number.isNaN(startMinutes) ||
    Number.isNaN(endHours) ||
    Number.isNaN(endMinutes)
  ) {
    return null;
  }

  const start = toTime(startHours, startMinutes);
  const end = toTime(endHours, endMinutes);

  if (start >= end) {
    return null;
  }

  return { start, end };
}
