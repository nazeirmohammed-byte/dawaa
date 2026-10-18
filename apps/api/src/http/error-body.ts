import { formatErrorDetails } from '@dawaa/shared';

export type ErrorBody = {
  code: string;
  message: string;
  messageKey: string;
  details: unknown;
};

export function toErrorBody(code: string, acceptLanguage: string | undefined, details: unknown = null): ErrorBody {
  return {
    code,
    message: formatErrorDetails(code, acceptLanguage, details),
    messageKey: `errors.${code}`,
    details,
  };
}
