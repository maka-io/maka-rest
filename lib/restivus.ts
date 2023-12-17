import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Route } from './route';
import { Auth } from './auth';
import Codes, { StatusResponse } from './codes';
import { Request, Response, IncomingMessage } from 'express';

interface RestivusOptions {
  paths: string[];
  useDefaultAuth: boolean;
  apiPath: string;
  apiRoot?: string;
  version: string | null;
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
}

interface BodyParams {
  username?: string;
  email?: string;
  password: string;
  hashed?: boolean;
}

class Restivus {
  private _routes: Route[];
  private _config: RestivusOptions;
  private user: Meteor.User | null;
  private userId: string | null;
  request: Request;
  response: Response;

  constructor(options: Partial<RestivusOptions>) {
    this._routes = [];
    this._config = {
      paths: [],
      useDefaultAuth: false,
      apiPath: 'api/',
      version: null,
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

    this.user = null;
    this.userId = null;

    this.configureCors();
    this.normalizeApiPath();
    this.initializeDefaultAuthEndpoints();
    this.initializeWildcardRoutes();
  }

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

  private normalizeApiPath(): void {
    this._config.apiPath = this._config.apiPath.startsWith('/') ? this._config.apiPath.slice(1) : this._config.apiPath;
    this._config.apiPath = this._config.apiPath.endsWith('/') ? this._config.apiPath : `${this._config.apiPath}/`;

    if (this._config.version) {
      this._config.apiRoot = this._config.apiPath;
      this._config.apiPath += `${this._config.version}/`;
    }
  }

  private initializeDefaultAuthEndpoints(): void {
    if (this._config.useDefaultAuth) {
      this._initAuth();
    }
  }

  private initializeWildcardRoutes(): void {
    if (!this._config.paths.includes('/')) {
      this.addRoute('/', { onRoot: true }, { get: () => Codes.success200('API Root') });
      this.addRoute('/', {}, { get: () => Codes.success200(`API ${this._config.version} Root`) });
    }

    if (!this._config.paths.includes('*')) {
      this.addRoute('*', {}, { get: () => Codes.notFound404() });
      this.addRoute('*', { onRoot: true }, { get: () => Codes.notFound404() });
    }
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

  private _validate(options: { username?: string; password: string; email?: string }): boolean {
    const { username, password, email } = options;
    if (!password) throw new Error('Password must be provided');
    if (!username && !email) throw new Error('Username or email must be provided');

    const user = email ? Meteor.users.findOne({ "emails.address": email }) : Meteor.users.findOne({ username });
    if (!user) throw new Error(`User not found for username: ${username}`);

    return this._validateUser(user, password);
  }

  private _initAuth(): void {
    this.addRoute('login', { authRequired: false }, {
      post: async (incomingMessage: IncomingMessage) => { // Replace with proper types
        const { bodyParams, request } = incomingMessage;

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
        return Codes.badRequest400('Error attempting login');
      }
    });

    this.addRoute('logout', { authRequired: true }, { post: async (incomingMessage: IncomingMessage) => await this._logout(incomingMessage) });
    this.addRoute('logoutAll', { authRequired: true }, { post: async (incomingMessage: IncomingMessage) => await this._logoutAll(incomingMessage) });
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
    const tokenLocation = this._config.auth.token;
    const [tokenPath, tokenFieldName] = tokenLocation.split('.');

    // Remove the specific token from the user's account
    await Meteor.users.updateAsync(user._id, { $pull: { [tokenPath]: { [tokenFieldName]: hashedToken } } });

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

export { Restivus, Codes };
