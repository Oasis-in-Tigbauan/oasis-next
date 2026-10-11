// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://9197a6d61bc3deed44580d4d4f9d0893@o4510393838862336.ingest.de.sentry.io/4510888251424848',

  // Enable logging
  integrations: [
    Sentry.consoleLoggingIntegration({
      levels: ['log', 'warn', 'error'],
    }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Disable data collection for user information. This disables PII (Personally Identifiable Information)
  dataCollection: {
    userInfo: false,
  },
});
