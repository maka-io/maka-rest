import { Meteor } from 'meteor/meteor';
import { Request, Response } from 'express';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { JsonRoutes } from './json-routes';
import Codes, { StatusResponse } from './codes';
import MakaRest from './maka-rest';

export interface EndpointContext {
  urlParams: any;
  queryParams: any;
  bodyParams: any;
  request: Request;
  response: Response;
  done: () => void;
  user?: Meteor.User;
  userId?: string;
}

export interface EndpointOptions {
  authRequired?: boolean;
  roleRequired?: string[];
  scopeRequired?: string[];
  action: (context: EndpointContext) => Promise<any>;
}

export interface RouteOptions {
  [key: string]: any; // Define specific routes here (e.g., get, post, put, del)
  /** Internal. Set only by the built-in logout endpoints; not a public option. */
  _skipVerifiedEmailCheck?: boolean;
  rateLimit?: {
    points?: number;
    duration?: number;
  };
}
class Route {
  private api: MakaRest; // Replace with the actual type of your API class
  private path: string;
  private options: RouteOptions;
  private endpoints: { [method: string]: EndpointOptions };
  private jsonRoutes: JsonRoutes;
  private rateLimiter?: RateLimiterMemory | RateLimiterRedis;

  constructor(api: any, path: string, options: RouteOptions, endpoints: { [method: string]: EndpointOptions }) {
    this.api = api;
    this.path = path ?? api._config.apiPath ?? ''; // Use apiPath as default if path is null
    this.options = options || {};
    this.endpoints = endpoints || this.options;
    this.jsonRoutes = JsonRoutes.getInstance();

    if (options.rateLimit) {
      if (!this.api._config.rateLimitOptions) {
        throw new Error('Rate limiting is not enabled. To add rate limiting to a route, first configure the main rateLimitOptions');
      }
      // Create a new rate limiter for this route if custom rate limit settings are provided
      this.rateLimiter = this.api._config.rateLimitOptions.useRedis ?
        new RateLimiterRedis({
          storeClient: this.api._config.rateLimitOptions.redis,
          points: options.rateLimit.points || this.api._config.rateLimitOptions.points,
          duration: options.rateLimit.duration || this.api._config.rateLimitOptions.duration,
          keyPrefix: 'custom_' + path
        }) :
        new RateLimiterMemory({
          points: options.rateLimit.points || this.api._config.rateLimitOptions.points,
          duration: options.rateLimit.duration || this.api._config.rateLimitOptions.duration,
        });
    }
  }

  private extractUrlParams(actualUrl: string, routePath: string): Record<string, string> {
    const actualParts = actualUrl.split('?')[0].split('/').filter(Boolean);
    const routeParts = routePath.split('/').filter(Boolean);
    const params: Record<string, string> = {};

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        const key = routeParts[i].substring(1);
        params[key] = actualParts[i];
      }
    }

    return params;
  }


  addToApi(onRoot: boolean = false): void {
    const availableMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'];

    if (this.api._config.paths.includes(this.path) && (onRoot && this.path !== '*' && this.path !== '/')) {
      throw new Error(`Cannot add a route at an existing path: ${this.path}`);
    }

    // Override the default OPTIONS endpoint with our own
    this.endpoints.options = this.api._config.defaultOptionsEndpoint;
    this._resolveEndpoints();
    this._configureEndpoints();

    this.api._config.paths.push(this.path);

    if (this.path === '') {
      if (onRoot) {
        throw new Error('Cannot add a root route without a specific path');
      }
      this.path = '/';
    }

    const fullPath = onRoot ? `${this.api._config.apiRoot}/${this.path}`.replace(/\/+/g, '/') : `${this.api.partialApiPath}/${this.path}`.replace(/\/+/g, '/');

    for (const method of Object.keys(this.endpoints)) {
      if (availableMethods.includes(method)) {
        const endpoint = this.endpoints[method];
        JsonRoutes.add(method, fullPath, async (req: Request, res: Response) => {
          const pathname = JsonRoutes.getPathname(req);
          if (this.api._config.rateLimitOptions) {
            // Rate limiting logic
            try {
              const key = this.api._config.rateLimitOptions.keyGenerator
                ? this.api._config.rateLimitOptions.keyGenerator(req)
                : req.ip;

              // Use the route-specific rate limiter if it exists, otherwise fall back to the global one
              const limiter = this.rateLimiter || this.api.rateLimiter;
              await limiter.consume(key);
            } catch (rejRes) {
              JsonRoutes.sendResult(res, {
                code: 429,
                data: 'Too many requests'
              });
              return;
            }
          }

          const endpointContext: EndpointContext = {
            urlParams: this.extractUrlParams(pathname, fullPath),
            queryParams: req.query,
            bodyParams: req.body,
            request: req,
            response: res,
            done: () => { /* Functionality for done */ },
            ...endpoint
          };

          try {
            const responseData = await this._callEndpoint(endpointContext, endpoint);
            if (responseData) {
              JsonRoutes.sendResult(res, {
                code: responseData.statusCode,
                headers: responseData.headers,
                data: responseData.data
              });
            }

            // Add a debug line that logs out the request and response in a structured way
            if (this.api._config.debug) {
              console.log(`\n${method.toUpperCase()} ${fullPath}`);
              console.log('Request:', {
                urlParams: this.extractUrlParams(pathname, fullPath),

                queryParams: req.query,
                bodyParams: req.body,
                headers: req.headers
              });
              console.log('Response:', responseData);
            }
          } catch (error) {
            console.log(error);
            JsonRoutes.sendResult(res, {
              code: 500,
              data: 'Server Error',
              headers: res.headers
            });
          }
        });
      }
    }

    JsonRoutes.processRoutes(this.api._config.apiRoot);
  }

  private _resolveEndpoints(): void {
    Object.entries(this.endpoints).forEach(([method, endpoint]) => {
      if (typeof endpoint === 'function') {
        this.endpoints[method] = { action: endpoint };
      }
    });
  }

  private _configureEndpoints(): void {
    Object.entries(this.endpoints).forEach(([method, endpoint]) => {
      if (method !== 'options') {
        endpoint.roleRequired = endpoint.roleRequired || [];
        endpoint.roleRequired = [...endpoint.roleRequired, ...(this.options.roleRequired || [])];
        endpoint.roleRequired = endpoint.roleRequired.length > 0 ? endpoint.roleRequired : undefined;
        endpoint.authRequired = endpoint.authRequired !== undefined ? endpoint.authRequired : (this.options.authRequired || !!endpoint.roleRequired);
      }
    });
  }

  private async _callEndpoint(endpointContext: EndpointContext, endpoint: EndpointOptions): Promise<StatusResponse> {
    const auth = await this._authAccepted(endpointContext, endpoint);
    if (auth.success) {
      if (!this._verifiedEmailAccepted(endpointContext, endpoint)) {
        return Codes.forbidden403('Email address must be verified');
      }
      if (await this._roleAccepted(endpointContext, endpoint)) {
        const endpointResponse = await endpoint.action(endpointContext);
        if (!endpointResponse) {
          return Codes.noContent204();
        }

        // if endpointResponse doesnt contain a statusCode or data, throw an error
        if (!endpointResponse.statusCode || !endpointResponse.data) {
          throw new Error('Endpoint response must contain a statusCode and data');
        }
        return endpointResponse;
      } else {
        return Codes.forbidden403();
      }
    } else {
      return auth.data ? Codes.unauthorized401(auth.data) : Codes.unauthorized401();
    }
  }

  private async _authAccepted(endpointContext: EndpointContext, endpoint: EndpointOptions): Promise<{ success: boolean; data?: any }> {
    if (endpoint.authRequired) {
      return await this._authenticate(endpointContext);
    }
    return { success: true };
  }

  private async _authenticate(endpointContext: EndpointContext): Promise<{ success: boolean; data?: any }> {
    const auth = this.api._config.auth.user.call(this, endpointContext);

    if (!auth || !auth.token) return { success: false };

    const userSelector = { [this.api._config.auth.token]: auth.token };

    const user = await Meteor.users.findOneAsync(userSelector);
    if (!user) return { success: false };

    endpointContext.user = user;
    endpointContext.userId = user._id;

    return { success: true, data: auth };
  }

  /**
   * The global verified-email gate (MakaRest.auth.requireVerifiedEmail).
   *
   * Read here, per request, rather than at construction -- unlike loginType,
   * which the constructor consumes and MakaRest.Settings then latches. So this
   * flag may be set at any point in the process and needs no ordering rule.
   *
   * Denial is 403, not 401: a 401 tells a client to re-authenticate, which is
   * useless advice to someone whose email is simply not verified.
   */
  private _verifiedEmailAccepted(endpointContext: EndpointContext, endpoint: EndpointOptions): boolean {
    if (!MakaRest.auth.requireVerifiedEmail) return true;
    // Public endpoints are untouched -- the gate only tightens authRequired ones.
    if (!endpoint.authRequired) return true;
    if (this.options._skipVerifiedEmailCheck) return true;

    // Fail closed: no emails array, or an empty one, is not a verified email.
    // That includes username-only accounts, which hold no email to verify.
    return !!endpointContext.user?.emails?.some((e) => e.verified);
  }

  /**
   * Resolves alanning:roles at call time.
   *
   * It is a weak dependency, so it is only present if the consuming app added
   * it, and a weak dependency's exports are reached through the Package
   * registry -- the symbol is never injected into this package's scope.
   * Referencing a bare `Roles` here is what used to make roleRequired die with
   * a ReferenceError.
   */
  private static resolveRoles(): any {
    const registry = (globalThis as any).Package;
    return registry && registry['alanning:roles'] && registry['alanning:roles'].Roles;
  }

  private async _roleAccepted(endpointContext: EndpointContext, endpoint: EndpointOptions): Promise<boolean> {
    if (!endpoint.roleRequired || !endpointContext.user) return true;

    const Roles = Route.resolveRoles();
    if (!Roles) {
      throw new Error(
        'maka:rest: roleRequired needs the alanning:roles package. Add it to your app with `meteor add alanning:roles`.'
      );
    }

    // The synchronous userIsInRole/getScopesForUser are client-only in
    // alanning:roles v4; the server only has the Async variants.
    const hasRole = await Roles.userIsInRoleAsync(endpointContext.user, endpoint.roleRequired);
    if (!endpoint.scopeRequired) return hasRole;

    const scopes = await Roles.getScopesForUserAsync(endpointContext.user);
    return hasRole && endpoint.scopeRequired.some((scope: string) => scopes.includes(scope));
  }
};

export { Route };
