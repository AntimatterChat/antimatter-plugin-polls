// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {GlobalState} from '@mattermost/types/store';

import {makePoll} from '../tests/polls';

import {endsIn, getCreateDialog, getPoll, myVotesFromVoters, percent} from './selectors';

describe('selectors', () => {
    it('read the plugin state, empty before the reducer runs', () => {
        const poll = makePoll();
        const state = {'plugins-com.antimatterchat.polls': {polls: {poll1: poll}, createDialog: {channelId: 'c'}}} as unknown as GlobalState;
        expect(getPoll(state, 'poll1')).toBe(poll);
        expect(getCreateDialog(state)).toEqual({channelId: 'c'});

        expect(getPoll({} as GlobalState, 'poll1')).toBeUndefined();
        expect(getCreateDialog({} as GlobalState)).toBeNull();
    });

    it('percent is the rounded share of the voters', () => {
        const poll = makePoll();
        expect(percent(poll, 0)).toBe(67);
        expect(percent(poll, 1)).toBe(33);
        expect(percent(poll, 2)).toBe(0);
        expect(percent(poll, 7)).toBe(0);
        expect(percent(makePoll({voter_count: 0}), 0)).toBe(0);
    });

    it('myVotesFromVoters lists the answers the user voted for', () => {
        expect(myVotesFromVoters(makePoll(), 'bob')).toEqual([0, 1]);
        expect(myVotesFromVoters(makePoll(), 'carol')).toEqual([0]);
        expect(myVotesFromVoters(makePoll(), 'dave')).toEqual([]);
    });

    it('endsIn picks the largest unit that fits', () => {
        const at = (minutes: number) => makePoll({end_at: 1000 + (minutes * 60000)});
        expect(endsIn(makePoll(), 1000)).toBeNull();
        expect(endsIn(makePoll({end_at: 5000, closed: true}), 1000)).toBeNull();
        expect(endsIn(at(0.2), 1000)).toEqual({value: 1, unit: 'minute'});
        expect(endsIn(at(59), 1000)).toEqual({value: 59, unit: 'minute'});
        expect(endsIn(at(90), 1000)).toEqual({value: 2, unit: 'hour'});
        expect(endsIn(at(47 * 60), 1000)).toEqual({value: 47, unit: 'hour'});
        expect(endsIn(at(3 * 24 * 60), 1000)).toEqual({value: 3, unit: 'day'});
    });
});
