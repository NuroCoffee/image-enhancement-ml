export type TaskId = string;

export type ProcessingStage =
  | 'decoding'
  | 'preprocessing'
  | 'inference'
  | 'correction'
  | 'encoding';

export type TaskState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type OutputFormat = 'auto' | 'jpeg' | 'png';

export interface TaskOptions {
  outputFormat?: OutputFormat;
}

export interface CorrectionParameters {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface TaskStatus {
  id: TaskId;
  state: TaskState;
  stage?: ProcessingStage;
  progress: number;
  error?: string;
  parameters?: CorrectionParameters;
  elapsedMs?: number;
  outputMimeType?: 'image/jpeg' | 'image/png';
}

export interface ImageEnhancerOptions {
  modelBaseUrl?: string;
  maxFileBytes?: number;
  maxPixels?: number;
  maxProcessingMs?: number;
}

export interface ImageEnhancerApi {
  createTask(file: File | Blob, options?: TaskOptions): TaskId;
  getStatus(id: TaskId): TaskStatus;
  cancelTask(id: TaskId): Promise<boolean>;
  getResult(id: TaskId): Promise<Blob>;
}

export interface StatusChangeEvent extends CustomEvent<TaskStatus> {
  readonly type: 'statuschange';
}
