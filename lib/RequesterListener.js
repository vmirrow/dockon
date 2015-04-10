'use strict';

module.exports = exports = RequesterListener;

function RequesterListener(AgentListener)
{
    this.agentFinder = {};

    this.NewRequesterListener(AgentListener);
};

RequesterListener.prototype.NewRequesterListener = function NewRequesterListener(agentFinder /* AgentListener */)
{
    var Self = this;

    Self.agentFinder = agentFinder;

    Self.requesterListener = GLOBAL.http.createServer();

    Self.requesterListener.on('request', function(request, response) {
        require(GLOBAL.path+'/lib/RequesterHandler')(request, response, Self.agentFinder);
    });

    Self.requesterListener.on('close', function() {
        GLOBAL.log.info(GLOBAL.log.StopRequesterListenerMessage);
    });

    Self.requesterListener.on('clientError', function (error, socket) {
        GLOBAL.log.error('Client Error', error.message);
    });

    Self.requesterListener.on('error', function(error) {
        GLOBAL.log.error(GLOBAL.log.StopRequesterListenerMessage, error)
    });

    Self.requesterListener.listen(GLOBAL.config.requester.port, GLOBAL.config.requester.host, function Run(socket) {
        GLOBAL.log.info(GLOBAL.log.StartRequesterListenerMessage, { addr: Self.requesterListener.address() });
    });
};
