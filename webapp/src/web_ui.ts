// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

// Antimatter ships two web UIs: the classic one and Fusion. Polls are drawn in each UI's own
// style. Both UIs say which one is running before plugins load.

export type WebUI = 'classic' | 'fusion';

// isFusionUI returns whether the Fusion web UI is running.
export function isFusionUI(): boolean {
    return window.antimatterWebUI === 'fusion' || document.documentElement.dataset.amWebUi === 'fusion';
}
