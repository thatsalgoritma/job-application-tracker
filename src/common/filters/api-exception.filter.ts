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
    const uploadError = getMulterError(exception);
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : uploadError?.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : uploadError
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionBody === 'object' && exceptionBody !== null
        ? (exceptionBody as Record<string, unknown>)
        : undefined;

    const message =
      (typeof exceptionBody === 'string' && exceptionBody) ||
      uploadError?.message ||
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

function getMulterError(
  exception: unknown,
): { code: string; message: string } | undefined {
  if (
    typeof exception !== 'object' ||
    exception === null ||
    !('name' in exception) ||
    exception.name !== 'MulterError' ||
    !('code' in exception)
  ) {
    return undefined;
  }
  return {
    code: String(exception.code),
    message:
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'Import file must be 2 MB or smaller'
        : 'Uploaded file could not be processed',
  };
}
