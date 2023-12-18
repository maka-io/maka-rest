import { WebApp } from 'meteor/webapp';
import { Request, Response, NextFunction } from 'express';

interface RouteHandler {
  method: string;
  path: string;
  handler: (req: Request, res: Response, next: NextFunction) => void;
}

interface Middleware {
  (req: Request, res: Response, next: NextFunction): void;
}

class JsonRoutes {
  private routes: RouteHandler[] = [];
  private middlewares: Middleware[] = [];
  private errorMiddlewares: Middleware[] = [];
  private responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };

  constructor() {
    // Initialize instance properties if needed
  }

  public add(method: string, path: string, handler: (req: Request, res: Response, next: NextFunction) => void) {
    if (path[0] !== '/') {
      path = '/' + path;
    }
    this.routes.push({ method, path, handler });
  }

  public use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  public useErrorMiddleware(middleware: Middleware) {
    this.errorMiddlewares.push(middleware);
  }

  public setResponseHeaders(headers: Record<string, string>) {
    this.responseHeaders = headers;
  }

  public sendResult(res: Response, options: { code?: number; headers?: Record<string, string>; data?: any }) {
    options = options || {};
    if (options.headers) {
      this.setHeaders(res, options.headers);
    }
    res.statusCode = options.code || 200;
    this.writeJsonToBody(res, options.data);
    res.end();
  }

  private setHeaders(res: Response, headers: Record<string, string>) {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  private writeJsonToBody(res: Response, json: any) {
    if (json !== undefined) {
      const shouldPrettyPrint = process.env.NODE_ENV === 'development';
      res.setHeader('Content-type', 'application/json');
      res.write(JSON.stringify(json, null, shouldPrettyPrint ? 2 : 0));
    }
  }

  private matchRoute(req: Request) {
    return this.routes.find(route => route.method.toUpperCase() === req.method && req.url === route.path);
  }

  public processRequest(req: Request, res: Response, next: NextFunction) {
    let index = 0;

    const nextMiddleware = () => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        middleware(req, res, nextMiddleware);
      } else {
        next();
      }
    };

    nextMiddleware();
  }

  public processRoutes() {
    WebApp.connectHandlers.use((req: Request, res: Response, next: NextFunction) => {
      this.processRequest(req, res, () => {
        const route = this.matchRoute(req);
        if (route) {
          this.setHeaders(res, this.responseHeaders);
          try {
            route.handler(req, res, next);
          } catch (error) {
            next(error);
          }
        } else {
          next();
        }
      });
    });

    this.errorMiddlewares.forEach(middleware => {
      WebApp.connectHandlers.use(middleware);
    });
  }
}

export { JsonRoutes };

