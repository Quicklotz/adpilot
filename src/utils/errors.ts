export enum ExitCode {
  SUCCESS = 0,
  USER_ERROR = 1,
  API_ERROR = 2,
  AUTH_ERROR = 3,
}

export class AdPilotError extends Error {
  public readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = ExitCode.USER_ERROR) {
    super(message);
    this.name = 'AdPilotError';
    this.exitCode = exitCode;
  }
}

export class AuthError extends AdPilotError {
  constructor(message: string) {
    super(message, ExitCode.AUTH_ERROR);
    this.name = 'AuthError';
  }
}

export class ApiError extends AdPilotError {
  constructor(message: string) {
    super(message, ExitCode.API_ERROR);
    this.name = 'ApiError';
  }
}

export class ValidationError extends AdPilotError {
  constructor(message: string) {
    super(message, ExitCode.USER_ERROR);
    this.name = 'ValidationError';
  }
}
