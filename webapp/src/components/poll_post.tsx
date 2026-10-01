// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';

import type {Post} from '@mattermost/types/posts';

import {isFusionUI} from '../web_ui';

import ClassicPoll from './classic_poll';
import FusionPoll from './fusion_poll';
import {messages} from './messages';
import {usePoll} from './use_poll';

type Props = {
    post: Post;
};

// PollPost shows the poll of a custom_poll post, in the style of the web UI that's running.
export default function PollPost({post}: Props) {
    const {formatMessage} = useIntl();
    const pollId = typeof post.props?.poll_id === 'string' ? post.props.poll_id : '';
    const {poll, failed} = usePoll(pollId);

    const fusion = isFusionUI();
    if (!poll) {
        const text = formatMessage(failed ? messages.unavailable : messages.loading);
        if (fusion) {
            return <div className='am-poll'><div className='am-sub'>{text}</div></div>;
        }
        return <div className='polls-placeholder'>{text}</div>;
    }
    return fusion ? <FusionPoll poll={poll}/> : <ClassicPoll poll={poll}/>;
}
