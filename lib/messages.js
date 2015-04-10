'use strict';

module.exports = {
    StartMessage: '======== Start ========',
    StopMessage: '======== Stop  ========',
    ConfigurationMessage: 'Configuration',

    // FIXME: Probably move these into specific packages (koneas/konea)

    StartAgentListenerMessage: 'Start Agent Listener',
    StopAgentListenerMessage: 'Stop Agent Listener',

    StartDispatcherMessage: 'Start Dispatcher',
    StopDispatcherMessage: 'Stop Dispatcher',

    StartRequesterListenerMessage: 'Start Client Listener',
    StopRequesterListenerMessage: 'Stop Client Listener',

    ConnectedMessage: 'Connected',

    SetKUIDMessage: 'Set KUID',

    DuplicateKUIDMessage: 'Duplicate KUID',

    AgentConnectMessage: 'Agent Connected',
    AgentDisconnectMessage: 'Agent Disconnected',

    // Means the agent bounced without disconnecting first. Usually due to unusual network changes like VPN
    AgentReconnectMessage: 'Agent Reconnected',

    AgentRegisteringMessage: 'Agent Registering',
    AgentRegisteredMessage: 'Agent Registered',

    AgentListenerCreationFailedMessage: 'Agent Listener Creation Failed'
};
