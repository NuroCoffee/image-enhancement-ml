import type {
  CorrectionParameters,
  ImageEnhancerOptions,
  TaskId,
  TaskOptions,
  TaskStatus,
} from './types';
import type {
  MainToWorkerMessage,
  WorkerConfigurePayload,
  WorkerToMainMessage,
} from '../worker/protocol';

interface ResultWaiter {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

interface TaskRecord {
  status: TaskStatus;
  result?: Blob;
  waiters: ResultWaiter[];
}

interface WorkerLike {
  postMessage(message: MainToWorkerMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerToMainMessage>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;

const DEFAULTS = {
  maxFileBytes: 60 * 1024 * 1024,
  maxPixels: 15_000_000,
  maxProcessingMs: 30_000,
};

export class TaskManager extends EventTarget {
  private readonly records = new Map<TaskId, TaskRecord>();
  private readonly cancelRequests = new Map<string, (value: boolean) => void>();
  private readonly worker: WorkerLike;
  private disposed = false;

  constructor(options: ImageEnhancerOptions = {}, workerFactory?: WorkerFactory) {
    super();
    this.worker = (workerFactory ?? TaskManager.defaultWorkerFactory)();
    this.worker.addEventListener('message', this.handleWorkerMessage);
    this.worker.addEventListener('error', this.handleWorkerError);

    const modelBaseUrl = options.modelBaseUrl ?? new URL('model/', document.baseURI).href;
    const payload: WorkerConfigurePayload = {
      modelUrl: new URL('model.json', modelBaseUrl).href,
      metadataUrl: new URL('model_metadata.json', modelBaseUrl).href,
      maxFileBytes: options.maxFileBytes ?? DEFAULTS.maxFileBytes,
      maxPixels: options.maxPixels ?? DEFAULTS.maxPixels,
      maxProcessingMs: options.maxProcessingMs ?? DEFAULTS.maxProcessingMs,
    };
    this.worker.postMessage({ type: 'configure', payload });
  }

  private static defaultWorkerFactory(): WorkerLike {
    return new Worker(new URL('../worker/enhancer.worker.ts', import.meta.url), {
      type: 'module',
      name: 'image-enhancer-worker',
    });
  }

  createTask(file: File | Blob, options: TaskOptions = {}): TaskId {
    this.assertActive();
    const id = crypto.randomUUID();
    const status: TaskStatus = { id, state: 'queued', progress: 0 };
    this.records.set(id, { status, waiters: [] });
    this.dispatchStatus(status);

    this.worker.postMessage({
      type: 'enqueue',
      payload: {
        id,
        file,
        filename: file instanceof File ? file.name : 'image',
        options: {
          outputFormat: options.outputFormat ?? 'auto',
        },
      },
    });
    return id;
  }

  getStatus(id: TaskId): TaskStatus {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown task: ${id}`);
    return { ...record.status };
  }

  async cancelTask(id: TaskId): Promise<boolean> {
    this.assertActive();
    const record = this.records.get(id);
    if (!record) return false;
    if (isTerminal(record.status.state)) return false;

    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => {
        this.cancelRequests.delete(requestId);
        resolve(false);
      }, 5_000);

      this.cancelRequests.set(requestId, (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      });
      this.worker.postMessage({ type: 'cancel', payload: { id, requestId } });
    });
  }

  getResult(id: TaskId): Promise<Blob> {
    const record = this.records.get(id);
    if (!record) return Promise.reject(new Error(`Unknown task: ${id}`));
    if (record.result) return Promise.resolve(record.result);
    if (record.status.state === 'failed') {
      return Promise.reject(new Error(record.status.error ?? 'Task failed.'));
    }
    if (record.status.state === 'cancelled') {
      return Promise.reject(new Error('Task was cancelled.'));
    }

    return new Promise<Blob>((resolve, reject) => {
      record.waiters.push({ resolve, reject });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    for (const record of this.records.values()) {
      this.rejectWaiters(record, new Error('ImageEnhancer was disposed.'));
    }
    this.records.clear();
    for (const resolve of this.cancelRequests.values()) resolve(false);
    this.cancelRequests.clear();
  }

  private readonly handleWorkerMessage = (event: MessageEvent<WorkerToMainMessage>): void => {
    const message = event.data;
    switch (message.type) {
      case 'status':
        this.updateStatus(message.payload);
        break;
      case 'result': {
        const record = this.records.get(message.payload.id);
        if (!record) return;
        record.result = message.payload.blob;
        const completed: TaskStatus = {
          id: message.payload.id,
          state: 'completed',
          stage: 'encoding',
          progress: 100,
          parameters: message.payload.parameters,
          elapsedMs: message.payload.elapsedMs,
          outputMimeType: message.payload.outputMimeType,
        };
        record.status = completed;
        for (const waiter of record.waiters.splice(0)) waiter.resolve(message.payload.blob);
        this.dispatchStatus(completed);
        break;
      }
      case 'cancelled': {
        const resolve = this.cancelRequests.get(message.payload.requestId);
        if (resolve) {
          this.cancelRequests.delete(message.payload.requestId);
          resolve(message.payload.success);
        }
        break;
      }
      case 'ready':
        this.dispatchEvent(new CustomEvent('ready', { detail: message.payload }));
        break;
    }
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(event.message || 'Web Worker crashed.');
    for (const record of this.records.values()) {
      if (!isTerminal(record.status.state)) {
        const status: TaskStatus = {
          ...record.status,
          state: 'failed',
          error: error.message,
        };
        record.status = status;
        this.rejectWaiters(record, error);
        this.dispatchStatus(status);
      }
    }
  };

  private updateStatus(status: TaskStatus): void {
    const record = this.records.get(status.id);
    if (!record) return;
    record.status = { ...status };
    if (status.state === 'failed') {
      this.rejectWaiters(record, new Error(status.error ?? 'Task failed.'));
    } else if (status.state === 'cancelled') {
      this.rejectWaiters(record, new Error('Task was cancelled.'));
    }
    this.dispatchStatus(status);
  }

  private dispatchStatus(status: TaskStatus): void {
    this.dispatchEvent(new CustomEvent<TaskStatus>('statuschange', { detail: { ...status } }));
  }

  private rejectWaiters(record: TaskRecord, error: Error): void {
    for (const waiter of record.waiters.splice(0)) waiter.reject(error);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('ImageEnhancer is disposed.');
  }
}

function isTerminal(state: TaskStatus['state']): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'failed';
}

