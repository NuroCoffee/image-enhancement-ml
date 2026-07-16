import type { ModelMetadata } from './metadata';

export interface DrawPlan {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destinationX: number;
  destinationY: number;
  destinationWidth: number;
  destinationHeight: number;
}

export function calculateDrawPlan(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ModelMetadata['input']['resizeMode'],
): DrawPlan {
  if (mode === 'letterbox') {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const destinationWidth = sourceWidth * scale;
    const destinationHeight = sourceHeight * scale;
    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      destinationX: (targetWidth - destinationWidth) / 2,
      destinationY: (targetHeight - destinationHeight) / 2,
      destinationWidth,
      destinationHeight,
    };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const cropWidth = sourceHeight * targetRatio;
    return {
      sourceX: (sourceWidth - cropWidth) / 2,
      sourceY: 0,
      sourceWidth: cropWidth,
      sourceHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: targetWidth,
      destinationHeight: targetHeight,
    };
  }
  const cropHeight = sourceWidth / targetRatio;
  return {
    sourceX: 0,
    sourceY: (sourceHeight - cropHeight) / 2,
    sourceWidth,
    sourceHeight: cropHeight,
    destinationX: 0,
    destinationY: 0,
    destinationWidth: targetWidth,
    destinationHeight: targetHeight,
  };
}

export function preprocessCanvas(canvas: OffscreenCanvas, metadata: ModelMetadata): Float32Array {
  const { width, height, resizeMode, letterboxColor, normalization } = metadata.input;
  const target = new OffscreenCanvas(width, height);
  const context = target.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) throw new Error('2D canvas context is unavailable.');

  context.fillStyle = `rgb(${letterboxColor[0]}, ${letterboxColor[1]}, ${letterboxColor[2]})`;
  context.fillRect(0, 0, width, height);
  const plan = calculateDrawPlan(canvas.width, canvas.height, width, height, resizeMode);
  context.drawImage(
    canvas,
    plan.sourceX,
    plan.sourceY,
    plan.sourceWidth,
    plan.sourceHeight,
    plan.destinationX,
    plan.destinationY,
    plan.destinationWidth,
    plan.destinationHeight,
  );

  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Float32Array(width * height * 3);
  for (let source = 0, targetIndex = 0; source < rgba.length; source += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const unit = rgba[source + channel] / 255;
      if (normalization.type === 'zero-one') {
        rgb[targetIndex++] = unit;
      } else if (normalization.type === 'minus-one-one') {
        rgb[targetIndex++] = unit * 2 - 1;
      } else {
        rgb[targetIndex++] = (unit - normalization.mean![channel]) / normalization.std![channel];
      }
    }
  }
  return rgb;
}
