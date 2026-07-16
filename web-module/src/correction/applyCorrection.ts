import type { CorrectionParameters } from '../api/types';
import type { ModelMetadata } from '../ml/metadata';

export interface CorrectionResult {
  hasTransparency: boolean;
}

export function parameterToFactor(value: number, maxFactor: number): number {
  return Math.exp(value * Math.log(maxFactor));
}

export function applyCorrectionInPlace(
  rgba: Uint8ClampedArray,
  parameters: CorrectionParameters,
  metadata: ModelMetadata['correction'],
): CorrectionResult {
  const factors = {
    brightness: parameterToFactor(parameters.brightness, metadata.maxFactors.brightness),
    contrast: parameterToFactor(parameters.contrast, metadata.maxFactors.contrast),
    saturation: parameterToFactor(parameters.saturation, metadata.maxFactors.saturation),
  };
  const pivot = metadata.contrastPivot * 255;
  const [wr, wg, wb] = metadata.lumaWeights;
  let hasTransparency = false;

  for (let index = 0; index < rgba.length; index += 4) {
    let r = rgba[index];
    let g = rgba[index + 1];
    let b = rgba[index + 2];

    for (const operation of metadata.operationOrder) {
      if (operation === 'brightness') {
        r *= factors.brightness;
        g *= factors.brightness;
        b *= factors.brightness;
      } else if (operation === 'contrast') {
        r = (r - pivot) * factors.contrast + pivot;
        g = (g - pivot) * factors.contrast + pivot;
        b = (b - pivot) * factors.contrast + pivot;
      } else {
        const luminance = r * wr + g * wg + b * wb;
        r = luminance + (r - luminance) * factors.saturation;
        g = luminance + (g - luminance) * factors.saturation;
        b = luminance + (b - luminance) * factors.saturation;
      }
    }

    rgba[index] = clampByte(r);
    rgba[index + 1] = clampByte(g);
    rgba[index + 2] = clampByte(b);
    if (rgba[index + 3] < 255) hasTransparency = true;
  }
  return { hasTransparency };
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
