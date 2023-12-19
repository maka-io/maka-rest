Package.describe({
  name: 'maka:rest',
  summary: 'Create authenticated REST APIs in Meteor 2.13+ via HTTP/HTTPS',
  version: '3.0.6',
  git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
  '@types/meteor': '2.9.7',
  '@types/express': '4.17.21',
  'express': '4.18.2',
  'http-status-codes': '2.3.0',
  'rate-limiter-flexible': '4.0.0',
  'redis': '4.6.11'
});

Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom(['2.13', '3.0-alpha.19']);

  // Meteor dependencies
  api.use('check');
  api.use('ecmascript');
  api.use('accounts-password');
  api.use('typescript');
  api.use('alanning:roles@3.6.0');

  // Exports
  api.mainModule('lib/maka-rest.ts', 'server');
});

Package.onTest(function (api) {

});
