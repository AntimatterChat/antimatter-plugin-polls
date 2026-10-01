// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {GlobalState} from '@mattermost/types/store';

import {makeState, makeStore} from '../tests/utils';

import * as client from './client';

import {getCreateDialog} from './selectors';
import type {PluginRegistry} from './types/host';

import Plugin from './index';

jest.mock('./client');

const mockedClient = client as jest.Mocked<typeof client>;

function makeRegistry(withComposerMenu: boolean) {
    const registry = {
        registerReducer: jest.fn(),
        registerWebSocketEventHandler: jest.fn(),
        registerReconnectHandler: jest.fn(),
        registerPostTypeComponent: jest.fn(),
        registerRootComponent: jest.fn(),
        registerChannelHeaderButtonAction: jest.fn(),
        registerSlashCommandWillBePostedHook: jest.fn(),
        registerComposerMenuItem: withComposerMenu ? jest.fn() : undefined,
    };
    return registry as typeof registry & PluginRegistry;
}

describe('Plugin', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        delete window.antimatterWebUI;
    });

    it('adds "Create a poll" to the "+" menu of the message box when the host has one', () => {
        const registry = makeRegistry(true);
        const store = makeStore(makeState());
        new Plugin().initialize(registry, store);

        expect(registry.registerPostTypeComponent).toHaveBeenCalledWith('custom_poll', expect.anything());
        expect(registry.registerChannelHeaderButtonAction).not.toHaveBeenCalled();
        const item = registry.registerComposerMenuItem!.mock.calls[0][0];
        expect(item.fusionIcon).toBe('poll');

        const state = {entities: {channels: {channels: {
            open: {id: 'open', delete_at: 0},
            archived: {id: 'archived', delete_at: 5},
        }}}} as unknown as GlobalState;
        expect(item.shouldRender!(state, {channelId: 'open'})).toBe(true);
        expect(item.shouldRender!(state, {channelId: 'archived'})).toBe(false);

        // Classic: the server's dialog, through /poll
        mockedClient.openServerDialog.mockResolvedValue({} as never);
        item.action({channelId: 'channel1', rootId: 'root1'});
        expect(mockedClient.openServerDialog).toHaveBeenCalledWith('team1', 'channel1', 'root1');

        // Fusion: the plugin's dialog
        window.antimatterWebUI = 'fusion';
        item.action({channelId: 'channel1'});
        expect(getCreateDialog(store.getState())).toEqual({channelId: 'channel1'});
    });

    it('falls back to a channel header button on hosts without the menu', () => {
        const registry = makeRegistry(false);
        new Plugin().initialize(registry, makeStore(makeState()));
        expect(registry.registerChannelHeaderButtonAction).toHaveBeenCalled();
    });

    it('opens its own dialog for /poll in Fusion', async () => {
        const registry = makeRegistry(true);
        const store = makeStore(makeState());
        new Plugin().initialize(registry, store);
        const hook = registry.registerSlashCommandWillBePostedHook!.mock.calls[0][0];
        const args = {channel_id: 'channel1', root_id: ''};

        expect(await hook('/poll', args)).toEqual({message: '/poll', args});
        expect(await hook('/poll "Q" "A" "B"', args)).toEqual({message: '/poll "Q" "A" "B"', args});

        window.antimatterWebUI = 'fusion';
        expect(await hook('/poll ', args)).toEqual({});
        expect(getCreateDialog(store.getState())).toEqual({channelId: 'channel1'});
    });
});
