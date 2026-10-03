import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  error: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionBody === 'object' && exceptionBody !== null
        ? (exceptionBody as Record<string, unknown>)
        : undefined;

    const message =
      (typeof exceptionBody === 'string' && exceptionBody) ||
      (typeof body?.message === 'string' || Array.isArray(body?.message)
        ? (body.message as string | string[])
        : 'Internal server error');
    const error =
      typeof body?.error === 'string'
        ? body.error
        : (HttpStatus[statusCode] ?? 'Internal Server Error');

    const errorBody: ErrorBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error,
    };

    response.status(statusCode).json(errorBody);
  }
}
