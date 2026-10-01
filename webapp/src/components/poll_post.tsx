// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import type {Post} from '@mattermost/types/posts';

import ClassicPoll from './classic_poll';
import {messages} from './messages';
import {usePoll} from './use_poll';

type Props = {
    post: Post;
};

// PollPost shows the poll of a custom_poll post.
export default function PollPost({post}: Props) {
    const {formatMessage} = useIntl();
    const pollId = typeof post.props?.poll_id === 'string' ? post.props.poll_id : '';
    const {poll, failed} = usePoll(pollId);

    if (!poll) {
        return (
            <div className='polls-placeholder'>
                {formatMessage(failed ? messages.unavailable : messages.loading)}
            </div>
        );
    }
    return <ClassicPoll poll={poll}/>;
}
