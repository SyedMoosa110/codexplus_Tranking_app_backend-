import { describe, it, expect } from 'vitest';
import { calcSession } from '../src/services/summary.service';

describe('Session Time & Idle Calculation Engine', () => {
  it('calculates 100% active session when no idle events exist', () => {
    const start = new Date('2026-11-06T09:00:00Z');
    const end = new Date('2026-11-06T10:00:00Z'); // 3600 seconds

    const events = [
      { type: 'HEARTBEAT', occurredAt: new Date('2026-11-06T09:01:00Z') },
      { type: 'APP_CHANGE', occurredAt: new Date('2026-11-06T09:05:00Z') },
      { type: 'HEARTBEAT', occurredAt: new Date('2026-11-06T09:59:00Z') },
    ];

    const result = calcSession(start, end, events);
    expect(result.trackedSec).toBe(3600);
    expect(result.idleSec).toBe(0);
    expect(result.activeSec).toBe(3600);
  });

  it('correctly calculates idle period between IDLE_START and IDLE_END', () => {
    const start = new Date('2026-11-06T09:00:00Z');
    const end = new Date('2026-11-06T10:00:00Z'); // 3600 seconds

    const events = [
      { type: 'IDLE_START', occurredAt: new Date('2026-11-06T09:15:00Z') },
      { type: 'IDLE_END', occurredAt: new Date('2026-11-06T09:30:00Z') }, // 15 min = 900 seconds idle
    ];

    const result = calcSession(start, end, events);
    expect(result.trackedSec).toBe(3600);
    expect(result.idleSec).toBe(900);
    expect(result.activeSec).toBe(2700);
  });

  it('handles idle state extending until session closure', () => {
    const start = new Date('2026-11-06T09:00:00Z');
    const end = new Date('2026-11-06T10:00:00Z'); // 3600 seconds

    const events = [
      { type: 'IDLE_START', occurredAt: new Date('2026-11-06T09:40:00Z') }, // 20 min = 1200 seconds idle until 10:00
    ];

    const result = calcSession(start, end, events);
    expect(result.trackedSec).toBe(3600);
    expect(result.idleSec).toBe(1200);
    expect(result.activeSec).toBe(2400);
  });

  it('correctly deducts unexpected offline crashes (>5 min gap) when gap check is enabled', () => {
    const start = new Date('2026-11-06T09:00:00Z');
    const end = new Date('2026-11-06T12:00:00Z'); // 3 hours = 10,800 sec

    // Agent crashed from 09:05 to 11:55 (170 minutes gap)
    const events = [
      { type: 'HEARTBEAT', occurredAt: new Date('2026-11-06T09:05:00Z') },
      { type: 'HEARTBEAT', occurredAt: new Date('2026-11-06T11:55:00Z') },
    ];

    const result = calcSession(start, end, events, { checkHeartbeatGaps: true, maxHeartbeatGapSec: 300 });
    // Expect huge deduction
    expect(result.trackedSec).toBeLessThan(1500);
    expect(result.idleSec).toBe(0);
  });
});
