// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector, useStore} from 'react-redux';

import type {GlobalState} from '@mattermost/types/store';
import type {UserProfile} from '@mattermost/types/users';

import {Permissions} from 'mattermost-redux/constants';
import {getChannel, getMyChannelMember} from 'mattermost-redux/selectors/entities/channels';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {haveIChannelPermission} from 'mattermost-redux/selectors/entities/roles';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {closePoll, loadMissingUsers, loadPoll, logError, toggleVote, type Store} from '../actions';
import {endsIn, getPoll} from '../selectors';
import type {Poll} from '../types/poll';

import {confirmDialog} from './fusion/confirm_dialog';
import {messages} from './messages';

// usePoll returns a poll, loading it when needed, and whether it couldn't be loaded.
export function usePoll(pollId: string) {
    const store = useStore() as unknown as Store;
    const poll = useSelector((state: GlobalState) => getPoll(state, pollId));
    const [failed, setFailed] = useState(false);
    const known = Boolean(poll);

    useEffect(() => {
        if (!pollId) {
            setFailed(true);
            return;
        }
        if (!known) {
            loadPoll(store, pollId).then((loaded) => setFailed(!loaded));
        }
    }, [pollId, known, store]);

    return {poll, failed: failed && !poll};
}

// usePollActions votes and closes, tracking the request in progress and the last error.
export function usePollActions(poll: Poll) {
    const {formatMessage} = useIntl();
    const store = useStore() as unknown as Store;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const canClose = useSelector((state: GlobalState) => canClosePoll(state, poll));

    const run = useCallback(async (action: () => Promise<void>, failure: typeof messages.voteFailed) => {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (err) {
            logError('request failed', err);
            setError(formatMessage(failure, {error: (err as Error).message}));
        } finally {
            setBusy(false);
        }
    }, [formatMessage]);

    const vote = useCallback((option: number) => {
        if (!poll.closed) {
            run(() => toggleVote(store, poll, option), messages.voteFailed);
        }
    }, [poll, store, run]);

    const close = useCallback(() => {
        run(() => closePoll(store, poll.id), messages.closeFailed);
    }, [poll.id, store, run]);

    return {vote, close, busy, error, canClose: canClose && !poll.closed};
}

// useConfirmedClose returns what the Close poll button does: ask first (Fusion's dialog, or the browser's under the
// classic UI), then close the poll.
export function useConfirmedClose(close: () => void) {
    const {formatMessage} = useIntl();
    return useCallback(async () => {
        const yes = await confirmDialog({
            title: formatMessage(messages.closeConfirmTitle),
            message: formatMessage(messages.closeConfirmLead),
            confirmLabel: formatMessage(messages.closePoll),
            cancelLabel: formatMessage(messages.cancel),
        });
        if (yes) {
            close();
        }
    }, [close, formatMessage]);
}

// canClosePoll tells whether the user can close the poll, like the server decides: its creator,
// the channel's admins and those who can delete others' posts in the channel.
export function canClosePoll(state: GlobalState, poll: Poll) {
    if (poll.creator_id === getCurrentUserId(state)) {
        return true;
    }
    if (getMyChannelMember(state, poll.channel_id)?.scheme_admin) {
        return true;
    }
    const channel = getChannel(state, poll.channel_id);
    return haveIChannelPermission(state, channel?.team_id, poll.channel_id, Permissions.DELETE_OTHERS_POSTS);
}

// useVoters loads the users who voted on a poll (unless it's anonymous) and returns their
// profiles (as far as they're loaded) and display names, by user ID.
export function useVoters(poll: Poll) {
    const store = useStore() as unknown as Store;
    const key = poll.options.flatMap((option) => option.voters || []).sort().join(',');
    const profiles = useSelector((state: GlobalState) => state.entities.users.profiles);
    const nameDisplay = useSelector(getTeammateNameDisplaySetting);

    useEffect(() => {
        if (key) {
            loadMissingUsers(store, key.split(','));
        }
    }, [key, store]);

    return useMemo(() => {
        const voters: {[userId: string]: {user: UserProfile; name: string}} = {};
        for (const id of key ? key.split(',') : []) {
            const user = profiles[id];
            if (user) {
                voters[id] = {user, name: displayUsername(user, nameDisplay)};
            }
        }
        return voters;
    }, [key, profiles, nameDisplay]);
}

// useVotersTitle returns the tooltip of an answer: who voted for it.
export function useVotersLabel() {
    const {formatMessage, formatList} = useIntl();
    return useCallback((names: string[]) => {
        if (!names.length) {
            return '';
        }
        const shown = names.length > 10 ? formatMessage(messages.andMore, {names: names.slice(0, 10).join(', '), count: names.length - 10}) : formatList(names, {type: 'conjunction'});
        return formatMessage(messages.votedBy, {names: shown});
    }, [formatMessage, formatList]);
}

// useEndsIn returns the time left before a poll ends, refreshed every minute.
export function useEndsIn(poll: Poll) {
    const [now, setNow] = useState(Date.now());
    const ends = Boolean(poll.end_at) && !poll.closed;
    useEffect(() => {
        const timer = ends ? setInterval(() => setNow(Date.now()), 60000) : null;
        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [ends]);

    // Past the end, the poll takes no votes even before the server says it's closed
    const ended = ends && (poll.end_at || 0) <= now;
    return {left: ended ? null : endsIn(poll, now), ended};
}
