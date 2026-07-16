/// <reference lib="webworker" />

import type { CorrectionParameters, TaskStatus } from '../api/types';
import { applyCorrectionInPlace } from '../correction/applyCorrection';
import { decodeImage } from '../image/decode';
import { encodeCanvas } from '../image/encode';
import { probeEncodedDimensions } from '../image/probeDimensions';
import { validateDimensions, validateEncodedFile } from '../image/validation';
import { ModelRunner } from '../ml/ModelRunner';
import { preprocessCanvas } from '../ml/preprocessing';
import { CancelledError, ProcessingTimeoutError, toErrorMessage } from '../utils/errors';
import type {
  EnqueuePayload,
  MainToWorkerMessage,
  WorkerConfigurePayload,
  WorkerToMainMessage,
} from './protocol';

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const queue: EnqueuePayload[] = [];
const cancelled = new Set<string>();
let config: WorkerConfigurePayload | undefined;
let current: EnqueuePayload | undefined;
let modelRunner: ModelRunner | undefined;
let processing = false;

context.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  if (message.type === 'configure') {
    config = message.payload;
    modelRunner?.dispose();
    modelRunner = new ModelRunner(config.modelUrl, config.metadataUrl);
    post({ type: 'ready', payload: { configured: true } });
    void processQueue();
    return;
  }

  if (message.type === 'enqueue') {
    queue.push(message.payload);
    postStatus({ id: message.payload.id, state: 'queued', progress: 0 });
    void processQueue();
    return;
  }

  const queuedIndex = queue.findIndex((task) => task.id === message.payload.id);
  if (queuedIndex >= 0) {
    queue.splice(queuedIndex, 1);
    postStatus({ id: message.payload.id, state: 'cancelled', progress: 0 });
    post({ type: 'cancelled', payload: { requestId: message.payload.requestId, success: true } });
    return;
  }
  if (current?.id === message.payload.id) {
    cancelled.add(message.payload.id);
    post({ type: 'cancelled', payload: { requestId: message.payload.requestId, success: true } });
    return;
  }
  post({ type: 'cancelled', payload: { requestId: message.payload.requestId, success: false } });
});

async function processQueue(): Promise<void> {
  if (processing || !config || !modelRunner) return;
  processing = true;
  try {
    while ((current = queue.shift())) {
      await processTask(current, config, modelRunner);
      cancelled.delete(current.id);
    }
  } finally {
    current = undefined;
    processing = false;
  }
}

async function processTask(
  task: EnqueuePayload,
  taskConfig: WorkerConfigurePayload,
  runner: ModelRunner,
): Promise<void> {
  const startedAt = performance.now();
  let decoded: Awaited<ReturnType<typeof decodeImage>> | undefined;
  try {
    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'decoding', 1);
    const format = await validateEncodedFile(task.file, taskConfig.maxFileBytes);
    const probedDimensions = await probeEncodedDimensions(task.file, format);
    if (probedDimensions) {
      validateDimensions(probedDimensions.width, probedDimensions.height, taskConfig.maxPixels);
    }
    postProgress(task.id, 'decoding', 5);
    decoded = await decodeImage(task.file, format, taskConfig.maxPixels);
    validateDimensions(decoded.width, decoded.height, taskConfig.maxPixels);
    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'decoding', 15);

    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const canvasContext = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true,
    });
    if (!canvasContext) throw new Error('2D canvas context is unavailable.');
    if (decoded.source instanceof ImageBitmap) {
      canvasContext.drawImage(decoded.source, 0, 0);
    } else {
      canvasContext.putImageData(decoded.source, 0, 0);
    }
    decoded.close();
    decoded = undefined;

    postProgress(task.id, 'preprocessing', 16);
    await runner.initialize();
    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    const metadata = runner.getMetadata();
    const modelInput = preprocessCanvas(canvas, metadata);
    postProgress(task.id, 'preprocessing', 25);

    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'inference', 27);
    const parameters = await runner.predict(modelInput);
    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'inference', 40, parameters);

    const hasTransparency = await correctCanvasInStrips(
      task.id,
      canvas,
      parameters,
      metadata.correction,
      startedAt,
      taskConfig.maxProcessingMs,
    );

    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'encoding', 92, parameters);
    const outputMimeType = chooseOutputMimeType(task.options.outputFormat, hasTransparency);
    const blob = await encodeCanvas(canvas, outputMimeType);
    checkpoint(task.id, startedAt, taskConfig.maxProcessingMs);
    postProgress(task.id, 'encoding', 99, parameters);

    post({
      type: 'result',
      payload: {
        id: task.id,
        blob,
        parameters,
        elapsedMs: Math.round(performance.now() - startedAt),
        outputMimeType,
      },
    });
  } catch (error) {
    if (error instanceof CancelledError) {
      postStatus({ id: task.id, state: 'cancelled', progress: 0 });
    } else {
      postStatus({
        id: task.id,
        state: 'failed',
        progress: 0,
        error: toErrorMessage(error),
      });
    }
  } finally {
    decoded?.close();
  }
}

async function correctCanvasInStrips(
  taskId: string,
  canvas: OffscreenCanvas,
  parameters: CorrectionParameters,
  metadata: Parameters<typeof applyCorrectionInPlace>[2],
  startedAt: number,
  maxProcessingMs: number,
): Promise<boolean> {
  const context2d = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  });
  if (!context2d) throw new Error('2D canvas context is unavailable.');

  const stripHeight = chooseStripHeight(canvas.width);
  let hasTransparency = false;
  for (let y = 0; y < canvas.height; y += stripHeight) {
    checkpoint(taskId, startedAt, maxProcessingMs);
    const height = Math.min(stripHeight, canvas.height - y);
    const imageData = context2d.getImageData(0, y, canvas.width, height);
    const result = applyCorrectionInPlace(imageData.data, parameters, metadata);
    hasTransparency ||= result.hasTransparency;
    context2d.putImageData(imageData, 0, y);
    const fraction = (y + height) / canvas.height;
    postProgress(taskId, 'correction', 40 + Math.round(fraction * 50), parameters);
    await yieldControl();
  }
  return hasTransparency;
}

function chooseStripHeight(width: number): number {
  // Keep one temporary strip near or below 8 MiB.
  return Math.max(16, Math.min(256, Math.floor((8 * 1024 * 1024) / (width * 4))));
}

function checkpoint(taskId: string, startedAt: number, maxProcessingMs: number): void {
  if (cancelled.has(taskId)) throw new CancelledError();
  if (performance.now() - startedAt > maxProcessingMs) throw new ProcessingTimeoutError();
}

function postProgress(
  id: string,
  stage: TaskStatus['stage'],
  progress: number,
  parameters?: CorrectionParameters,
): void {
  postStatus({ id, state: 'processing', stage, progress, parameters });
}

function postStatus(status: TaskStatus): void {
  post({ type: 'status', payload: status });
}

function post(message: WorkerToMainMessage): void {
  context.postMessage(message);
}

function chooseOutputMimeType(
  outputFormat: 'auto' | 'jpeg' | 'png',
  hasTransparency: boolean,
): 'image/jpeg' | 'image/png' {
  if (outputFormat === 'png') return 'image/png';
  if (outputFormat === 'jpeg') return 'image/jpeg';
  return hasTransparency ? 'image/png' : 'image/jpeg';
}

function yieldControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
