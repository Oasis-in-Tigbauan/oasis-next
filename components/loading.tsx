'use client';

import {useEffect, useState} from 'react';

import Typography from '@/components/typography';
import {Spinner} from '@/components/ui/spinner';

const loadingMessages = [
  "It's taking too long...",
  'Almost there...',
  "Are you sure this isn't your internet connection? It's already been a while to load...",
  'This may take years to load. Try refreshing the page. or you wait...',
];

export default function Loading() {
  const [idx, setIdx] = useState(-1);

  useEffect(() => {
    // Set up the interval
    const interval = setInterval(() => {
      setIdx((prevIndex) => {
        const nextIndex = prevIndex + 1;

        // If the next index is the last one, clear the timer
        if (nextIndex === loadingMessages.length - 1) {
          clearInterval(interval);
        }

        return nextIndex;
      });
    }, 15_000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 pt-0 w-full">
      <Spinner className="mx-auto mb-4 mt-8 size-1/8" />
      <Typography variant="muted" className="text-center">
        {idx === -1 ? 'Initializing Data...' : loadingMessages[idx]}
      </Typography>
    </div>
  );
}
