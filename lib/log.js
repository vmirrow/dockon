'use strict';

Object.defineProperty(Error.prototype, 'toJSON', {
    value: function () {
        var alt = {};

        Object.getOwnPropertyNames(this).forEach(function (key) {
            alt[key] = this[key];
        }, this);

        return alt;
    },
    configurable: true
});

var logger = {};
var debug_logging_enabled = false;

function log(logfile, level, mode, debug)
{
    debug_logging_enabled = debug || false;

    // Mixin our messages so they are available as require('log.js').blah.
    for(var x in require(__dirname+'/messages.js')) {
        var message = require(__dirname+'/messages.js')[x];
        log.prototype[x] = message; 
    }

    var config = {
        stackIndex: 1,
        methods: [ 'fixme', 'trace', 'panic', 'fatal', 'error', 'warn', 'info', 'debug' ],
        format: "{{timestamp}}|{{title}}|{{file}}{{line}}{{method}}{{file_line_method}}|{{message}}",
        dateformat: "yyyy-mm-dd.HH:MM:sso",
        preprocess:  function(data){
            data.title = data.title.toUpperCase().pad(5, ' ', 1);
            // Combine file, line, and method into a single line.
            data.file_line_method = (data.file.toLowerCase()+':'+data.line+':'+data.method.split('.').pop()).pad(40, ' ', 1);
            // Remove these since we're displaying them as a single line. *Hack*
            data.file = '';
            data.line = '';
            data.method = '';
        }
    };

    config.transport = function(data) {
        switch(mode) {
            case 'both':
                console.log(data.output);
            case 'file':
                if(!logfile.length) {
                    throw new Error('logfile cannot be empty.');
                }
                var stream = GLOBAL.fs.createWriteStream(logfile, {
                    flags: 'a',
                    encoding: 'utf8',
                    mode: '0666'
                });
                stream.write(data.output+"\n");
                stream.end();
            break;
            case 'console':
                console.log(data.output);
            break;
            case 'stdout':
            default:
                if(data.level > 5) {
                    process.stdout.write(data.output+"\n");
                }
                else {
                    process.stderr.write(data.output+"\n");
                }
            break;
        }
    };

    config.level = level || 'info';

    logger = require('tracer').console(config);
};

function _makeMessage(message, data)
{
    if(typeof message === 'object') {
        message = JSON.stringify(message);
    }   

    message = ' '+(message || '').toString().trim().pad(25, ' ', 1)+' |';

    // If debugging is disabled, then we want to loop over all of our objects and convert any Error objects to just Error.message.
    // This is done to keep from printing the stacktrace, which keeps the log concise.
    if(!debug_logging_enabled) {
        if(typeof data === 'object') {
            if(data instanceof Buffer) {
                data = data.toString().trim();
            }

            if(data instanceof Error) {
                delete data.stack;
            }
            
            for(var key in data) { 
                if(data[key] instanceof Error) {
                    delete data[key].stack;
                }
            }
        }
        else if(typeof data === 'string') {
            data = data.trim();
        }
    }

    // Convert our JSON object to a string.
    if(data !== undefined) {
        try {
            message += JSON.stringify(data);
        }
        catch(e) {
            message += GLOBAL.util.inspect(data, false, 2);
        }
    }

    message = message.replace(/\\n/g, "\n").replace(/\s+/g, " ");

    if(!debug_logging_enabled) {
        return message.replace(/\n/g, "");
    }
    
    return message;
}

log.prototype.info = function info(message, data)
{
    logger.info(_makeMessage(message, data));
};

log.prototype.warn = function warn(message, data)
{
    logger.warn(_makeMessage(message, data));
};

log.prototype.error = function error(message, data)
{
    logger.error(_makeMessage(message, data));
};

log.prototype.fatal = function fatal(message, data)
{
    logger.fatal(_makeMessage(message, data));
};

log.prototype.panic = function panic(message, data)
{
    logger.panic(_makeMessage(message, data));
};

log.prototype.debug = function debug(message, data)
{
    logger.debug(_makeMessage(message, data));
};

log.prototype.trace = function trace(message, data)
{
    logger.trace(_makeMessage(message, data));
};

log.prototype.fixme = function info(message, data)
{
    logger.fixme(_makeMessage(message, data));
};

module.exports = exports = function Newlog(logfile, level, mode, debug) {
    return new log(logfile, level, mode, debug);
};
