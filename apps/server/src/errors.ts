export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 500,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, "bad_request", message, details);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, "not_found", message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, "conflict", message);
}
