import path from "node:path";

import * as utils from "./utils.mjs";

const __dirname = import.meta.dirname;

async function main() {
  // Resend API Key
  const resend = await utils.env.ask("Your Resend API Key", "runtime.resend.api.key");
  if (!resend) {
    throw new Error("Resend API Key is required.");
  }

  const resendFromAddress = await utils.env.ask(
    "Your Resend From Address (Example: oasis-app <no-reply@oasis-app.dev>)",
    "runtime.resend.from.address",
  );
  if (!resendFromAddress) {
    throw new Error("Resend From Address is required.");
  }

  // Sentry token
  const sentry = await utils.env.ask("Your Sentry Auth Token", "runtime.sentry.auth.token");
  if (!sentry) {
    throw new Error("Sentry Auth Token is required.");
  }

  // Token generation for authentication
  const token = utils.token.generatePassword(32, "!#%&()*+,/:;<=>?@[]^`{|}");
  utils.env.write("runtime.better.auth.token", token);
  utils.env.write("runtime.better.auth.url", "http://localhost:3000");

  // Database configuration
  const dbPassword = utils.token.generatePassword(32);
  utils.env.write("runtime.postgres.password", dbPassword);

  const dbUser = await utils.env.ask("Your Database username", "runtime.postgres.username", "postgres");
  const dbName = await utils.env.ask("Your Database name", "runtime.postgres.db", "oasis");
  const dbHost = await utils.env.ask("Your Database host", "runtime.postgres.host", "localhost");
  const dbPort = await utils.env.ask("Your Database port", "runtime.postgres.port", "5432");

  // Redis configuration
  await utils.env.ask("Your Redis Connection String", "runtime.redis.url", "redis://localhost:6379");

  // Generate a connection string
  const connectionString = utils.db.createConnectionString({
    username: dbUser,
    password: dbPassword,
    name: dbName,
    host: dbHost,
    port: dbPort,
  });
  utils.env.write("runtime.database.url", connectionString);

  // Write to root
  await utils.env.export(path.join(__dirname, "../.env"));

  // Run the docker-compose
  await utils.process.spawnAsync("docker", ["compose", "up", "-d"], {
    cwd: path.join(__dirname, "../"),
  });

  // Wait 5s...
  await utils.timers.wait(5);

  // Create the database in preparation of pushing the schema to a database
  await utils.db.setupDatabase({
    username: dbUser,
    password: dbPassword,
    name: dbName,
    host: dbHost,
    port: dbPort,
  });

  // Wait 5s...
  await utils.timers.wait(5);

  // Start the schema migration
  await utils.process.spawnAsync("pnpm", ["run", "db:migrate"], {
    cwd: path.join(__dirname, "../"),
  });

  await utils.timers.wait(5);

  // Seed
  await utils.process.spawnAsync("pnpm", ["run", "db:seed"], {
    cwd: path.join(__dirname, "../"),
  });

  await utils.timers.wait(5);

  // Finally, prepare for the setup
  await utils.process.spawnAsync("pnpm", ["run", "setup:admin"], {
    cwd: path.join(__dirname, "../"),
  });
}

main().catch(console.error);
