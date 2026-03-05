import { describe, it, expect } from 'vitest';
import { TYPE_OPTIONS, FORMAT_OPTIONS, FORMAT_GROUPS } from './constants';

describe('TYPE_OPTIONS', () => {
  it('includes staging type', () => {
    const staging = TYPE_OPTIONS.find((o) => o.value === 'staging');
    expect(staging).toBeDefined();
    expect(staging!.label).toBe('Staging');
  });

  it('includes all four repo types in order', () => {
    const values = TYPE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['local', 'staging', 'remote', 'virtual']);
  });

  it('has unique values', () => {
    const values = TYPE_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('FORMAT_OPTIONS', () => {
  it('has at least one format', () => {
    expect(FORMAT_OPTIONS.length).toBeGreaterThan(0);
  });

  it('each option has value, label, and group', () => {
    for (const opt of FORMAT_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.group).toBeTruthy();
    }
  });
});

describe('FORMAT_GROUPS', () => {
  it('groups all format options by group name', () => {
    const totalFromGroups = FORMAT_GROUPS.reduce(
      (sum, [, opts]) => sum + opts.length,
      0
    );
    expect(totalFromGroups).toBe(FORMAT_OPTIONS.length);
  });
});
