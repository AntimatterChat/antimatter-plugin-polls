// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {AnyAction} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {makePoll} from '../tests/polls';

import {handleMyVotes, handlePollUpdated, loadPoll, toggleVote} from './actions';
import * as client from './client';
import reducer, {type PollsPluginState} from './reducer';

jest.mock('./client');

const mockedClient = client as jest.Mocked<typeof client>;

function makeStore(currentUserId = 'bob') {
    let pluginState: PollsPluginState = reducer(undefined, {type: '@@INIT'});
    const store = {
        dispatch: jest.fn((action: AnyAction) => {
            pluginState = reducer(pluginState, action);
        }),
        getState: () => ({
            entities: {users: {currentUserId}},
            'plugins-com.antimatterchat.polls': pluginState,
        } as unknown as GlobalState),
        get plugin() {
            return pluginState;
        },
    };
    return store;
}

function message<T>(data: T) {
    return {event: 'custom', data, broadcast: {channel_id: 'channel1', team_id: '', user_id: ''}};
}

describe('actions', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('loadPoll fetches a poll once at a time', async () => {
        const store = makeStore();
        mockedClient.getPoll.mockResolvedValue(makePoll());

        const [a, b] = await Promise.all([loadPoll(store, 'poll1'), loadPoll(store, 'poll1')]);
        expect(a).toEqual(makePoll());
        expect(b).toBe(a);
        expect(mockedClient.getPoll).toHaveBeenCalledTimes(1);
        expect(store.plugin.polls.poll1).toEqual(makePoll());
    });

    it('toggleVote votes, or removes the vote for an answer the user voted for', async () => {
        const store = makeStore();
        mockedClient.vote.mockResolvedValue(makePoll({my_votes: [2]}));
        mockedClient.unvote.mockResolvedValue(makePoll({my_votes: []}));

        await toggleVote(store, makePoll({my_votes: [1]}), 2);
        expect(mockedClient.vote).toHaveBeenCalledWith('poll1', 2);
        expect(store.plugin.polls.poll1.my_votes).toEqual([2]);

        await toggleVote(store, makePoll({my_votes: [2]}), 2);
        expect(mockedClient.unvote).toHaveBeenCalledWith('poll1', 2);
        expect(store.plugin.polls.poll1.my_votes).toEqual([]);
    });

    describe('handlePollUpdated', () => {
        it('reads the user votes from the voters', () => {
            const store = makeStore('carol');
            store.dispatch({type: 'com.antimatterchat.polls/received_poll', data: makePoll({my_votes: [1]})});

            const sent = makePoll({voter_count: 4, my_votes: []});
            handlePollUpdated(store, message({poll: JSON.stringify(sent)}));
            expect(store.plugin.polls.poll1).toEqual({...sent, my_votes: [0]});
        });

        it('keeps the user votes of anonymous polls', () => {
            const store = makeStore();
            store.dispatch({type: 'com.antimatterchat.polls/received_poll', data: makePoll({anonymous: true, my_votes: [2]})});

            const sent = makePoll({anonymous: true, voter_count: 9, options: [{text: 'A', votes: 9}], my_votes: []});
            handlePollUpdated(store, message({poll: JSON.stringify(sent)}));
            expect(store.plugin.polls.poll1).toEqual({...sent, my_votes: [2]});
        });

        it('ignores polls the user has not seen, and invalid ones', () => {
            const store = makeStore();
            jest.spyOn(console, 'error').mockImplementation(() => {});

            handlePollUpdated(store, message({poll: JSON.stringify(makePoll())}));
            handlePollUpdated(store, message({poll: '{'}));
            expect(store.plugin.polls).toEqual({});
        });
    });

    it('handleMyVotes applies the votes from another session', () => {
        const store = makeStore();
        store.dispatch({type: 'com.antimatterchat.polls/received_poll', data: makePoll({anonymous: true})});

        handleMyVotes(store, message({poll_id: 'poll1', my_votes: '[0,2]'}));
        expect(store.plugin.polls.poll1.my_votes).toEqual([0, 2]);
    });
});
