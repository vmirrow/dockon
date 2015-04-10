// Include all of the modules used by Koneas here.

// This require puts itself in the GLOBAL scope.
require('js-methods');

GLOBAL.events = require('events');
GLOBAL.fs = require('fs');
GLOBAL.http = require('http');
GLOBAL.spdy = require('spdy'),
GLOBAL.tls = require('tls'),
GLOBAL.util = require('util'),
GLOBAL.uuid = require('node-uuid');
GLOBAL.qs = require('querystring');


// Store our path globally, so we don't have to keep deriving it.
GLOBAL.path = require('path').dirname(require.main.filename);
if(GLOBAL.path === undefined) {
    throw new Error('Global Path Not Loaded');
}

// TODO: Add commard-line argument parsing here to allow overrides.
// This should determine which config file to load. It should also override options in the config.

// Include our configuration file.
// NOTE: The GLOBAL.config.debug flag can be used in the code to determine if we're in debug mode or not.
GLOBAL.config = require(GLOBAL.path+'/config/default');

// Load the appropriate overrides if any were given
// FIXME: This is overly hard-coded
if(process.argv[2] == '-config') {
  require(GLOBAL.path+'/config/'+process.argv[3])
}

// Load the certificates based on our config
GLOBAL.config.tls.server.key = GLOBAL.fs.readFileSync(GLOBAL.config.tls.server.keyPath)
GLOBAL.config.tls.server.cert = GLOBAL.fs.readFileSync(GLOBAL.config.tls.server.certPath)

// Include our global logger.
GLOBAL.log = require(GLOBAL.path+'/lib/log')(GLOBAL.config.log.file, GLOBAL.config.log.level, GLOBAL.config.log.mode, GLOBAL.config.debug);

// Ensure we loaded the configuration and logger.
if(GLOBAL.config === undefined) {
    throw new Error('Global Configuration Not Loaded');
}
if(GLOBAL.log === undefined) {
    throw new Error('Global Logger Not Loaded');
}
