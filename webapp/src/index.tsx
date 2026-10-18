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
import PollComposerMode, {POLL_MODE_ID} from './components/poll_composer_mode';
import PollPost from './components/poll_post';
import manifest from './manifest';
import reducer from './reducer';
import type {PluginClass, PluginRegistry, PluginStore, WebSocketMessage} from './types/host';
import {isFusionUI} from './web_ui';
import {registerTranslations} from './translations';

import './styles.css';

// The type of the posts showing a poll
const POST_TYPE = 'custom_poll';

// The window event with which Antimatter Fusion's composer opens one of its modes (see registerComposerMode).
const COMPOSER_MODE_EVENT = 'am-composer-mode';

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
        const inOpenChannel = (state: GlobalState, {channelId}: {channelId: string}) => getChannel(state, channelId)?.delete_at === 0;

        // Fusion hosts with composer modes: the poll is written in the composer itself (its text is the question),
        // offered in its "+" menu. Other hosts with the message box's "+" menu get "Create a poll" there (a dialog),
        // others in the channel header.
        const composerMode = typeof registry.registerComposerMode === 'function';
        if (registry.registerComposerMode) {
            registry.registerComposerMode({
                id: POLL_MODE_ID,
                label: text,
                fusionIcon: 'poll',
                placeholder: (intl) => intl.formatMessage(messages.questionPlaceholder),
                sendLabel: (intl) => intl.formatMessage(messages.post),
                component: PollComposerMode,
                shouldRender: inOpenChannel,
            });
        } else if (typeof registry.registerComposerMenuItem === 'function') {
            registry.registerComposerMenuItem({
                text,
                icon,
                fusionIcon: 'poll',
                action: ({channelId, rootId}) => openPollCreation(store, channelId, rootId),
                shouldRender: inOpenChannel,
            });
        } else {
            registry.registerChannelHeaderButtonAction(icon, (channel) => openPollCreation(store, channel.id), text, text);
        }

        // In Fusion, /poll without arguments writes the poll in the composer (or opens the plugin's dialog on hosts
        // without composer modes) rather than the server's dialog
        registry.registerSlashCommandWillBePostedHook?.(async (message, args) => {
            if (isFusionUI() && message.trim() === '/poll') {
                if (composerMode) {
                    window.dispatchEvent(new CustomEvent(COMPOSER_MODE_EVENT, {detail: {id: POLL_MODE_ID, channelId: args.channel_id, ...(args.root_id ? {rootId: args.root_id} : {})}}));
                } else {
                    store.dispatch(openCreateDialog(args.channel_id, args.root_id));
                }
                return {};
            }
            return {message, args};
        });
    }
}

window.registerPlugin(manifest.id, new Plugin());
