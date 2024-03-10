# Maka-Rest

#### REST APIs for the Best of Us!

## Table of Contents
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Terminology](#terminology)
- [Writing a Maka-Rest API](#writing-a-maka-rest-api)
  - [Configuration Options](#configuration-options)
  - [Defining Custom Routes](#defining-custom-routes)
    - [Path Structure](#path-structure)
    - [Route Options](#route-options)
    - [Defining Endpoints](#defining-endpoints)
      - [Endpoint Configuration](#endpoint-configuration-1)
      - [Endpoint Context](#endpoint-context)
      - [Response Data](#response-data)
  - [Versioning an API](#versioning-an-api)
  - [Documenting an API](#documenting-an-api)
- [Consuming a Maka-Rest API](#consuming-a-maka-rest-api)
  - [Basic Usage](#basic-usage)
  - [Authenticating](#authenticating)
    - [Default Authentication](#default-authentication)
      - [Logging In](#logging-in)
      - [Logging Out](#logging-out)
      - [Authenticated Calls](#authenticated-calls)

# Getting Started

## Installation

You can install Maka-Rest using Meteor's package manager:
```bash
> meteor add maka:rest
```

Or using maka-cli

```bash
> maka add maka:rest
```

## Quick Start

```javascript
	import MakaRest from 'meteor/maka:rest';
```

Often, the easiest way to explain something is by example, so here's a short example of what it's
like to create an API with Maka-Rest:

```javascript
Items = new Mongo.Collection('items');
Articles = new Mongo.Collection('articles');

if (Meteor.isServer) {
  // Global API configuration
  const Api = new MakaRest({
    useDefaultAuth: true,
    prettyJson: true
  });

  // Maps to: /api/articles/:id
  Api.addRoute('articles/:id', {authRequired: true}, {
    get() {
      return Articles.findOne(this.urlParams.id);
    },
    delete: {
      roleRequired: ['author', 'admin'],
      action() {
        if (Articles.remove(this.urlParams.id)) {
          return {status: 'success', data: {message: 'Article removed'}};
        }
        return {
          statusCode: 404,
          body: {status: 'fail', message: 'Article not found'}
        };
      }
    }
  });
}
```

## Terminology

Just to clarify some terminology that will be used throughout these docs:

_**(HTTP) Method:**_
- The type of HTTP request (e.g., GET, PUT, POST, etc.)

_**Endpoint:**_
- The function executed when a request is made at a given URL path for a specific HTTP method

_**Route:**_
- A URL path and its set of configurable endpoints

# Writing A Maka-Rest API

**Maka-Rest is a _server-only_ package. Attempting to access any of its methods from the client will
result in an error.**

## Configuration Options

The following configuration options are available when initializing an API using
`new Maka-Rest(options)`:

##### `apiPath`
- _String_
- Default: `'api/'`
- The base path for your API. If you use `'api'` and add a route called `'users'`, the URL will be
  `https://yoursite.com/api/users/`.

##### `auth`
- _Object_
  - `token`  _String_
    - Default: `'services.resume.loginTokens.hashedToken'`
    - The path to the hashed auth token in the `Meteor.user` document. This location will be checked
      for a matching token if one is returned in `auth.user()`.
  - `user`  _Function_
    - Default: Get user from `X-Auth-Token` headers
        ```javascript
        function() {
          return {
            token: Accounts._hashLoginToken(this.request.headers['x-auth-token'])
          };
        }
        ```

    - Provides one of two levels of authentication, depending on the data returned. The context
      within this function is the [endpoint context](#endpoint-context) without `this.user` and completes successfully, the authenticated user and their ID will be attached to the [endpoint
      context](#endpoint-context).

      For either level of auth described above, you can optionally return a custom error response by
      providing that response in an `error` field of your response object. The `error` value can be
      [any valid response](#response-data). If an `error` field exists in the object returned from
      your custom auth function, all other fields will be ignored. Do **not** provide an `error`
      value if you intend for the authentication to pass successfully.

##### `defaultHeaders`
- _Object_
- Default: `{ 'Content-Type': 'application/json' }`
- The response headers that will be returned from every endpoint by default. These can be overridden
  by [returning `headers` of the same name from any endpoint](#response-data).

##### `defaultOptionsEndpoint`
- [_Endpoint_](#endpoint-configuration)
- Default: undefined
- If an endpoint is provided, it will be used as the OPTIONS endpoint on all routes, except those
  that have one manually defined. This can be used to DRY up your API, since OPTIONS endpoints will
  frequently [respond generically](http://zacstewart.com/2012/04/14/http-options-method.html) across
  all routes.

##### `enableCors`
- _Boolean_
- Default: `true`
- If true, enables cross-origin resource sharing ([CORS]). This allows your API to receive requests
  from _any_ domain (when `false`, the API will only accept requests from the domain where the API
  is being hosted. _Note: Only applies to requests originating from browsers)._

##### `prettyJson`
- _Boolean_
- Default: `false`
- If `true`, render formatted JSON in response.

##### `useDefaultAuth`
- _Boolean_
- Default: `false`
- If `true`, `POST /login` and `GET /logout` endpoints are added to the API. See [Authenticating]
  (#authenticating) for details on using these endpoints.

##### `version`
- _String_
- Default: `null`
- URL path versioning is the only type of API versioning currently available, so if a version is
  provided, it's appended to the base path of all routes that belong to that API
    ```javascript
    // Base URL path: my-api/v1/
    ApiV1 = new MakaRest({
      apiPath: 'my-api/',
      version: 'v1'
    });

    // Base URL path: my-api/v2/
    ApiV2 = new MakaRest({
      apiPath: 'my-api/',
      version: 'v2'
    });
    ```

Here's a sample configuration with the complete set of options:

**Warning! For demo purposes only - using this configuration is not recommended!**

```javascript
  new MakaRest({
    apiPath: 'my-api/',
    auth: {
      token: 'auth.apiKey',
      user: function () {
        return {
          userId: this.request.headers['user-id'],
          token: this.request.headers['login-token']
        };
      }
    },
    defaultHeaders: {
      'Content-Type': 'application/json'
    },
    prettyJson: true,
    useDefaultAuth: true,
    version: 'v1'
  });
```

#### Route Configuration

The top level properties of the options apply to both routes that will be generated
(`/api/<collection>` and `/api/<collection>/:id`):

##### `path`
- _String_
- The base path for the generated routes. Given a path `'other-path'`, routes will be generated at
  `'api/other-path'` and `'api/other-path/:id'`

##### `routeOptions`
- _Object_
- `authRequired` _Boolean_
  - Default: `false`
  - If true, all endpoints on these routes will return a `401` if the user is not properly
    [authenticated](#authenticating).
- `roleRequired` _String or Array of Strings_
  - Default: `undefined` (no role required)
  - The acceptable user roles for all endpoints on this route (e.g., `'admin'`, `['admin', 'dev']`).
    Additional role permissions can be defined on specific endpoints. If the authenticated user does
    not belong to at least one of the accepted roles, a `403` is returned. Since a role cannot be
    verified without an authenticated user, setting the `roleRequired` implies `authRequired: true`,
    so that option can be omitted without any consequence. For more on setting up roles, check out
    the [`alanning:roles`][alanning-roles] package.

##### `excludedEndpoints`
- _String or Array of Strings_
- Default: `undefined`
- The names of the endpoints that should _not_ be generated (see the `endpoints` option below for a
  complete list of endpoint names).

##### `endpoints`
- _Object_
- Default: `undefined` (all available endpoints generated)
- Each property of this object corresponds to a REST endpoint. In addition to the
  `excludedEndpoints` list, you can also prevent an endpoint from being generated by setting its
  value to `false`. All other endpoints will be generated. The complete set of configurable
  properties on these endpoints is described in the [Endpoint Configuration](#endpoint-configuration)
  section below. Here is a list of all available endpoints, including their corresponding HTTP method,
  path, and a short description of their behavior:
  - `getAll` [_Endpoint_](#endpoint-configuration)
    - `GET /api/collection`
    - Return a list of all entities within the collection (filtered searching via query params
      coming soon!).
  - `post` _Endpoint_
    - `POST /api/collection`
    - Add a new entity to the collection. All data passed in the request body will be copied into
      the newly created entity. **Warning: This is unsafe for now, as no type or bounds checking is
      done.**
  - `get` _Endpoint_
    - `GET /api/collection/:id`
    - Return the entity with the given `:id`.
  - `put` _Endpoint_
    - `PUT /api/collection/:id`
    - Completely replace the entity with the given `:id` with the data contained in the request
      body. Any fields not included will be removed from the document in the collection.
  - `patch` _Endpoint_
    - `PATCH /api/collection/:id`
    - Partially modify the entity with the given `:id` with the data contained in the request
      body. Only fields included will be modified.
  - `delete` _Endpoint_
    - `DELETE /api/collection/:id`
    - Remove the entity with the given `:id` from the collection.

#### Endpoint Configuration

By default, each of the endpoints listed above is `undefined`, which means it will be generated with
any default route options. If you need finer control over your endpoints, each can be defined as an
object containing the following properties:

##### `authRequired`
- _Boolean_
- Default: `undefined`
- If true, this endpoint will return a `401` if the user is not properly [authenticated]
  (#authenticating). If defined, this overrides the option of the same name defined on the entire
  route.

##### `roleRequired`
- _String or Array of Strings_
- Default: `undefined` (no role required)
- The acceptable user roles for this endpoint (e.g.,
  `'admin'`, `['admin', 'dev']`). These roles will be accepted in addition to any defined over the
  entire route. If the authenticated user does not belong to at least one of the accepted roles, a
  `403` is returned. Since a role cannot be verified without an authenticated user, setting the
  `roleRequired` implies `authRequired: true`, so that option can be omitted without any
  consequence. For more on setting up roles, check out the [`alanning:roles`][alanning-roles]
  package.

##### `action`
- _Function_
- Default: `undefined` (Default endpoint generated)
- If you need to completely override the default endpoint behavior, you can provide a function
  that will be executed when the corresponding request is made. No parameters are passed; instead,
  `this` contains the [endpoint context](#endpoint-context), with properties including the URL and
  query parameters.


### Request and Response Structure

All responses generated by Maka-Rest follow the [JSend] format, with one minor tweak: failures have
an identical structure to errors. Successful responses will have a status code of `200`, unless
otherwise indicated. Sample requests and responses for each endpoint are included below:

#### `post`
Request:
```bash
curl -X POST http://localhost:3000/api/articles/ -d "title=Witty Title" -d "author=Jack Rose"
```

Response:

Status Code: `201`
```json
{
  "status": "success",
  "data": {
    "_id": "LrcEYNojn5N7NPRdo",
    "title": "Witty Title",
    "author": "Jack Rose"
  }
}
```

#### `getAll`
Request:
```bash
curl -X GET http://localhost:3000/api/articles/
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "_id": "LrcEYNojn5N7NPRdo",
      "title": "Witty Title!",
      "author": "Jack Rose",
    },
    {
      "_id": "7F89EFivTnAcPMcY5",
      "title": "Average Stuff",
      "author": "Joe Schmoe",
    }
  ]
}
```

#### `get`
Request:
```bash
curl -X GET http://localhost:3000/api/articles/LrcEYNojn5N7NPRdo
```

Response:
```json
{
  "status": "success",
  "data": {
    "_id": "LrcEYNojn5N7NPRdo",
    "title": "Witty Title",
    "author": "Jack Rose",
  }
}
```

#### `put`
Request:
```bash
curl -X PUT http://localhost:3000/api/articles/LrcEYNojn5N7NPRdo -d "title=Wittier Title" -d "author=Jaclyn Rose"
```

Response:
```json
{
  "status": "success",
  "data": {
    "_id": "LrcEYNojn5N7NPRdo",
    "title": "Wittier Title",
    "author": "Jaclyn Rose"
  }
}
```

#### `patch`
Request:
```bash
curl -X PATCH http://localhost:3000/api/articles/LrcEYNojn5N7NPRdo -d "author=J. K. Rowling"
```

Response:
```json
{
  "status": "success",
  "data": {
    "_id": "LrcEYNojn5N7NPRdo",
    "title": "Wittier Title",
    "author": "J. K. Rowling"
  }
}
```

#### `delete`
Request:
```bash
curl -X DELETE http://localhost:3000/api/articles/LrcEYNojn5N7NPRdo
```

Response:
```json
{
  "status": "success",
  "data": {
    "message": "Item removed"
  }
}
```


## Defining Custom Routes

Routes are defined using `Maka-Rest#addRoute()`. A route consists of a path and a set of endpoints
defined at that path.

### Path Structure

The `path` is the 1st parameter of `Maka-Rest#addRoute`. You can pass it a string or regex. If you
pass it `test/path`, the full path will be `https://yoursite.com/api/test/path`.

Paths can have variable parameters. For example, you can create a route to show a post with a
specific id. The `id` is variable depending on the post you want to see such as "/articles/1" or
"/articles/2". To declare a named parameter in the path, use the `:` syntax followed by the parameter
name. When a user goes to that URL, the actual value of the parameter will be stored as a property
on `this.urlParams` in your endpoint function.

In this example we have a parameter named `_id`. If we navigate to the `/post/5` URL in our browser,
inside of the GET endpoint function we can get the actual value of the `_id` from
`this.urlParams._id`. In this case `this.urlParams._id => 5`.

```javascript
// Given a URL "/post/5"
Api.addRoute('/post/:_id', {
  get: function () {
    const id = this.urlParams._id; // "5"
  }
});
```

You can have multiple URL parameters. In this example, we have an `_id` parameter and a `commentId`
parameter. If you navigate to the URL `/post/5/comments/100` then inside your endpoint function
`this.urlParams._id => 5` and `this.urlParams.commentId => 100`.

```javascript
// Given a URL "/post/5/comments/100"
Api.addRoute('/post/:_id/comments/:commentId', {
  get: function () {
    const id = this.urlParams._id; // "5"
    const commentId = this.urlParams.commentId; // "100"
  }
});
```

If there is a query string in the URL, you can access that using `this.queryParams`.

```javascript
// Given the URL: "/post/5?q=liked#hash_fragment"
Api.addRoute('/post/:_id', {
  get: function () {
    const id = this.urlParams._id;
    const query = this.queryParams; // query.q -> "liked"
  }
});
```

### Route Options

The following options are available in `Maka-Rest#addRoute` (as the 2nd, optional parameter):
##### `authRequired`
- _Boolean_
- Default: `false`
- If true, all endpoints on this route will return a `401` if the user is not properly
  [authenticated](#authenticating).

##### `roleRequired`
- _String or Array of Strings_
- Default: `undefined` (no role required)
- A string or array of strings corresponding to the acceptable user roles for all endpoints on
  this route (e.g., `'admin'`, `['admin', 'dev']`). Additional role permissions can be defined on
  specific endpoints. If the authenticated user does not belong to at least one of the accepted
  roles, a `403` is returned. Since a role cannot be verified without an authenticated user,
  setting the `roleRequired` implies `authRequired: true`, so that option can be omitted without
  any consequence. For more on setting up roles, check out the [`alanning:roles`][alanning-roles]
  package.

### Defining Endpoints

The last parameter of `Maka-Rest#addRoute` is an object with properties corresponding to the supported
HTTP methods. At least one method must have an endpoint defined on it. The following endpoints can
be defined in Maka-Rest:
- `get`
- `post`
- `put`
- `patch`
- `delete`
- `options`

These endpoints can be defined one of two ways. First, you can simply provide a function for each
method you want to support at the given path. The corresponding endpoint will be executed when that
type of request is made at that path.

For finer-grained control over each endpoint, you can also define each one as an object
containing the endpoint action and some addtional configuration options.

#### Endpoint Configuration

An `action` is required when configuring an endpoint. All other configuration settings are optional,
and will get their default values from the route.

##### `action`
- _Function_
- Default: `undefined`
- A function that will be executed when a request is made for the corresponding HTTP method.

##### `authRequired`
- _String_
- Default: [`Route.authRequired`](#authrequired-1)
- If true, this endpoint will return a `401` if the user is not properly
  [authenticated](#authenticating). Overrides the option of the same name defined on the entire
  route.

##### `roleRequired`
- _String or Array of Strings_
- Default: [`Route.roleRequired`](#rolerequired-1)
- The acceptable user roles for this endpoint (e.g.,
  `'admin'`, `['admin', 'dev']`). These roles will be accepted in addition to any defined over the
  entire route. If the authenticated user does not belong to at least one of the accepted roles, a
  `403` is returned. Since a role cannot be verified without an authenticated user, setting the
  `roleRequired` implies `authRequired: true`, so that option can be omitted without any
  consequence. For more on setting up roles, check out the [`alanning:roles`][alanning-roles]
  package.

```javascript
Api.addRoute('articles', {authRequired: true}, {
  get: {
    authRequired: false,
    action: function () {
      // GET api/articles
    }
  },
  post: function () {
    // POST api/articles
  },
  put: function () {
    // PUT api/articles
  },
  patch: function () {
    // PATCH api/articles
  },
  delete: function () {
    // DELETE api/articles
  },
  options: function () {
    // OPTIONS api/articles
  }
});
```
In the above examples, all the endpoints except the GETs will require [authentication]
(#authenticating).

#### Endpoint Context

Each endpoint has access to:

##### `this.user`
- _Meteor.user_
- The authenticated `Meteor.user`. Only available if `authRequired` is `true` and a user is
  successfully authenticated. If not, it will be `undefined`.

##### `this.userId`
- _String_
- The authenticated user's `Meteor.userId`. Only available if `authRequired` is `true` and a user is
  successfully authenticated. If not, it will be `undefined`.

##### `this.urlParams`
- _Object_
- Non-optional parameters extracted from the URL. A parameter `id` on the path `articles/:id` would be
  available as `this.urlParams.id`.

##### `this.queryParams`
- _Object_
- Optional query parameters from the URL. Given the URL `https://yoursite.com/articles?likes=true`,
  `this.queryParams.likes => true`.

##### `this.bodyParams`
- _Object_
- Parameters passed in the request body. Given the request body `{ "friend": { "name": "Jack" } }`,
  `this.bodyParams.friend.name => "Jack"`.

##### `this.request`
- [_Node request object_][node-request]

##### `this.response`
- [_Node response object_][node-response]
- If you handle the response yourself using `this.response.write()` or `this.response.writeHead()`
  you **must** call `this.done()`. In addition to preventing the default response (which will throw
  an error if you've initiated the response yourself), it will also close the connection using
  `this.response.end()`, so you can safely omit that from your endpoint.

##### `this.done()`
- _Function_
- **Must** be called after handling the response manually with `this.response.write()` or
  `this.response.writeHead()`. This must be called immediately before returning from an endpoint.

  ```javascript
  Api.addRoute('manualResponse', {
    get: function () {
      console.log('Testing manual response');
      this.response.write('This is a manual response');
      this.done();  // Must call this immediately before return!
    }
  });
  ```

##### `this.<endpointOption>`
All [endpoint configuration options](#endpoint-configuration-1) can be accessed by name (e.g.,
`this.roleRequired`). Within an endpoint, all options have been completely resolved, meaning all
configuration options set on an endpoint's route will already be applied to the endpoint as
defaults. So if you set `authRequired: true` on a route and do not set the `authRequired` option on
one if its endpoints, `this.authRequired` will still be `true` within that endpoint, since the
default will already have been applied from the route.

#### Response Data

You can return a raw string:
```javascript
return "That's current!";
```

A JSON object:
```javascript
return { json: 'object' };
```

A raw array:
```javascript
return [ 'red', 'green', 'blue' ];
```

Or include a `statusCode` or `headers`. At least one must be provided along with the `body`:
```javascript
return {
  statusCode: 404,
  headers: {
    'Content-Type': 'text/plain',
    'X-Custom-Header': 'custom value'
  },
  body: 'There is nothing here!'
};
```

All responses contain the following defaults, which will be overridden with any provided values:

##### statusCode
- Default: `200`

##### headers
- Default:
  - `Content-Type`: `application/json`
  - `Access-Control-Allow-Origin`: `*`
    - This is a [CORS-compliant header][cors] that allows requests to be made to the API from any
      domain. Without this, requests from within the browser would only be allowed from the same
      domain the API is hosted on, which is typically not the intended behavior. This can be
      [disabled by default](https://github.com/kahmali/meteor-maka-rest#enablecors), or also by
      returning a header of the same name with a domain specified (usually the domain the API is
      being hosted on).


## Versioning an API

We can't always get an API right on the first try (in fact, most people don't). Eventually, we
find ourselves needing to maintain different versions of our API. This allows clients to convert at
their own convenience, while providing the latest and greatest API to those ready to consume it.

Currently, there is only a single versioning strategy supported in Maka-Rest: URL path versioning. In
this strategy, the version of the API is appended to the base path of all routes belonging to that
API. This allows us to easily maintain multiple versions of an API, each with their own set of
configuration options. Here's a [good write-up]
(http://www.troyhunt.com/2014/02/your-api-versioning-is-wrong-which-is.html) on some of the
different API versioning strategies.

```javascript
// Configure first version of the API
var ApiV1 = new Restivus({
  version: 'v1',
  useDefaultAuth: true,
  prettyJson: true
});

// Maps to api/v1/items and api/v1/items/:id
ApiV1.addCollection(Items, {
  routeOptions: { authRequired: true }
});

// Maps to api/v1/custom
ApiV1.addRoute('custom', {
  get: function () {
    return 'get something';
  }
});

// Configure another version of the API (with a different set of config options if needed)
var ApiV2 = new Restivus({
  version: 'v2',
  enableCors: false
});

// Maps to api/v2/items and api/v2/items/:id (with auth requirement removed in this version)
ApiV2.addCollection(Items);

// Maps to api/v2/custom (notice the different return value)
ApiV2.addRoute('custom', {
  get: function () {
    return {
      status: 'success',
      data: 'get something different'
    };
  }
});
```

## Documenting an API

What's a REST API without awesome docs? I'll tell you: absolutely freaking useless. So to fix that,
we use and recommend [apiDoc][]. It allows you to generate beautiful and extremely handy API docs
from your JavaScript or CoffeeScript comments. It supports other comment styles as well, but we're
Meteorites, so who cares? Check it out. Use it.

# Consuming A Maka-Rest API

The following uses the above code.

## Basic Usage

We can call our `POST /articles/:id/comments` endpoint the following way. Note the /api/ in the URL
(defined with the api_path option above):
```bash
curl -d "message=Some message details" http://localhost:3000/api/articles/3/comments
```

_**Note: There is a 50mb limit on requests. If you need this limit increased, please file a GitHub Issue.**_

## Authenticating

**Warning: Make sure you're using HTTPS, otherwise this is insecure!**

### Default Authentication

_Note: To use the default authentication, you must first [create a user with the `accounts-password`
package](http://docs.meteor.com/#/full/accounts_passwords). You can do this with Maka-Rest if you
[setup a POST collection endpoint for the `Meteor.users` collection](#users-collection-endpoints)._

#### Logging In

If you have `useDefaultAuth` set to `true`, you now have a `POST /api/login` endpoint that returns a
`userId` and `authToken`. You must save these, and include them in subsequent requests. In addition
to the `password`, the login endpoint requires one of the following parameters (via the request
body):
- `email`: An email address associated with your `Meteor.user` account
- `username`: The username associated with your `Meteor.user` account
- `user`: **Note: This is for legacy purposes only. It is recommended to use one of the options
  above.** Accepts either of the options listed above. Maka-Rest will (very naively) attempt to
  determine if the value provided is an email, otherwise it will assume it to be the username. This
  can sometimes lead to unexpected behavior.

A login will look something like

```bash
curl http://localhost:3000/api/login/ -d "username=test&password=password"
```

The password can be SHA-256 hashed on the client side, in which case your request would look like
```bash
curl http://localhost:3000/api/login/ -d "username=test&password=sha-256-password&hashed=true"
```

And the response will look like
```javascript
{"status":"success","data":{"authToken":"8zXkiThVtm3u7pE-7xacuAIrKF1VTA-WA3LRMogqiRp","when":"2020-08-03T16:21:02.361Z"}}
```

You'll need to save the `userId` and `token` on the client, for subsequent authenticated requests.

#### Logging Out

You also have an authenticated `POST /api/logout` endpoint for logging a user out. If successful, the
auth token that is passed in the request header will be invalidated (removed from the user account),
so it will not work in any subsequent requests.
```bash
curl http://localhost:3000/api/logout -X POST -H "X-Auth-Token: 8zXkiThVtm3u7pE-7xacuAIrKF1VTA-WA3LRMogqiRp"
```

#### Authenticated Calls

For any endpoints that require the default authentication, you must include the `userId` and
`authToken` with each request under the following headers:
- X-Auth-Token

```bash
curl -H "X-Auth-Token: f2KpRW7KeN9aPmjSZ" http://localhost:3000/api/articles/
```
