// DUMMY: deliberately failing test to check CI failure reporting. DO NOT MERGE.
import { describe, expect, it } from 'vitest';

describe('DUMMY-002 CI failure reporting (do not merge)', () => {
  it('DUMMY-002-S1 fails on purpose (frontend)', () => {
    expect('actual').toBe('expected');
  });
});
