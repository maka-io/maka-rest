import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Route } from './route';
import { Auth } from './auth';
import Codes, { StatusResponse } from './codes';
import { Request, Response, IncomingMessage } from 'express';
import { RateLimiterMemory, RateLimiterRedis, IRateLimiterOptions } from 'rate-limiter-flexible';
import { RedisClient } from 'redis';

interface MakaRestOptions {
  paths: string[];
  useDefaultAuth: boolean;
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
  onLoginFailure?: (req: Request) => any;
  onLoggedIn?: (incomingMessage: IncomingMessage) => any;
  onLoggedOut?: (incomingMessage: IncomingMessage) => any;
  rateLimitOptions?: IRateLimiterOptions
    & {
      useRedis?: boolean;
      redis?: RedisClient;
      keyGenerator?: (req: Request) => string;
    };
}

interface BodyParams {
  username?: string;
  email?: string;
  password: string;
  hashed?: boolean;
}

class MakaRest {
  readonly _routes: Route[];
  readonly _config: MakaRestOptions;
  readonly rateLimiter?: RateLimiterMemory | RateLimiterRedis;
  readonly partialApiPath: string;
  static defaultAuthInitialized = false; // Static property to track auth initialization
  request: Request;
  response: Response;

  constructor(options: Partial<MakaRestOptions>) {
    this._routes = [];
    this._config = {
      paths: [],
      useDefaultAuth: false,
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

    this.configureCors();
    this.partialApiPath = this.normalizeApiPath(this._config);
    // Initialize default auth endpoints only if they haven't been initialized before

    if (options.isRoot && options.useDefaultAuth && !settings.isDefaultAuthInitialized()) {
      this.initializeDefaultAuthEndpoints();
      settings.setDefaultAuthInitialized(true);
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

  private initializeDefaultAuthEndpoints(): void {
    this._initAuth();
  }

  private initializeWildcardRoutes(): void {
    // Existing code to initialize specific wildcard routes
    if (!this._config.paths.includes('/')) {
      this.addRoute('/', { onRoot: true }, { get: () => Codes.success200('API Root') });
      const prettyPrintPath = this._config.apiPath ? this._config.apiPath + ' ' : '';
      this.addRoute('/', {}, { get: () => Codes.success200(`API ${prettyPrintPath}${this._config.version} Root`.trim()) });
    }

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

  private _validateUser(user: Meteor.User, password: string): boolean {
    if (!user.services || !user.services.password) {
      throw new Error('User has no password set');
    }

    const resultOfInvocation = Accounts._checkPassword(user, password);
    return !resultOfInvocation.error;
  }

  private _initAuth(): void {
    this.addRoute('login', { onRoot: true, authRequired: false }, {
      post: async (incomingMessage: IncomingMessage) => { // Replace with proper types
        const { bodyParams } = incomingMessage;

        const user = this._extractUser(bodyParams) as Meteor.User;
        const auth = await Auth.loginWithPassword(user, this._extractPassword(bodyParams));
        if (auth.userId && auth.authToken) {
          const searchQuery = { [this._config.auth.token]: Accounts._hashLoginToken(auth.authToken) };
          const user = await Meteor.users.findOneAsync({ '_id': auth.userId }, searchQuery);
          if (!user) {
            const extra = this._config.onLoginFailure?.call(this, incomingMessage);
            return Codes.badRequest400({ message: 'Error attempting login', ...extra })
          }
          Object.assign(incomingMessage, { user });
          const extra = this._config.onLoggedIn?.call(this, incomingMessage);
          return extra ? { ...Codes.success200(auth), extra } : Codes.success200(auth);
        }

        const extra = this._config.onLoginFailure?.call(this, incomingMessage);
        if (auth.error) {
          return Codes.unauthorized401({ error: auth.error, ...extra });
        }
        return Codes.badRequest400({ message: 'Error attempting login', ...extra });
      }
    });

    this.addRoute('logout', { onRoot: true, authRequired: true }, { post: async (incomingMessage: IncomingMessage) => await this._logout(incomingMessage) });
    this.addRoute('logoutAll', { onRoot: true, authRequired: true }, { post: async (incomingMessage: IncomingMessage) => await this._logoutAll(incomingMessage) });
  }

  private _extractUser(body: BodyParams): Partial<Meteor.User> {
    if (body.username) {
      return { username: body.username };
    } else if (body.email) {
      return { emails: [{ address: body.email, verified: false }] };
    } else {
      throw new Error('Username or email must be provided');
    }
  }

  private _extractPassword(body: BodyParams): string | { digest: string; algorithm: string } {
    return body.hashed ? { digest: body.password, algorithm: 'sha-256' } : body.password;
  }

  private async _logout(incomingMessage: IncomingMessage): Promise<StatusResponse> {
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
    const extra = this._config.onLoggedOut?.call(this, incomingMessage);
    return extra ? { ...Codes.success200('Logged out successfully'), extra } : Codes.success200('Logged out successfully');
  }

  private async _logoutAll(incomingMessage: IncomingMessage): Promise<StatusResponse> {
    const { user } = incomingMessage;
    // Clear all tokens from the user's account
    await Meteor.users.updateAsync(user._id, { $set: { 'services.resume.loginTokens': [] } });

    // Call the logout hook if it's defined
    const extra = this._config.onLoggedOut?.call(this, incomingMessage);
    return extra ? { ...Codes.success200('Logged out from all devices successfully'), extra } : Codes.success200('Logged out from all devices successfully');
  }
}

export default MakaRest;
export { MakaRest as Restivus, Codes };
