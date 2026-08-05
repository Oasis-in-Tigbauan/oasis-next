import Link from 'next/link';

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-900/20" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-[30rem] rounded-full bg-indigo-200/20 blur-3xl dark:bg-indigo-900/15" />

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center px-6 text-center">
        {/* Logo / badge */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-blue-700 shadow-xs backdrop-blur-sm dark:border-blue-800/50 dark:bg-zinc-900/70 dark:text-blue-300">
          <span className="size-2 rounded-full bg-blue-500" />
          Municipality of Tigbauan
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
          Oasis
          <span className="ml-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
            Next
          </span>
        </h1>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/auth/signin"
            className="inline-flex h-11 w-48 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign in
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
        &copy; {new Date().getFullYear()} Municipality of Tigbauan. All rights reserved.
      </footer>
    </div>
  );
}
