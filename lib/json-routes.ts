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
  private static instance: JsonRoutes;
  private routes: RouteHandler[] = [];
  private middlewares: Middleware[] = [];
  private errorMiddlewares: Middleware[] = [];
  private responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };

  // Make the constructor private
  private constructor() {
    // Initialize instance properties if needed
  }

  // Public static method to access the instance
  public static getInstance(): JsonRoutes {
    if (!JsonRoutes.instance) {
      JsonRoutes.instance = new JsonRoutes();
    }
    return JsonRoutes.instance;
  }

  public static add(method: string, path: string, handler: (req: Request, res: Response, next: NextFunction) => void) {
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

  public static sendResult(res: Response, options: { code?: number; headers?: Record<string, string>; data?: any }) {
    const instance = JsonRoutes.getInstance();
    options = options || {};
    if (options.headers) {
      instance.setHeaders(res, options.headers);
    }
    res.statusCode = options.code || 200;
    instance.writeJsonToBody(res, options.data);
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

  private matchRoute(req: Request): RouteHandler | undefined {
    return this.routes.find(route => {
      const isMethodMatch = route.method.toUpperCase() === req.method;

      // Function to normalize a path by removing trailing slash if present
      const normalizePath = (path: string) => (path.endsWith('/') && path !== '/') ? path.slice(0, -1) : path;

      // Normalize paths for comparison
      const normalizedRoutePath = normalizePath(route.path);
      const normalizedReqPath = normalizePath(req.url);

      // Split normalized paths into segments for comparison
      const routeSegments = normalizedRoutePath.split('/');
      const reqSegments = normalizedReqPath.split('/');

      // Check for dynamic segments and extract params
      let isPathMatch = routeSegments.length === reqSegments.length;
      const params: any = {};
      if (isPathMatch) {
        for (let i = 0; i < routeSegments.length; i++) {
          if (routeSegments[i].startsWith(':')) {
            params[routeSegments[i].substring(1)] = reqSegments[i];
          } else if (routeSegments[i] !== reqSegments[i]) {
            isPathMatch = false;
            break; // Exit loop early if a segment does not match
          }
        }
      }

      // Assign extracted parameters to the request object
      if (isPathMatch) {
        req.params = { ...req.params, ...params };
        req.route = normalizedRoutePath; // Assign the normalized route path to the request object
      }

      return isMethodMatch && isPathMatch;
    });
  }


  // Helper function to normalize paths by removing trailing slash if present
  private normalizePath(path: string): string {
    // Remove a trailing slash if it exists, except for the root path '/'
    return (path !== '/') ? path.replace(/\/$/, '') : path;
  }
  private processRequest(req: Request, res: Response, next: NextFunction) {
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

  public static processRoutes(apiRoot: string) {
    const instance = JsonRoutes.getInstance();
    WebApp.connectHandlers.use((req: Request, res: Response, next: NextFunction) => {
      if (req.url.startsWith(`/${apiRoot}`)) {
        instance.processRequest(req, res, () => {
          const route = instance.matchRoute(req);
          if (route) {
            instance.setHeaders(res, instance.responseHeaders);
            try {
              route.handler(req, res, next);
            } catch (error) {
              next(error);
            }
          } else {
            res.statusCode = 404;
            instance.writeJsonToBody(res, 'Not Found');
            res.end();
          }
        });
      } else {
        next();
      }
    });
    instance.errorMiddlewares.forEach(middleware => {
      WebApp.connectHandlers.use(middleware);
    });
  }
}

export { JsonRoutes };
