import { TaskManager, type WorkerFactory } from './TaskManager';
import type {
  ImageEnhancerApi,
  ImageEnhancerOptions,
  TaskId,
  TaskOptions,
  TaskStatus,
} from './types';

export class ImageEnhancer extends EventTarget implements ImageEnhancerApi {
  private readonly manager: TaskManager;

  constructor(options: ImageEnhancerOptions = {}, workerFactory?: WorkerFactory) {
    super();
    this.manager = new TaskManager(options, workerFactory);
    this.manager.addEventListener('statuschange', this.forwardStatus);
    this.manager.addEventListener('ready', this.forwardReady);
  }

  createTask(file: File | Blob, options?: TaskOptions): TaskId {
    return this.manager.createTask(file, options);
  }

  getStatus(id: TaskId): TaskStatus {
    return this.manager.getStatus(id);
  }

  cancelTask(id: TaskId): Promise<boolean> {
    return this.manager.cancelTask(id);
  }

  getResult(id: TaskId): Promise<Blob> {
    return this.manager.getResult(id);
  }

  dispose(): void {
    this.manager.removeEventListener('statuschange', this.forwardStatus);
    this.manager.removeEventListener('ready', this.forwardReady);
    this.manager.dispose();
  }

  private readonly forwardStatus = (event: Event): void => {
    const detail = (event as CustomEvent<TaskStatus>).detail;
    this.dispatchEvent(new CustomEvent<TaskStatus>('statuschange', { detail }));
  };

  private readonly forwardReady = (event: Event): void => {
    this.dispatchEvent(new CustomEvent('ready', { detail: (event as CustomEvent).detail }));
  };
}
