// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {act, fireEvent, screen, within} from '@testing-library/react';
import React from 'react';

import {makePoll} from '../../tests/polls';
import {makeState, makeStore, renderWithStore} from '../../tests/utils';
import * as client from '../client';

import PollComposerMode, {pollProblem} from './poll_composer_mode';

jest.mock('../client');

const mockedClient = client as jest.Mocked<typeof client>;

// The poll in Fusion's composer: the composer gives it its text (the question) and a way to set what Send does.
function renderMode(rootId?: string) {
    let submit: ((message: string) => Promise<string | void>) | null = null;
    const setSubmit = jest.fn((fn: typeof submit) => {
        submit = fn;
    });
    const view = renderWithStore(
        <PollComposerMode
            channelId='channel1'
            rootId={rootId}
            message=''
            setSubmit={setSubmit}
            onCancel={jest.fn()}
        />,
        makeStore(makeState()),
    );
    const send = async (message: string) => {
        let result: string | void = undefined;
        await act(async () => {
            result = await submit!(message);
        });
        return result;
    };
    return {...view, setSubmit, send, current: () => submit};
}

const answer = (n: number) => screen.getByRole('textbox', {name: `Answer ${n}`});
const answers = () => within(screen.getByRole('list', {name: 'Answers'})).getAllByRole('textbox');

describe('PollComposerMode', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockedClient.createPoll.mockResolvedValue(makePoll());
    });

    test('starts with two answers to fill, a way to add more, and the settings in one row', () => {
        renderMode();
        expect(answers()).toHaveLength(2);
        expect(screen.queryByRole('button', {name: /Remove answer/})).not.toBeInTheDocument();

        const settings = screen.getByRole('group', {name: 'Poll settings'});
        expect(within(settings).getByRole('button', {name: 'Add answer'})).toBeInTheDocument();
        expect(within(settings).getByRole('button', {name: 'Several answers'})).toHaveAttribute('aria-pressed', 'false');
        expect(within(settings).getByRole('button', {name: 'Anonymous'})).toHaveAttribute('aria-pressed', 'false');
        expect(within(settings).getByRole('combobox', {name: 'Duration'})).toHaveValue('1440');
    });

    test('Send posts the poll: the composer\'s text is the question, with the answers and settings', async () => {
        const {send} = renderMode('root1');
        fireEvent.change(answer(1), {target: {value: ' Pizza '}});
        fireEvent.click(screen.getByRole('button', {name: 'Add answer'}));
        fireEvent.change(answer(3), {target: {value: 'Sushi'}});
        fireEvent.click(screen.getByRole('button', {name: 'Several answers'}));
        fireEvent.click(screen.getByRole('button', {name: 'Anonymous'}));
        fireEvent.change(screen.getByRole('combobox', {name: 'Duration'}), {target: {value: '480'}});

        expect(await send(' Lunch? ')).toBeUndefined();
        expect(mockedClient.createPoll).toHaveBeenCalledWith({
            channel_id: 'channel1',
            root_id: 'root1',
            question: 'Lunch?',
            options: ['Pizza', 'Sushi'],
            multi: true,
            anonymous: true,
            duration_minutes: 480,
        });
    });

    test('says what is missing instead of posting', async () => {
        const {send} = renderMode();
        expect(await send('   ')).toBe('Write the question in the message box first');

        fireEvent.change(answer(1), {target: {value: 'Pizza'}});
        expect(await send('Lunch?')).toBe('Add at least two answers');

        expect(await send('x'.repeat(201))).toBe('The question can be up to 200 characters');
        expect(mockedClient.createPoll).not.toHaveBeenCalled();
    });

    test('says why the server refused it', async () => {
        mockedClient.createPoll.mockRejectedValue(new Error('a poll can have up to 10 answers'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const {send} = renderMode();
        fireEvent.change(answer(1), {target: {value: 'A'}});
        fireEvent.change(answer(2), {target: {value: 'B'}});
        expect(await send('Q')).toBe('The poll couldn\'t be created: a poll can have up to 10 answers');
    });

    test('Enter goes to the next answer and adds one after the last; Backspace removes an empty one', () => {
        renderMode();
        fireEvent.change(answer(1), {target: {value: 'Pizza'}});
        fireEvent.keyDown(answer(1), {key: 'Enter'});
        expect(answer(2)).toHaveFocus();

        // The last one, empty: nothing to add yet.
        fireEvent.keyDown(answer(2), {key: 'Enter'});
        expect(answers()).toHaveLength(2);

        fireEvent.change(answer(2), {target: {value: 'Sushi'}});
        fireEvent.keyDown(answer(2), {key: 'Enter'});
        expect(answers()).toHaveLength(3);
        expect(answer(3)).toHaveFocus();

        fireEvent.keyDown(answer(3), {key: 'Backspace'});
        expect(answers()).toHaveLength(2);
        expect(answer(2)).toHaveFocus();
    });

    test('a poll keeps two answers at least, and ten at most', () => {
        renderMode();
        for (let i = 0; i < 8; i++) {
            fireEvent.click(screen.getByRole('button', {name: 'Add answer'}));
        }
        expect(answers()).toHaveLength(10);
        expect(screen.queryByRole('button', {name: 'Add answer'})).not.toBeInTheDocument();

        for (let i = 10; i > 2; i--) {
            fireEvent.click(screen.getByRole('button', {name: `Remove answer ${i}`}));
        }
        expect(answers()).toHaveLength(2);
        expect(screen.queryByRole('button', {name: /Remove answer/})).not.toBeInTheDocument();
    });

    test('Send is the composer\'s again once the poll goes', () => {
        const {setSubmit, unmount} = renderMode();
        unmount();
        expect(setSubmit).toHaveBeenLastCalledWith(null);
    });

    test('the checks follow the server\'s', () => {
        expect(pollProblem('', ['a', 'b'])).toBe('question');
        expect(pollProblem('é'.repeat(200), ['a', 'b'])).toBe('');
        expect(pollProblem('é'.repeat(201), ['a', 'b'])).toBe('question_long');
        expect(pollProblem('Q', ['a'])).toBe('few');
        expect(pollProblem('Q', Array.from({length: 11}, (_, i) => String(i)))).toBe('many');
    });
});
