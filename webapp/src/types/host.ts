// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type React from 'react';
import type {Reducer, Store} from 'redux';

import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';
import type {GlobalState} from '@mattermost/types/store';

import type {WebUI} from '../web_ui';

export type ComposerMenuItemContext = {
    channelId: string;
    rootId?: string;
};

export type SlashCommandArgs = {
    channel_id: string;
    team_id?: string;
    root_id?: string;
};

export type SlashCommandHookResult = {message?: string; args?: SlashCommandArgs} | {error: {message: string}};

// The subset of the host's plugin registry this plugin uses. The hooks that older or upstream
// hosts may lack are optional: the plugin checks for them and degrades gracefully.
export interface PluginRegistry {
    registerReducer(reducer: Reducer): void;
    registerWebSocketEventHandler(event: string, handler: (msg: WebSocketMessage) => void): void;
    registerReconnectHandler(handler: () => void): void;
    registerPostTypeComponent(type: string, component: React.ComponentType<{post: Post}>): string;
    registerRootComponent(component: React.ComponentType): string;
    registerChannelHeaderButtonAction(icon: React.ReactNode, action: (channel: Channel) => void, dropdownText: React.ReactNode, tooltipText: React.ReactNode): string;
    registerSlashCommandWillBePostedHook?(hook: (message: string, args: SlashCommandArgs) => Promise<SlashCommandHookResult | Record<string, never>>): string;

    // Antimatter hooks
    registerComposerMenuItem?(item: {
        text: React.ReactNode;
        icon: React.ReactNode;
        fusionIcon?: string;
        action: (ctx: ComposerMenuItemContext) => void;
        shouldRender?: (state: GlobalState, ctx: ComposerMenuItemContext) => boolean;
    }): string;
}

export type WebSocketMessage<T = Record<string, unknown>> = {
    event: string;
    data: T;
    broadcast: {channel_id: string; team_id: string; user_id: string};
};

export type PluginStore = Store<GlobalState>;

export interface PluginClass {
    initialize(registry: PluginRegistry, store: PluginStore): void | Promise<void>;
    uninitialize?(): void;
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: PluginClass): void;
        basename?: string;

        // Set by the Antimatter web UIs before plugins load
        antimatterWebUI?: WebUI;
    }
}
