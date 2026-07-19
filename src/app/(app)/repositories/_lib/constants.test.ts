import { describe, it, expect } from 'vitest';
import {
  TYPE_OPTIONS,
  FORMAT_OPTIONS,
  FORMAT_GROUPS,
  hasRpmTrustedKeyConfig,
  hasDebianConfig,
  hasNpmScopePolicy,
} from './constants';

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

describe('1.6.0 format-specific config gating (#602)', () => {
  it('hasRpmTrustedKeyConfig only for rpm', () => {
    expect(hasRpmTrustedKeyConfig('rpm')).toBe(true);
    expect(hasRpmTrustedKeyConfig('debian')).toBe(false);
    expect(hasRpmTrustedKeyConfig('npm')).toBe(false);
  });

  it('hasDebianConfig only for debian', () => {
    expect(hasDebianConfig('debian')).toBe(true);
    expect(hasDebianConfig('rpm')).toBe(false);
    expect(hasDebianConfig('generic')).toBe(false);
  });

  it('hasNpmScopePolicy only for npm remote/virtual', () => {
    expect(hasNpmScopePolicy('npm', 'virtual')).toBe(true);
    expect(hasNpmScopePolicy('npm', 'remote')).toBe(true);
    expect(hasNpmScopePolicy('npm', 'local')).toBe(false);
    expect(hasNpmScopePolicy('npm', 'staging')).toBe(false);
    expect(hasNpmScopePolicy('maven', 'virtual')).toBe(false);
  });
});
