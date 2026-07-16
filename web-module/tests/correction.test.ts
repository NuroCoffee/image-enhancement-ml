import { describe, expect, it } from 'vitest';
import { applyCorrectionInPlace, parameterToFactor } from '../src/correction/applyCorrection';
import { parseModelMetadata } from '../src/ml/metadata';

const correction = parseModelMetadata({}).correction;

describe('applyCorrectionInPlace', () => {
  it('does not change RGB for neutral parameters', () => {
    const pixels = new Uint8ClampedArray([12, 100, 240, 177]);
    applyCorrectionInPlace(pixels, { brightness: 0, contrast: 0, saturation: 0 }, correction);
    expect(Array.from(pixels)).toEqual([12, 100, 240, 177]);
  });

  it('preserves alpha and clamps RGB', () => {
    const pixels = new Uint8ClampedArray([250, 5, 120, 42]);
    applyCorrectionInPlace(pixels, { brightness: 1, contrast: 1, saturation: 1 }, correction);
    expect(pixels[3]).toBe(42);
    expect([...pixels.slice(0, 3)].every((value) => value >= 0 && value <= 255)).toBe(true);
  });

  it('maps negative and positive values to reciprocal logarithmic factors', () => {
    expect(parameterToFactor(1, 2)).toBeCloseTo(2);
    expect(parameterToFactor(-1, 2)).toBeCloseTo(0.5);
  });
});
