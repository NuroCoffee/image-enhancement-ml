import type { CorrectionParameters, TaskId, TaskOptions, TaskStatus } from '../api/types';

export interface WorkerConfigurePayload {
  modelUrl: string;
  metadataUrl: string;
  maxFileBytes: number;
  maxPixels: number;
  maxProcessingMs: number;
}

export interface EnqueuePayload {
  id: TaskId;
  file: Blob;
  filename: string;
  options: Required<TaskOptions>;
}

export type MainToWorkerMessage =
  | { type: 'configure'; payload: WorkerConfigurePayload }
  | { type: 'enqueue'; payload: EnqueuePayload }
  | { type: 'cancel'; payload: { id: TaskId; requestId: string } };

export type WorkerToMainMessage =
  | { type: 'ready'; payload: { configured: true } }
  | { type: 'status'; payload: TaskStatus }
  | {
      type: 'result';
      payload: {
        id: TaskId;
        blob: Blob;
        parameters: CorrectionParameters;
        elapsedMs: number;
        outputMimeType: 'image/jpeg' | 'image/png';
      };
    }
  | { type: 'cancelled'; payload: { requestId: string; success: boolean } };
