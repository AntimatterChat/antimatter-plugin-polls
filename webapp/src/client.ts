// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import {Client4} from 'mattermost-redux/client';

import manifest from './manifest';
import type {Poll, PollRequest} from './types/poll';

export class ClientError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function apiURL(path: string) {
    return `${window.basename || ''}/plugins/${manifest.id}/api/v1${path}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const options: {method: string; body?: string} = {method};
    if (typeof body !== 'undefined') {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(apiURL(path), Client4.getOptions(options));

    if (!response.ok) {
        let message = response.statusText;
        try {
            const data = await response.json();
            message = data.error || message;
        } catch {
            // Not JSON
        }
        throw new ClientError(message, response.status);
    }

    return response.json();
}

export function getPoll(pollId: string) {
    return request<Poll>('GET', `/polls/${pollId}`);
}

export function createPoll(req: PollRequest) {
    return request<Poll>('POST', '/polls', req);
}

export function vote(pollId: string, option: number) {
    return request<Poll>('POST', `/polls/${pollId}/vote`, {option});
}

export function unvote(pollId: string, option: number) {
    return request<Poll>('POST', `/polls/${pollId}/unvote`, {option});
}

export function closePoll(pollId: string) {
    return request<Poll>('POST', `/polls/${pollId}/close`);
}

// openServerDialog runs /poll, which opens the server's poll creation dialog: the interactive
// dialogs of the web and desktop apps.
export function openServerDialog(teamId: string, channelId: string, rootId?: string) {
    return Client4.executeCommand('/poll', {team_id: teamId, channel_id: channelId, root_id: rootId || ''});
}
