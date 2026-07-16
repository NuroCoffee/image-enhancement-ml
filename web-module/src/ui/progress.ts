import type { ProcessingStage, TaskState } from '../api/types';

const STAGE_LABELS: Record<ProcessingStage, string> = {
  decoding: 'Декодирование',
  preprocessing: 'Подготовка для CNN',
  inference: 'Запуск модели',
  correction: 'Коррекция изображения',
  encoding: 'Кодирование результата',
};

const STATE_LABELS: Record<TaskState, string> = {
  queued: 'В очереди',
  processing: 'Обработка',
  completed: 'Готово',
  cancelled: 'Отменено',
  failed: 'Ошибка',
};

export function formatStatus(state: TaskState, stage?: ProcessingStage): string {
  if (state === 'processing' && stage) return STAGE_LABELS[stage];
  return STATE_LABELS[state];
}
