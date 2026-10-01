// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {Client4} from 'mattermost-redux/client';

import {handleMyVotes, handlePollUpdated, reloadPolls} from './actions';
import manifest from './manifest';
import reducer from './reducer';
import type {PluginClass, PluginRegistry, PluginStore, WebSocketMessage} from './types/host';

export default class Plugin implements PluginClass {
    public initialize(registry: PluginRegistry, store: PluginStore) {
        if (window.basename) {
            Client4.setUrl(window.basename);
        }

        registry.registerReducer(reducer);
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_poll_updated`, (msg) => handlePollUpdated(store, msg as WebSocketMessage<{poll: string}>));
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_poll_my_votes`, (msg) => handleMyVotes(store, msg as WebSocketMessage<{poll_id: string; my_votes: string}>));
        registry.registerReconnectHandler(() => reloadPolls(store));
    }
}

window.registerPlugin(manifest.id, new Plugin());
