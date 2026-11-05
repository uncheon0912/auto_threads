import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexRateLimitClient, weeklyUsageFromResponse } from './rate-limits';

afterEach(()=>vi.useRealTimers());

describe('Codex usage windows', () => {
  it('separates five hour and weekly windows regardless of order', () => {
    const status = weeklyUsageFromResponse({ rateLimits: { primary: { windowDurationMins: 10080, usedPercent: 53, resetsAt: 1800000000 }, secondary: { windowDurationMins: 300, usedPercent: 23, resetsAt: 1799990000 } } }, 42);
    expect(status).toMatchObject({ routineTokens: 42, weeklyRemainingPercent: 47, fiveHourRemainingPercent: 77, available: true });
    expect(status.resetsAt).toBe(new Date(1800000000 * 1000).toISOString());
    expect(status.fiveHourResetsAt).toBe(new Date(1799990000 * 1000).toISOString());
  });
  it('preserves a five hour value when weekly data is absent', () => {
    const status = weeklyUsageFromResponse({ rateLimits: { primary: { windowDurationMins: 300, usedPercent: 110 } } });
    expect(status.fiveHourRemainingPercent).toBe(0);
    expect(status.weeklyRemainingPercent).toBeUndefined();
    expect(status.available).toBe(false);
  });
});

describe('Codex connection recovery',()=>{
  it('attempts reconnection after an unexpected disconnect',async()=>{
    vi.useFakeTimers();
    const client=new CodexRateLimitClient('not-used');
    const start=vi.spyOn(client,'start').mockResolvedValue();
    client['disconnect'](new Error('lost'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(start).toHaveBeenCalledOnce();
    client.stop();
  });
  it('does not reconnect after an intentional shutdown',async()=>{
    vi.useFakeTimers();
    const client=new CodexRateLimitClient('not-used');
    const start=vi.spyOn(client,'start').mockResolvedValue();
    client['disconnect'](new Error('lost'));
    client.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(start).not.toHaveBeenCalled();
  });
});
