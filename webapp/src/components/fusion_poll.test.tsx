// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {fireEvent, screen, waitFor} from '@testing-library/react';
import React from 'react';

import {makePoll} from '../../tests/polls';
import {makeState, makeStore, renderWithStore} from '../../tests/utils';
import * as client from '../client';

import PollPost from './poll_post';

jest.mock('../client');

const mockedClient = client as jest.Mocked<typeof client>;

describe('PollPost in the Fusion UI', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        window.antimatterWebUI = 'fusion';
    });

    afterEach(() => {
        delete window.antimatterWebUI;
    });

    const post = {id: 'post1', props: {poll_id: 'poll1'}} as never;

    it("draws the poll with the mockup's markup", async () => {
        const poll = makePoll({my_votes: [0], multi: false});
        const store = makeStore(makeState({polls: [poll], users: [{id: 'bob', username: 'bob'}]}));
        const {container} = renderWithStore(<PollPost post={post}/>, store);

        expect(container.querySelector('.am-poll h4')).toHaveTextContent('Which Friday works for demo day?');
        expect(container.querySelector('.am-poll .am-sub')).toHaveTextContent('Select one answer');

        const options = container.querySelectorAll('.am-poll-opt');
        expect(options).toHaveLength(3);
        expect(options[0]).toHaveClass('am-mine');
        expect(options[0]).not.toHaveClass('am-multi');
        expect(options[0].querySelector('.am-fill')).toHaveStyle({width: '67%'});
        expect(options[0].querySelector('.am-mark use')).toHaveAttribute('href', '#am-i-check');
        expect(options[0].querySelector('.am-pct')).toHaveTextContent('67%');
        expect(options[0].querySelectorAll('.am-faces .am-av')).toHaveLength(1);
        expect(container.querySelector('.am-poll-foot')).toHaveTextContent('3 votes');

        mockedClient.vote.mockResolvedValue(makePoll({my_votes: [1]}));
        fireEvent.click(screen.getByRole('button', {name: 'November 13: 33%'}));
        await waitFor(() => expect(mockedClient.vote).toHaveBeenCalledWith('poll1', 1));
    });

    it('loads the poll it has not seen', async () => {
        mockedClient.getPoll.mockResolvedValue(makePoll());
        const store = makeStore(makeState());
        const {container} = renderWithStore(<PollPost post={post}/>, store);

        expect(screen.getByText('Loading the poll…')).toBeInTheDocument();
        await waitFor(() => expect(container.querySelectorAll('.am-poll-opt')).toHaveLength(3));
        expect(mockedClient.getPoll).toHaveBeenCalledWith('poll1');
    });

    it('says when the poll is gone', async () => {
        mockedClient.getPoll.mockRejectedValue(new Error('poll not found'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        renderWithStore(<PollPost post={post}/>, makeStore(makeState()));

        expect(await screen.findByText('This poll is no longer available.')).toBeInTheDocument();
    });
});
