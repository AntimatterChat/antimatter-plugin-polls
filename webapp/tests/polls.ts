// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import type {Poll} from '../src/types/poll';

// makePoll returns a poll for tests.
export function makePoll(partial: Partial<Poll> = {}): Poll {
    return {
        id: 'poll1',
        post_id: 'post1',
        channel_id: 'channel1',
        creator_id: 'alice',
        question: 'Which Friday works for demo day?',
        options: [
            {text: 'November 6', votes: 2, voters: ['bob', 'carol']},
            {text: 'November 13', votes: 1, voters: ['bob']},
            {text: 'November 20', votes: 0},
        ],
        multi: true,
        anonymous: false,
        create_at: 1000,
        closed: false,
        voter_count: 3,
        my_votes: [],
        ...partial,
    };
}
