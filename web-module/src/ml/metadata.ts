export type ResizeMode = 'letterbox' | 'center-crop';
export type NormalizationType = 'zero-one' | 'minus-one-one' | 'mean-std';
export type CorrectionOperation = 'brightness' | 'contrast' | 'saturation';

export interface ModelMetadata {
  schemaVersion: number;
  input: {
    width: number;
    height: number;
    channels: 3;
    colorOrder: 'RGB';
    resizeMode: ResizeMode;
    letterboxColor: [number, number, number];
    normalization: {
      type: NormalizationType;
      mean?: [number, number, number];
      std?: [number, number, number];
    };
  };
  output: {
    order: [CorrectionOperation, CorrectionOperation, CorrectionOperation];
    min: number;
    max: number;
  };
  correction: {
    version: 'log-factor-v1';
    operationOrder: [CorrectionOperation, CorrectionOperation, CorrectionOperation];
    maxFactors: {
      brightness: number;
      contrast: number;
      saturation: number;
    };
    contrastPivot: number;
    lumaWeights: [number, number, number];
  };
}

const DEFAULT_METADATA: ModelMetadata = {
  schemaVersion: 1,
  input: {
    width: 224,
    height: 224,
    channels: 3,
    colorOrder: 'RGB',
    resizeMode: 'center-crop',
    letterboxColor: [0, 0, 0],
    normalization: { type: 'zero-one' },
  },
  output: {
    order: ['brightness', 'contrast', 'saturation'],
    min: -1,
    max: 1,
  },
  correction: {
    version: 'log-factor-v1',
    operationOrder: ['brightness', 'contrast', 'saturation'],
    maxFactors: { brightness: 2, contrast: 2, saturation: 2 },
    contrastPivot: 0.5,
    lumaWeights: [0.2126, 0.7152, 0.0722],
  },
};

export async function loadModelMetadata(url: string): Promise<ModelMetadata> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить model_metadata.json (${response.status}).`);
  }
  const raw = (await response.json()) as unknown;
  return parseModelMetadata(raw);
}

export function parseModelMetadata(raw: unknown): ModelMetadata {
  if (!isObject(raw)) throw new Error('model_metadata.json должен содержать JSON-объект.');

  const input = isObject(raw.input) ? raw.input : {};
  const output = isObject(raw.output) ? raw.output : {};
  const correction = isObject(raw.correction) ? raw.correction : {};
  const normalization = isObject(input.normalization) ? input.normalization : {};
  const maxFactors = isObject(correction.maxFactors) ? correction.maxFactors : {};

  const inputSize = Array.isArray(raw.input_size) ? raw.input_size : undefined;
  const width = positiveInteger(input.width ?? inputSize?.[1] ?? DEFAULT_METADATA.input.width, 'input.width');
  const height = positiveInteger(input.height ?? inputSize?.[0] ?? DEFAULT_METADATA.input.height, 'input.height');
  const resizeMode = normalizeResizeMode(input.resizeMode ?? raw.resize_mode ?? DEFAULT_METADATA.input.resizeMode);
  const normalizationType = normalizeNormalization(
    normalization.type ?? raw.normalization ?? DEFAULT_METADATA.input.normalization.type,
  );

  const parsed: ModelMetadata = {
    schemaVersion: numberOr(raw.schemaVersion ?? raw.schema_version, 1),
    input: {
      width,
      height,
      channels: 3,
      colorOrder: 'RGB',
      resizeMode,
      letterboxColor: rgbTuple(input.letterboxColor ?? raw.letterbox_color, [0, 0, 0]),
      normalization: {
        type: normalizationType,
        mean: normalizationType === 'mean-std'
          ? unitTuple(normalization.mean ?? raw.mean, 'normalization.mean')
          : undefined,
        std: normalizationType === 'mean-std'
          ? positiveTuple(normalization.std ?? raw.std, 'normalization.std')
          : undefined,
      },
    },
    output: {
      order: operationTuple(output.order ?? raw.output_order, DEFAULT_METADATA.output.order),
      min: numberOr(output.min ?? raw.output_min, -1),
      max: numberOr(output.max ?? raw.output_max, 1),
    },
    correction: {
      version: 'log-factor-v1',
      operationOrder: operationTuple(
        correction.operationOrder ?? raw.operation_order,
        DEFAULT_METADATA.correction.operationOrder,
      ),
      maxFactors: {
        brightness: positiveNumber(maxFactors.brightness, 2, 'maxFactors.brightness'),
        contrast: positiveNumber(maxFactors.contrast, 2, 'maxFactors.contrast'),
        saturation: positiveNumber(maxFactors.saturation, 2, 'maxFactors.saturation'),
      },
      contrastPivot: boundedNumber(correction.contrastPivot, 0.5, 0, 1, 'contrastPivot'),
      lumaWeights: positiveTuple(
        correction.lumaWeights,
        'lumaWeights',
        DEFAULT_METADATA.correction.lumaWeights,
      ),
    },
  };

  if (parsed.output.min >= parsed.output.max) throw new Error('output.min должен быть меньше output.max.');
  return parsed;
}

function normalizeResizeMode(value: unknown): ResizeMode {
  if (value === 'letterbox' || value === 'padding' || value === 'pad') return 'letterbox';
  if (value === 'center-crop' || value === 'center_crop' || value === 'crop') return 'center-crop';
  throw new Error(`Неизвестный resizeMode: ${String(value)}.`);
}

function normalizeNormalization(value: unknown): NormalizationType {
  if (value === 'zero-one' || value === 'zero_one' || value === '0_1') return 'zero-one';
  if (value === 'minus-one-one' || value === 'minus_one_one' || value === '-1_1') return 'minus-one-one';
  if (value === 'mean-std' || value === 'mean_std') return 'mean-std';
  throw new Error(`Неизвестная нормализация: ${String(value)}.`);
}

function operationTuple(value: unknown, fallback: ModelMetadata['output']['order']): ModelMetadata['output']['order'] {
  const candidate = Array.isArray(value) ? value : fallback;
  if (candidate.length !== 3) throw new Error('Порядок параметров должен содержать три элемента.');
  const allowed = new Set(['brightness', 'contrast', 'saturation']);
  if (!candidate.every((item) => allowed.has(String(item)))) throw new Error('Некорректный порядок параметров.');
  if (new Set(candidate).size !== 3) throw new Error('Параметры в порядке не должны повторяться.');
  return candidate as ModelMetadata['output']['order'];
}

function rgbTuple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  if (value.length !== 3) throw new Error('RGB-кортеж должен содержать три значения.');
  return value.map((item) => boundedNumber(item, 0, 0, 255, 'RGB')) as [number, number, number];
}

function unitTuple(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} должен содержать три значения.`);
  return value.map((item) => boundedNumber(item, 0, -10, 10, label)) as [number, number, number];
}

function positiveTuple(
  value: unknown,
  label: string,
  fallback?: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value)) {
    if (fallback) return fallback;
    throw new Error(`${label} должен содержать три значения.`);
  }
  if (value.length !== 3) throw new Error(`${label} должен содержать три значения.`);
  return value.map((item) => positiveNumber(item, NaN, label)) as [number, number, number];
}

function positiveInteger(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${label} должен быть положительным целым.`);
  return result;
}

function positiveNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} должен быть положительным числом.`);
  return result;
}

function numberOr(value: unknown, fallback: number): number {
  const result = Number(value ?? fallback);
  if (!Number.isFinite(result)) throw new Error('Ожидалось конечное число.');
  return result;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const result = Number(value ?? fallback);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${label} должен находиться в диапазоне [${min}, ${max}].`);
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
