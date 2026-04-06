import {
  AdPilotError,
  AuthError,
  ApiError,
  ValidationError,
  ExitCode,
} from '../../src/utils/errors';

describe('AdPilotError', () => {
  it('has correct default exitCode (USER_ERROR)', () => {
    const err = new AdPilotError('test error');
    expect(err.exitCode).toBe(ExitCode.USER_ERROR);
  });

  it('accepts a custom exitCode', () => {
    const err = new AdPilotError('test', ExitCode.API_ERROR);
    expect(err.exitCode).toBe(ExitCode.API_ERROR);
  });

  it('is an instance of Error', () => {
    const err = new AdPilotError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new AdPilotError('test');
    expect(err.name).toBe('AdPilotError');
  });

  it('preserves the message', () => {
    const err = new AdPilotError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });
});

describe('AuthError', () => {
  it('has exitCode AUTH_ERROR (3)', () => {
    const err = new AuthError('no token');
    expect(err.exitCode).toBe(ExitCode.AUTH_ERROR);
    expect(err.exitCode).toBe(3);
  });

  it('is an instance of Error and AdPilotError', () => {
    const err = new AuthError('no token');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdPilotError);
  });

  it('has the correct name', () => {
    const err = new AuthError('test');
    expect(err.name).toBe('AuthError');
  });
});

describe('ApiError', () => {
  it('has exitCode API_ERROR (2)', () => {
    const err = new ApiError('api failed');
    expect(err.exitCode).toBe(ExitCode.API_ERROR);
    expect(err.exitCode).toBe(2);
  });

  it('is an instance of Error and AdPilotError', () => {
    const err = new ApiError('api failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdPilotError);
  });

  it('has the correct name', () => {
    const err = new ApiError('test');
    expect(err.name).toBe('ApiError');
  });
});

describe('ValidationError', () => {
  it('has exitCode USER_ERROR (1)', () => {
    const err = new ValidationError('bad input');
    expect(err.exitCode).toBe(ExitCode.USER_ERROR);
    expect(err.exitCode).toBe(1);
  });

  it('is an instance of Error and AdPilotError', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdPilotError);
  });

  it('has the correct name', () => {
    const err = new ValidationError('test');
    expect(err.name).toBe('ValidationError');
  });
});

describe('ExitCode enum', () => {
  it('has expected values', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.USER_ERROR).toBe(1);
    expect(ExitCode.API_ERROR).toBe(2);
    expect(ExitCode.AUTH_ERROR).toBe(3);
  });
});
