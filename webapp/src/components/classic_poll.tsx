// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import {Client4} from 'mattermost-redux/client';

import {percent} from '../selectors';
import type {Poll} from '../types/poll';

import {messages} from './messages';
import {useConfirmedClose, useEndsIn, usePollActions, useVoters, useVotersLabel} from './use_poll';

const MAX_FACES = 3;

type Props = {
    poll: Poll;
};

// ClassicPoll is a poll in the classic web app's style: the answers with their share of the
// voters, who voted for them, and the time left.
export default function ClassicPoll({poll}: Props) {
    const {formatMessage, formatRelativeTime} = useIntl();
    const {vote, close, busy, error, canClose} = usePollActions(poll);
    const confirmClose = useConfirmedClose(close);
    const voters = useVoters(poll);
    const votersLabel = useVotersLabel();
    const {left, ended} = useEndsIn(poll);
    const closed = poll.closed || ended;

    let status = '';
    if (closed) {
        status = formatMessage(messages.closed);
    } else if (left) {
        status = formatMessage(messages.endsIn, {when: formatRelativeTime(left.value, left.unit)});
    }

    return (
        <div className={'polls-card' + (closed ? ' polls-card--closed' : '')}>
            <div className='polls-card__question'>{poll.question}</div>
            <div className='polls-card__sub'>
                {formatMessage(poll.multi ? messages.selectMany : messages.selectOne)}
                {poll.anonymous && <span className='polls-card__tag'>{formatMessage(messages.anonymous)}</span>}
            </div>
            {poll.options.map((option, i) => {
                const mine = poll.my_votes.includes(i);
                const pct = percent(poll, i);
                const known = (option.voters || []).filter((id) => voters[id]);
                return (
                    <button
                        key={option.text}
                        type='button'
                        className={'polls-option' + (mine ? ' polls-option--mine' : '') + (poll.multi ? ' polls-option--multi' : '')}
                        aria-pressed={mine}
                        aria-label={formatMessage(messages.option, {text: option.text, percent: pct})}
                        title={votersLabel(known.map((id) => voters[id].name))}
                        disabled={closed || busy}
                        onClick={() => vote(i)}
                    >
                        <span
                            className='polls-option__fill'
                            style={{width: `${pct}%`}}
                        />
                        <span className='polls-option__mark'>
                            {mine && <i className='icon icon-check'/>}
                        </span>
                        <span className='polls-option__text'>{option.text}</span>
                        {known.length > 0 && (
                            <span className='polls-option__faces'>
                                {known.slice(0, MAX_FACES).map((id) => (
                                    <img
                                        key={id}
                                        src={Client4.getProfilePictureUrl(id, voters[id].user.last_picture_update)}
                                        alt=''
                                    />
                                ))}
                            </span>
                        )}
                        <span className='polls-option__pct'>{`${pct}%`}</span>
                    </button>
                );
            })}
            <div className='polls-card__footer'>
                <span>{formatMessage(messages.votes, {count: poll.voter_count})}</span>
                {status && <span>{status}</span>}
                {canClose && !closed && (
                    <button
                        type='button'
                        className='polls-card__close'
                        disabled={busy}
                        onClick={confirmClose}
                    >
                        {formatMessage(messages.closePoll)}
                    </button>
                )}
            </div>
            {error && <div className='polls-card__error'>{error}</div>}
        </div>
    );
}
