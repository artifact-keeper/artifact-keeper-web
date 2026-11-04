import { describe, it, expect } from 'vitest';
import {
  TYPE_OPTIONS,
  FORMAT_OPTIONS,
  FORMAT_GROUPS,
  FILTER_HIDDEN_FORMATS,
  formatGroupsFor,
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

  it('has unique values', () => {
    const values = FORMAT_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  // JupyterLab Extensions is a PyPI alias (artifact-keeper#3784) filed with the
  // other IDE extension formats (#833). The group drives the list-page filter;
  // the create dialog itself sorts formats alphabetically.
  it('lists JupyterLab Extensions and Agent Plugins in the Extensions group with VS Code and JetBrains', () => {
    const extensions = FORMAT_OPTIONS.filter((o) => o.group === 'Extensions').map(
      (o) => [o.value, o.label],
    );
    expect(extensions).toEqual([
      ['vscode', 'VS Code Extensions'],
      ['jetbrains', 'JetBrains Plugins'],
      ['agentplugins', 'Agent Plugins'],
      ['jupyter', 'JupyterLab Extensions'],
    ]);
  });
});

describe('MCP Registry option (artifact-keeper#5253)', () => {
  it('files MCP Registry in its own AI Agents group', () => {
    expect(FORMAT_OPTIONS.filter((o) => o.group === 'AI Agents')).toEqual([
      { value: 'mcp', label: 'MCP Registry', group: 'AI Agents' },
    ]);
  });

  it('drops the option, and its emptied group, from the filter when the backend lacks mcp', () => {
    expect(formatGroupsFor(true)).toBe(FORMAT_GROUPS);
    const groups = formatGroupsFor(false);
    expect(groups.map(([g]) => g)).not.toContain('AI Agents');
    expect(groups.flatMap(([, o]) => o.map((x) => x.value))).not.toContain('mcp');
    expect(groups.find(([g]) => g === 'Core')?.[1]).toEqual(
      FORMAT_GROUPS.find(([g]) => g === 'Core')?.[1],
    );
  });
});

describe('FORMAT_GROUPS', () => {
  it('groups every format option except the filter-hidden aliases by group name', () => {
    const totalFromGroups = FORMAT_GROUPS.reduce(
      (sum, [, opts]) => sum + opts.length,
      0
    );
    expect(totalFromGroups).toBe(FORMAT_OPTIONS.length - FILTER_HIDDEN_FORMATS.size);
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

  it('hasNpmScopePolicy only for npm remote', () => {
    expect(hasNpmScopePolicy('npm', 'remote')).toBe(true);
    expect(hasNpmScopePolicy('npm', 'local')).toBe(false);
    expect(hasNpmScopePolicy('npm', 'staging')).toBe(false);
    expect(hasNpmScopePolicy('maven', 'remote')).toBe(false);
  });

  // The policy is stored on each Remote *member*, not on the aggregate. The
  // backend rejects a write against a virtual repo, which made every npm
  // virtual create fail with a 400 (artifact-keeper-web#745).
  it('hasNpmScopePolicy excludes npm virtual repositories', () => {
    expect(hasNpmScopePolicy('npm', 'virtual')).toBe(false);
  });
});


describe("GitHub mirror format options", () => {
  it.each(["github", "mise", "aqua"])("offers %s as a distinct format", (value) => {
    expect(FORMAT_OPTIONS.filter((option) => option.value === value)).toHaveLength(1);
  });
});

// Gradle is served by the Maven handler and Gradle clients use Maven
// repositories, so a separate "Gradle" entry in the list filter matched
// nothing (#814). It stays a format the create dialog can pick.
describe('format filter vs create picker (#814)', () => {
  const filterValues = FORMAT_GROUPS.flatMap(([, options]) => options.map((o) => o.value));

  it('does not offer Gradle as a separate filter option', () => {
    expect(filterValues).not.toContain('gradle');
  });

  it('still offers Maven in the filter', () => {
    expect(filterValues).toContain('maven');
  });

  it('keeps Gradle in the create-dialog format list', () => {
    expect(FORMAT_OPTIONS.map((o) => o.value)).toContain('gradle');
  });

  it('leaves out only Gradle from the filter', () => {
    const missing = FORMAT_OPTIONS.map((o) => o.value).filter((v) => !filterValues.includes(v));
    expect(missing).toEqual(['gradle']);
  });
});
