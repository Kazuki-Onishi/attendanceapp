export type NormalizedSpan = {
  start: string;
  end: string;
};

export type SpanParseResult = {
  spans: NormalizedSpan[];
  errors: string[];
  warnings: string[];
  normalizedText: string;
};

type ParseTimeOptions = {
  allowTwentyFour?: boolean;
};

const TIME_SEPARATOR_PATTERN = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u223C\u301C\uFF5E~\uFF70\u30FC-]/g;
const TIME_COLON_PATTERN = /[\uFF1A\uFE55\uA789\uFF61]/g;
const JAPANESE_COMMA_PATTERN = /[\u3001\uFF0C]/g;

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':');
  const h = Number.parseInt(hours, 10);
  const m = Number.parseInt(minutes, 10);
  return h * 60 + m;
};

const parseTimeToken = (token: string, options: ParseTimeOptions = {}): string | null => {
  const cleaned = token.replace(/[^0-9:]/g, '');
  if (!cleaned) {
    return null;
  }

  const compact = cleaned.replace(/:/g, '');
  if (!/^\d{1,4}$/.test(compact)) {
    return null;
  }

  let hours: number;
  let minutes: number;
  if (compact.length <= 2) {
    hours = Number.parseInt(compact, 10);
    minutes = 0;
  } else if (compact.length === 3) {
    hours = Number.parseInt(compact.slice(0, 1), 10);
    minutes = Number.parseInt(compact.slice(1), 10);
  } else {
    hours = Number.parseInt(compact.slice(0, 2), 10);
    minutes = Number.parseInt(compact.slice(2), 10);
  }

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  if (hours === 24 && minutes === 0 && options.allowTwentyFour) {
    return '24:00';
  }

  if (hours < 0 || hours > 23) {
    return null;
  }

  if (minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const compareTimes = (a: string, b: string): number => {
  return toMinutes(a) - toMinutes(b);
};

const normalizeSegment = (segment: string): string => {
  return segment
    .trim()
    .replace(TIME_COLON_PATTERN, ':')
    .replace(TIME_SEPARATOR_PATTERN, '-')
    .replace(/[\s\u00A0]+/g, '')
    .replace(/[\u2014\u2015]/g, '-')
    .replace(/\u2212/g, '-')
    .replace(/[\uFF0D]/g, '-')
    .replace(/-+/g, '-');
};

export const parseSpanInput = (input: string): SpanParseResult => {
  const spans: NormalizedSpan[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const segments = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) =>
      line
        .replace(JAPANESE_COMMA_PATTERN, ',')
        .split(/[,:;\uFF1B]/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter(Boolean);

  segments.forEach((segment) => {
    const normalized = normalizeSegment(segment);
    if (!normalized) {
      return;
    }

    const parts = normalized.split('-').filter(Boolean);
    if (parts.length !== 2) {
      errors.push(`"${segment}" is not in a recognised range format. Try 10-18 or 10:00-18:00.`);
      return;
    }

    const start = parseTimeToken(parts[0], { allowTwentyFour: false });
    const end = parseTimeToken(parts[1], { allowTwentyFour: true });

    if (!start || !end) {
      errors.push(`Could not interpret the time range in "${segment}".`);
      return;
    }

    if (compareTimes(start === '24:00' ? '23:59' : start, end === '24:00' ? '24:00' : end) >= 0) {
      errors.push(`"${segment}" must end after it starts.`);
      return;
    }

    const key = `${start}-${end}`;
    if (seen.has(key)) {
      warnings.push(`The range ${start}-${end} is duplicated and was ignored.`);
      return;
    }

    seen.add(key);
    spans.push({ start, end });
  });

  spans.sort((a, b) => {
    const diff = compareTimes(a.start, b.start);
    if (diff !== 0) {
      return diff;
    }
    return compareTimes(a.end, b.end);
  });

  const normalizedText = spans.map((span) => `${span.start}-${span.end}`).join('\n');

  return {
    spans,
    errors,
    warnings,
    normalizedText,
  };
};

export const spansToMultiline = (spans: NormalizedSpan[]): string => {
  if (!spans.length) {
    return '';
  }

  return spans
    .slice()
    .sort((a, b) => {
      const diff = compareTimes(a.start, b.start);
      if (diff !== 0) {
        return diff;
      }
      return compareTimes(a.end, b.end);
    })
    .map((span) => `${span.start}-${span.end}`)
    .join('\n');
};
