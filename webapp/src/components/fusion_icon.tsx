// Copyright (c) 2026-present Antimatter contributors.
// See LICENSE.txt for license information.

import React from 'react';

type Props = {
    name: string;
    size?: 'sm' | 'xs';
};

// FusionIcon draws an icon of the Fusion UI's icon set, which the UI renders once in the page.
export default function FusionIcon({name, size}: Props) {
    return (
        <svg
            className={'am-ic' + (size ? ` am-${size}` : '')}
            aria-hidden='true'
        >
            <use href={`#am-i-${name}`}/>
        </svg>
    );
}
