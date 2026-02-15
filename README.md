# oasis-next

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
   
   It will ask you for a couple of things like Sentry API Key, Database credentials, etc.

4. After generating the configs, you need to push the schema to db:
   ```sh
   pnpm run db:push
   ```
   
5. To generate an administrator account, you need to run:
   ```sh
   pnpm run setup:admin
   ```
   
   Follow the instructions after it generates the invitation link. You need to use the
   email address it generated.

6. Run the server and complete the setup:
   ```sh
   pnpm run dev
   ```
   
   Then open your browser at http://localhost:3000 to open the app.

7. To enable your administrator account, run:

   ```sh
   pnpm run db:studio
   ```
   
   To open the Drizzle studio. Enable your account by setting `emailVerified` to `true`. We
   don't perform email verification for this project because of how the invitation system works.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – an interactive Next.js tutorial.
- [Drizzle](https://orm.drizzle.team/) – the fastest ORM for Node-based applications.
- [better-auth](https://www.better-auth.com/) - Authentication library used for this project.
- [better-fetch](https://better-fetch.vercel.app/docs) - Fetch library used for this project.
- [Shadcn](https://ui.shadcn.com/) - UI library used for this project.
