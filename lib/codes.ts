import { StatusCodes, getReasonPhrase } from 'http-status-codes';

// TODO: move this to typings
export interface StatusResponse {
  statusCode: number;
  status: string;
  data: any;
  headers?: Record<string, string>;
  extra?: any;
}

/**
 * Class containing methods to generate structured HTTP responses.
 * Each method corresponds to a specific HTTP status code.
 */
class Codes {
  /**
   * Generates a structured response object for an HTTP request.
   * @param statusCode - HTTP status code.
   * @param body - Response body.
   * @param extra - Optional additional data to include in the response.
   * @param headers - Optional HTTP headers.
   * @returns A structured response object.
   */
  private static generateResponse(statusCode: number, body: any, extra?: any, headers?: Record<string, string>): StatusResponse {
    const response: StatusResponse = {
      statusCode,
      status: getReasonPhrase(statusCode),
      data: body,
      headers: headers || {}
    };

    if (extra) {
      response.extra = extra;
    }
    return response;
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static continue100(body = 'No Content', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.CONTINUE, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static success200(body = {}, extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.OK, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static success201(body = 'Created', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.CREATED, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static success205(body = 'No Content', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.RESET_CONTENT, body, extra, headers);
  }

  /**
   * Generates a 301 Moved Permanently response, typically used for URL redirection.
   * @param redirectUrl - The URL to redirect to.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns A structured response object with 301 status.
   */
  static movedPermanently301(redirectUrl: string, extra?: any, headers?: Record<string, string>): StatusResponse {
    headers = headers || {};
    headers['Location'] = redirectUrl;  // Setting the Location header for the redirect

    return this.generateResponse(StatusCodes.MOVED_PERMANENTLY, {}, extra, headers);
  }
  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static badRequest400(body = 'Bad Request', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.BAD_REQUEST, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static unauthorized401(body = 'Unauthorized', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.UNAUTHORIZED, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static forbidden403(body = 'Forbidden', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.FORBIDDEN, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static notFound404(body = 'Not Found', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.NOT_FOUND, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static notAllowed405(body = 'Not Allowed', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.METHOD_NOT_ALLOWED, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static unsupported415(body = 'Unsupported', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.UNSUPPORTED_MEDIA_TYPE, body, extra, headers);
  }

  /**
   * Generates a 418 I'm a Teapot response.
   * @param body - Optional custom message, defaults to "I'm a teapot".
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns A structured response object with 418 status.
   */
  static teapot418(body = "I'm a teapot", extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.IM_A_TEAPOT, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static serverError500(body = 'Server Error', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.INTERNAL_SERVER_ERROR, body, extra, headers);
  }

  /**
   * @param body - Optional custom message.
   * @param extra - Optional additional data.
   * @param headers - Optional HTTP headers.
   * @returns StatusResponse structured response object.
   */
  static tooManyRequests429(body = 'Too Many Requests', extra?: any, headers?: Record<string, string>): StatusResponse {
    return this.generateResponse(StatusCodes.TOO_MANY_REQUESTS, body, extra, headers);
  }
}

export default Codes;
