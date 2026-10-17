// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {fireEvent, screen, waitFor} from '@testing-library/react';
import React from 'react';

import {makePoll} from '../../tests/polls';
import {makeState, makeStore, renderWithStore} from '../../tests/utils';
import * as client from '../client';

import ClassicPoll from './classic_poll';

jest.mock('../client');

const mockedClient = client as jest.Mocked<typeof client>;

function renderPoll(poll = makePoll(), options: Parameters<typeof makeState>[0] = {}) {
    const store = makeStore(makeState({polls: [poll], ...options}));
    renderWithStore(<ClassicPoll poll={poll}/>, store);
    return store;
}

describe('ClassicPoll', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('shows the answers with their share of the voters', () => {
        renderPoll(makePoll({creator_id: 'bob'}), {users: [{id: 'bob', username: 'bob'}, {id: 'carol', username: 'carol'}]});

        expect(screen.getByText('Which Friday works for demo day?')).toBeInTheDocument();
        expect(screen.getByText('Select one or more answers')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'November 6: 67%'})).toHaveAttribute('title', 'Voted by bob and carol');
        expect(screen.getByRole('button', {name: 'November 13: 33%'})).toHaveAttribute('title', 'Voted by bob');
        expect(screen.getByText('3 votes')).toBeInTheDocument();
        expect(screen.queryByText('Close poll')).not.toBeInTheDocument();
    });

    it("votes, or removes the user's vote", async () => {
        mockedClient.vote.mockResolvedValue(makePoll({my_votes: [2]}));
        renderPoll(makePoll({my_votes: [0]}));

        expect(screen.getByRole('button', {name: 'November 6: 67%'})).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', {name: 'November 20: 0%'}));
        await waitFor(() => expect(mockedClient.vote).toHaveBeenCalledWith('poll1', 2));
        await waitFor(() => expect(screen.getByRole('button', {name: 'November 6: 67%'})).toBeEnabled());

        mockedClient.unvote.mockResolvedValue(makePoll());
        fireEvent.click(screen.getByRole('button', {name: 'November 6: 67%'}));
        await waitFor(() => expect(mockedClient.unvote).toHaveBeenCalledWith('poll1', 0));
    });

    it('explains failed votes', async () => {
        mockedClient.vote.mockRejectedValue(new Error('the poll is closed'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        renderPoll();

        fireEvent.click(screen.getByRole('button', {name: 'November 20: 0%'}));
        expect(await screen.findByText("Your vote couldn't be saved: the poll is closed")).toBeInTheDocument();
    });

    it('lets its creator close it', async () => {
        mockedClient.closePoll.mockResolvedValue(makePoll({closed: true}));
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        renderPoll(makePoll({end_at: Date.now() + (2 * 24 * 3600 * 1000)}));

        expect(screen.getByText('Ends in 2 days')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close poll'));
        await waitFor(() => expect(mockedClient.closePoll).toHaveBeenCalledWith('poll1'));

        // The classic UI keeps the browser's confirmation.
        expect(window.confirm).toHaveBeenCalledWith('Close the poll?\n\nNobody will be able to vote any more, and the results stay as they are.');
    });

    it('stays open when its creator thinks again', async () => {
        jest.spyOn(window, 'confirm').mockReturnValue(false);
        renderPoll();

        fireEvent.click(screen.getByText('Close poll'));
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(mockedClient.closePoll).not.toHaveBeenCalled();
    });

    it('lets channel admins close it', () => {
        renderPoll(makePoll({creator_id: 'bob'}), {channelAdmin: true});
        expect(screen.getByText('Close poll')).toBeInTheDocument();
    });

    it('takes no votes once closed', () => {
        renderPoll(makePoll({closed: true, closed_at: 5000}));

        expect(screen.getByText('Final results')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'November 6: 67%'})).toBeDisabled();
        expect(screen.queryByText('Close poll')).not.toBeInTheDocument();
    });

    it('takes no votes past its end', () => {
        renderPoll(makePoll({end_at: Date.now() - 1000}));

        expect(screen.getByText('Final results')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'November 6: 67%'})).toBeDisabled();
    });

    it("doesn't tell who voted on anonymous polls", () => {
        renderPoll(makePoll({anonymous: true, options: [{text: 'Yes', votes: 2}, {text: 'No', votes: 1}]}));

        expect(screen.getByText('Anonymous')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Yes: 67%'})).toHaveAttribute('title', '');
    });
});
