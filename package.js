Package.describe({
    name: 'maka:rest',
    summary: 'Create authenticated REST APIs in Meteor 1.10.2+ via HTTP/HTTPS',
    version: '1.1.2',
    git: 'https://github.com/maka-io/maka-rest.git'
});

Npm.depends({
    'url-parse': '1.1.7',
    '@apidevtools/json-schema-ref-parser': '9.0.1',
    'yamljs': '0.3.0'
});

Package.onUse(function (api) {
    // Minimum Meteor version
    api.versionsFrom('METEOR@1.10.2');

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
