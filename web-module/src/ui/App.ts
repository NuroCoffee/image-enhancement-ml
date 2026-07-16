import type { ImageEnhancer } from '../api/ImageEnhancer';
import type { OutputFormat, TaskStatus } from '../api/types';
import { formatStatus } from './progress';
import { PreviewUrl } from './preview';

const MAX_FILE_BYTES = 60 * 1024 * 1024;

export class App {
  private selectedFile?: File;
  private currentTaskId?: string;
  private resultBlob?: Blob;
  private readonly sourcePreview = new PreviewUrl();
  private readonly resultPreview = new PreviewUrl();

  constructor(
    private readonly root: HTMLElement,
    private readonly enhancer: ImageEnhancer,
  ) {}

  mount(): void {
    this.root.innerHTML = template();
    this.fileInput.addEventListener('change', this.handleFileInput);
    this.dropZone.addEventListener('dragover', this.handleDragOver);
    this.dropZone.addEventListener('dragleave', this.handleDragLeave);
    this.dropZone.addEventListener('drop', this.handleDrop);
    this.startButton.addEventListener('click', this.start);
    this.cancelButton.addEventListener('click', this.cancel);
    this.downloadButton.addEventListener('click', this.download);
    this.enhancer.addEventListener('statuschange', this.handleStatus);
  }

  dispose(): void {
    this.fileInput.removeEventListener('change', this.handleFileInput);
    this.dropZone.removeEventListener('dragover', this.handleDragOver);
    this.dropZone.removeEventListener('dragleave', this.handleDragLeave);
    this.dropZone.removeEventListener('drop', this.handleDrop);
    this.startButton.removeEventListener('click', this.start);
    this.cancelButton.removeEventListener('click', this.cancel);
    this.downloadButton.removeEventListener('click', this.download);
    this.enhancer.removeEventListener('statuschange', this.handleStatus);
    this.sourcePreview.clear();
    this.resultPreview.clear();
  }

  private readonly handleFileInput = (): void => {
    const file = this.fileInput.files?.[0];
    if (file) this.selectFile(file);
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
    this.dropZone.classList.add('drop-zone--active');
  };

  private readonly handleDragLeave = (): void => {
    this.dropZone.classList.remove('drop-zone--active');
  };

  private readonly handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.dropZone.classList.remove('drop-zone--active');
    const file = event.dataTransfer?.files[0];
    if (file) this.selectFile(file);
  };

  private selectFile(file: File): void {
    this.resetResult();
    this.selectedFile = file;
    this.filename.textContent = file.name;
    this.fileMeta.textContent = `${formatBytes(file.size)} · ${file.type || 'тип будет определён по сигнатуре'}`;
    this.errorBox.hidden = true;
    this.startButton.disabled = file.size === 0 || file.size > MAX_FILE_BYTES;

    const url = this.sourcePreview.set(file);
    this.sourceImage.src = url;
    this.sourceImage.hidden = false;
    this.sourcePlaceholder.hidden = true;
    this.sourceImage.onerror = () => {
      this.sourceImage.hidden = true;
      this.sourcePlaceholder.hidden = false;
      this.sourcePlaceholder.textContent = 'Предпросмотр формата недоступен браузеру. Worker всё равно попробует декодировать файл.';
    };

    if (file.size > MAX_FILE_BYTES) {
      this.showError('Файл превышает лимит 60 МБ.');
    }
  }

  private readonly start = (): void => {
    if (!this.selectedFile || this.currentTaskId) return;
    this.resetResult();
    this.errorBox.hidden = true;
    this.currentTaskId = this.enhancer.createTask(this.selectedFile, {
      outputFormat: this.outputSelect.value as OutputFormat,
    });
    this.startButton.disabled = true;
    this.cancelButton.disabled = false;
    this.progressContainer.hidden = false;
  };

  private readonly cancel = async (): Promise<void> => {
    if (!this.currentTaskId) return;
    this.cancelButton.disabled = true;
    const accepted = await this.enhancer.cancelTask(this.currentTaskId);
    if (!accepted) this.cancelButton.disabled = false;
  };

  private readonly handleStatus = async (event: Event): Promise<void> => {
    const status = (event as CustomEvent<TaskStatus>).detail;
    if (status.id !== this.currentTaskId) return;

    this.progressBar.value = status.progress;
    this.progressBar.setAttribute('aria-valuenow', String(status.progress));
    this.progressPercent.textContent = `${Math.round(status.progress)}%`;
    this.stageLabel.textContent = formatStatus(status.state, status.stage);

    if (status.parameters) {
      this.parameters.hidden = false;
      this.parameters.textContent = [
        `brightness: ${status.parameters.brightness.toFixed(3)}`,
        `contrast: ${status.parameters.contrast.toFixed(3)}`,
        `saturation: ${status.parameters.saturation.toFixed(3)}`,
      ].join(' · ');
    }

    if (status.state === 'completed') {
      this.cancelButton.disabled = true;
      this.currentTaskId = undefined;
      try {
        this.resultBlob = await this.enhancer.getResult(status.id);
        this.resultImage.src = this.resultPreview.set(this.resultBlob);
        this.resultImage.hidden = false;
        this.resultPlaceholder.hidden = true;
        this.downloadButton.disabled = false;
        this.processingTime.textContent = status.elapsedMs
          ? `Время: ${(status.elapsedMs / 1000).toFixed(2)} с`
          : '';
      } catch (error) {
        this.showError(error instanceof Error ? error.message : String(error));
      }
      this.startButton.disabled = !this.selectedFile;
    } else if (status.state === 'failed') {
      this.currentTaskId = undefined;
      this.cancelButton.disabled = true;
      this.startButton.disabled = !this.selectedFile;
      this.showError(status.error ?? 'Неизвестная ошибка.');
    } else if (status.state === 'cancelled') {
      this.currentTaskId = undefined;
      this.cancelButton.disabled = true;
      this.startButton.disabled = !this.selectedFile;
    }
  };

  private readonly download = (): void => {
    if (!this.resultBlob || !this.selectedFile) return;
    const extension = this.resultBlob.type === 'image/png' ? 'png' : 'jpg';
    const base = this.selectedFile.name.replace(/\.[^.]+$/, '') || 'enhanced';
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(this.resultBlob);
    anchor.download = `${base}-enhanced.${extension}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  };

  private resetResult(): void {
    this.resultBlob = undefined;
    this.resultPreview.clear();
    this.resultImage.removeAttribute('src');
    this.resultImage.hidden = true;
    this.resultPlaceholder.hidden = false;
    this.downloadButton.disabled = true;
    this.parameters.hidden = true;
    this.processingTime.textContent = '';
    this.progressBar.value = 0;
    this.progressPercent.textContent = '0%';
  }

  private showError(message: string): void {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
  }

  private get fileInput(): HTMLInputElement { return this.query('#file-input'); }
  private get dropZone(): HTMLElement { return this.query('#drop-zone'); }
  private get filename(): HTMLElement { return this.query('#filename'); }
  private get fileMeta(): HTMLElement { return this.query('#file-meta'); }
  private get sourceImage(): HTMLImageElement { return this.query('#source-image'); }
  private get sourcePlaceholder(): HTMLElement { return this.query('#source-placeholder'); }
  private get resultImage(): HTMLImageElement { return this.query('#result-image'); }
  private get resultPlaceholder(): HTMLElement { return this.query('#result-placeholder'); }
  private get outputSelect(): HTMLSelectElement { return this.query('#output-format'); }
  private get startButton(): HTMLButtonElement { return this.query('#start-button'); }
  private get cancelButton(): HTMLButtonElement { return this.query('#cancel-button'); }
  private get downloadButton(): HTMLButtonElement { return this.query('#download-button'); }
  private get progressContainer(): HTMLElement { return this.query('#progress-container'); }
  private get progressBar(): HTMLProgressElement { return this.query('#progress-bar'); }
  private get progressPercent(): HTMLElement { return this.query('#progress-percent'); }
  private get stageLabel(): HTMLElement { return this.query('#stage-label'); }
  private get parameters(): HTMLElement { return this.query('#parameters'); }
  private get processingTime(): HTMLElement { return this.query('#processing-time'); }
  private get errorBox(): HTMLElement { return this.query('#error-box'); }

  private query<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    return element;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function template(): string {
  return `
    <main class="shell">
      <header class="header">
        <div class="header-copy">
          <p class="eyebrow">ML based image enhancement</p>
          <h1>Улучшение<br />изображений</h1>
          <p class="subtitle">Локально работающая свёрточная нейронная сеть улучшает изображение по 3-ём параметрам: яркость, контрастность и насыщенность.</p>
        </div>
      </header>

      <section class="panel upload-panel">
        <div class="section-label"><span>01</span> Входной файл</div>
        <label id="drop-zone" class="drop-zone" for="file-input">
          <input id="file-input" type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.bmp,image/jpeg,image/png,image/heic,image/heif,image/bmp" />
          <span class="drop-zone__title">Выберите файл или перетащите его сюда</span>
          <span class="drop-zone__hint">JPG / PNG / HEIC / BMP · до 60 МБ · до 15 Мп</span>
        </label>
        <div class="file-info">
          <strong id="filename">Файл не выбран</strong>
          <span id="file-meta">Ожидание входных данных</span>
        </div>
      </section>

      <section class="preview-grid">
        <article class="panel preview-card">
          <div class="section-label"><span>02</span> Исходник</div>
          <div class="preview-frame">
            <img id="source-image" alt="Исходное изображение" hidden />
            <p id="source-placeholder">Здесь появится исходное изображение.</p>
          </div>
        </article>
        <article class="panel preview-card preview-card--result">
          <div class="section-label"><span>03</span> Результат</div>
          <div class="preview-frame">
            <img id="result-image" alt="Обработанное изображение" hidden />
            <p id="result-placeholder">Результат появится после обработки.</p>
          </div>
        </article>
      </section>

      <section class="panel controls">
        <div class="control-field">
          <label for="output-format">Формат результата</label>
          <select id="output-format">
            <option value="auto">Автоматически</option>
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
          </select>
          <small class="control-hint">JPG сохраняется с максимальным качеством.</small>
        </div>
        <div class="actions">
          <button id="start-button" class="button button--primary" disabled>Запустить обработку</button>
          <button id="cancel-button" class="button" disabled>Отменить</button>
          <button id="download-button" class="button" disabled>Скачать</button>
        </div>
      </section>

      <section id="progress-container" class="panel progress-panel" hidden>
        <div class="section-label"><span>04</span> Выполнение</div>
        <div class="progress-heading">
          <strong id="stage-label">Ожидание</strong>
          <span id="progress-percent">0%</span>
        </div>
        <progress id="progress-bar" max="100" value="0" aria-label="Прогресс обработки"></progress>
        <div class="runtime-data">
          <p id="parameters" class="parameters" hidden></p>
          <p id="processing-time" class="processing-time"></p>
        </div>
      </section>

      <div id="error-box" class="error-box" role="alert" hidden></div>

    </main>
  `;
}
