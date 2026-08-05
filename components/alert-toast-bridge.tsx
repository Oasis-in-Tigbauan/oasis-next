'use client';

import {useEffect} from 'react';
import {toast} from 'sonner';

export default function AlertToastBridge() {
  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (message?: unknown) => {
      const text = typeof message === 'string' ? message : String(message ?? '');
      const normalized = text.toLowerCase();

      if (
        normalized.includes('failed') ||
        normalized.includes('unable') ||
        normalized.includes('cannot') ||
        normalized.includes('invalid') ||
        normalized.includes('not found') ||
        normalized.includes('no such')
      ) {
        toast.error(text || 'The operation could not be completed.');
        return;
      }

      if (
        normalized.includes('required') ||
        normalized.includes('select') ||
        normalized.includes('complete') ||
        normalized.includes('please')
      ) {
        toast.warning(text || 'Please review the required fields.');
        return;
      }

      if (
        normalized.includes('success') ||
        normalized.includes('created') ||
        normalized.includes('updated') ||
        normalized.includes('deleted') ||
        normalized.includes('moved') ||
        normalized.includes('saved')
      ) {
        toast.success(text);
        return;
      }

      toast.info(text || 'Notice');
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  return null;
}
