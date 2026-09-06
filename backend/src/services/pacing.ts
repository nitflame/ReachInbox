/**
 * Pure scheduling-pacing math, kept dependency-free so it's trivially
 * unit-testable without a DB or queue.
 */

export interface PacingInput {
  /** Minimum gap the caller asked for between consecutive sends, in ms. */
  requestedDelayMs: number;
  /** Max emails that should go out within any rolling hour. */
  hourlyLimit: number;
}

export interface PacingResult {
  /** The delay actually used between consecutive emails, in ms. */
  effectiveDelayMs: number;
  /** The minimum spacing required to respect hourlyLimit, in ms. */
  minSpacingForHourlyLimitMs: number;
}

/**
 * Combines an explicit "delay between emails" with an hourly cap.
 *
 * The hourly limit is enforced by ensuring emails are spaced at least
 * `3_600_000 / hourlyLimit` ms apart; if the caller's requested delay is
 * already looser than that, it wins (no reason to send slower than asked).
 * If it's tighter than the hourly limit allows, the hourly limit wins.
 *
 * Scope note: this paces the emails *within a single scheduling request*.
 * It does not look at emails already scheduled by earlier requests for the
 * same tenant/sender - see README "unresolved issues" for the implication.
 */
export function computeEffectiveDelayMs(input: PacingInput): PacingResult {
  if (input.requestedDelayMs < 0) {
    throw new Error("requestedDelayMs must be >= 0");
  }
  if (input.hourlyLimit <= 0) {
    throw new Error("hourlyLimit must be > 0");
  }

  const minSpacingForHourlyLimitMs = Math.ceil(3_600_000 / input.hourlyLimit);
  const effectiveDelayMs = Math.max(input.requestedDelayMs, minSpacingForHourlyLimitMs);

  return { effectiveDelayMs, minSpacingForHourlyLimitMs };
}

/**
 * Scheduled send time for the i-th (0-indexed) recipient in a batch.
 */
export function computeScheduledAt(startTime: Date, index: number, effectiveDelayMs: number): Date {
  return new Date(startTime.getTime() + index * effectiveDelayMs);
}
