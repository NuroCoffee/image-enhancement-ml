import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import type { CorrectionParameters } from '../api/types';
import { loadModelMetadata, type ModelMetadata } from './metadata';

export class ModelRunner {
  private model?: GraphModel;
  private metadata?: ModelMetadata;
  private initialization?: Promise<void>;

  constructor(
    private readonly modelUrl: string,
    private readonly metadataUrl: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.initializeInternal();
    return this.initialization;
  }

  getMetadata(): ModelMetadata {
    if (!this.metadata) throw new Error('ModelRunner is not initialized.');
    return this.metadata;
  }

  async predict(input: Float32Array): Promise<CorrectionParameters> {
    await this.initialize();
    const metadata = this.getMetadata();
    const expected = metadata.input.width * metadata.input.height * 3;
    if (input.length !== expected) {
      throw new Error(`Model input length ${input.length} != ${expected}.`);
    }

    const tensor = tf.tensor4d(input, [1, metadata.input.height, metadata.input.width, 3]);
    let output: tf.Tensor | tf.Tensor[] | tf.NamedTensorMap | undefined;

    try {
      output = this.model!.predict(tensor);
      const outputTensors = collectOutputTensors(output);
      const outputTensor = outputTensors[0];
      if (!outputTensor) throw new Error('Model returned no output tensor.');

      const values = Array.from(await outputTensor.data());
      if (values.length < 3) throw new Error('Model output must contain three numbers.');

      const parameters: Partial<CorrectionParameters> = {};
      metadata.output.order.forEach((name, index) => {
        parameters[name] = clamp(values[index], metadata.output.min, metadata.output.max);
      });
      return parameters as CorrectionParameters;
    } finally {
      tensor.dispose();
      disposeOutput(output);
    }
  }

  dispose(): void {
    this.model?.dispose();
    this.model = undefined;
    this.initialization = undefined;
  }

  private async initializeInternal(): Promise<void> {
    this.metadata = await loadModelMetadata(this.metadataUrl);
    await selectBackend();

    // The ML module exports a TensorFlow SavedModel as a TF.js GraphModel.
    // loadLayersModel() cannot read this format and throws
    // "Improper config format ... 'className' and 'config' must set".
    this.model = await loadGraphModel(this.modelUrl);

    const { width, height } = this.metadata.input;
    const warmup = tf.zeros([1, height, width, 3]);
    let output: tf.Tensor | tf.Tensor[] | tf.NamedTensorMap | undefined;

    try {
      output = this.model.predict(warmup);
      const outputTensor = collectOutputTensors(output)[0];
      if (!outputTensor) throw new Error('Model warm-up returned no output tensor.');
      await outputTensor.data();
    } finally {
      warmup.dispose();
      disposeOutput(output);
    }
  }
}

async function selectBackend(): Promise<void> {
  // This exported GraphModel contains FusedMatMul with tanh.
  // TF.js WebGL 4.22 does not implement that fused activation, while CPU does.
  for (const backend of ['cpu'] as const) {
    try {
      if (await tf.setBackend(backend)) {
        await tf.ready();
        return;
      }
    } catch {
      // Try the next backend.
    }
  }
  throw new Error('TensorFlow.js CPU backend could not be initialized.');
}

function collectOutputTensors(
  output: tf.Tensor | tf.Tensor[] | tf.NamedTensorMap,
): tf.Tensor[] {
  if (Array.isArray(output)) return output;
  if (isTensor(output)) return [output];
  return Object.values(output);
}

function disposeOutput(
  output: tf.Tensor | tf.Tensor[] | tf.NamedTensorMap | undefined,
): void {
  if (!output) return;
  for (const tensor of collectOutputTensors(output)) tensor.dispose();
}

function isTensor(value: tf.Tensor | tf.NamedTensorMap): value is tf.Tensor {
  return typeof (value as tf.Tensor).data === 'function'
    && typeof (value as tf.Tensor).dispose === 'function';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) throw new Error('Model returned a non-finite value.');
  return Math.min(max, Math.max(min, value));
}
