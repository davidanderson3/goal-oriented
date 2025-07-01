import { describe, it, expect, vi } from 'vitest';

// Mock auth.js to avoid loading Firebase scripts during tests
vi.mock('../js/auth.js', () => ({
  getCurrentUser: () => null,
  db: {}
}));

import { parseNaturalDate, formatDaysUntil, generateId } from '../js/helpers.js';

describe('parseNaturalDate', () => {
  it('returns today\'s date string for "today" input', () => {
    const result = parseNaturalDate('today');
    const today = new Date().toISOString().split('T')[0];
    expect(result).toBe(today);
  });

  it('returns next Monday when input is "mon"', () => {
    const result = parseNaturalDate('mon');
    const today = new Date();
    const next = new Date(today);
    let delta = 1 - today.getDay();
    if (delta <= 0) delta += 7;
    next.setDate(today.getDate() + delta);
    const monday = next.toISOString().split('T')[0];
    expect(result).toBe(monday);
  });
});

describe('formatDaysUntil', () => {
  it('returns "today" for current date', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(formatDaysUntil(today)).toBe('today');
  });

  it('handles future and past dates', () => {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    expect(formatDaysUntil(tomorrow.toISOString().split('T')[0])).toBe('in 1 day');
    expect(formatDaysUntil(yesterday.toISOString().split('T')[0])).toBe('overdue by 1 day');
  });
});

describe('generateId', () => {
  it('generates unique-like ids', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^_[a-z0-9]{9}$/);
  });
});
