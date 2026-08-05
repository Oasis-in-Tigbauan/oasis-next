'use client';

import type {ComponentProps} from 'react';

export default function ErrorTextRenderer({message, ...props}: ErrorTextRendererProps) {
  if (message !== null && message !== undefined && typeof message !== 'object') {
    return <p {...props}>Unknown exception occurred.</p>;
  }

  if (typeof message === 'string') return <p {...props}>{message}</p>;

  return (
    <p {...props}>
      {Object.keys(message as Record<string, string>).map((key, idx) => (
        <span key={idx}>{message![key]}</span>
      ))}
    </p>
  );
}

interface ErrorTextRendererProps extends ComponentProps<'p'> {
  message: Record<string, string> | string | null | undefined;
}
