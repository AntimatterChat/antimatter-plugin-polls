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
    closeConfirm: {id: 'polls.close_confirm', defaultMessage: 'Close the poll? Nobody will be able to vote anymore.'},
    loading: {id: 'polls.loading', defaultMessage: 'Loading the poll…'},
    unavailable: {id: 'polls.unavailable', defaultMessage: 'This poll is no longer available.'},
    voteFailed: {id: 'polls.vote_failed', defaultMessage: "Your vote couldn't be saved: {error}"},
    closeFailed: {id: 'polls.close_failed', defaultMessage: "The poll couldn't be closed: {error}"},
    votedBy: {id: 'polls.voted_by', defaultMessage: 'Voted by {names}'},
    andMore: {id: 'polls.and_more', defaultMessage: '{names} and {count, plural, one {# other} other {# others}}'},
    option: {id: 'polls.option', defaultMessage: '{text}: {percent}%'},
});
