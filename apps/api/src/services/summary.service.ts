export interface ActivityEventInput {
  type: string;
  occurredAt: Date;
}

export interface SessionCalculationResult {
  trackedSec: number;
  idleSec: number;
  activeSec: number;
}

/**
 * Calculates active, idle, and tracked time for a session based on raw events.
 * Handles IDLE_START / IDLE_END pairs, active time deduction, and bounds checking.
 * If checkHeartbeatGaps is enabled, gaps > maxHeartbeatGapSec without any events
 * are treated as OFFLINE (e.g. system crash, forced taskkill, or sleep).
 */
export function calcSession(
  startAt: Date,
  endAt: Date,
  events: ActivityEventInput[],
  options: { checkHeartbeatGaps?: boolean; maxHeartbeatGapSec?: number } = {}
): SessionCalculationResult {
  if (endAt <= startAt) {
    return { trackedSec: 0, idleSec: 0, activeSec: 0 };
  }

  const { checkHeartbeatGaps = false, maxHeartbeatGapSec = 300 } = options;

  // Sort events chronologically
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let totalIdleSec = 0;
  let idleFrom: Date | null = null;
  let offlineSec = 0;

  let lastTimestamp = startAt;

  for (const e of sorted) {
    if (checkHeartbeatGaps) {
      const gapSec = (e.occurredAt.getTime() - lastTimestamp.getTime()) / 1000;
      if (gapSec > maxHeartbeatGapSec) {
        offlineSec += (gapSec - maxHeartbeatGapSec);
      }
      lastTimestamp = e.occurredAt;
    }

    if (e.type === 'IDLE_START' && !idleFrom) {
      idleFrom = e.occurredAt;
    } else if (e.type === 'IDLE_END' && idleFrom) {
      const durationSec = Math.max(0, (e.occurredAt.getTime() - idleFrom.getTime()) / 1000);
      totalIdleSec += durationSec;
      idleFrom = null;
    }
  }

  // If session closed while still in idle state
  if (idleFrom) {
    const durationSec = Math.max(0, (endAt.getTime() - idleFrom.getTime()) / 1000);
    totalIdleSec += durationSec;
  }

  // Final gap check from last event to session endAt
  if (checkHeartbeatGaps && sorted.length > 0) {
    const finalGapSec = (endAt.getTime() - lastTimestamp.getTime()) / 1000;
    if (finalGapSec > maxHeartbeatGapSec) {
      offlineSec += (finalGapSec - maxHeartbeatGapSec);
    }
  }

  const rawSessionDurationSec = Math.max(0, (endAt.getTime() - startAt.getTime()) / 1000);
  const trackedSec = Math.max(0, Math.floor(rawSessionDurationSec - offlineSec));
  const idleSec = Math.min(Math.floor(totalIdleSec), trackedSec);
  const activeSec = Math.max(0, trackedSec - idleSec);

  return { trackedSec, idleSec, activeSec };
}
