import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTime } from '../src/reminders';

describe('reminders', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses relative time (minutes)', () => {
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        const result = parseTime('10m', 'UTC');
        expect(result).toBe(Math.floor(now.getTime() / 1000) + 600);
    });

    it('parses relative time (hours)', () => {
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        const result = parseTime('1h', 'UTC');
        expect(result).toBe(Math.floor(now.getTime() / 1000) + 3600);
    });

    it('parses absolute time (HH:MM) today', () => {
        // 10:00 UTC, target 11:00 UTC
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        const result = parseTime('11:00', 'UTC');
        expect(result).toBe(Math.floor(new Date('2023-10-27T11:00:00Z').getTime() / 1000));
    });

    it('parses absolute time (HH:MM) tomorrow if already past', () => {
        // 10:00 UTC, target 09:00 UTC (should be tomorrow)
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        const result = parseTime('09:00', 'UTC');
        expect(result).toBe(Math.floor(new Date('2023-10-28T09:00:00Z').getTime() / 1000));
    });

    it('parses absolute time with timezone (Europe/Madrid)', () => {
        // Europe/Madrid is UTC+2 in Oct 2023
        // If it's 10:00 UTC, it's 12:00 in Madrid.
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        
        // Target 13:00 in Madrid
        // 13:00 Madrid = 11:00 UTC
        const result = parseTime('13:00', 'Europe/Madrid');
        expect(result).toBe(Math.floor(new Date('2023-10-27T11:00:00Z').getTime() / 1000));
    });

    it('parses absolute time with timezone (America/New_York)', () => {
        // America/New_York is UTC-4 in Oct 2023
        // If it's 10:00 UTC, it's 06:00 in NY.
        const now = new Date('2023-10-27T10:00:00Z');
        vi.setSystemTime(now);
        
        // Target 07:00 in NY
        // 07:00 NY = 11:00 UTC
        const result = parseTime('07:00', 'America/New_York');
        expect(result).toBe(Math.floor(new Date('2023-10-27T11:00:00Z').getTime() / 1000));
    });
});
