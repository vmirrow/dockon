'use strict';

/**
 * Static Constructor
 *
 * This function is here to mimic koneas.go's logging.  
 *
 */
module.exports = exports = function RunAgentHandler(conn, config)
{
    return new AgentHandler(conn, config);
};

/**
 * Constrcutor
 *
 * An AgentHandler manages one agent (konea) connection. It handles fetching
 * and setting the KUID. It holds a refernece to the HTTP Agent that is used to
 * proxy HTTP requests for requesters, and returns the response.
 *
 */
function AgentHandler(conn, config)
{
    var self = this;

    GLOBAL.events.EventEmitter.call(self);

    self.closed = false;
    self.kuid = '';
    self.config = config || {};

    self.heartbeat = {
        outgoing: {
            timeout: {
                default: GLOBAL.config.heartbeat.outgoing.default,
                overage: GLOBAL.config.heartbeat.outgoing.overage,
                window: GLOBAL.config.heartbeat.outgoing.window,
                limit: {
                    lower: null,
                    upper: null
                },
                koneas: null,
                konea: null
            },
            timer: null,
            enabled: (GLOBAL.config.heartbeat.outgoing.enabled && !(self.config.ver))
        },
        incoming: {
            timeout: (self.config.hbSeconds || GLOBAL.config.heartbeat.incoming.default) * GLOBAL.config.heartbeat.incoming.overage * 1000,
            timer: null,
            enabled: (GLOBAL.config.heartbeat.incoming.enabled && (self.config.ver))
        }
    };

    // A node.js spdy (http.Agent).
    self.conn = conn;
    self.addr = conn._spdyState.socket.remoteAddress+':'+conn._spdyState.socket.remotePort;

    // Make sure we're listening/emitting events.
    self.BindEventListeners();

    GLOBAL.log.info('Start Agent Handler', { addr: self.Addr() });
} 

// Make AgentHandler a subclass of EventEmitter so we can emit() events. 
GLOBAL.util.inherits(AgentHandler, GLOBAL.events.EventEmitter);

/**
 * Emits an AgentHandler close event.
 *
 */
AgentHandler.prototype.EmitCloseEvent = function EmitCloseEvent()
{
    var self = this;

    self.Stop();

    self.emit('close', self);
};

/**
 * Emits an AgentHandler error event.
 *
 */
AgentHandler.prototype.EmitErrorEvent = function EmitErrorEvent(error)
{
    var self = this;

    self.Stop();

    self.emit('error', self);
};

/**
 * Helper function that gets called by the constructor. It is where you put global event handler for AgentHandler.
 *
 */
AgentHandler.prototype.BindEventListeners = function BindEventListeners()
{
    var self = this;

    self.BindIncomingPingHandledEventHandler();

    // TODO: Need to determine if we need both socket and conn close/error event handlers.
    // Leaving it for now as a safety precaution, better to handle an event twice than miss it.
    // As part of this, I added a this.closed flag, used in this.Stop() to suppress handling of subsequent close/error events.
    self.conn._spdyState.socket.on('close', self.EmitCloseEvent.bind(self));
    self.conn._spdyState.socket.on('error', self.EmitErrorEvent.bind(self));

    self.conn.on('close', self.EmitCloseEvent.bind(self));
    self.conn.on('error', self.EmitErrorEvent.bind(self));

    self.BindHeartbeatEventHandlers();

    self.on('kuidNegotiationError', self.EmitErrorEvent.bind(self));
};

/**
 * Returns the network address of the agent.
 *
 */
AgentHandler.prototype.Addr = function Addr()
{
    return this.addr;
};
   
/**
 * Returns the unique identifier of the agent.
 * This may vary until the handler finishes registering with the AgentListener, but is stable after that.
 *
 */
AgentHandler.prototype.Kuid = function Kuid() 
{
    return this.kuid;
};

/**
 * Returns the version of the agent.
 *
 */
AgentHandler.prototype.Version = function Version() 
{
    return this.config.ver;
};

/**
 * Helper function that manages the kuid on intial agent connect.
 *
 */
AgentHandler.prototype.NegotiateKuid = function NegotiateKuid(kuid)
{
    var self = this;

    // If the kuid was received successfully, emit a success event.
    self.once('getKuidSuccess', function NegotiateKuid() {
        self.emit('kuidNegotiationSuccess', self);
    });

    // If the kuid was not received successfully, emit an error event.
    self.once('getKuidError', function NegotiateKuid(error) {
        self.emit('kuidNegotiationError', self);
    });

    // If the kuid was not found, try to regnerate it.
    // TODO: This code is never run for v1. See GetKuid().
    self.once('getKuidNotFound', function NegotiateKuid(error) {
        self.once('regenerateKuidSuccess', function NegotiateKuid() {
            self.emit('kuidNegotiationSuccess', self);
        });
        self.once('regenerateKuidError', function NegotiateKuid(error) {
            self.emit('kuidNegotiationError', self);
        });
        self.RegenerateKuid();
    });

    // If we were given a kuid, use it.
    if(kuid && kuid.length) {
        this.kuid = kuid;
        self.emit('kuidNegotiationSuccess', self);
    }
    // Otherwise, try to get the kuid from Konea.
    // FUTURE SELF: The original konea implementation didn't send the kuid in the query string on connect.
    else {
        self.GetKuid();
    }
};

/**
 * Generates a new KUID and sends it to konea.
 *
 */
AgentHandler.prototype.RegenerateKuid = function RegenerateKuid()
{
    var self = this;

    self.once('setKuidSuccess', function RegenerateKuid() {
        self.emit('regenerateKuidSuccess');
    });
    self.once('setKuidError', function RegenerateKuid(error) {
        self.emit('regenerateKuidError', error);
    });

    self.PutKuid(require(GLOBAL.path+'/lib/kuid')());
};
  
/**
 * Makes an HTTP GET request to /agent/kuid to get the kuid from konea.
 *
 */
AgentHandler.prototype.GetKuid = function GetKuid()
{
    var self = this;
    var action = '';
    var response_body = '';
    var response_status = '';

    GLOBAL.log.info('Requesting KUID', { addr: self.Addr() });

    var request = GLOBAL.http.get({
        path: '/agent/kuid',
        agent: self.conn,
    });

    request.setTimeout(GLOBAL.config.http_request.timeout, function GetKuid() {
        GLOBAL.log.error('GET /agent/kuid Request Timed Out, Request Aborted', { timeout: GLOBAL.config.http_request.timeout });
        request.abort();
    });

    request.on('response', function GetKuid(response) {
        response.setEncoding('utf8');
        response_status = response.statusCode;

        response.on('data', function GetKuid(chunk) {
            response_body += chunk;
        });

        response.on('end', function GetKuid() {
            switch(response_status) {
                case 200:
                    self.kuid = response_body.trim();
                    if(self.kuid.length) {
                        GLOBAL.log.info('Received KUID', { addr: self.Addr(), kuid: self.Kuid(), status: response_status });
                        self.emit('getKuidSuccess');
                    }
                    else {
                        GLOBAL.log.error('GET /agent/kuid Failed', { addr: self.Addr(), status: response_status });
                        self.emit('getKuidError', new Error('GET /agent/kuid Failed'));
                    }
                break;
                case 404:
                    // TODO: For v1, we've decided not to generate kuids.
                    // TODO: Uncomment this for v2.
                    // self.emit('getKuidNotFound', new Error('KUID Not Found'), self);
                    GLOBAL.log.error('KUID Not Found', { addr: self.Addr(), status: response_status });
                    self.emit('getKuidError', new Error('KUID Not Found'));
                break;
                default:
                    GLOBAL.log.error('GET /agent/kuid Failed', { addr: self.Addr(), status: response_status });
                    self.emit('getKuidError', new Error('GET /agent/kuid Failed'));
                break;
            }
        });

        response.on('error', function GetKuid(error) {
            GLOBAL.log.error('GET /agent/kuid Failed', { addr: self.Addr(), error: error });
            self.emit('getKuidError', error);
        });
    });
    
    request.on('error', function GetKuid(error) {
        GLOBAL.log.error('GET /agent/kuid Failed', { addr: self.Addr(), error: error });
        self.emit('getKuidError', error);
    });

    request.end();
};

/**
 * Makes an HTTP PUT request to /agents/kuid to send the KUID to konea.
 *
 */
AgentHandler.prototype.PutKuid = function PutKuid(kuid)
{
    var self = this;
    var error = false;
    var response_body = '';
    var response_status = '';

    var request = GLOBAL.http.request({
        path: '/agent/kuid', 
        agent: self.conn,
        method: 'PUT',
        // Sending the content-length disabled chunked encoding. Lame right? :|
        headers: {
            'Content-Length': kuid.length
        }
    });       

    request.setTimeout(GLOBAL.config.http_request.timeout, function GetKuid() {
        GLOBAL.log.error('PUT /agent/kuid Request Timed Out, Request Aborted', { timeout: GLOBAL.config.http_request.timeout });
        request.abort();
    });

    request.on('response', function PutKuid(response) {
        response.setEncoding('utf8');
        response_status = response.statusCode;

        response.on('data', function PutKuid(chunk) {
            response_body += chunk;
        });

        response.on('end', function PutKuid() {
            switch(response_status) {
                // New KUID assigned. 
                case 201:
                // Existing KUID replaced. 
                case 204:
                    self.kuid = kuid; 
                    GLOBAL.log.info(GLOBAL.log.SetKUIDMessage, { addr: self.Addr(), kuid: self.Kuid(), status: response_status });
                    self.emit('setKuidSuccess');
                break;
                // Probably a 500, fail.
                default:
                    GLOBAL.log.error('PUT /agent/kuid Failed', { addr: self.Addr(), kuid: response_body.trim(), status: response_status });
                    self.emit('setKuidError', new Error('PUT /agent/kuid Failed'));
                break;
            }
        });

        response.on('error', function GetKuid(error) {
            GLOBAL.log.error('PUT /agent/kuid Failed', { addr: self.Addr(), error: error });
            self.emit('setKuidError', error);
        });
    }); 

    request.on('error', function PutKuid(error) {
        GLOBAL.log.error('PUT /agent/kuid Failed', { addr: self.Addr(), error: error });
        self.emit('setKuidError', error);
    }); 
    
    // Write the kuid to the request body.
    request.write("\n");
    request.end(kuid);
};

/**
 * Makes an HTTP POST request to /heartbeat to send ensure the liveliness of konea.
 *
 */
AgentHandler.prototype.Heartbeat = function Heartbeat()
{
    var self = this;
    var response_body = '';
    var response_status = '';
    
    var request = GLOBAL.http.request({
        path: '/heartbeat?timeoutSeconds='+self.heartbeat.outgoing.timeout.konea, 
        agent: self.conn,
        method: 'POST'
    });
    
    request.setTimeout(GLOBAL.config.http_request.timeout, function Heartbeat() {
        GLOBAL.log.error('POST /heartbeat Request Timed Out, Request Aborted', { timeout: GLOBAL.config.http_request.timeout });
        request.abort();
    });
    
    request.on('response', function Heartbeat(response) {
        response.setEncoding('utf8');
        response_status = response.statusCode;

        response.on('data', function Heartbeat(chunk) {
            response_body += chunk;
        }); 
        
        response.on('end', function Heartbeat() {
            switch(response_status) {
                // Verifies that end-to-end connection still exists.
                case 204:
                    GLOBAL.log.debug('POST /heartbeat Succeeded', { addr: self.Addr(), kuid: self.Kuid(), status: response_status });
                    self.emit('heartbeatSuccess');
                break;
                // Probably a 500, fail.
                default:
                    GLOBAL.log.debug('POST /heartbeat Failed', { addr: self.Addr(), kuid: self.Kuid(), status: response_status });
                    self.emit('heartbeatError', new Error('POST /heartbeat Failed'));
                break;
            }   
        }); 
    }); 
    
    request.on('error', function Heartbeat(error) {
        GLOBAL.log.debug('POST /heartbeat Failed', { addr: self.Addr(), kuid: self.Kuid(), error: error });
        self.emit('heartbeatError', new Error('POST /heartbeat Failed'));
    }); 
    
    // Write the empty request body and end the request.
    request.write("\n");
    request.end();
};

/**
 * Helper function to calculate the heartbeat timeout interval.
 *
 */
AgentHandler.prototype.CalculateHeartbeatTimeout = function CalculateHeartbeatTimeout()
{
    var self = this;

    self.heartbeat.outgoing.timeout.limit.lower = (self.heartbeat.outgoing.timeout.default - (self.heartbeat.outgoing.timeout.default * self.heartbeat.outgoing.timeout.window)) * 1000;
    self.heartbeat.outgoing.timeout.limit.upper = (self.heartbeat.outgoing.timeout.default * self.heartbeat.outgoing.timeout.window) * 1000;

    // koneas timeout must be in milliseconds. 
    self.heartbeat.outgoing.timeout.koneas = Math.floor(Math.random() * (self.heartbeat.outgoing.timeout.limit.upper - self.heartbeat.outgoing.timeout.limit.lower + 1) + self.heartbeat.outgoing.timeout.limit.lower); 

    // konea timeout must be in WHOLE seconds.
    self.heartbeat.outgoing.timeout.konea = parseInt(self.heartbeat.outgoing.timeout.default * self.heartbeat.outgoing.timeout.overage, 10);
};

/**
 * Helper function to schedule the heartbeat request.
 *
 */
AgentHandler.prototype.ScheduleHeartbeat = function ScheduleHeartbeat()
{
    var self = this;

    clearTimeout(self.heartbeat.outgoing.timer);
    self.heartbeat.outgoing.timer = setTimeout(function ScheduleHeartbeat() {
        self.Heartbeat();
    }, self.heartbeat.outgoing.timeout.koneas);
};

/**
 * Add event listeners for the heartbeat.
 *
 */
AgentHandler.prototype.BindHeartbeatEventHandlers = function BindHeartbeatEventHandlers()
{
    var self = this;

    if(self.heartbeat.outgoing.enabled) {
        self.on('heartbeatSuccess', self.ScheduleHeartbeat);
        self.on('heartbeatError', self.EmitErrorEvent.bind(self));
    }
};

/**
 * Starts the heartbeat.
 *
 */
AgentHandler.prototype.StartHeartbeat = function StartHeartbeat()
{
    var self = this;

    self.CalculateHeartbeatTimeout();

    if(self.heartbeat.outgoing.enabled) {
        self.ScheduleHeartbeat();
        GLOBAL.log.debug('Heartbeat started', { addr: self.Addr(), kuid: self.Kuid(), heartbeat: self.heartbeat });
    }
};

/**
 * Stops the heartbeat.
 *
 */
AgentHandler.prototype.StopHeartbeat = function StopHeartbeat()
{
    var self = this;

    if(self.heartbeat.outgoing.enabled) {
        clearTimeout(self.heartbeat.outgoing.timer);
        GLOBAL.log.debug('Heartbeat stopped', { addr: self.Addr(), kuid: self.Kuid(), heartbeat: self.heartbeat });
    }
};

/**
 * Asynchronously pings the agent to determine if it's still alive.
 * If the ping is successful, the callback function is invoked.
 *
 */
AgentHandler.prototype.IsLive = function IsLive(callback)
{
    var self = this;

    if(self.conn) {
        return self.conn.ping(callback);
    }
};

AgentHandler.prototype.BindIncomingPingHandledEventHandler = function BindIncomingPingHandledEventHandler()
{
    var self = this;

    if(!self.heartbeat.outgoing.enabled) {
        self.SetPingTimer();

        var handlePing = function handlePing() {
            self.emit('incomingHeartbeatSuccess', self);
            self.SetPingTimer();
        };

        if(self.conn) {
            self.conn._spdyState.connection.on('ping', handlePing);
        }
    }
};

AgentHandler.prototype.SetPingTimer = function SetPingTimer()
{
    var self = this;

    clearTimeout(self.heartbeat.incoming.timer);
    self.heartbeat.incoming.timer = setTimeout(function() {
        self.EmitErrorEvent.bind(self);
    }, self.heartbeat.incoming.timeout); 
};

AgentHandler.prototype.Start = function Start()
{
    var self = this;

    GLOBAL.log.info(GLOBAL.log.AgentConnectMessage , { addr: self.Addr(), kuid: self.Kuid()});
    self.StartHeartbeat();
};

/**
 * Call this function when you want to close a stream.
 * 
 */
AgentHandler.prototype.Stop = function Stop(remove_all_listeners)
{       
    var self = this;

    // Since we're trapping close/error events at the socket and connection layers 
    // I added this flag to suppress duplicate close/error event calls to this function.
    // See TODO above.
    if(self.closed) {
        return;
    }
    else {
        self.closed = true;
    }

    if(remove_all_listeners) {
        self.removeAllListeners();
    }

    self.StopHeartbeat();

    // Close the stream.
    if(self.conn && self.conn.close) {
        self.conn.close(function Stop() {
            self.conn = null; 
        });
    }
    GLOBAL.log.info(GLOBAL.log.AgentDisconnectMessage, { "addr": self.Addr(), "kuid": self.Kuid() });
};
