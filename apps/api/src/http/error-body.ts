import { errorMessage } from '@dawaa/shared';

export type ErrorBody = {
  code: string;
  message: string;
  messageKey: string;
  details: unknown;
};

export function toErrorBody(code: string, acceptLanguage: string | undefined, details: unknown = null): ErrorBody {
  return {
    code,
    message: errorMessage(code, acceptLanguage),
    messageKey: `errors.${code}`,
    details,
  };
}
