/**
 * Pure, dependency-free hour-bucketing helpers. Every rate-limit and
 * notification key is anchored to these so the same wall-clock hour always
 * produces the same key, regardless of which process computes it.
 */

/** Floors a Date to the start of its UTC hour (e.g. 14:37:12 -> 14:00:00.000). */
export function floorToHour(date: Date): Date {
  const floored = new Date(date);
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

/** Start of the next UTC hour after `date`. */
export function nextHourStart(date: Date): Date {
  return new Date(floorToHour(date).getTime() + 3_600_000);
}

/** Stable string key for the UTC hour containing `date`, e.g. for Redis keys. */
export function hourWindowKey(date: Date): string {
  return floorToHour(date).toISOString();
}
