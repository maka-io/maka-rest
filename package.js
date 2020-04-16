Package.describe({
    name: 'maka:rest',
    summary: 'Create authenticated REST APIs in Meteor 1.10.1+ via HTTP/HTTPS',
    version: '0.9.7',
    git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
  "url-parse": "1.1.7"
});

Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom('METEOR@1.10.1');

  // Meteor dependencies
  api.use('check');
  api.use('underscore');
  api.use('ecmascript');
  api.use('accounts-password@1.3.3');
  api.use('simple:json-routes@2.1.0');

  //api.addFiles('lib/auth.js', 'server');
  //api.addFiles('lib/route.js', 'server');
  //api.addFiles('lib/restivus.js', 'server');
  // api.addFiles('lib/restivus-swagger.js', 'server');

  // Exports
  //api.export('Restivus', 'server');
    api.mainModule('lib/restivus.js', 'server');
});


Package.onTest(function (api) {

});
