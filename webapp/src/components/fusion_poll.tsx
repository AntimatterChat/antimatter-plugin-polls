// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import {Client4} from 'mattermost-redux/client';

import {percent} from '../selectors';
import type {Poll} from '../types/poll';

import FusionIcon from './fusion_icon';
import {messages} from './messages';
import {useEndsIn, usePollActions, useVoters, useVotersLabel} from './use_poll';

const MAX_FACES = 3;

// A stable hue per user, like the Fusion UI's avatars, for the initials shown until the picture loads.
function hueFor(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = ((h * 31) + id.charCodeAt(i)) % 360;
    }
    return h;
}

type Props = {
    poll: Poll;
};

// FusionPoll is a poll in the Fusion UI, drawn with the mockup's markup and classes.
export default function FusionPoll({poll}: Props) {
    const {formatMessage, formatRelativeTime} = useIntl();
    const {vote, close, busy, error, canClose} = usePollActions(poll);
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
        <div className='am-poll'>
            <h4>{poll.question}</h4>
            <div className='am-sub'>
                {formatMessage(poll.multi ? messages.selectMany : messages.selectOne)}
                {poll.anonymous && ` · ${formatMessage(messages.anonymous)}`}
            </div>
            {poll.options.map((option, i) => {
                const mine = poll.my_votes.includes(i);
                const pct = percent(poll, i);
                const known = (option.voters || []).filter((id) => voters[id]);
                return (
                    <button
                        key={option.text}
                        type='button'
                        className={'am-poll-opt' + (mine ? ' am-mine' : '') + (poll.multi ? ' am-multi' : '')}
                        aria-pressed={mine}
                        aria-label={formatMessage(messages.option, {text: option.text, percent: pct})}
                        title={votersLabel(known.map((id) => voters[id].name))}
                        disabled={closed || busy}
                        onClick={() => vote(i)}
                    >
                        <span
                            className='am-fill'
                            style={{width: `${pct}%`}}
                        />
                        <span className='am-mark'>{mine && <FusionIcon name='check'/>}</span>
                        <span>{option.text}</span>
                        {known.length > 0 && (
                            <span className='am-faces'>
                                {known.slice(0, MAX_FACES).map((id) => (
                                    <span
                                        key={id}
                                        className='am-av am-xs'
                                        style={{'--am-h': hueFor(id)} as React.CSSProperties}
                                        aria-hidden='true'
                                    >
                                        <img
                                            src={Client4.getProfilePictureUrl(id, voters[id].user.last_picture_update)}
                                            alt=''
                                            loading='lazy'
                                        />
                                    </span>
                                ))}
                            </span>
                        )}
                        <span className='am-pct'>{`${pct}%`}</span>
                    </button>
                );
            })}
            <div className='am-poll-foot'>
                <span>{formatMessage(messages.votes, {count: poll.voter_count})}</span>
                {status && <span>{status}</span>}
                {canClose && !closed && (
                    <button
                        type='button'
                        className='polls-fusion-close'
                        disabled={busy}
                        onClick={() => {
                            // eslint-disable-next-line no-alert
                            if (window.confirm(formatMessage(messages.closeConfirm))) {
                                close();
                            }
                        }}
                    >
                        {formatMessage(messages.closePoll)}
                    </button>
                )}
            </div>
            {error && <div className='polls-fusion-error'>{error}</div>}
        </div>
    );
}
