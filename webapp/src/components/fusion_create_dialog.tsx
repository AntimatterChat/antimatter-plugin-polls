// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {closeCreateDialog, logError} from '../actions';
import * as client from '../client';
import type {CreateDialogState} from '../reducer';
import {getCreateDialog} from '../selectors';
import {isFusionUI} from '../web_ui';

import FusionIcon from './fusion_icon';
import {messages} from './messages';

const MIN_ANSWERS = 2;
const MAX_ANSWERS = 10;
const DEFAULT_DURATION = 24 * 60;

// The Fusion UI's layer for popovers and dialogs, whose styles apply to what it contains
const LAYER_ID = 'am-layer';

// FusionCreateDialog is the poll creation dialog of the Fusion UI, from the mockup, shown above the
// app (in its layer) while the plugin state says it's open.
export default function FusionCreateDialog() {
    const dialog = useSelector(getCreateDialog);
    const layer = dialog && isFusionUI() ? document.getElementById(LAYER_ID) : null;
    if (!dialog || !layer) {
        return null;
    }
    return ReactDOM.createPortal(
        <CreatePollForm
            key={dialog.channelId + (dialog.rootId || '')}
            dialog={dialog}
        />,
        layer,
    );
}

type Answer = {id: number; text: string};

function CreatePollForm({dialog}: {dialog: CreateDialogState}) {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const questionRef = useRef<HTMLInputElement>(null);
    const nextId = useRef(4);
    const [question, setQuestion] = useState('');
    const [answers, setAnswers] = useState<Answer[]>([{id: 1, text: ''}, {id: 2, text: ''}, {id: 3, text: ''}]);
    const [multi, setMulti] = useState(false);
    const [anonymous, setAnonymous] = useState(false);
    const [duration, setDuration] = useState(DEFAULT_DURATION);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const close = () => dispatch(closeCreateDialog());

    useEffect(() => {
        questionRef.current?.focus();
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                dispatch(closeCreateDialog());
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [dispatch]);

    const addAnswer = () => {
        if (answers.length >= MAX_ANSWERS) {
            setError(formatMessage(messages.tooManyAnswers));
            return;
        }
        setError('');
        setAnswers([...answers, {id: nextId.current++, text: ''}]);
    };

    const removeAnswer = (id: number) => {
        if (answers.length <= MIN_ANSWERS) {
            setError(formatMessage(messages.needTwoAnswers));
            return;
        }
        setError('');
        setAnswers(answers.filter((a) => a.id !== id));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const options = answers.map((a) => a.text.trim()).filter(Boolean);
        if (options.length < MIN_ANSWERS) {
            setError(formatMessage(messages.tooFewAnswers));
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await client.createPoll({
                channel_id: dialog.channelId,
                root_id: dialog.rootId,
                question: question.trim(),
                options,
                multi,
                anonymous,
                duration_minutes: duration,
            });
            close();
        } catch (err) {
            logError('failed to create a poll', err);
            setError(formatMessage(messages.createFailed, {error: (err as Error).message}));
            setSubmitting(false);
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
        <div
            className='am-scrim'
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    close();
                }
            }}
        >
            <form
                className='am-modal am-small'
                role='dialog'
                aria-modal='true'
                aria-label={formatMessage(messages.createPoll)}
                onSubmit={submit}
            >
                <div className='am-pane'>
                    <h2>{formatMessage(messages.createPoll)}</h2>
                    <p className='am-lead'>{formatMessage(messages.createLead)}</p>
                    <label className='am-field'>
                        <span>{formatMessage(messages.question)}</span>
                        <input
                            ref={questionRef}
                            type='text'
                            placeholder={formatMessage(messages.questionPlaceholder)}
                            required={true}
                            maxLength={200}
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                        />
                    </label>
                    <div className='am-field'><span>{formatMessage(messages.answers)}</span></div>
                    <div className='am-poll-opts'>
                        {answers.map((answer, i) => (
                            <div key={answer.id}>
                                <input
                                    type='text'
                                    placeholder={formatMessage(messages.answer, {n: i + 1})}
                                    aria-label={formatMessage(messages.answer, {n: i + 1})}
                                    maxLength={80}
                                    value={answer.text}
                                    onChange={(e) => setAnswers(answers.map((a) => (a.id === answer.id ? {...a, text: e.target.value} : a)))}
                                />
                                <button
                                    type='button'
                                    className='am-icon-btn'
                                    aria-label={formatMessage(messages.removeAnswer, {n: i + 1})}
                                    onClick={() => removeAnswer(answer.id)}
                                >
                                    <FusionIcon
                                        name='x'
                                        size='sm'
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type='button'
                        className='am-btn polls-fusion-add'
                        onClick={addAnswer}
                    >
                        <FusionIcon
                            name='plus'
                            size='sm'
                        />
                        {formatMessage(messages.addAnswer)}
                    </button>
                    <ToggleRow
                        title={formatMessage(messages.multi)}
                        help={formatMessage(messages.multiHelp)}
                        on={multi}
                        onChange={setMulti}
                    />
                    <ToggleRow
                        title={formatMessage(messages.anonymousToggle)}
                        help={formatMessage(messages.anonymousHelp)}
                        on={anonymous}
                        onChange={setAnonymous}
                    />
                    <label className='am-field polls-fusion-duration'>
                        <span>{formatMessage(messages.duration)}</span>
                        <select
                            value={duration}
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
                    {error && <div className='polls-fusion-error'>{error}</div>}
                    <div className='am-modal-actions'>
                        <button
                            type='button'
                            className='am-btn'
                            onClick={close}
                        >
                            {formatMessage(messages.cancel)}
                        </button>
                        <button
                            type='submit'
                            className='am-btn am-primary'
                            disabled={submitting}
                        >
                            <FusionIcon
                                name='poll'
                                size='sm'
                            />
                            {formatMessage(messages.post)}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

type ToggleRowProps = {
    title: string;
    help: string;
    on: boolean;
    onChange: (on: boolean) => void;
};

// ToggleRow is the mockup's switch with a title and a description.
function ToggleRow({title, help, on, onChange}: ToggleRowProps) {
    return (
        <div className='am-toggle-row'>
            <div className='am-txt'>
                <b>{title}</b>
                <span>{help}</span>
            </div>
            <button
                type='button'
                className='am-switch'
                role='switch'
                aria-checked={on}
                aria-label={title}
                onClick={() => onChange(!on)}
            />
        </div>
    );
}
