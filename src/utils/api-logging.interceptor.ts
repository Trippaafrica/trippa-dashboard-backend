import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { supabase } from '../auth/supabase.client';

@Injectable()
export class ApiLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const endpoint = req.originalUrl || req.url;
    const start = Date.now();

    return next.handle().pipe(
      tap(async (data) => {
        const responseTime = Date.now() - start;
        const res = context.switchToHttp().getResponse();
        await supabase.from('api_logs').insert([
          {
            endpoint,
            method,
            status_code: res.statusCode,
            response_time_ms: responseTime,
            error_message: null,
          },
        ]);
      }),
      catchError(async (err) => {
        const responseTime = Date.now() - start;
        const res = context.switchToHttp().getResponse();
        await supabase.from('api_logs').insert([
          {
            endpoint,
            method,
            status_code: res.statusCode || 500,
            response_time_ms: responseTime,
            error_message: err?.message || 'Unknown error',
          },
        ]);
        throw err;
      })
    );
  }
}
