import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';

import AlertToastBridge from '@/components/alert-toast-bridge';
import {Toaster} from '@/components/ui/sonner';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'oasis-next',
  description: 'Municipality Management System for Municipality of Tigbauan',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <AlertToastBridge />
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
