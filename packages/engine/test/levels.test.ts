import { describe, it, expect } from 'vitest';
import { detectBreaks, weekRolledOver } from '../src/levels';

const LEVELS = { prevDayHigh: 2650, prevDayLow: 2600, prevWeekHigh: 2680, prevWeekLow: 2580 };

describe('detectBreaks', () => {
  it('reports a daily-high break', () => {
    expect(detectBreaks(LEVELS, 2651)).toEqual([{ type: 'daily_high', level: 2650, livePrice: 2651 }]);
  });
  it('reports both breaks when price slices two levels', () => {
    // 2579 is below the daily low (2600) AND the weekly low (2580).
    expect(detectBreaks(LEVELS, 2579)).toEqual([
      { type: 'daily_low', level: 2600, livePrice: 2579 },
      { type: 'weekly_low', level: 2580, livePrice: 2579 },
    ]);
  });
  it('reports nothing inside the range', () => {
    expect(detectBreaks(LEVELS, 2625)).toEqual([]);
  });
  it('ignores null levels', () => {
    expect(detectBreaks({ prevDayHigh: null, prevDayLow: null, prevWeekHigh: null, prevWeekLow: null }, 9999)).toEqual([]);
  });
  it('uses strict inequality at the level', () => {
    expect(detectBreaks(LEVELS, 2650)).toEqual([]);
  });
});

describe('weekRolledOver', () => {
  it('detects a new weekly high', () => {
    expect(weekRolledOver(2680, 2690)).toBe(true);
  });
  it('is false when unchanged or missing', () => {
    expect(weekRolledOver(2680, 2680)).toBe(false);
    expect(weekRolledOver(2680, null)).toBe(false);
  });
});
