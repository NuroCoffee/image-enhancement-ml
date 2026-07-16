export class UserFacingError extends Error {
  constructor(message: string, readonly code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UserFacingError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Task was cancelled.');
    this.name = 'CancelledError';
  }
}

export class ProcessingTimeoutError extends Error {
  constructor() {
    super('Processing exceeded the configured time limit.');
    this.name = 'ProcessingTimeoutError';
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
