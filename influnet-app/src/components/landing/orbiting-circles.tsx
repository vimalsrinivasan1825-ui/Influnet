'use client';

import React from 'react';

export interface OrbitingCirclesProps {
  className?: string;
  children?: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
}

export default function OrbitingCircles({
  className = '',
  children,
  reverse = false,
  duration = 20,
  delay = 0,
  radius = 50,
  path = true,
}: OrbitingCirclesProps) {
  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute inset-0 size-full stroke-black/5 stroke-1 dark:stroke-white/5"
        >
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
            strokeDasharray="4 4"
          />
        </svg>
      )}

      <div
        style={
          {
            "--duration": `${duration}s`,
            "--radius": `${radius}`,
            "--delay": `${-delay}s`,
          } as React.CSSProperties
        }
        className={`absolute flex size-full items-center justify-center rounded-full animate-orbit ${
          reverse ? '[animation-direction:reverse]' : ''
        } ${className}`}
      >
        {children}
      </div>
    </>
  );
}
