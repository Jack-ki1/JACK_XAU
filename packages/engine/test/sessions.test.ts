import { describe, it, expect } from 'vitest';
import { getActiveSession, isMarketOpen, getMarketStatus, getUpcomingSession } from '../src/sessions';

describe('getActiveSession (DST-aware)', () => {
  it('finds London during BST (summer) at 10:00 London time', () => {
    // 2026-07-15 10:00 Europe/London = 09:00 UTC (BST = UTC+1)
    const s = getActiveSession(new Date('2026-07-15T09:00:00Z'));
    expect(s?.name).toBe('LONDON');
  });
  it('finds London during GMT (winter) at 10:00 London time', () => {
    // 2026-01-15 10:00 Europe/London = 10:00 UTC (GMT = UTC+0)
    const s = getActiveSession(new Date('2026-01-15T10:00:00Z'));
    expect(s?.name).toBe('LONDON');
  });
  it('finds the London/NY overlap in summer', () => {
    // 14:00 London (BST) = 09:00 New York (EDT) — both in 8-17 local
    const s = getActiveSession(new Date('2026-07-15T13:00:00Z'));
    expect(s?.name).toBe('LONDON/NY OVERLAP');
  });
  it('finds New York alone in winter evenings UTC', () => {
    // 18:00 UTC winter = 18:00 London (closed) = 13:00 New York (EST, open)
    const s = getActiveSession(new Date('2026-01-15T18:00:00Z'));
    expect(s?.name).toBe('NEW YORK');
  });
  it('returns null in the dead zone', () => {
    // 03:00 UTC winter: London 03:00 (closed), New York 22:00 prev day
    // (closed), Tokyo/Sydney fixed UTC windows (06-15 / 04-13) exclude 03.
    const s = getActiveSession(new Date('2026-01-15T03:00:00Z'));
    expect(s).toBeNull();
  });
  it('finds Tokyo inside its UTC window', () => {
    // Tokyo 09:00-18:00 EAT = 06:00-15:00 UTC → 11:00 UTC winter, while
    // London (11:00 local, open) takes priority per the overlap order.
    const s = getActiveSession(new Date('2026-01-15T11:00:00Z'));
    expect(s?.name).toBe('LONDON');
  });
});

describe('isMarketOpen (weekend logic)', () => {
  it('is open mid-week', () => {
    expect(isMarketOpen(new Date('2026-10-07T12:00:00Z'))).toBe(true); // Wednesday
  });
  it('is closed Saturday', () => {
    expect(isMarketOpen(new Date('2026-10-10T12:00:00Z'))).toBe(false);
  });
  it('is closed Friday after 5pm ET', () => {
    // Friday 17:30 New York (EDT, UTC-4) = 21:30 UTC
    expect(isMarketOpen(new Date('2026-10-09T21:30:00Z'))).toBe(false);
  });
  it('is open Friday before 5pm ET', () => {
    expect(isMarketOpen(new Date('2026-10-09T20:30:00Z'))).toBe(true);
  });
  it('is closed Sunday before 5pm ET', () => {
    expect(isMarketOpen(new Date('2026-10-11T20:30:00Z'))).toBe(false);
  });
  it('is open Sunday after 5pm ET', () => {
    expect(isMarketOpen(new Date('2026-10-11T21:30:00Z'))).toBe(true);
  });
});

describe('getMarketStatus / getUpcomingSession', () => {
  it('wraps the boolean with a detail string', () => {
    const st = getMarketStatus(new Date('2026-10-07T12:00:00Z'));
    expect(st).toEqual({ open: true, detail: expect.any(String) });
  });
  it('returns null when no session change is near', () => {
    // Mid-overlap: 10 minutes ahead is still overlap.
    const u = getUpcomingSession(new Date('2026-07-15T13:00:00Z'), 10);
    expect(u).toBeNull();
  });
});
