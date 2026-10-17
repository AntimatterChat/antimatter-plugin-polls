// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {createIntl} from 'react-intl';

import type {GlobalState} from '@mattermost/types/store';

import {makeState, makeStore} from '../tests/utils';

import * as client from './client';
import PollComposerMode, {POLL_MODE_ID} from './components/poll_composer_mode';

import {getCreateDialog} from './selectors';
import type {PluginRegistry} from './types/host';

import Plugin from './index';

jest.mock('./client');

const mockedClient = client as jest.Mocked<typeof client>;

function makeRegistry(withComposerMenu: boolean, withComposerMode = false) {
    const registry = {
        registerReducer: jest.fn(),
        registerWebSocketEventHandler: jest.fn(),
        registerReconnectHandler: jest.fn(),
        registerPostTypeComponent: jest.fn(),
        registerRootComponent: jest.fn(),
        registerChannelHeaderButtonAction: jest.fn(),
        registerSlashCommandWillBePostedHook: jest.fn(),
        registerComposerMenuItem: withComposerMenu ? jest.fn() : undefined,
        registerComposerMode: withComposerMode ? jest.fn() : undefined,
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

    describe('in Fusion, with composer modes', () => {
        it('writes the poll in the composer: a mode in its "+" menu, not a menu item opening a dialog', () => {
            const registry = makeRegistry(true, true);
            new Plugin().initialize(registry, makeStore(makeState()));

            expect(registry.registerComposerMenuItem).not.toHaveBeenCalled();
            expect(registry.registerChannelHeaderButtonAction).not.toHaveBeenCalled();
            const mode = registry.registerComposerMode!.mock.calls[0][0];
            expect(mode.id).toBe(POLL_MODE_ID);
            expect(mode.fusionIcon).toBe('poll');
            expect(mode.component).toBe(PollComposerMode);

            const intl = createIntl({locale: 'en', defaultLocale: 'en', onError: () => null});
            expect(typeof mode.placeholder === 'function' && mode.placeholder(intl)).toBe('What should we decide?');
            expect(typeof mode.sendLabel === 'function' && mode.sendLabel(intl)).toBe('Post poll');

            const state = {entities: {channels: {channels: {
                open: {id: 'open', delete_at: 0},
                archived: {id: 'archived', delete_at: 5},
            }}}} as unknown as GlobalState;
            expect(mode.shouldRender!(state, {channelId: 'open'})).toBe(true);
            expect(mode.shouldRender!(state, {channelId: 'archived'})).toBe(false);
        });

        it('/poll opens the poll in the composer it was typed in', async () => {
            const registry = makeRegistry(true, true);
            const store = makeStore(makeState());
            new Plugin().initialize(registry, store);
            const hook = registry.registerSlashCommandWillBePostedHook!.mock.calls[0][0];
            const opened = jest.fn();
            window.addEventListener('am-composer-mode', opened);

            window.antimatterWebUI = 'fusion';
            expect(await hook('/poll', {channel_id: 'channel1', root_id: 'root1'})).toEqual({});
            expect(opened).toHaveBeenCalledTimes(1);
            expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({id: POLL_MODE_ID, channelId: 'channel1', rootId: 'root1'});

            // Not the plugin's dialog; and /poll with arguments still goes to the server.
            expect(getCreateDialog(store.getState())).toBeNull();
            const args = {channel_id: 'channel1', root_id: ''};
            expect(await hook('/poll "Q" "A" "B"', args)).toEqual({message: '/poll "Q" "A" "B"', args});
            window.removeEventListener('am-composer-mode', opened);
        });
    });
});
