/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Shows `children` at their real size — 1:1 — whenever the page has the room,
 * and scales them down evenly (like a screenshot) only when it does not.
 */
export function Scaled({ width, height, children, className = '', frameClassName = '' }: {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
  /** On the visible box — rounded corners, a border, a shadow. */
  frameClassName?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const measure = () => setScale(Math.min(1, element.clientWidth / width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={box} className={`w-full ${className}`} style={{ maxWidth: width }}>
      <div className={`relative overflow-hidden ${frameClassName}`} style={{ height: height * scale }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width, height, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          {children}
        </div>
      </div>
    </div>
  );
}
