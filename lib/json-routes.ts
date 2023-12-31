import { WebApp } from 'meteor/webapp';
import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

export interface RouteHandler {
  method: string;
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
}

export interface Middleware {
  (req: IncomingMessage, res: ServerResponse, next: Function): void;
}

class JsonRoutes {
  private static instance: JsonRoutes;
  private routes: RouteHandler[] = [];
  private middlewares: Middleware[] = [];
  private errorMiddlewares: Middleware[] = [];
  private responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };

  private constructor() {}

  public static getInstance(): JsonRoutes {
    if (!JsonRoutes.instance) {
      JsonRoutes.instance = new JsonRoutes();
    }
    return JsonRoutes.instance;
  }

  public static add(method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const instance = JsonRoutes.getInstance();
    if (path[0] !== '/') {
      path = '/' + path;
    }
    instance.routes.push({ method, path, handler });
  }

  public static use(middleware: Middleware) {
    const instance = JsonRoutes.getInstance();
    instance.middlewares.push(middleware);
  }

  public static useErrorMiddleware(middleware: Middleware) {
    const instance = JsonRoutes.getInstance();
    instance.errorMiddlewares.push(middleware);
  }

  public static setResponseHeaders(headers: Record<string, string>) {
    const instance = JsonRoutes.getInstance();
    instance.responseHeaders = headers;
  }

  public static sendResult(res: ServerResponse, options: { code?: number; headers?: Record<string, string>; data?: any }) {
    const instance = JsonRoutes.getInstance();
    options = options || {};
    if (options.headers) {
      instance.setHeaders(res, options.headers);
    }

    res.statusCode = options.code || 200;
    instance.writeJsonToBody(res, options.data);

    res.end();
  }

  private setHeaders(res: ServerResponse, headers: Record<string, string>) {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  private writeJsonToBody(res: ServerResponse, json: any) {
    if (res.headersSent) {
      return;
    }

    if (json !== undefined) {
      const shouldPrettyPrint = process.env.NODE_ENV === 'development';
      res.setHeader('Content-type', 'application/json');
      res.write(JSON.stringify(json, null, shouldPrettyPrint ? 2 : 0));
    }
  }

  private matchRoute(req: IncomingMessage): RouteHandler | undefined {
    const parsedUrl = parse(req.url || '', true);
    const path = parsedUrl.pathname || '';

    return this.routes.find(route => {
      const isMethodMatch = route.method.toUpperCase() === req.method?.toUpperCase();
      const routeSegments = route.path.split('/').filter(seg => seg.length);
      const pathSegments = path.split('/').filter(seg => seg.length);

      if (routeSegments.length !== pathSegments.length) {
        return false;
      }

      const isPathMatch = routeSegments.every((seg, i) => {
        return seg.startsWith(':') || seg === pathSegments[i];
      });

      // Optional: Extract dynamic segments as params (like Express)
      // If needed, add logic here to extract and assign params to the request object

      return isMethodMatch && isPathMatch;
    });
  }

  private async parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString(); // Convert Buffer to string
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async processRequest(req: IncomingMessage, res: ServerResponse) {
    // Attempt to parse JSON body, but do not halt on failure
    try {
      req.body = await this.parseJsonBody(req);
    } catch (error) {
      // If parsing fails, req.body will remain undefined
      // The error is silently ignored, allowing endpoints to handle it as needed
    }

    // Continue with middleware processing and routing
    let index = 0;
    const nextMiddleware = () => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        middleware(req, res, nextMiddleware);
      } else {
        this.routeRequest(req, res);
      }
    };
    nextMiddleware();
  }

  private routeRequest(req: IncomingMessage, res: ServerResponse) {
    const route = this.matchRoute(req);
    if (route) {
      this.setHeaders(res, this.responseHeaders);
      try {
        route.handler(req, res);
      } catch (error) {
        this.handleError(error, res);
      }
    } else {
      res.statusCode = 404;
      this.writeJsonToBody(res, 'Not Found');
      res.end();
    }
  }

  private handleError(error: any, res: ServerResponse) {
    res.statusCode = 500;
    this.writeJsonToBody(res, { error: error.message || 'Internal Server Error' });
    res.end();
  }

  public static processRoutes(apiRoot: string) {
    const instance = JsonRoutes.getInstance();

    WebApp.connectHandlers.use((req: IncomingMessage, res: ServerResponse, next: Function) => {
      // Ensure the URL starts with the apiRoot
      if (req.url && req.url.startsWith(`/${apiRoot}`)) {
        instance.processRequest(req, res);
      } else {
        // If not part of the apiRoot, just call next middleware in the stack
        next();
      }
    });

    // Apply error middlewares if any
    instance.errorMiddlewares.forEach(middleware => {
      WebApp.connectHandlers.use((req, res, next) => {
        if (req.url && req.url.startsWith(`/${apiRoot}`)) {
          middleware(req, res, next);
        } else {
          next();
        }
      });
    });
  }
}

export { JsonRoutes };
