// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {AnyAction} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {CLOSE_CREATE_DIALOG, OPEN_CREATE_DIALOG, RECEIVED_MY_VOTES, RECEIVED_POLL} from './action_types';
import * as client from './client';
import {getPluginState, getPoll, myVotesFromVoters} from './selectors';
import type {WebSocketMessage} from './types/host';
import type {Poll} from './types/poll';
import {isFusionUI} from './web_ui';

export type GetState = () => GlobalState;
export type Dispatch = (action: AnyAction) => unknown;
export type Store = {dispatch: Dispatch; getState: GetState};

export function receivedPoll(poll: Poll): AnyAction {
    return {type: RECEIVED_POLL, data: poll};
}

export function logError(message: string, err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[polls] ${message}`, err);
}

const loading = new Map<string, Promise<Poll | null>>();

// loadPoll fetches a poll, once at a time.
export function loadPoll(store: Store, pollId: string): Promise<Poll | null> {
    let promise = loading.get(pollId);
    if (!promise) {
        promise = client.getPoll(pollId).then((poll) => {
            store.dispatch(receivedPoll(poll));
            return poll;
        }, (err) => {
            logError('failed to load a poll', err);
            return null;
        }).finally(() => loading.delete(pollId));
        loading.set(pollId, promise);
    }
    return promise;
}

// reloadPolls fetches again the polls the user has seen, e.g. after a reconnection.
export function reloadPolls(store: Store) {
    for (const pollId of Object.keys(getPluginState(store.getState()).polls)) {
        loadPoll(store, pollId);
    }
}

// toggleVote votes for an answer, or removes the vote when the user already voted for it.
export async function toggleVote(store: Store, poll: Poll, option: number) {
    const remove = poll.my_votes.includes(option);
    const updated = remove ? await client.unvote(poll.id, option) : await client.vote(poll.id, option);
    store.dispatch(receivedPoll(updated));
}

export async function closePoll(store: Store, pollId: string) {
    store.dispatch(receivedPoll(await client.closePoll(pollId)));
}

// handlePollUpdated keeps the polls the user has seen up to date. What the channel gets doesn't
// say what the user voted for: it's read from the voters, or kept for anonymous polls.
export function handlePollUpdated(store: Store, msg: WebSocketMessage<{poll: string}>) {
    let poll: Poll;
    try {
        poll = JSON.parse(msg.data.poll);
    } catch (err) {
        logError('received an invalid poll', err);
        return;
    }
    const state = store.getState();
    const known = getPoll(state, poll.id);
    if (!known) {
        return;
    }
    const myVotes = poll.anonymous ? known.my_votes : myVotesFromVoters(poll, getCurrentUserId(state));
    store.dispatch(receivedPoll({...poll, my_votes: myVotes}));
}

// handleMyVotes applies the user's votes from another session.
export function handleMyVotes(store: Store, msg: WebSocketMessage<{poll_id: string; my_votes: string}>) {
    try {
        const myVotes = JSON.parse(msg.data.my_votes);
        store.dispatch({type: RECEIVED_MY_VOTES, data: {pollId: msg.data.poll_id, myVotes}});
    } catch (err) {
        logError('received invalid votes', err);
    }
}

export function openCreateDialog(channelId: string, rootId?: string): AnyAction {
    return {type: OPEN_CREATE_DIALOG, data: rootId ? {channelId, rootId} : {channelId}};
}

export function closeCreateDialog(): AnyAction {
    return {type: CLOSE_CREATE_DIALOG};
}

// openPollCreation opens the poll creation dialog for a channel or thread: the plugin's own in the
// Fusion UI, else the server's (an interactive dialog, opened by running /poll).
export async function openPollCreation(store: Store, channelId: string, rootId?: string) {
    if (isFusionUI()) {
        store.dispatch(openCreateDialog(channelId, rootId));
        return;
    }
    const state = store.getState();
    const teamId = getChannel(state, channelId)?.team_id || getCurrentTeamId(state);
    try {
        await client.openServerDialog(teamId, channelId, rootId);
    } catch (err) {
        logError('failed to open the poll dialog', err);
    }
}
