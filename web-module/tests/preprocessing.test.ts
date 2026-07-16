import { describe, expect, it } from 'vitest';
import { calculateDrawPlan } from '../src/ml/preprocessing';

describe('calculateDrawPlan', () => {
  it('letterboxes without stretching', () => {
    const plan = calculateDrawPlan(400, 200, 224, 224, 'letterbox');
    expect(plan.destinationWidth).toBeCloseTo(224);
    expect(plan.destinationHeight).toBeCloseTo(112);
    expect(plan.destinationY).toBeCloseTo(56);
  });

  it('center-crops a wide image', () => {
    const plan = calculateDrawPlan(400, 200, 224, 224, 'center-crop');
    expect(plan.sourceWidth).toBe(200);
    expect(plan.sourceX).toBe(100);
    expect(plan.destinationWidth).toBeCloseTo(224);
  });
});
