Package.describe({
  name: 'maka:rest',
  summary: 'Create authenticated REST APIs in Meteor 2.13+ via HTTP/HTTPS',
  version: '4.0.13',
  git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
  '@types/meteor': '2.9.9',
  '@types/express': '5.0.3',
  '@maka/types': '1.1.9',
  'express': '5.1.0',
  'http-status-codes': '2.3.0',
  'rate-limiter-flexible': '7.2.0',
  'redis': '5.8.1'
});

Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom(['2.13', '3.0-beta.6']);

  // Meteor dependencies
  api.use('ecmascript');
  api.use('typescript');

  // Exports
  api.mainModule('lib/maka-rest.ts', 'server');
});

Package.onTest(function (api) {

});
