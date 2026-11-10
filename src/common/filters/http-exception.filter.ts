// src/common/filters/http-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let data: any = null; // Default data is null

    // This is the new, smarter logic
    if (
      status === HttpStatus.BAD_REQUEST &&
      (exceptionResponse as any).validationErrors
    ) {
      // If it's a 400 error and has our custom 'validationErrors' key,
      // we know it came from our ZodValidationPipe.
      message = (exceptionResponse as any).message || 'Validation failed';
      data = (exceptionResponse as any).validationErrors; // Put the details in the data payload
    } else {
      // This handles all other HttpExceptions in the standard way
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message ||
            'An unexpected error occurred';
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      data: data, // The data will be null for general errors, or the validation object for Zod errors
    });
  }
}
