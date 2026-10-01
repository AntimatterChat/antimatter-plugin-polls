// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {GlobalState} from '@mattermost/types/store';

import manifest from './manifest';
import type {PollsPluginState} from './reducer';
import type {Poll} from './types/poll';

const emptyState: PollsPluginState = {polls: {}, createDialog: null};

export function getPluginState(state: GlobalState): PollsPluginState {
    return (state as unknown as Record<string, PollsPluginState | undefined>)[`plugins-${manifest.id}`] || emptyState;
}

export function getPoll(state: GlobalState, pollId: string): Poll | undefined {
    return getPluginState(state).polls[pollId];
}

export function getCreateDialog(state: GlobalState) {
    return getPluginState(state).createDialog;
}

// percent returns the share of the voters who voted for an answer, rounded like the server does.
export function percent(poll: Poll, option: number): number {
    const votes = poll.options[option]?.votes || 0;
    if (!poll.voter_count) {
        return 0;
    }
    return Math.floor(((votes * 100) + Math.floor(poll.voter_count / 2)) / poll.voter_count);
}

// myVotesFromVoters returns the answers a user voted for, from who voted for what (not anonymous polls).
export function myVotesFromVoters(poll: Poll, userId: string): number[] {
    const mine: number[] = [];
    poll.options.forEach((option, i) => {
        if (option.voters?.includes(userId)) {
            mine.push(i);
        }
    });
    return mine;
}

// endsIn returns how long until a poll ends, in the largest unit that fits, or null when it doesn't end.
export function endsIn(poll: Poll, now: number): {value: number; unit: 'minute' | 'hour' | 'day'} | null {
    if (!poll.end_at || poll.closed) {
        return null;
    }
    const minutes = Math.max(1, Math.ceil((poll.end_at - now) / 60000));
    if (minutes < 60) {
        return {value: minutes, unit: 'minute'};
    }
    const hours = Math.round(minutes / 60);
    if (hours < 48) {
        return {value: hours, unit: 'hour'};
    }
    return {value: Math.round(hours / 24), unit: 'day'};
}
