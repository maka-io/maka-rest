Package.describe({
  name: 'maka:rest',
  summary: 'Create authenticated REST APIs in Meteor 2.13+ via HTTP/HTTPS',
  version: '4.0.16',
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

});
