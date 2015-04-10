'use strict';

module.exports = exports = function StartRequesterHandler(request, response, agentFinder)
{
    request.pause();

    GLOBAL.log.info('Received Request', { method: request.method, url: request.url });

    var url_parts = parseUrl(request.url);

    switch(true) {
        // TODO: NOT IMPLEMENTED - Return all of the agents and their info.
        case (url_parts.url === '/'):
        // If we weren't able to parse the url, then return a 404 Not Found and exit.
        case (url_parts === undefined):
            GLOBAL.log.warn('Ignored Request', { method: request.method, url: request.url });
            response.statusCode = 404;
            response.end();
        break;
        // If we're in debug mode and /agents/connected is received, show connected agent count.
        case (url_parts.url === '/count'):
            var count = agentFinder.ConnectionCount();
            GLOBAL.log.debug('GET /count', { count: count });
            response.write('{"count":'+count+'}');
            response.write('\n');
            response.end();
        break;
        // Handle all other requests. 
        default:
            // If we got a kuid, see if we can find an associated agent.
            var agentHandler = agentFinder.FindAgent(url_parts.kuid)
            if(agentHandler === undefined) {
                response.statusCode = 410;
                response.end();
                return;
            }

            var options = {
                agent: agentHandler.conn,
                path: url_parts.url,
                method: request.method,
                headers: request.headers
            };

            var agent = GLOBAL.http.request(options, function(agent_response) {
                agent_response.pause();
                response.writeHeader(agent_response.statusCode, agent_response.headers);
                agent_response.pipe(response);
                agent_response.resume();
            });
        
            agent.on('error', function StartRequesterHandler(error) {
                GLOBAL.log.error(request.method+' '+url_parts.url+' Failed', { addr: agentHandler.Addr(), kuid: url_parts.kuid, error: error });
                response.statusCode = 500;
                response.end();
            });
        
            request.pipe(agent);
        break;
    }

    request.resume();
};

function parseUrl(url)
{
    var url_parts = {};
    var result = {};
    result.url = null;
    result.kuid = null;

    if((url_parts = url.match(/^\/agents\/?$/)) !== null) {
        result.url = '/';
    }
    else if((url_parts = url.match(/^\/count\/?$/)) !== null) {
        result.url = '/count';
    }
    else if((url_parts = url.match(/^\/agents(\/(.*?)(\/.*))\/?$/)) !== null) {
        if(url_parts[3] === undefined) {
            result.url = url_parts[2].replace(/\/+$/, '');
        }
        else {
            result.url = url_parts[3].replace(/\/+$/, '');
        }

        if(url_parts[2] === undefined) { 
            return undefined;
        }
        result.kuid = url_parts[2];
    }

    return result;
}
