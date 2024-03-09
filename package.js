Package.describe({
  name: 'maka:rest',
  summary: 'Create authenticated REST APIs in Meteor 2.13+ via HTTP/HTTPS',
  version: '4.0.7',
  git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
  '@types/meteor': '2.9.7',
  '@types/express': '4.17.21',
  '@maka/types': '1.1.9',
  'express': '4.18.2',
  'http-status-codes': '2.3.0',
  'rate-limiter-flexible': '4.0.0',
  'redis': '4.6.11'
});

Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom(['2.13', '3.0-alpha.19']);

  // Meteor dependencies
  api.use('ecmascript');
  api.use('typescript');

  // Exports
  api.mainModule('lib/maka-rest.ts', 'server');
});

Package.onTest(function (api) {

});
