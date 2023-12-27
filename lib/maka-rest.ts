import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { Accounts } from 'meteor/accounts-base';
import { Route } from './route';
import { Auth } from './auth';
import Codes, { StatusResponse } from './codes';
import { Request, Response, IncomingMessage } from 'express';
import { RateLimiterMemory, RateLimiterRedis, IRateLimiterOptions } from 'rate-limiter-flexible';
import { RedisClient } from 'redis';

type LoginType = 'default' | null;

interface MakaRestOptions {
  debug?: boolean;
  paths: string[];
  apiRoot: string; // Root of the API, e.g., 'api'
  apiPath?: string; // Additional path after the version, required unless isRoot is true
  version: string; // API version, e.g., 'v1'
  isRoot?: boolean; // If true, this instance represents the root of the API
  prettyJson: boolean;
  auth: {
    token: string;
    user: (http: IncomingMessage) => { token?: string };
  };
  defaultHeaders: Record<string, string>;
  enableCors: boolean;
  defaultOptionsEndpoint?: () => void;
  rateLimitOptions?: IRateLimiterOptions
    & {
      useRedis?: boolean;
      redis?: RedisClient;
      keyGenerator?: (req: Request) => string;
    };
}

class MakaRest {
  readonly _routes: Route[];
  readonly _config: MakaRestOptions;
  readonly rateLimiter?: RateLimiterMemory | RateLimiterRedis;
  readonly partialApiPath: string;
  static defaultAuthInitialized = false; // Static property to track auth initialization
  request: Request;
  response: Response;

  // Type for interceptor function
  static interceptorType = (req: IncomingMessage, res: Response, next: Function) => {};

  // Static property to store interceptors
  static interceptors: Array<typeof MakaRest.interceptorType> = [];

  // Static method to add an interceptor
  static addInterceptor(interceptor: typeof MakaRest.interceptorType) {
    MakaRest.interceptors.push(interceptor);
  }

  // Static method to execute interceptors
  static executeInterceptors(req: IncomingMessage, res: Response, next: Function, index = 0) {
    if (index < MakaRest.interceptors.length) {
      const interceptor = MakaRest.interceptors[index];
      interceptor(req, res, () => MakaRest.executeInterceptors(req, res, next, index + 1));
    } else {
      next(); // Continue to the next middleware/handler
    }
  }

  // Static auth object to hold event listeners
  static auth = {
    loginType: null as LoginType,
    onLoggedIn: (req: IncomingMessage) => {},
    onLoggedOut: (req: IncomingMessage) => {},
    onLoginFailure: (req: IncomingMessage, reason?: string) => {}
  };

  constructor(options: Partial<MakaRestOptions>) {
    this._routes = [];
    this._config = {
      debug: false,
      paths: [],
      apiRoot: 'api',
      version: 'v1',
      prettyJson: false,
      auth: {
        token: 'services.resume.loginTokens.hashedToken',
        user: (obj: IncomingMessage) => {
          if (obj) {
            const { request } = obj;
            const tokenHeader = request.headers['x-auth-token'] || request.headers['X-Auth-Token'];
            return { token: tokenHeader ? Accounts._hashLoginToken(tokenHeader) : undefined };
          }
          return {
            token: undefined
          }
        }
      },
      defaultHeaders: {
        'Content-Type': 'application/json'
      },
      enableCors: true,
      ...options
    };

    if (options.rateLimitOptions) {
      if (options.rateLimitOptions.useRedis && options.rateLimitOptions.redis) {
        this.rateLimiter = new RateLimiterRedis({
          storeClient: options.rateLimitOptions.redis,
          ...options.rateLimitOptions,
        });
      } else {
        this.rateLimiter = new RateLimiterMemory(options.rateLimitOptions);
      }
    }

    const settings = MakaRest.Settings.getInstance();

    if (options.isRoot) {
      if (settings.isRootInstanceCreated()) {
        throw new Error('MAKA REST: Only one root instance is allowed');
      }
      settings.setRootInstanceCreated(true);
    }

    // Example of using executeInterceptors in a route
    WebApp.connectHandlers.use((req, res, next) => {
      MakaRest.executeInterceptors(req, res, next);
    });

    this.configureCors();
    this.partialApiPath = this.normalizeApiPath(this._config);
    // Initialize default auth endpoints only if they haven't been initialized before

    if (options.isRoot && options.useDefaultAuth && !settings.isDefaultAuthInitialized()) {
      this.initializeDefaultAuthEndpoints();
      settings.setDefaultAuthInitialized(true);
    }

    if (!options.isRoot && options.useDefaultAuth) {
      if (Meteor.isDevelopment) {
        console.warn('MAKA REST: Default auth endpoints can only be initialized on the root instance');
      }
    }

    this.initializeWildcardRoutes();

  }

  // Private singleton class for managing settings
  static Settings = (function() {
    let instance;

    function createInstance() {
      let defaultAuthInitialized = false;
      let rootInstanceCreated = false;
      // Other shared settings...

      return {
        isDefaultAuthInitialized: () => defaultAuthInitialized,
        isRootInstanceCreated: () => rootInstanceCreated,
        setDefaultAuthInitialized: (value) => { defaultAuthInitialized = value; },
        setRootInstanceCreated: (value) => { rootInstanceCreated = value; },
        // Other methods for managing settings...
      };
    }

    return {
      getInstance: function() {
        if (!instance) {
          instance = createInstance();
        }
        return instance;
      }
    };
  })();

  private configureCors(): void {
    if (this._config.enableCors) {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
      };

      if (this._config.useDefaultAuth) {
        corsHeaders['Access-Control-Allow-Headers'] += ', Authorization, X-Auth-Token';
      }

      Object.assign(this._config.defaultHeaders, corsHeaders);

      if (!this._config.defaultOptionsEndpoint) {
        this._config.defaultOptionsEndpoint = () => {
          this.response.writeHead(200, this._config.defaultHeaders);
          this.response.end();
        };
      }
    }
  }

  private normalizeApiPath(options: Partial<MakaRestOptions>): string {
    // Validate apiPath and isRoot
    if (!options.isRoot && !options.apiPath) {
      throw new Error("apiPath must be defined unless isRoot is set to true.");
    }

    // Construct the base path
    let basePath = `${options.apiRoot}/${options.version}`;
    if (options.apiPath) {
      basePath += `/${options.apiPath}`;
    }

    // Normalize slashes
    const partialApiPath = basePath.replace(/\/+/g, '/');
    return partialApiPath;
  }

  private initializeWildcardRoutes(): void {
    if (!this._config.paths.includes('*')) {
      this.addRoute('*', {}, { get: () => Codes.notFound404() });
      this.addRoute('*', { onRoot: true }, { get: () => Codes.notFound404() });
    }

    // Add a catch-all route for any other request that includes the apiRoot
    this.addRoute(`${this._config.apiRoot}/*`, {}, { get: () => Codes.notFound404() });
  }


  addRoute(path: string, options: any, endpoints: any): void {
    const route = new Route(this, path, options, endpoints);
    this._routes.push(route);
    route.addToApi(options?.onRoot);
  }

  private initializeDefaultAuthEndpoints(): void {
    if (MakaRest.auth.loginType === 'default') {
      this.addRoute('login', { onRoot: true, authRequired: false }, {
        post: async (incomingMessage: IncomingMessage) => { return await this.login(incomingMessage) }
      });

      this.addRoute('logout', { onRoot: true, authRequired: true }, {
        post: async (incomingMessage: IncomingMessage) => await this.logout(incomingMessage)
      });
      this.addRoute('logoutAll', { onRoot: true, authRequired: true }, {
        post: async (incomingMessage: IncomingMessage) => await this.logoutAll(incomingMessage)
      });
    }
  }

  private async login(incomingMessage: IncomingMessage): Promise<StatusResponse> { // Replace with proper types
    const { bodyParams } = incomingMessage;

    const user = Auth.extractUser(bodyParams) as Meteor.User;
    const auth = await Auth.loginWithPassword(user, Auth.extractPassword(bodyParams));
    if (auth.userId && auth.authToken) {
      const searchQuery = { [this._config.auth.token]: Accounts._hashLoginToken(auth.authToken) };
      const user = await Meteor.users.findOneAsync({ '_id': auth.userId }, searchQuery);
      if (!user) {
        MakaRest.auth.onLoginFailure?.(incomingMessage, 'Error attempting login');
        return Codes.badRequest400('Error attempting login')
      }
      Object.assign(incomingMessage, { user });
      MakaRest.auth.onLoggedIn?.(incomingMessage);
      return Codes.success200(auth);
    }

    MakaRest.auth.onLoginFailure?.(incomingMessage, 'Error attempting login');
    if (auth.error) {
      return Codes.unauthorized401(auth.error);
    }

    return Codes.badRequest400('Error attempting login');
  }

  private async logout(incomingMessage: IncomingMessage): Promise<StatusResponse> {
    const { user, request } = incomingMessage;
    // Extract the auth token from the request headers
    const authToken = request.headers['x-auth-token'] || this.request.headers['X-Auth-Token'];
    if (!authToken) {
      return Codes.unauthorized401('No auth token provided');
    }

    const hashedToken = Accounts._hashLoginToken(authToken);

    // Remove the specific token from the user's account
    await Meteor.users.updateAsync(
      { _id: user._id, 'services.resume.loginTokens': { $exists: true, $type: 'array' } },
      { $pull: { 'services.resume.loginTokens': { hashedToken } } }
    );

    // Call the logout hook if it's defined
    MakaRest.auth.onLoggedOut?.(incomingMessage);
    return Codes.success200('Logged out successfully');
  }

  private async logoutAll(incomingMessage: IncomingMessage): Promise<StatusResponse> {
    const { user } = incomingMessage;
    // Clear all tokens from the user's account
    await Meteor.users.updateAsync(user._id, { $set: { 'services.resume.loginTokens': [] } });

    // Call the logout hook if it's defined
    MakaRest.auth.onLoggedOut?.(incomingMessage);
    return Codes.success200('Logged out from all devices successfully');
  }
}

export default MakaRest;
export { MakaRest as Restivus, Codes };
