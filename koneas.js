#!/usr/local/bin/node

/*
var memwatch = require('memwatch');
var colors = require('colors');

var hd = {};
memwatch.on('leak', function(info) {
    console.log('leak'.red, info);
    console.log(require('util').inspect(hd.end(), false, 5));
});
memwatch.on('stats', function(stats) {
    hd = new memwatch.HeapDiff();
    console.log('stats'.green, stats);
});
*/

/**
 * The following reqires store themselves in the GLOBAL scope.
 * So, GLOBAL.log and GLOBAL.config, GLOBAL.path, etc.
 *
 * globals.js is also where all of the modules get included.
 * They are also stored in the GLOBAL scope.
 *
 */
require(__dirname+'/lib/init');

/**
 * Wrapping this in a main() function to make logging neater.
 *
 */
var main = function main()
{
    GLOBAL.log.info(GLOBAL.log.StartMessage);

    // Handle uncaught exceptions here.
    process.on('uncaughtException', function UncaughtExceptionHandler(error) {
        GLOBAL.log.panic('Caught Unhandled Exception', error);
        CleanupHandler('UNHANDLED_EXCEPTION');
    });


    process.on('SIGHUP', function SigHupHandler() {
        GLOBAL.log.debug('Caught SIGHUP');
    });

    // Handle (SIGTERM).
    process.on('SIGTERM', function SigTermHandler() {
        GLOBAL.log.debug('Caught SIGTERM');
        CleanupHandler('SIGTERM');
    });

    // Handle Ctrl-C (SIGINT).
    process.on('SIGINT', function SigIntHandler() {
        GLOBAL.log.debug('Caught SIGINT');
        CleanupHandler('SIGINT');
    });

    // Toggle debug mode (SIGUSR2).
    // Right now this doesn't do anything, but it's here in case we want to do something with it.
    process.on('SIGUSR2', function SigUsr2Handler() {
        GLOBAL.debug = !GLOBAL.debug;
        GLOBAL.log.debug('Caught SIGUSR2', { debug: GLOBAL.debug });
    });

    // Log the fact that we're exiting.
    process.on('exit', function ExitHandler(code) {
        GLOBAL.log.info('Koneas Exited', { code: code });
    });

    // Handle pid file creation and removal (if enabled).
    if(GLOBAL.config.pid) {
        try {
            // If the pid file exists, then read it in, and do a kill -0 to see if the pid belongs to a running process.
            if(GLOBAL.fs.existsSync(GLOBAL.config.pid.file)) {
                var current_pid = GLOBAL.fs.readFileSync(GLOBAL.config.pid.file).toString();

                var process_exists = false;
                try {
                    // process.kill() throws an exception if the process doesn't exist.
                    process.kill(current_pid, 0);
                    process_exists = true;
                }
                catch(error) {
                    process_exists = false;
                }

                if(process_exists) {
                    GLOBAL.log.panic('Koneas is already running!', { pid: current_pid });
                    process.exit(1);
                }
            }

            require('npid').create(GLOBAL.config.pid.file, true).removeOnExit();
        }
        catch(error) {
            log.panic('Pid Creation Failed', error.message);
            process.exit(1);
        }
    }

    // Helper function to handle koneas shutdown.
    // It attempts to disconnect all of the agents
    // so a proper disconnect event can occur.
    function CleanupHandler(code)
    {
        GLOBAL.log.warn('Attempting Cleanup Before Shutdown');

        agentlistener.Stop();
        // Stop() causes the socket close events to trigger, which we handle.
        // So, this is a lame attempt to make sure we give enough time to handle
        // those close events before going down for the count.
        // Without this kludge (surely there's a better way), we would shutdown
        // before the events even occur. :(
        // We stop the listener when we call Stop()
        // so no new connections will come in.
        var attempts = 0;
        var connection_count = 0;
        var last_connection_count = 0;

        setInterval(function CleanupHandler() {
            connection_count = agentlistener.ConnectionCount();
            if(connection_count == 0) {
                process.nextTick(function CleanupHandler() {
                    process.exit(code);
                });
            }
            else if(attempts == 10 && last_connection_count == connection_count) {
                process.nextTick(function CleanupHandler() {
                    process.exit(code);
                });
            }
            last_connection_count = connection_count;
            attempts++;
        }, 500);
    }

    // Setup our listeners and handlers.
    var AgentListener = require(GLOBAL.path+'/lib/AgentListener');
    var AgentHandler = require(GLOBAL.path+'/lib/AgentHandler');
    var RequesterListener = require(GLOBAL.path+'/lib/RequesterListener');

    var agentlistener = new AgentListener(AgentHandler);
    var requesterlistener = new RequesterListener(agentlistener);
}();
