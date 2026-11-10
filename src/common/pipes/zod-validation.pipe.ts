import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: any, metadata: ArgumentMetadata) {
    try {
      this.schema.parse(value);
      return value;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          validationErrors: this.formatZodErrors(error.errors),
        });
      }
      throw error;
    }
  }

  private formatZodErrors(errors: any) {
    return errors.reduce((acc: any, err: any) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});
  }
}
