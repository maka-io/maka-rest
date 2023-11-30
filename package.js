Package.describe({
    name: 'maka:rest',
    summary: 'Create authenticated REST APIs in Meteor 1.10.2+ via HTTP/HTTPS',
    version: '2.0.13',
    git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
    'url-parse': '1.5.10',
    '@apidevtools/json-schema-ref-parser': '11.1.0',
    'yamljs': '0.3.0',
    'limiter': '2.1.0'
});

Package.onUse(function (api) {
    // Minimum Meteor version
    api.versionsFrom(['1.10.2','2.3', '2.6', '2.7','3.0-alpha.19']);

    // Meteor dependencies
    api.use('check');
    api.use('underscore');
    api.use('ecmascript');
    api.use('accounts-password');
    api.use('simple:json-routes@2.3.1');

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
