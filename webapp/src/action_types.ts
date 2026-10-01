// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import manifest from './manifest';

const prefix = `${manifest.id}/`;

export const RECEIVED_POLL = prefix + 'received_poll';
export const RECEIVED_MY_VOTES = prefix + 'received_my_votes';
export const OPEN_CREATE_DIALOG = prefix + 'open_create_dialog';
export const CLOSE_CREATE_DIALOG = prefix + 'close_create_dialog';
