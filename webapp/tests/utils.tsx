// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {applyMiddleware, createStore, type AnyAction, type Dispatch, type Middleware} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import manifest from '../src/manifest';
import reducer, {type PollsPluginState} from '../src/reducer';
import type {PluginStore} from '../src/types/host';
import type {Poll} from '../src/types/poll';

export const currentUserId = 'alice';

type TestStateOptions = {
    polls?: Poll[];
    users?: Array<{id: string; username: string}>;
    channelAdmin?: boolean;
};

// makeState returns a minimal host state with this plugin's state.
export function makeState({polls = [], users = [], channelAdmin = false}: TestStateOptions = {}): GlobalState {
    const pluginState: PollsPluginState = {
        ...reducer(undefined, {type: '@@INIT'}),
        polls: Object.fromEntries(polls.map((poll) => [poll.id, poll])),
    };
    return {
        entities: {
            general: {config: {}, license: {}},
            preferences: {myPreferences: {}},
            users: {
                currentUserId,
                profiles: {
                    [currentUserId]: {id: currentUserId, username: currentUserId, roles: 'system_user'},
                    ...Object.fromEntries(users.map((u) => [u.id, {last_picture_update: 0, ...u}])),
                },
            },
            channels: {
                channels: {channel1: {id: 'channel1', team_id: 'team1', type: 'O'}},
                roles: {channel1: new Set(['channel_user'])},
                myMembers: {channel1: {channel_id: 'channel1', user_id: currentUserId, roles: 'channel_user', scheme_admin: channelAdmin}},
            },
            teams: {currentTeamId: 'team1', teams: {}, myMembers: {team1: {team_id: 'team1', roles: 'team_user'}}},
            roles: {roles: {}},
        },
        [`plugins-${manifest.id}`]: pluginState,
    } as unknown as GlobalState;
}

// Runs thunks (the host store does too), without any request: they resolve to nothing.
const thunks: Middleware = () => (next: Dispatch) => (action: unknown) => {
    if (typeof action === 'function') {
        return Promise.resolve({data: []});
    }
    return next(action as AnyAction);
};

// makeStore returns a store whose actions go through this plugin's reducer.
export function makeStore(initial: GlobalState): PluginStore {
    const pluginKey = `plugins-${manifest.id}`;
    return createStore((state: GlobalState | undefined, action: AnyAction) => {
        const current = state || initial;
        const pluginState = (current as unknown as Record<string, PollsPluginState>)[pluginKey];
        const next = reducer(pluginState, action);
        if (next === pluginState) {
            return current;
        }
        return {...current, [pluginKey]: next} as GlobalState;
    }, initial, applyMiddleware(thunks)) as unknown as PluginStore;
}

export function renderWithStore(ui: React.ReactElement, store: PluginStore) {
    return render(
        <Provider store={store}>
            <IntlProvider
                locale='en'
                onError={() => null}
            >
                {ui}
            </IntlProvider>
        </Provider>,
    );
}
