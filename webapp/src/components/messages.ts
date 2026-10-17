// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {defineMessages} from 'react-intl';

export const messages = defineMessages({
    selectOne: {id: 'polls.select_one', defaultMessage: 'Select one answer'},
    selectMany: {id: 'polls.select_many', defaultMessage: 'Select one or more answers'},
    anonymous: {id: 'polls.anonymous', defaultMessage: 'Anonymous'},
    votes: {id: 'polls.votes', defaultMessage: '{count, plural, one {# vote} other {# votes}}'},
    endsIn: {id: 'polls.ends_in', defaultMessage: 'Ends {when}'},
    closed: {id: 'polls.closed', defaultMessage: 'Final results'},
    closePoll: {id: 'polls.close', defaultMessage: 'Close poll'},
    closeConfirmTitle: {
        id: 'polls.close_confirm.title',
        defaultMessage: 'Close the poll?',
        description: 'Title of the dialog that asks before closing a poll (ending the voting early).',
    },
    closeConfirmLead: {
        id: 'polls.close_confirm.lead',
        defaultMessage: 'Nobody will be able to vote any more, and the results stay as they are.',
        description: 'Sentence under "Close the poll?" in the dialog that asks before closing a poll.',
    },
    loading: {id: 'polls.loading', defaultMessage: 'Loading the poll…'},
    unavailable: {id: 'polls.unavailable', defaultMessage: 'This poll is no longer available.'},
    voteFailed: {id: 'polls.vote_failed', defaultMessage: "Your vote couldn't be saved: {error}"},
    closeFailed: {id: 'polls.close_failed', defaultMessage: "The poll couldn't be closed: {error}"},
    votedBy: {id: 'polls.voted_by', defaultMessage: 'Voted by {names}'},
    andMore: {id: 'polls.and_more', defaultMessage: '{names} and {count, plural, one {# other} other {# others}}'},
    option: {id: 'polls.option', defaultMessage: '{text}: {percent}%'},

    createPoll: {id: 'polls.create', defaultMessage: 'Create a poll'},
    createLead: {id: 'polls.create.lead', defaultMessage: 'Everyone in the conversation can vote. Results update live.'},
    question: {id: 'polls.create.question', defaultMessage: 'Question'},
    questionPlaceholder: {id: 'polls.create.question_placeholder', defaultMessage: 'What should we decide?'},
    answers: {id: 'polls.create.answers', defaultMessage: 'Answers'},
    answer: {id: 'polls.create.answer', defaultMessage: 'Answer {n}'},
    removeAnswer: {id: 'polls.create.remove_answer', defaultMessage: 'Remove answer {n}'},
    addAnswer: {id: 'polls.create.add_answer', defaultMessage: 'Add answer'},
    multi: {id: 'polls.create.multi', defaultMessage: 'Allow multiple answers'},
    multiHelp: {id: 'polls.create.multi_help', defaultMessage: 'Voters can pick more than one option.'},
    anonymousToggle: {id: 'polls.create.anonymous', defaultMessage: 'Anonymous voting'},
    anonymousHelp: {id: 'polls.create.anonymous_help', defaultMessage: 'Nobody sees who voted for what.'},
    duration: {id: 'polls.create.duration', defaultMessage: 'Duration'},
    hours: {id: 'polls.create.hours', defaultMessage: '{n, plural, one {# hour} other {# hours}}'},
    days: {id: 'polls.create.days', defaultMessage: '{n, plural, one {# day} other {# days}}'},
    weeks: {id: 'polls.create.weeks', defaultMessage: '{n, plural, one {# week} other {# weeks}}'},
    noEnd: {id: 'polls.create.no_end', defaultMessage: 'No end'},
    cancel: {id: 'polls.create.cancel', defaultMessage: 'Cancel'},
    post: {id: 'polls.create.post', defaultMessage: 'Post poll'},
    tooFewAnswers: {id: 'polls.create.too_few', defaultMessage: 'Add at least two answers'},
    tooManyAnswers: {id: 'polls.create.too_many', defaultMessage: 'Polls can have up to 10 answers'},
    needTwoAnswers: {id: 'polls.create.need_two', defaultMessage: 'A poll needs at least two answers'},
    createFailed: {id: 'polls.create.failed', defaultMessage: "The poll couldn't be created: {error}"},

    // Antimatter Fusion: the poll written in the composer (poll_composer_mode.tsx)
    needQuestion: {
        id: 'polls.compose.need_question',
        defaultMessage: 'Write the question in the message box first',
        description: 'Error in the composer when a poll is posted without a question; the question is the text typed in the message box above the answers.',
    },
    questionTooLong: {
        id: 'polls.compose.question_too_long',
        defaultMessage: 'The question can be up to {max} characters',
        description: 'Error in the composer when a poll\'s question (the message box text) is too long; {max} is a number.',
    },
    multiShort: {
        id: 'polls.compose.multi',
        defaultMessage: 'Several answers',
        description: 'Short toggle under a poll being written in the composer: voters may pick more than one answer.',
    },
    settings: {
        id: 'polls.compose.settings',
        defaultMessage: 'Poll settings',
        description: 'Accessible name of the row of a poll\'s settings (several answers, anonymous, duration) under its answers in the composer.',
    },
});
