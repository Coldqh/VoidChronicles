import { describe, expect, it } from 'vitest';
import {
  recomputeSystemFromSettlements,
  settlementShortages,
  simulateSettlementCycle
} from '../simulation/economy';

describe('economy compatibility exports', () => {
  it('keeps the settlement API required by kernel trade and migration', () => {
    expect(typeof recomputeSystemFromSettlements).toBe('function');
    expect(typeof settlementShortages).toBe('function');
    expect(typeof simulateSettlementCycle).toBe('function');
  });
});
