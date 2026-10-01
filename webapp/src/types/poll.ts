// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

export type PollOption = {
    text: string;
    votes: number;

    // Who voted for the answer, unless the poll is anonymous
    voters?: string[];
};

// A poll as the server shows it to the user
export type Poll = {
    id: string;
    post_id: string;
    channel_id: string;
    creator_id: string;
    question: string;
    options: PollOption[];
    multi: boolean;
    anonymous: boolean;
    create_at: number;
    end_at?: number;
    closed_at?: number;
    closed: boolean;
    voter_count: number;

    // The answers the user voted for
    my_votes: number[];
};

export type PollRequest = {
    channel_id: string;
    root_id?: string;
    question: string;
    options: string[];
    multi: boolean;
    anonymous: boolean;
    duration_minutes: number;
};
