'use client';

import {AlertTriangle, RefreshCw} from 'lucide-react';

import {Button} from '@/components/ui/button';

export default function DeadHamster() {
  return (
    <div className="flex min-h-[55vh] w-full items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-lg border border-[#D8E2EC] bg-[#FBFCFE] px-7 py-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-[#FFF3D6] text-[#9A6510]">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#122033]">
          This view could not load
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#52657A]">
          The request failed before the page could finish loading. Try again, or return to the
          previous page if the problem continues.
        </p>
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </section>
    </div>
  );
}
