module.exports = {
    tls: {
        server: {
            keyPath:  GLOBAL.path+'/keys/konea-key.pem',
            certPath: GLOBAL.path+'/keys/konea-cert.pem',
            honorCipherOrder: true,
            ciphers: "AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH",
        },
        port: '12345',
        host: '0.0.0.0'
    },
    http_request: {
        timeout: 120000 // (2 minutes in milliseconds)
    },
    http_agent: {
        spdy: {
            plain: true,
            ssl: false,
            headerCompression: true,
            version: 3.1
        }
    },
    requester: {
        port: '23456',
        host: '0.0.0.0'
    },
    hooks: {
        connect: '/kbox/bin/kbagentless/onagentconnect %s',
        disconnect: '/kbox/bin/kbagentless/onagentdisconnect %s',
    },
    heartbeat: {
        outgoing: {
            default: 120,  // seconds
            window: 0.25,  // How large is our ± window for heartbeats? [-25%, +25%]
            overage: 1.5,  // How much overage (beyond actual) do we pass to the agent?
            enabled: false,
        },
        incoming: {
            default: 120,
            overage: 2,
            enabled: true,
        }
    },
    log: {
        file: '/kbox/kboxwww/logs/koneas_output',
        level: 'fixme',
        mode: 'stdout'
    },
    pid: {
        file: '/var/run/koneas.pid',
    },
    debug: true 
};
