'use strict';

module.exports = exports = AgentListener;

/**
 * Static Constructor
 *
 * This function is here to mimic koneas.go's logging. 
 *
 */
function AgentListener(Handler)
{
    var self = this;

    self.connectedAgents = {};
    self.server = {};

    self.NewAgentListener(Handler);
};

/**
 * Constructor  
 *
 *  An AgentListener is a server that handles all incoming tls connections from konea clients.
 *  When an agent successfully establishes a tls connection, koneas handles an initial GET (should be changed to CONNECT) request,
 *  and responds with a 200, which causes konea to become a spdy server.
 *  Koneas then hijacks the tls connection, and establishes a reverse spdy tunnel, acting as the spdy client.
 *  The point of this tunnel, is to forward requests from the external API to konea.
 *
 */
AgentListener.prototype.NewAgentListener = function NewAgentListener(AgentHandler)
{
    var self = this;
   
    self.AgentHandler = AgentHandler;
 
    // Create the tls server instance.
    self.server = GLOBAL.tls.createServer(GLOBAL.config.tls.server);

    // Start listening for tls connect and error events.
    self.BindEventListeners();

    // Start the tls listener.
    self.server.listen(GLOBAL.config.tls.port, GLOBAL.config.tls.host, self.Run.bind(self));
};

/**
 * Helper function that gets called by the constructor. It is where you put global event handler for AgentListener.
 *
 */
AgentListener.prototype.BindEventListeners = function BindEventListeners()
{
    var self = this;

    // Bind a handler to the secureConnection event, which is emitted once the tls-handshake completes successfully.
    self.server.on('secureConnection', self.HandleAgentConnect.bind(self));

    // Bind a handler to the clientError event, which is emitted when a client fails to connect.
    self.server.on('clientError', self.HandleClientError.bind(self));

    // TODO: I'm not sure we need this, but I'm leaving it here just in case.
    self.server.on('error', self.HandleClientError.bind(self));
};

/**
 * This is here to mimic koneas.go's logging.
 *
 */
AgentListener.prototype.Run = function Run()
{
    var self = this;

    var socket_info = self.server.address();

    GLOBAL.log.info(GLOBAL.log.StartAgentListenerMessage, { addr: socket_info.address+':'+socket_info.port });
};

/**
 * Returns a reference to an AgentHandler, if the kuid is found.
 *
 */
AgentListener.prototype.FindAgent = function FindAgent(kuid)
{
    return this.connectedAgents[kuid];
};

/**
 * Returns the number of connections koneas has connected.
 *
 */
AgentListener.prototype.ConnectionCount = function ConnectionCount()
{
    return Object.keys(this.connectedAgents).length;
};

/**
 * Shuts down koneas and sends a disconnect to all of the konea connections.
 *
 */
AgentListener.prototype.Stop = function Stop(kuid)
{
    var self = this;

    if(self.server.close) {
        self.server.close();
    }

    for(kuid in self.connectedAgents) {
        self.connectedAgents[kuid].EmitCloseEvent();
    }
};

/**
 * Converts the tls connection to a spdy connection.
 *
 */
AgentListener.prototype.RunSpdyServer = function RunSpdyServer(socket, options, config)
{
    var self = this;
            
    function SpecialAgent(options)
    { 
        GLOBAL.http.Agent.call(this, options);
        this.options = options;
        this.createConnection = function createConnection(options)
        {
            function read() {
                var b = socket.read();
                if(b === null) {
                    socket.once('readable', read);
                }
            }

            if(socket.read) {
                read();
            }

            return socket;
        };
    };
    GLOBAL.util.inherits(SpecialAgent, GLOBAL.http.Agent);

    return self.AgentHandler(GLOBAL.spdy.createAgent(SpecialAgent, options), config);
};

/**
 * Stores konea connection in local collection.
 * Also handles duplicate detection.
 * NOTE: Currently, we just reject duplicate connections, but once AMP is dead, we will do full duplicate detection. **
 *
 * Lowercase to mimic koneas.go's logging.
 *
 */
AgentListener.prototype.RegisterAgentHandler = function RegisterAgentHandler(agentHandler)
{
    var self = this;

    GLOBAL.log.debug(GLOBAL.log.AgentRegisteringMessage, { addr: agentHandler.Addr(), kuid: agentHandler.Kuid() });

    // If this kuid is already in our collection.
    var agent = {};
    agent.kuid = agentHandler.Kuid();
    agent.addr = agentHandler.Addr();
    agent.version = agentHandler.Version(); 
    
    function AcceptNewAgent() {
        self.connectedAgents[agent.kuid] = agentHandler;
        agentHandler.Start();
    }
    
    function RejectNewAgent() {
        agentHandler.Stop(true); 
    }

    self.CheckForDuplicateAgent(
        agent,
        AcceptNewAgent,
        RejectNewAgent
    );
};

AgentListener.prototype.CheckForDuplicateAgent = function CheckForDuplicateAgent(agent, is_unique_callback, is_dup_callback)
{
    var self = this;

    if(self.connectedAgents[agent.kuid]) {
        agent.prev = self.connectedAgents[agent.kuid].Addr();

        // And the original agent responds to a ping.
        self.connectedAgents[agent.kuid].IsLive(function HandleDuplicateAgent() {
            // Then it's a real duplicate.
            GLOBAL.log.info(GLOBAL.log.DuplicateKUIDMessage, agent);
            /* 
            var kuid = agentHandler.Kuid(); 
            agentHandler.RegenerateKuid(); 
            agentHandler.on('regenerateKuidSuccess', function HandleDuplicateAgent() { 
                GLOBAL.log.info('KUID was successfully regenerated.', { old: agent.kuid, new: agentHandler.Kuid() }); 
                self.connectedAgents[agentHandler.Kuid()] = agentHandler; 
            });
            */
            is_dup_callback();
        });

        self.connectedAgents[agent.kuid].on('error', function HandleTimedOutAgent() {
            // The close event might have happened already, so if it did, don't call Stop().
            if(self.connectedAgents[agent.kuid] !== undefined) {
                // Call Stop(true) to suppress triggering the AgentHandler 'close' event so we don't end up in a race with the event handler.
                self.connectedAgents[agennt.kuid].Stop(true);
            }
            GLOBAL.log.info(GLOBAL.log.AgentReconnectMessage, agent);
            is_unique_callback();
        });
    }
    // This is a new kuid, so add the agent to our collection. 
    else {
        is_unique_callback();
    }
};

/**
 * Handles tls connection errors.
 *
 * This is a connection error, so we shouldn't have established the tls connection yet.
 * Destroy the connection and log the fact.
 *
 */
AgentListener.prototype.HandleClientError = function HandleClientError(error, pair)
{
    var self = this;

    if(pair) {
        GLOBAL.log.warn('Client Connection Error Occurred', { error: error, addr: pair.cleartext.remoteAddress+':'+pair.cleartext.remotePort });
        pair.destroy();
    }
    else {
        GLOBAL.log.warn('Client Connection Error Occurred', { error: error, addr: "undefined" });
    }
};

/**
 * Handles http (spdy) socket disconnects.
 *
 * Either konea disconnected, had an error, or we called AgentHandler.Stop().
 * Remove the agent from the collection.
 *
 */
AgentListener.prototype.HandleAgentDisconnect = function HandleAgentDisconnect(agentHandler)
{
    delete this.connectedAgents[agentHandler.Kuid()];
};

/**
 * Handles tls connect events.
 *
 * Sets up the data event listener, which receives the inital GET / from konea.
 * In response, it sends a 200 to konea which causes konea to convert to a spdy server.
 * Koneas then "hijacks" the tls connetion and convert it into a spdy client. 
 * Also requests kuid from agent and sets up handlers.
 *
 */
AgentListener.prototype.HandleAgentConnect = function HandleAgentConnect(socket)
{
    var self = this;

    socket.on('data', function HandleAgentConnectRead(data) {
        var data = data.toString();
        // Konea is supposed to send a GET / immediately after the tls connection is established.
        // If we get that, then return a 200, which causes Konea to "convert" into a SPDY server. 
        // We then convert to a SPDY proxy server.
        
        // Newer Konea send the kuid and other information as a query string parameter.
        // Older Konea don't send the kuid, so we want to request it from Konea.
        if(data.match(/^GET \/([?].*)? HTTP\/1.1\r\n/)) {
            // Parse the query string.
            var query_string = data.match(/[?](.*) /);
            var query_string_parts = {};
            if(query_string) {
                var query_string_parts = GLOBAL.qs.parse(query_string.slice(-1)[0]) || {};
            }

            // Pass the rest of the query string in as a config object.
            var config = JSON.parse(JSON.stringify(query_string_parts));
            delete config.kuid;

            var AcceptNewAgent = function AcceptNewAgent() {
                socket.write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n", function() {
                    // Setup the spdy server.
                    self.RunSpdyServer(socket, GLOBAL.config.http_agent, config)
                        .on('error', self.HandleAgentDisconnect.bind(self))
                        .on('close', self.HandleAgentDisconnect.bind(self))
                        .once('kuidNegotiationSuccess', self.RegisterAgentHandler.bind(self))
                        .NegotiateKuid(query_string_parts.kuid);
                });  
            };

            var RejectNewAgent = function RejectNewAgent() {
                socket.write("HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\n\r\n", function() {
                    GLOBAL.log.info(GLOBAL.log.DuplicateKUIDMessage, agent);

                    // We probably don't need to do this, but I'm going to leave it for good measure.
                    socket.destroy();
                });  
            };

            if(query_string_parts.kuid) {
                var agent = {};
                agent.kuid = query_string_parts.kuid; 
                agent.addr = socket.remoteAddress;
                agent.version = config.ver;

                self.CheckForDuplicateAgent(
                    agent,
                    AcceptNewAgent,
                    RejectNewAgent
                );
            }
            else {
                AcceptNewAgent();
            }
        }
        // If we got here, then konea didn't send us a GET /, so return a 400 and destroy the socket.
        else {
            socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n", function() {
                self.HandleClientError(new Error('konea failed to send GET / request.'), socket.pair);
                // We probably don't need to do this, but I'm going to leave it for good measure.
                socket.destroy();
            });
        }
        // Make sure the 'data' listener is removed so we don't trap anymore requests at this level.
        socket.removeListener('data', HandleAgentConnectRead);
    });

    // If we get here, then we had a connection error.
    socket.on('error', function(error) {
        GLOBAL.log.debug("Socket Error", error);
    });
};
