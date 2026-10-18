// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';

import {logError} from '../actions';
import * as client from '../client';
import manifest from '../manifest';
import type {ComposerModeProps} from '../types/host';

import FusionIcon from './fusion_icon';
import {messages} from './messages';

// The poll written in Antimatter Fusion's composer (registerComposerMode): the composer's text is the question, the
// answers are listed under it with a way to add one, and the poll's settings (several answers, anonymous, how long it
// stays open) are a compact row of toggles. The composer's Send posts it; its Cancel goes back to a plain message.

export const POLL_MODE_ID = `${manifest.id}.poll`;

// As on the server (poll.go)
export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 10;
export const MAX_QUESTION = 200;
export const MAX_ANSWER = 80;
const DEFAULT_DURATION = 24 * 60;

type Answer = {id: number; text: string};

// The answers written, without the empty ones.
const written = (answers: Answer[]) => answers.map((a) => a.text.trim()).filter(Boolean);

// pollProblem says what keeps a poll from being posted, if anything: the message to show.
export function pollProblem(question: string, options: string[]): keyof typeof PROBLEMS | '' {
    if (!question) {
        return 'question';
    }
    if (Array.from(question).length > MAX_QUESTION) {
        return 'question_long';
    }
    if (options.length < MIN_ANSWERS) {
        return 'few';
    }
    return options.length > MAX_ANSWERS ? 'many' : '';
}

const PROBLEMS = {
    question: messages.needQuestion,
    question_long: messages.questionTooLong,
    few: messages.tooFewAnswers,
    many: messages.tooManyAnswers,
};

export default function PollComposerMode({channelId, rootId, setSubmit}: ComposerModeProps) {
    const {formatMessage} = useIntl();
    const nextId = useRef(MIN_ANSWERS + 1);
    const listRef = useRef<HTMLOListElement>(null);
    const [answers, setAnswers] = useState<Answer[]>([{id: 1, text: ''}, {id: 2, text: ''}]);
    const [multi, setMulti] = useState(false);
    const [anonymous, setAnonymous] = useState(false);
    const [duration, setDuration] = useState(DEFAULT_DURATION);
    const [focusId, setFocusId] = useState<number | null>(null);

    // The answer just added (or moved to) takes the focus once drawn.
    useEffect(() => {
        if (focusId !== null) {
            listRef.current?.querySelector<HTMLInputElement>(`input[data-answer="${focusId}"]`)?.focus();
            setFocusId(null);
        }
    }, [focusId]);

    // Send posts the poll with what's written now.
    useEffect(() => {
        setSubmit(async (message) => {
            const question = message.trim();
            const options = written(answers);
            const problem = pollProblem(question, options);
            if (problem) {
                return formatMessage(PROBLEMS[problem], {max: MAX_QUESTION});
            }
            try {
                await client.createPoll({
                    channel_id: channelId,
                    root_id: rootId,
                    question,
                    options,
                    multi,
                    anonymous,
                    duration_minutes: duration,
                });

                // Nothing to show: posted.
                return '';
            } catch (err) {
                logError('failed to create a poll', err);
                return formatMessage(messages.createFailed, {error: (err as Error).message});
            }
        });
    }, [setSubmit, answers, multi, anonymous, duration, channelId, rootId, formatMessage]);
    useEffect(() => () => setSubmit(null), [setSubmit]);

    const add = (after?: number) => {
        if (answers.length >= MAX_ANSWERS) {
            return;
        }
        const answer = {id: nextId.current++, text: ''};
        const at = typeof after === 'undefined' ? answers.length : answers.findIndex((a) => a.id === after) + 1;
        setAnswers([...answers.slice(0, at), answer, ...answers.slice(at)]);
        setFocusId(answer.id);
    };
    const remove = (id: number) => {
        if (answers.length <= MIN_ANSWERS) {
            return;
        }
        const at = answers.findIndex((a) => a.id === id);
        const rest = answers.filter((a) => a.id !== id);
        setAnswers(rest);
        setFocusId(rest[Math.max(0, at - 1)].id);
    };

    // Enter goes on to the next answer, adding one after the last; Backspace in an empty one removes it. Ctrl/⌘+Enter
    // posts, as the composer's Send.
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, answer: Answer, i: number) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (i < answers.length - 1) {
                setFocusId(answers[i + 1].id);
            } else if (answer.text.trim()) {
                add(answer.id);
            }
        } else if (e.key === 'Backspace' && !answer.text && answers.length > MIN_ANSWERS) {
            e.preventDefault();
            remove(answer.id);
        }
    };

    const durations = [
        {value: 60, label: formatMessage(messages.hours, {n: 1})},
        {value: 8 * 60, label: formatMessage(messages.hours, {n: 8})},
        {value: 24 * 60, label: formatMessage(messages.days, {n: 1})},
        {value: 3 * 24 * 60, label: formatMessage(messages.days, {n: 3})},
        {value: 7 * 24 * 60, label: formatMessage(messages.weeks, {n: 1})},
        {value: 0, label: formatMessage(messages.noEnd)},
    ];

    return (
        <div className={'polls-cmode' + (multi ? ' polls-cmode-multi' : '')}>
            <ol
                ref={listRef}
                className='polls-cmode-answers'
                aria-label={formatMessage(messages.answers)}
            >
                {answers.map((answer, i) => (
                    <li key={answer.id}>
                        <span
                            className='polls-cmode-mark'
                            aria-hidden='true'
                        />
                        <input
                            type='text'
                            data-answer={answer.id}
                            placeholder={formatMessage(messages.answer, {n: i + 1})}
                            aria-label={formatMessage(messages.answer, {n: i + 1})}
                            maxLength={MAX_ANSWER}
                            value={answer.text}
                            onChange={(e) => setAnswers(answers.map((a) => (a.id === answer.id ? {...a, text: e.target.value} : a)))}
                            onKeyDown={(e) => onKeyDown(e, answer, i)}
                        />
                        {answers.length > MIN_ANSWERS && (
                            <button
                                type='button'
                                className='am-icon-btn polls-cmode-remove'
                                title={formatMessage(messages.removeAnswer, {n: i + 1})}
                                aria-label={formatMessage(messages.removeAnswer, {n: i + 1})}
                                onClick={() => remove(answer.id)}
                            >
                                <FusionIcon
                                    name='x'
                                    size='sm'
                                />
                            </button>
                        )}
                    </li>
                ))}
            </ol>
            <div
                className='polls-cmode-row'
                role='group'
                aria-label={formatMessage(messages.settings)}
            >
                {answers.length < MAX_ANSWERS && (
                    <button
                        type='button'
                        className='polls-cmode-add'
                        onClick={() => add()}
                    >
                        <FusionIcon
                            name='plus'
                            size='sm'
                        />
                        {formatMessage(messages.addAnswer)}
                    </button>
                )}
                <span className='polls-cmode-grow'/>
                <button
                    type='button'
                    className='polls-cmode-toggle'
                    aria-pressed={multi}
                    title={formatMessage(messages.multiHelp)}
                    onClick={() => setMulti(!multi)}
                >
                    <FusionIcon
                        name='checkbox'
                        size='sm'
                    />
                    {formatMessage(messages.multiShort)}
                </button>
                <button
                    type='button'
                    className='polls-cmode-toggle'
                    aria-pressed={anonymous}
                    title={formatMessage(messages.anonymousHelp)}
                    onClick={() => setAnonymous(!anonymous)}
                >
                    <FusionIcon
                        name='eye-off'
                        size='sm'
                    />
                    {formatMessage(messages.anonymous)}
                </button>
                <label className='polls-cmode-duration'>
                    <FusionIcon
                        name='clock'
                        size='sm'
                    />
                    <select
                        value={duration}
                        aria-label={formatMessage(messages.duration)}
                        onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                    >
                        {durations.map((d) => (
                            <option
                                key={d.value}
                                value={d.value}
                            >
                                {d.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </div>
    );
}
