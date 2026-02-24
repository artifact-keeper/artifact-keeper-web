/**
 * Maps each tutorial ID to glob patterns of source files it exercises.
 * Used by content-hash.ts to detect when a tutorial needs re-recording.
 */

const SHARED_TRIGGERS = [
  'e2e/tutorials/fixtures/tutorial-helper.ts',
  'e2e/tutorials/fixtures/tutorial-seed.ts',
  'playwright-tutorials.config.ts',
  'src/app/(auth)/login/**/*',
  'src/components/layout/**/*',
];

export const TRIGGER_MAP: Record<string, string[]> = {
  '01-getting-started': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/01-getting-started.tutorial.ts',
    'src/app/(app)/(protected)/dashboard/**/*',
    'src/app/(app)/(protected)/repositories/**/*',
    'src/app/(app)/(protected)/packages/**/*',
    'src/app/(app)/(protected)/security/**/*',
    'src/app/(app)/(admin)/users/**/*',
    'src/app/(app)/(admin)/settings/**/*',
  ],
  '02-create-repositories': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/02-create-repositories.tutorial.ts',
    'src/app/(app)/(protected)/repositories/**/*',
  ],
  '03-proxy-setup': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/03-proxy-setup.tutorial.ts',
    'src/app/(app)/(protected)/repositories/**/*',
  ],
  '04-virtual-repositories': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/04-virtual-repositories.tutorial.ts',
    'src/app/(app)/(protected)/repositories/**/*',
  ],
  '05-security-quality-gates': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/05-security-quality-gates.tutorial.ts',
    'src/app/(app)/(protected)/security/**/*',
    'src/app/(app)/(protected)/quality-gates/**/*',
  ],
  '06-user-management': [
    ...SHARED_TRIGGERS,
    'e2e/tutorials/06-user-management.tutorial.ts',
    'src/app/(app)/(admin)/users/**/*',
    'src/app/(app)/(admin)/groups/**/*',
    'src/app/(app)/(admin)/permissions/**/*',
    'src/app/(app)/(admin)/access-tokens/**/*',
  ],
};
