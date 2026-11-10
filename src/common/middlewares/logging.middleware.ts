import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { WinstonLoggerService } from '../services/winston-logger.service';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: WinstonLoggerService) {}

  private sanitizeRequestBody(body: any): any {
    const sanitizedBody = { ...body };

    const sensitiveFields = ['password', 'confirmPassword'];

    sensitiveFields.forEach((field) => {
      if (sanitizedBody[field]) {
        sanitizedBody[field] = '******';
      }
    });

    return sanitizedBody;
  }

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body } = req;

    // Sanitize the body (remove sensitive data like password)
    const sanitizedBody = this.sanitizeRequestBody(body);

    // Log the sanitized request body
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      this.logger.log(
        `[Request] ${method} ${originalUrl} - Body: ${JSON.stringify(sanitizedBody)}`,
      );
    } else {
      this.logger.log(`[Request] ${method} ${originalUrl}`);
    }

    // Log the response once it's sent
    res.on('finish', () => {
      const { statusCode } = res;
      this.logger.log(`[Response] ${statusCode} ${method} ${originalUrl}`);
    });

    next();
  }
}
