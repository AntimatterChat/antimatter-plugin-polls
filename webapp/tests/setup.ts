// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import '@testing-library/jest-dom';

// The host's plugin loader, called when the plugin's bundle loads
window.registerPlugin = jest.fn();
