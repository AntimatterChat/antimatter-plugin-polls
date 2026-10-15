// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import type {GlobalState} from '@mattermost/types/store';

import {Client4} from 'mattermost-redux/client';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {handleMyVotes, handlePollUpdated, openCreateDialog, openPollCreation, reloadPolls} from './actions';
import FusionCreateDialog from './components/fusion_create_dialog';
import {messages} from './components/messages';
import PollPost from './components/poll_post';
import manifest from './manifest';
import reducer from './reducer';
import type {PluginClass, PluginRegistry, PluginStore, WebSocketMessage} from './types/host';
import {isFusionUI} from './web_ui';
import {registerTranslations} from './translations';

import './styles.css';

// The type of the posts showing a poll
const POST_TYPE = 'custom_poll';

export default class Plugin implements PluginClass {
    public initialize(registry: PluginRegistry, store: PluginStore) {
        registerTranslations(registry);

        if (window.basename) {
            Client4.setUrl(window.basename);
        }

        registry.registerReducer(reducer);
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_poll_updated`, (msg) => handlePollUpdated(store, msg as WebSocketMessage<{poll: string}>));
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_poll_my_votes`, (msg) => handleMyVotes(store, msg as WebSocketMessage<{poll_id: string; my_votes: string}>));
        registry.registerReconnectHandler(() => reloadPolls(store));

        registry.registerPostTypeComponent(POST_TYPE, PollPost);
        this.registerCreation(registry, store);
    }

    private registerCreation(registry: PluginRegistry, store: PluginStore) {
        registry.registerRootComponent(FusionCreateDialog);
        const icon = <i className='icon icon-chart-bar'/>;
        const text = <FormattedMessage {...messages.createPoll}/>;

        // Hosts with the message box's "+" menu get "Create a poll" there, others in the channel header
        if (typeof registry.registerComposerMenuItem === 'function') {
            registry.registerComposerMenuItem({
                text,
                icon,
                fusionIcon: 'poll',
                action: ({channelId, rootId}) => openPollCreation(store, channelId, rootId),
                shouldRender: (state: GlobalState, {channelId}) => getChannel(state, channelId)?.delete_at === 0,
            });
        } else {
            registry.registerChannelHeaderButtonAction(icon, (channel) => openPollCreation(store, channel.id), text, text);
        }

        // In Fusion, /poll without arguments opens the plugin's dialog rather than the server's
        registry.registerSlashCommandWillBePostedHook?.(async (message, args) => {
            if (isFusionUI() && message.trim() === '/poll') {
                store.dispatch(openCreateDialog(args.channel_id, args.root_id));
                return {};
            }
            return {message, args};
        });
    }
}

window.registerPlugin(manifest.id, new Plugin());
