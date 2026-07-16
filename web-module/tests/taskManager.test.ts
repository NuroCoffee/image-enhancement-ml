import { describe, expect, it, vi } from 'vitest';
import { ImageEnhancer } from '../src/api/ImageEnhancer';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../src/worker/protocol';

class FakeWorker {
  messages: MainToWorkerMessage[] = [];
  private messageListeners: Array<(event: MessageEvent<WorkerToMainMessage>) => void> = [];
  postMessage(message: MainToWorkerMessage): void { this.messages.push(message); }
  addEventListener(type: 'message' | 'error', listener: EventListener): void {
    if (type === 'message') this.messageListeners.push(listener as (event: MessageEvent<WorkerToMainMessage>) => void);
  }
  terminate = vi.fn();
  emit(message: WorkerToMainMessage): void {
    for (const listener of this.messageListeners) listener(new MessageEvent('message', { data: message }));
  }
}

describe('ImageEnhancer API', () => {
  it('returns task id immediately and resolves a result', async () => {
    const worker = new FakeWorker();
    const enhancer = new ImageEnhancer({ modelBaseUrl: 'https://example.test/model/' }, () => worker as never);
    const id = enhancer.createTask(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]));
    expect(enhancer.getStatus(id).state).toBe('queued');

    const resultPromise = enhancer.getResult(id);
    const output = new Blob(['ok'], { type: 'image/jpeg' });
    worker.emit({
      type: 'result',
      payload: {
        id,
        blob: output,
        parameters: { brightness: 0, contrast: 0, saturation: 0 },
        elapsedMs: 12,
        outputMimeType: 'image/jpeg',
      },
    });

    await expect(resultPromise).resolves.toBe(output);
    expect(enhancer.getStatus(id).state).toBe('completed');
    enhancer.dispose();
  });
});
