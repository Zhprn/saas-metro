// src/common/interceptors/transform.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse();

    // For custom messages set via a decorator (optional, but nice to have)
    // const message = this.reflector.get<string>('response_message', context.getHandler()) || 'Success';

    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode,
        message: 'Success', // Or use the custom message from above
        data: data,
      })),
    );
  }
}
