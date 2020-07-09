import ParsedURL from 'url-parse';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { Route } from './route.js';

const URL = new ParsedURL(Meteor.absoluteUrl());

class Restivus {
    constructor(options) {
        this._routes = [];
        this._config = {
            paths: [],
            useDefaultAuth: false,
            apiPath: 'api/',
            version: null,
            prettyJson: false,
            auth: {
                token: 'services.resume.loginTokens.hashedToken',
                user() {
                    let token;
                    if (this.request.headers['x-auth-token']) {
                        token = Accounts._hashLoginToken(this.request.headers['x-auth-token']);
                    }
                    return {
                        userId: this.request.headers['x-user-id'],
                        token
                    };
                }
            },
            defaultHeaders: {
                'Content-Type': 'application/json'
            },
            enableCors: true
        };

        // Configure API with the given options
        Object.assign(this._config, options);

        if (this._config.enableCors) {
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
            };

            if (this._config.useDefaultAuth) {
                corsHeaders['Access-Control-Allow-Headers'] += ', X-User-Id, X-Auth-Token';
            }

            // Set default header to enable CORS if configured
            Object.assign(this._config.defaultHeaders, corsHeaders);

            if (!this._config.defaultOptionsEndpoint) {
                this._config.defaultOptionsEndpoint = function() {
                    this.response.writeHead(200, corsHeaders);
                    return this.done();
                };
            }
        }

        // Normalize the API path
        if (this._config.apiPath[0] === '/') {
            this._config.apiPath = this._config.apiPath.slice(1);
        }
        if (_.last(this._config.apiPath) !== '/') {
            this._config.apiPath = this._config.apiPath + '/';
        }

        // URL path versioning is the only type of API versioning currently available, so if a version is
        // provided, append it to the base path of the API
        if (this._config.version) {
            this._config.apiPath += this._config.version + '/';
        }

        // Add default login and logout endpoints if auth is configured
        if (this._config.useDefaultAuth) {
            this._initAuth();
        } else if (this._config.useAuth) {
            this._initAuth();
            console.warn('Warning: useAuth API config option will be removed in Restivus v1.0 ' +
                '\n    Use the useDefaultAuth option instead'
            );
        }
    }

    /**
      A set of endpoints that can be applied to a Collection Route
      */
    _collectionEndpoints = {
            get(collection) {
                return {
                    get: {
                        action() {
                            const entity = collection.findOne(this.urlParams.id);
                            if (entity) {
                                return {status: 'success', data: entity};
                            } else {
                                return {
                                    statusCode: 404,
                                    body: {status: 'fail', message: 'Item not found'}
                                };
                            }
                        }
                    }
                };
            },
            put(collection) {
                return {
                    put: {
                        action() {
                            const entityIsUpdated = collection.update(this.urlParams.id, this.bodyParams);
                            if (entityIsUpdated) {
                                const entity = collection.findOne(this.urlParams.id);
                                return {status: 'success', data: entity};
                            } else {
                                return {
                                    statusCode: 404,
                                    body: {status: 'fail', message: 'Item not found'}
                                };
                            }
                        }
                    }
                };
            },
            patch(collection) {
                return {
                    patch: {
                        action() {
                            const entityIsUpdated = collection.update(this.urlParams.id, {$set: this.bodyParams});
                            if (entityIsUpdated) {
                                const entity = collection.findOne(this.urlParams.id);
                                return {status: 'success', data: entity};
                            } else {
                                return {
                                    statusCode: 404,
                                    body: {status: 'fail', message: 'Item not found'}
                                };
                            }
                        }
                    }
                };
            },
            delete(collection) {
                return {
                    delete: {
                        action() {
                            if (collection.remove(this.urlParams.id)) {
                                return {status: 'success', data: {message: 'Item removed'}};
                            } else {
                                return {
                                    statusCode: 404,
                                    body: {status: 'fail', message: 'Item not found'}
                                };
                            }
                        }
                    }
                };
            },
            post(collection) {
                return {
                    post: {
                        action() {
                            const entityId = collection.insert(this.bodyParams);
                            const entity = collection.findOne(entityId);
                            if (entity) {
                                return {
                                    statusCode: 201,
                                    body: {status: 'success', data: entity}
                                };
                            } else {
                                return {
                                    statusCode: 400,
                                    body: {status: 'fail', message: 'No item added'}
                                };
                            }
                        }
                    }
                };
            },
            getAll(collection) {
                return {
                    get: {
                        action() {
                            const entities = collection.find().fetch();
                            if (entities) {
                                return {status: 'success', data: entities};
                            } else {
                                return {
                                    statusCode: 404,
                                    body: {status: 'fail', message: 'Unable to retrieve items from collection'}
                                };
                            }
                        }
                    }
                };
            }
        }

        /**
      A set of endpoints that can be applied to a Meteor.users Collection Route
      */
    _userCollectionEndpoints = {
        get(collection) {
            return {
                get: {
                    action() {
                        const entity = collection.findOne(this.urlParams.id, {fields: {profile: 1}});
                        if (entity) {
                            return {status: 'success', data: entity};
                        } else {
                            return {
                                statusCode: 404,
                                body: {status: 'fail', message: 'User not found'}
                            };
                        }
                    }
                }
            };
        },
        put(collection) {
            return {
                put: {
                    action() {
                        const entityIsUpdated = collection.update(this.urlParams.id, {$set: {profile: this.bodyParams}});
                        if (entityIsUpdated) {
                            const entity = collection.findOne(this.urlParams.id, {fields: {profile: 1}});
                            return {status: "success", data: entity};
                        } else {
                            return {
                                statusCode: 404,
                                body: {status: 'fail', message: 'User not found'}
                            };
                        }
                    }
                }
            };
        },
        delete(collection) {
            return {
                delete: {
                    action() {
                        if (collection.remove(this.urlParams.id)) {
                            return {status: 'success', data: {message: 'User removed'}};
                        } else {
                            return {
                                statusCode: 404,
                                body: {status: 'fail', message: 'User not found'}
                            };
                        }
                    }
                }
            };
        },
        post(collection) {
            return {
                post: {
                    action() {
                        // Create a new user account
                        const entityId = Accounts.createUser(this.bodyParams);
                        const entity = collection.findOne(entityId, {fields: {profile: 1}});
                        if (entity) {
                            return {
                                statusCode: 201,
                                body: {status: 'success', data: entity}
                            };
                        } else {
                            ({statusCode: 400});
                            return {status: 'fail', message: 'No user added'};
                        }
                    }
                }
            };
        },
        getAll(collection) {
            return {
                get: {
                    action() {
                        const entities = collection.find({}, {fields: {profile: 1}}).fetch();
                        if (entities) {
                            return {status: 'success', data: entities};
                        } else {
                            return {
                                statusCode: 404,
                                body: {status: 'fail', message: 'Unable to retrieve users'}
                            };
                        }
                    }
                }
            };
        }
    }


    /**
    Add endpoints for the given HTTP methods at the given path

    @param path {String} The extended URL path (will be appended to base path of the API)
    @param options {Object} Route configuration options
    @param options.authRequired {Boolean} The default auth requirement for each endpoint on the route
    @param options.roleRequired {String or String[]} The default role required for each endpoint on the route
    @param endpoints {Object} A set of endpoints available on the new route (get, post, put, patch, delete, options)
    @param endpoints.<method> {Function or Object} If a function is provided, all default route
        configuration options will be applied to the endpoint. Otherwise an object with an `action`
        and all other route config options available. An `action` must be provided with the object.
        */
    addRoute(path, options, endpoints) {
        // Create a new route and add it to our list of existing routes
        const route = new Route(this, path, options, endpoints);
        this._routes.push(route);

        route.addToApi();

        return this;
    }


    /**
    Generate routes for the Meteor Collection with the given name
    */
    addCollection(collection, options) {
        let collectionEndpoints;
        if (options == null) { options = {}; }
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'getAll'];
        const methodsOnCollection = ['post', 'getAll'];

        // Grab the set of endpoints
        if (collection === Meteor.users) {
            collectionEndpoints = this._userCollectionEndpoints;
        } else {
            collectionEndpoints = this._collectionEndpoints;
        }

        // Flatten the options and set defaults if necessary
        const endpointsAwaitingConfiguration = options.endpoints || {};
        const routeOptions = options.routeOptions || {};
        const excludedEndpoints = options.excludedEndpoints || [];
        // Use collection name as default path
        const path = options.path || collection._name;

        // Separate the requested endpoints by the route they belong to (one for operating on the entire
        // collection and one for operating on a single entity within the collection)
        const collectionRouteEndpoints = {};
        const entityRouteEndpoints = {};
        if (_.isEmpty(endpointsAwaitingConfiguration) && _.isEmpty(excludedEndpoints)) {
            // Generate all endpoints on this collection
            methods.forEach((method) => {
                // Partition the endpoints into their respective routes
                if (Array.from(methodsOnCollection).includes(method)) {
                    _.extend(collectionRouteEndpoints, collectionEndpoints[method].call(this, collection));
                } else { _.extend(entityRouteEndpoints, collectionEndpoints[method].call(this, collection)); }
            });
        } else {
            // Generate any endpoints that haven't been explicitly excluded
            methods.forEach((method) => {
                if (!Array.from(excludedEndpoints).includes(method) && (endpointsAwaitingConfiguration[method] !== false)) {
                    // Configure endpoint and map to it's http method
                    // TODO: Consider predefining a map of methods to their http method type (e.g., getAll: get)
                    const endpointOptions = endpointsAwaitingConfiguration[method];
                    const configuredEndpoint = {};
                    _.each(collectionEndpoints[method].call(this, collection), (action, methodType) => configuredEndpoint[methodType] =
                        _.chain(action)
                        .clone()
                        .extend(endpointOptions)
                        .value());
                    // Partition the endpoints into their respective routes
                    if (Array.from(methodsOnCollection).includes(method)) {
                        _.extend(collectionRouteEndpoints, configuredEndpoint);
                    } else { _.extend(entityRouteEndpoints, configuredEndpoint); }
                    return;
                }
            });
        }

        // Add the routes to the API
        this.addRoute(path, routeOptions, collectionRouteEndpoints);
        this.addRoute(`${path}/:id`, routeOptions, entityRouteEndpoints);

        return this;
    }


    /*
    Add /login and /logout endpoints to the API
    */
    _initAuth() {
        const self = this;
        /*
      Add a login endpoint to the API

      After the user is logged in, the onLoggedIn hook is called (see Restfully.configure() for
      adding hook).
      */
        this.addRoute('login', {authRequired: false}, {
            post() {
                // Grab the username or email that the user is logging in with
                let auth;
                const user = {};
                if (this.bodyParams.user) {
                    if (this.bodyParams.user.indexOf('@') === -1) {
                        user.username = this.bodyParams.user;
                    } else {
                        user.email = this.bodyParams.user;
                    }
                } else if (this.bodyParams.username) {
                    user.username = this.bodyParams.username;
                } else if (this.bodyParams.email) {
                    user.email = this.bodyParams.email;
                }

                let {
                    password
                } = this.bodyParams;
                if (this.bodyParams.hashed) {
                    password = {
                        digest: password,
                        algorithm: 'sha-256'
                    };
                }

                // Try to log the user into the user's account (if successful we'll get an auth token back)
                try {
                    auth = Auth.loginWithPassword(user, password);
                } catch (e) {
                    return{
                        statusCode: e.error,
                        body: { status: 'error', message: e.reason }
                    };
                }

                // Get the authenticated user
                // TODO: Consider returning the user in Auth.loginWithPassword(), instead of fetching it again here
                if (auth.userId && auth.authToken) {
                    const searchQuery = {};
                    searchQuery[self._config.auth.token] = Accounts._hashLoginToken(auth.authToken);
                    this.user = Meteor.users.findOne(
                        {'_id': auth.userId},
                        searchQuery);
                    this.userId = this.user != null ? this.user._id : undefined;
                }

                const response = {status: 'success', data: auth};

                // Call the login hook with the authenticated user attached
                const extraData = self._config.onLoggedIn != null ? self._config.onLoggedIn.call(this) : undefined;
                if (extraData != null) {
                    _.extend(response.data, {extra: extraData});
                }

                return response;
            }
        }
        );

        const logout = function() {
            // Remove the given auth token from the user's account
            const authToken = this.request.headers['x-auth-token'];
            const hashedToken = Accounts._hashLoginToken(authToken);
            const tokenLocation = self._config.auth.token;
            const index = tokenLocation.lastIndexOf('.');
            const tokenPath = tokenLocation.substring(0, index);
            const tokenFieldName = tokenLocation.substring(index + 1);
            const tokenToRemove = {};
            tokenToRemove[tokenFieldName] = hashedToken;
            const tokenRemovalQuery = {};
            tokenRemovalQuery[tokenPath] = tokenToRemove;
            Meteor.users.update(this.user._id, {$pull: tokenRemovalQuery});

            const response = {status: 'success', data: {message: 'You\'ve been logged out!'}};

            // Call the logout hook with the authenticated user attached
            const extraData = self._config.onLoggedOut != null ? self._config.onLoggedOut.call(this) : undefined;
            if (extraData != null) {
                _.extend(response.data, {extra: extraData});
            }

            return response;
        };

        /*
      Add a logout endpoint to the API

      After the user is logged out, the onLoggedOut hook is called (see Restfully.configure() for
      adding hook).
      */
        return this.addRoute('logout', {authRequired: true}, {
            get() {
                console.warn("Warning: Default logout via GET will be removed in Restivus v1.0. Use POST instead.");
                console.warn("    See https://github.com/kahmali/meteor-restivus/issues/100");
                return logout.call(this);
            },
            post: logout
        });
    }

    async addSwagger(swaggerPath, swaggerJson) {
        // Set constants
        const restivus = this;
        const config = restivus._config;
        let swagger = null;
        if (restivus.swagger && !swaggerJson) {
            swaggerJson = restivus.swagger;
        }

        if (config.deRef) {
           swagger = await $RefParser.dereference(swaggerJson, config.deRef);
        } else {
            swagger = swaggerJson;
        }

        let foundPaths = null;

        // Call add Route
        restivus.addRoute(swaggerPath, {authRequired: false}, {
            get: function () {
                // Check if swagger configuration exists
                if(swagger === undefined ||
                    swagger === undefined) {
                    return {"error": "Swagger configuration not given for Restivus."};
                }
                else {
                    // Initialize swagger.json documentation object
                    let doc = {};

                    if (swagger.paths) {
                        foundPaths = swagger.paths;
                        delete swagger.paths;
                    }

                    // Add main meta from config
                    Object.assign(doc, swagger);


                    // Add securityDefinitions for default authentication
                    if(config.useDefaultAuth) {
                        const security = {
                            securityDefinitions: {
                                userId: {
                                    type: 'apiKey',
                                    name: 'X-User-Id',
                                    in: 'header',
                                },
                                authToken: {
                                    type: 'apiKey',
                                    name: 'X-Auth-Token',
                                    in: 'header',
                                },
                            }
                        }
                        Object.assign(doc, security);
                    }

                    // if the components have a top level components, flatten it a little.
                    if (swagger.components) {
                        if (swagger.components.components) {
                            swagger.components = swagger.components.components;
                        }
                    }

                    // Loop through all routes
                    let paths = {};
                    restivus._routes.forEach((route) => {
                        // Exclude swagger and possible users paths
                        if(route.path !== swaggerPath &&
                            !route.path.includes('users') )
                        {

                            // Modify path parameter to swagger spec style
                            // Replaces :param with {param}
                            const newPath = route.path.replace(/:(\w+)/g, '{$1}');
                            // Use path as key
                            const key = '/'.concat(newPath);

                            // Array of endpoint keys
                            const routeEndpoints = Object.keys(route.endpoints);

                            // Exclude options from routeEndpoints array
                            const endpoints = _.without(routeEndpoints, 'options');

                            // Init currentPath
                            paths[key] = {};
                            let currentPath = paths[key];

                            // Loop through endpoints
                            endpoints.forEach((endpoint) => {
                                let currentEndpoint = route.endpoints[endpoint];

                                // Add user-defined swagger metadata for endpoint if exists
                                if(currentEndpoint.swagger !== undefined) {
                                    currentPath[endpoint] = currentEndpoint.swagger;
                                } else if (foundPaths && foundPaths[key]) {
                                    currentPath[endpoint] = foundPaths[key][endpoint];
                                } else if (config.useDefaultAuth) {
                                    // Add swagger metadata for default authentication endpoints
                                    const authTag = 'Authentication'
                                    if(route.path === 'login') {
                                        currentPath[endpoint] = {
                                            tags: [
                                                authTag,
                                            ],
                                            description: 'Login',
                                            parameters: [
                                                {
                                                    name: 'authentication',
                                                    in: 'body',
                                                    description: 'User credentials',
                                                    required: true,
                                                    schema: {
                                                        $ref: '#/definitions/Authentication',
                                                    },
                                                },
                                            ],
                                            responses: {
                                                200: {
                                                    description: 'Successful login',
                                                },
                                                401: {
                                                    description: 'Unauthorized',
                                                },
                                            },
                                        }
                                    } else if(route.path === 'logout' && endpoint === 'post') {
                                        currentPath[endpoint] = {
                                            tags: [
                                                authTag,
                                            ],
                                            description: 'Logout',
                                            responses: {
                                                200: {
                                                    description: 'Successful logout',
                                                },
                                                401: {
                                                    description: 'Unauthorized',
                                                },
                                            },
                                        }
                                    }
                                }
                            });
                        }
                    });

                    // Add paths to Swagger doc
                    doc.paths = paths;

                    // Init definitions object
                    let definitions = {};
                    // Default authentication object definition
                    if(config.useDefaultAuth) {
                        Object.assign(definitions, {
                            Authentication: {
                                type: 'object',
                                required: [
                                    'username',
                                    'password',
                                ],
                                properties: {
                                    username: {
                                        type: 'string',
                                    },
                                    password: {
                                        type: 'string',
                                    }
                                }
                            },
                        });
                    }

                    // Return swagger.json
                    return doc;
                }
            }
        });
    }
}

export { Restivus };
