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
  private static routes: RouteHandler[] = [];
  private static middlewares: Middleware[] = [];
  private static errorMiddlewares: Middleware[] = [];
  private static responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };

  public static add(method: string, path: string, handler: (req: Request, res: Response, next: NextFunction) => void) {
    if (path[0] !== '/') {
      path = '/' + path;
    }
    JsonRoutes.routes.push({ method, path, handler });
  }

  public static use(middleware: Middleware) {
    JsonRoutes.middlewares.push(middleware);
  }

  public static useErrorMiddleware(middleware: Middleware) {
    JsonRoutes.errorMiddlewares.push(middleware);
  }

  public static setResponseHeaders(headers: Record<string, string>) {
    JsonRoutes.responseHeaders = headers;
  }

  public static sendResult(res: Response, options: { code?: number; headers?: Record<string, string>; data?: any }) {
    options = options || {};
    if (options.headers) {
      JsonRoutes.setHeaders(res, options.headers);
    }
    res.statusCode = options.code || 200;
    JsonRoutes.writeJsonToBody(res, options.data);
    res.end();
  }

  private static setHeaders(res: Response, headers: Record<string, string>) {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  private static writeJsonToBody(res: Response, json: any) {
    if (json !== undefined) {
      const shouldPrettyPrint = process.env.NODE_ENV === 'development';
      res.setHeader('Content-type', 'application/json');
      res.write(JSON.stringify(json, null, shouldPrettyPrint ? 2 : 0);
    }
  }

  private static matchRoute(req: Request) {
    return JsonRoutes.routes.find(route => route.method.toUpperCase() === req.method && req.url.startsWith(route.path));
  }

  public static processRequest(req: Request, res: Response, next: NextFunction) {
    let index = 0;

    const nextMiddleware = () => {
      if (index < JsonRoutes.middlewares.length) {
        const middleware = JsonRoutes.middlewares[index++];
        middleware(req, res, nextMiddleware);
      } else {
        next();
      }
    };

    nextMiddleware();
  }

  public static processRoutes() {
    WebApp.connectHandlers.use((req: Request, res: Response, next: NextFunction) => {
      JsonRoutes.processRequest(req, res, () => {
        const route = JsonRoutes.matchRoute(req);
        if (route) {
          JsonRoutes.setHeaders(res, JsonRoutes.responseHeaders);
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

    JsonRoutes.errorMiddlewares.forEach(middleware => {
      WebApp.connectHandlers.use(middleware);
    });
  }
}

JsonRoutes.use(JsonRoutes.processRoutes);

export { JsonRoutes };
