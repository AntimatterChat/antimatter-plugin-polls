// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {act, fireEvent, screen, waitFor} from '@testing-library/react';
import React from 'react';

import {makeState, makeStore, renderWithStore} from '../../tests/utils';
import {openCreateDialog} from '../actions';
import * as client from '../client';
import {getCreateDialog} from '../selectors';
import {makePoll} from '../../tests/polls';

import FusionCreateDialog from './fusion_create_dialog';

jest.mock('../client');

const mockedClient = client as jest.Mocked<typeof client>;

function renderDialog(rootId?: string) {
    const store = makeStore(makeState());
    store.dispatch(openCreateDialog('channel1', rootId));
    renderWithStore(<FusionCreateDialog/>, store);
    return store;
}

describe('FusionCreateDialog', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        window.antimatterWebUI = 'fusion';
        const layer = document.createElement('div');
        layer.id = 'am-layer';
        layer.className = 'am-layer';
        document.body.appendChild(layer);
    });

    afterEach(() => {
        delete window.antimatterWebUI;
        document.getElementById('am-layer')?.remove();
    });

    it('creates the poll in the channel or thread it was opened from', async () => {
        mockedClient.createPoll.mockResolvedValue(makePoll());
        const store = renderDialog('root1');

        const dialog = screen.getByRole('dialog', {name: 'Create a poll'});
        expect(document.getElementById('am-layer')).toContainElement(dialog);

        fireEvent.change(screen.getByPlaceholderText('What should we decide?'), {target: {value: ' Lunch? '}});
        fireEvent.change(screen.getByLabelText('Answer 1'), {target: {value: 'Pizza'}});
        fireEvent.change(screen.getByLabelText('Answer 3'), {target: {value: 'Sushi'}});
        fireEvent.click(screen.getByRole('switch', {name: 'Allow multiple answers'}));
        fireEvent.change(screen.getByRole('combobox'), {target: {value: '480'}});
        fireEvent.click(screen.getByRole('button', {name: 'Post poll'}));

        await waitFor(() => expect(getCreateDialog(store.getState())).toBeNull());
        expect(mockedClient.createPoll).toHaveBeenCalledWith({
            channel_id: 'channel1',
            root_id: 'root1',
            question: 'Lunch?',
            options: ['Pizza', 'Sushi'],
            multi: true,
            anonymous: false,
            duration_minutes: 480,
        });
    });

    it('needs two answers', () => {
        renderDialog();

        fireEvent.change(screen.getByPlaceholderText('What should we decide?'), {target: {value: 'Lunch?'}});
        fireEvent.change(screen.getByLabelText('Answer 1'), {target: {value: 'Pizza'}});
        fireEvent.click(screen.getByRole('button', {name: 'Post poll'}));

        expect(screen.getByText('Add at least two answers')).toBeInTheDocument();
        expect(mockedClient.createPoll).not.toHaveBeenCalled();
    });

    it('adds and removes answers, from 2 to 10', () => {
        renderDialog();

        fireEvent.click(screen.getByRole('button', {name: 'Remove answer 3'}));
        expect(screen.queryByLabelText('Answer 3')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Remove answer 2'}));
        expect(screen.getByText('A poll needs at least two answers')).toBeInTheDocument();

        for (let i = 0; i < 9; i++) {
            fireEvent.click(screen.getByRole('button', {name: 'Add answer'}));
        }
        expect(screen.getByLabelText('Answer 10')).toBeInTheDocument();
        expect(screen.getByText('Polls can have up to 10 answers')).toBeInTheDocument();
    });

    it('explains failures and stays open', async () => {
        mockedClient.createPoll.mockRejectedValue(new Error("you can't post in this channel"));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const store = renderDialog();

        fireEvent.change(screen.getByPlaceholderText('What should we decide?'), {target: {value: 'Lunch?'}});
        fireEvent.change(screen.getByLabelText('Answer 1'), {target: {value: 'Pizza'}});
        fireEvent.change(screen.getByLabelText('Answer 2'), {target: {value: 'Sushi'}});
        fireEvent.click(screen.getByRole('button', {name: 'Post poll'}));

        expect(await screen.findByText("The poll couldn't be created: you can't post in this channel")).toBeInTheDocument();
        expect(getCreateDialog(store.getState())).not.toBeNull();
    });

    it('closes with Escape or Cancel', () => {
        const store = renderDialog();
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(getCreateDialog(store.getState())).toBeNull();

        act(() => {
            store.dispatch(openCreateDialog('channel1'));
        });
        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(getCreateDialog(store.getState())).toBeNull();
    });

    it('is only drawn by the Fusion UI', () => {
        window.antimatterWebUI = 'classic';
        renderDialog();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
