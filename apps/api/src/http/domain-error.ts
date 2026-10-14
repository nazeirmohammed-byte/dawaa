export class DomainError extends Error {
  readonly details: unknown;

  constructor(
    readonly code: string,
    readonly status: number,
    details: unknown = null,
  ) {
    super(code);
    this.name = 'DomainError';
    this.details = details;
  }
}
