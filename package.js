Package.describe({
  name: 'maka:rest',
  summary: 'Create authenticated REST APIs in Meteor 2.13+ via HTTP/HTTPS',
  version: '4.0.20',
  git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
  '@types/meteor': '2.9.9',
  '@types/express': '5.0.3',
  'express': '5.1.0',
  'http-status-codes': '2.3.0',
  'rate-limiter-flexible': '7.2.0',
  'redis': '5.8.1'
});

Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom(['3.5']);

  // Meteor dependencies
  api.use('ecmascript');
  api.use('typescript');
  // Provides the Accounts object and its token internals. accounts-password
  // stays the consuming app's responsibility -- it is only needed by the
  // default login endpoints, via Accounts._checkPasswordAsync.
  api.use('accounts-base', 'server');
  // Weak: only routes using roleRequired need it, so the consuming app
  // decides whether to install it. Reached via the Package registry at
  // call time -- see Route.resolveRoles.
  //
  // The version constraint is required: publishing fails without one, even
  // for a weak dependency. 4.0.0 is the Meteor 3 line, and _roleAccepted
  // needs userIsInRoleAsync/getScopesForUserAsync, which the 3.6.x series
  // predates.
  api.use('alanning:roles@4.0.0', 'server', { weak: true });

  // maka-rest.ts (and route.ts in turn) import these siblings with
  // relative paths -- not covered by mainModule() on its own. They must
  // be added explicitly or they can be dropped when this package is
  // consumed as a downloaded/pre-built isopack and recompiled by the
  // consumer's build (same bug and fix as maka:http@1.1.13's
  // http-common.ts).
  api.addFiles([
    'lib/auth.ts',
    'lib/codes.ts',
    'lib/json-routes.ts',
    'lib/route.ts',
  ], 'server');

  // Exports
  api.mainModule('lib/maka-rest.ts', 'server');
});

Package.onTest(function (api) {
  api.use('maka:rest');

  api.use([
    'ecmascript',
    'typescript',
    'meteortesting:mocha@3.4.0',
    'mongo',
    'webapp',
    'accounts-base',
    'accounts-password',
    'alanning:roles@4.0.0',
  ]);

  api.addFiles([
    'test/_fixture.ts',
    'test/codes-tests.ts',
    'test/json-routes-tests.ts',
    'test/route-tests.ts',
    'test/auth-tests.ts',
    'test/http-tests.ts',
  ], 'server');
});
