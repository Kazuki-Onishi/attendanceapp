import type { Attendance } from './types';

type BreakInterval = { start: Date; end?: Date };

const sumBreakMinutes = (breaks: BreakInterval[]): number => {
  if (!breaks.length) {
    return 0;
  }

  return breaks.reduce((total, current) => {
    if (!current.start) {
      return total;
    }
    const end = current.end ?? new Date();
    const diffMs = end.getTime() - current.start.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) {
      return total;
    }
    return total + diffMs / (1000 * 60);
  }, 0);
};

export const isOnBreak = (attendance: Attendance | null | undefined): boolean => {
  if (!attendance || attendance.breaks.length === 0) {
    return false;
  }

  const lastBreak = attendance.breaks[attendance.breaks.length - 1];
  return Boolean(lastBreak && !lastBreak.end);
};

export const workedMinutes = (clockIn: Date, breaks: BreakInterval[], now: Date = new Date()): number => {
  const diffMs = now.getTime() - clockIn.getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return 0;
  }

  const totalMinutes = diffMs / (1000 * 60);
  const breakMinutes = sumBreakMinutes(breaks);
  const worked = Math.max(totalMinutes - breakMinutes, 0);

  return Math.round(worked);
};

export const formatMinutesAsHours = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0:00';
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours}:${String(mins).padStart(2, '0')}`;
};
export const formatHM = formatMinutesAsHours;
