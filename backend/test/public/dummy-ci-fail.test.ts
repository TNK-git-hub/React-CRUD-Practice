// DUMMY: deliberately failing test to check CI failure reporting. DO NOT MERGE.
import { describe, expect, it } from 'vitest';

describe('DUMMY-001 CI failure reporting (do not merge)', () => {
  it('DUMMY-001-S1 passes on purpose', () => {
    expect(2 + 2).toBe(4);
  });

  it('DUMMY-001-S2 fails on purpose (backend)', () => {
    expect(1 + 1).toBe(3);
  });
});
