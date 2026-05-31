import { DateTime } from "luxon";

export type InclusiveLeaveDates = {
  start: DateTime;
  end: DateTime;
};

/**
 * Calculates an inclusive weekday-only leave range from a starting date.
 *
 * @description
 * Counts Monday through Friday as working days and does not apply a holiday
 * calendar. A weekend starting date is rejected because it is not a working day.
 *
 * @param {string} startDate - ISO date selected by the applicant.
 * @param {string} workingDays - Positive whole-number count of requested days.
 * @returns {InclusiveLeaveDates | null} Inclusive range when valid, otherwise null.
 */
export function calculateInclusiveLeaveDates(
  startDate: string,
  workingDays: string,
): InclusiveLeaveDates | null {
  const start = DateTime.fromISO(startDate, { zone: "Asia/Manila" }).startOf("day");
  const days = Number.parseInt(workingDays, 10);

  if (!start.isValid || !/^[1-9]\d{0,3}$/.test(workingDays) || days <= 0 || start.weekday > 5) {
    return null;
  }

  let end = start;
  let counted = 1;

  while (counted < days) {
    end = end.plus({ days: 1 });
    if (end.weekday <= 5) {
      counted++;
    }
  }

  return { start, end };
}

export function formatInclusiveLeaveDates(range: InclusiveLeaveDates | null): string {
  if (!range) return "";

  const start = range.start.toFormat("M/d/yyyy");
  const end = range.end.toFormat("M/d/yyyy");
  return start === end ? start : `${start}-${end}`;
}
