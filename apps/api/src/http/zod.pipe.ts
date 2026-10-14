import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainError } from './domain-error';
import { fieldsFromZod } from './field-errors';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 400, { fields: fieldsFromZod(parsed.error) });
    }
    return parsed.data;
  }
}
