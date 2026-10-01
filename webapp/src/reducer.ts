// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {combineReducers} from 'redux';

import {CLOSE_CREATE_DIALOG, OPEN_CREATE_DIALOG, RECEIVED_MY_VOTES, RECEIVED_POLL} from './action_types';
import type {Poll} from './types/poll';

// Where the poll creation dialog was opened from
export type CreateDialogState = {
    channelId: string;
    rootId?: string;
};

export type PollsPluginState = {
    polls: {[pollId: string]: Poll};
    createDialog: CreateDialogState | null;
};

type Action = {
    type: string;
    data?: unknown;
};

export type MyVotesData = {pollId: string; myVotes: number[]};

function polls(state: PollsPluginState['polls'] = {}, action: Action): PollsPluginState['polls'] {
    switch (action.type) {
    case RECEIVED_POLL: {
        const poll = action.data as Poll;
        return {...state, [poll.id]: poll};
    }
    case RECEIVED_MY_VOTES: {
        const {pollId, myVotes} = action.data as MyVotesData;
        const poll = state[pollId];
        if (!poll) {
            return state;
        }
        return {...state, [pollId]: {...poll, my_votes: myVotes}};
    }
    default:
        return state;
    }
}

function createDialog(state: CreateDialogState | null = null, action: Action): CreateDialogState | null {
    switch (action.type) {
    case OPEN_CREATE_DIALOG:
        return action.data as CreateDialogState;
    case CLOSE_CREATE_DIALOG:
        return null;
    default:
        return state;
    }
}

export default combineReducers({
    polls,
    createDialog,
});
