import { Meteor } from 'meteor/meteor';
import { Request, Response } from 'express';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { JsonRoutes } from './json-routes';
import Codes, { StatusResponse } from './codes';
import MakaRest from './maka-rest';

import {
  Route as IRoute,
} from '@maka/types';

class Route implements IRoute {
  private api: MakaRest; // Replace with the actual type of your API class
  private path: string;
  private options: IRoute.RouteOptions;
  private endpoints: { [method: string]: IRoute.EndpointOptions };
  private jsonRoutes: JsonRoutes;
  private rateLimiter?: RateLimiterMemory | RateLimiterRedis;

  constructor(api: any, path: string, options: IRoute.RouteOptions, endpoints: { [method: string]: IRoute.EndpointOptions }) {
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

          const endpointContext: IRoute.EndpointContext = {
            urlParams: req.params,
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
                urlParams: req.params,
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

  private async _callEndpoint(endpointContext: IRoute.EndpointContext, endpoint: IRoute.EndpointOptions): Promise<StatusResponse> {
    const auth = await this._authAccepted(endpointContext, endpoint);
    if (auth.success) {
      if (this._roleAccepted(endpointContext, endpoint)) {
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

  private async _authAccepted(endpointContext: IRoute.EndpointContext, endpoint: IRoute.EndpointOptions): Promise<{ success: boolean; data?: any }> {
    if (endpoint.authRequired) {
      return await this._authenticate(endpointContext);
    }
    return { success: true };
  }

  private async _authenticate(endpointContext: IRoute.EndpointContext): Promise<{ success: boolean; data?: any }> {
    const auth = this.api._config.auth.user.call(this, endpointContext);

    if (!auth || !auth.token) return { success: false };

    const userSelector = { [this.api._config.auth.token]: auth.token };

    const user = await Meteor.users.findOneAsync(userSelector);
    if (!user) return { success: false };

    endpointContext.user = user;
    endpointContext.userId = user._id;
    return { success: true, data: auth };
  }

  private _roleAccepted(endpointContext: IRoute.EndpointContext, endpoint: IRoute.EndpointOptions): boolean {
    if (!endpoint.roleRequired || !endpointContext.user) return true;

    const hasRole = Roles.userIsInRole(endpointContext.user, endpoint.roleRequired);
    if (endpoint.scopeRequired) {
      const hasScope = endpoint.scopeRequired.some(scope =>
        Roles.getScopesForUser(endpointContext.user).includes(scope));
      return hasRole && hasScope;
    }
    return hasRole;
  }
};

export { Route };
