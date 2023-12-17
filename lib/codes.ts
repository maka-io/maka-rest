import { StatusCodes, getReasonPhrase } from 'http-status-codes';
export interface StatusResponse {
  statusCode: number;
  status: string;
  body: any;
  headers?: Record<string, string>;
  extra?: any;
}
class Codes {
  static generateResponse(statusCode: number, body: any, extra?: any, headers?: Record<string, string>): StatusResponse {
    const response: StatusResponse = {
      statusCode,
      status: getReasonPhrase(statusCode),
      body,
      headers: headers || {}
    };
    if (extra) {
      response.extra = extra;
    }
    return response;
  }

  static continue100(body = 'No Content', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.CONTINUE, body, extra, headers);
  }

  static success200(body = {}, extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.OK, body, extra, headers);
  }

  static success201(body = 'Created', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.CREATED, body, extra, headers);
  }

  static success205(body = 'No Content', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.RESET_CONTENT, body, extra, headers);
  }

  static movedPermanently301(redirectUrl: string, extra?: any, headers?: Record<string, string>): StatusResponse {
    headers = headers || {};
    headers['Location'] = redirectUrl;  // Setting the Location header for the redirect

    return this.generateResponse(StatusCodes.MOVED_PERMANENTLY, {}, extra, headers);
  }

  static badRequest400(body = 'Bad Request', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.BAD_REQUEST, body, extra, headers);
  }

  static unauthorized401(body = 'Unauthorized', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.UNAUTHORIZED, body, extra, headers);
  }

  static forbidden403(body = 'Forbidden', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.FORBIDDEN, body, extra, headers);
  }

  static notFound404(body = 'Not Found', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.NOT_FOUND, body, extra, headers);
  }

  static notAllowed405(body = 'Not Allowed', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.METHOD_NOT_ALLOWED, body, extra, headers);
  }

  static unsupported415(body = 'Unsupported', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.UNSUPPORTED_MEDIA_TYPE, body, extra, headers);
  }

  static serverError500(body = 'Server Error', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.INTERNAL_SERVER_ERROR, body, extra, headers);
  }

  static tooManyRequests429(body = 'Too Many Requests', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.TOO_MANY_REQUESTS, body, extra, headers);
  }
}

export default Codes;
