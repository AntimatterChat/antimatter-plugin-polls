// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {makePoll} from '../tests/polls';

import {closeCreateDialog, openCreateDialog, receivedPoll} from './actions';
import {RECEIVED_MY_VOTES} from './action_types';
import reducer from './reducer';

describe('reducer', () => {
    const initial = reducer(undefined, {type: '@@INIT'});

    it('starts empty', () => {
        expect(initial).toEqual({polls: {}, createDialog: null});
    });

    it('keeps the received polls', () => {
        const poll = makePoll();
        const state = reducer(initial, receivedPoll(poll));
        expect(state.polls).toEqual({poll1: poll});

        const updated = makePoll({voter_count: 4});
        expect(reducer(state, receivedPoll(updated)).polls.poll1).toBe(updated);
    });

    it("updates the user's votes of known polls only", () => {
        const state = reducer(initial, receivedPoll(makePoll()));

        const next = reducer(state, {type: RECEIVED_MY_VOTES, data: {pollId: 'poll1', myVotes: [2]}});
        expect(next.polls.poll1.my_votes).toEqual([2]);
        expect(next.polls.poll1.voter_count).toBe(3);

        expect(reducer(state, {type: RECEIVED_MY_VOTES, data: {pollId: 'other', myVotes: [1]}})).toBe(state);
    });

    it('opens and closes the creation dialog', () => {
        const open = reducer(initial, openCreateDialog('channel1', ''));
        expect(open.createDialog).toEqual({channelId: 'channel1'});

        const inThread = reducer(initial, openCreateDialog('channel1', 'root1'));
        expect(inThread.createDialog).toEqual({channelId: 'channel1', rootId: 'root1'});

        expect(reducer(open, closeCreateDialog()).createDialog).toBeNull();
    });
});
