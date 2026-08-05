# oasis-next

[![CircleCI](https://dl.circleci.com/status-badge/img/circleci/E456Hd1RqfPHz9QYrccdkR/MAoz8ho7NLTVyzGdx9Ubg3/tree/master.svg?style=svg&circle-token=CCIPRJ_E9X7bHs4Qcgu5rgsujaPK7_506e7369727f005c8e18d96fb272973e37b4fa01)](https://dl.circleci.com/status-badge/redirect/circleci/E456Hd1RqfPHz9QYrccdkR/MAoz8ho7NLTVyzGdx9Ubg3/tree/master)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Difference with `oasis-app`

This project is a rewrite of the `oasis-app` project, aiming to be more performant, more
beautiful and easy to ~~vibe code~~.

This rewrite contains a new approach on how this project will be deployed. Before, the project
was flexible to allow multiple municipalities in a single deployment. However, now it will focus only
on per-municipality deployments.

With this change, each update will be done and tested per municipality-basis. This will allow us
to gather feedback and avoid downtime that will cause a lot of issues throughout our customers.

### Migration of Services

Services are written to be flexible enough to be migrated as APIs again. However, Events API
will retain to still provide a real-time feed of any writing updates.

With this change, we will sunset the service template method as it was unfeasible and a bit
"too much" for this current move. Since it will be per-municipality deployments, the load
should not be too high unless we deal with millions of employees (which is very unlikely).

## Getting Started

### Requirements

Before you begin, you will need to have the following tools installed on your machine:

- [Node.js >= 24](https://nodejs.org/en)
- [Git](https://git-scm.com)
- [Docker Engine or Docker Desktop](https://docker.com)
- [pnpm >= 10](https://pnpm.io)

Additionally, you will need to have certain API Keys:

- [A Sentry Authentication Key](https://docs.sentry.io/account/auth-tokens/).
- [Resend API Key](https://resend.com/docs/api-reference/api-keys/create-api-key)

## Preparing your environment

1. Clone this repository:

   ```sh
   git clone https://github.com/Oasis-in-Tigbauan/oasis-next.git && cd oasis-next
   ```

2. Install required dependencies:

   ```sh
   pnpm i
   ```

3. Generate required environment configs:

   ```sh
   pnpm run setup
   ```

   It will ask you for a couple of things like Sentry API Key, Resend API Key, Database credentials, etc.

4. To create a enroller account, you need to run

   ```sh
   pnpm run enroller -- --enable
   ```

   In the enroller account, you can create offices, setup roles, set permissions, invite people to the
   organization and even create accounts without requiring to go thru the whole enrollment process.

   > [!IMPORTANT]
   > You need to disable the enroller account via `pnpm run enroller -- --disable` after inviting people
   > to join the organization on production environments. You won't like that someone have access to the
   > enroller account and have malicious actors come in! OR you can keep this enabled as long as the password
   > is changed frequently and have 2FA enabled.

5. Start the project!

   ```sh
   pnpm run dev
   ```

   Then open your browser at http://localhost:3000 to open the app.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – an interactive Next.js tutorial.
- [Drizzle](https://orm.drizzle.team/) – the fastest ORM for Node-based applications.
- [better-auth](https://www.better-auth.com/) - Authentication library used for this project.
- [better-fetch](https://better-fetch.vercel.app/docs) - Fetch library used for this project.
- [Shadcn](https://ui.shadcn.com/) - UI library used for this project.
