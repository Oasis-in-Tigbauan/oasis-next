# oasis-next

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Requirements

Before you begin, you will need to have the following tools installed on your machine:

- [Node.js >= 24](https://nodejs.org/en)
- [Git](https://git-scm.com)
- [Docker Engine or Docker Desktop](https://docker.com)
- [pnpm >= 10](https://pnpm.io)

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
   > [!NOTE]
   > You need [Sentry API Key](https://docs.sentry.io/api/guides/create-auth-token/).

   ```sh
   pnpm run setup
   ```
   
   It will ask you for couple things like Sentry API Key, Database credentials, etc.

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – an interactive Next.js tutorial.
- [Drizzle](https://orm.drizzle.team/) – the fastest ORM for Node-based applications.
- [better-auth](https://www.better-auth.com/) - Authentication library used for this project.
- [better-fetch](https://better-fetch.vercel.app/docs) - Fetch library used for this project.
- [Shadcn](https://ui.shadcn.com/) - UI library used for this project.
