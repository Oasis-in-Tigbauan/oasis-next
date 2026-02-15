import fs from "node:fs/promises";
import path from "node:path";

import * as utils from "./utils.mjs";

const __dirname = import.meta.dirname;

async function main() {
    let template = await fs.readFile(path.join(__dirname, "env_template.txt"), { encoding: "utf-8" });
    let composeTemplate = await fs.readFile(path.join(__dirname, "env_compose.txt"), { encoding: "utf-8" });

    // Sentry token
    const sentryToken = await utils.prompt.questionAsync("Your Sentry Token: ");
    template = template.replace("SENTRY_AUTH_TOKEN=YOUR_SENTRY_AUTH_TOKEN", "SENTRY_AUTH_TOKEN=\"" + sentryToken + "\"");

    // Token generation for authentication
    const token = utils.token.generatePassword(32, "!#%&()*+,/:;<=>?@[]^`{|}");
    template = template.replace("BETTER_AUTH_TOKEN=YOUR_SECRET_KEY", "BETTER_AUTH_TOKEN=\"" + token + "\"");

    // Database configuration
    const databasePassword = utils.token.generatePassword(32);
    composeTemplate = composeTemplate.replace("POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD", "POSTGRES_PASSWORD=\"" + databasePassword + "\"");

    const databaseUsername = await utils.prompt
        .questionAsync("Your PostgreSQL username (Default: postgres): ") || "postgres";
    composeTemplate = composeTemplate.replace("POSTGRES_USERNAME=YOUR_POSTGRES_USERNAME", "POSTGRES_USERNAME=\"" + databaseUsername + "\"");

    const databaseName = await utils.prompt
        .questionAsync("Your PostgreSQL database name (Default: oasis): ") || "oasis";
    composeTemplate = composeTemplate.replace("POSTGRES_DB=YOUR_POSTGRES_DB", "POSTGRES_DATABASE=\"" + databaseName + "\"");

    const databaseHost = await utils.prompt
        .questionAsync("Your PostgreSQL host (Default: localhost): ") || "localhost";
    composeTemplate = composeTemplate.replace("POSTGRES_HOST=YOUR_POSTGRES_HOST", "POSTGRES_HOST=\"" + databaseHost + "\"");

    const databasePort = await utils.prompt
        .questionAsync("Your PostgreSQL port (Default: 5432): ") || "5432";
    composeTemplate = composeTemplate.replace("POSTGRES_PORT=YOUR_POSTGRES_PORT", "POSTGRES_PORT=\"" + databasePort + "\"");

    // Generate a connection string
    const connectionString = `postgresql://${databaseUsername}:${databasePassword}@${databaseHost}:${databasePort}/${databaseName}?schema=public`;
    template = template.replace("DATABASE_URL=YOUR_DATABASE_URL", "DATABASE_URL=\"" + connectionString + "\"");

    // Write to root
    await fs.writeFile(path.join(__dirname, "../.env"), template, "utf-8");
    await fs.writeFile(path.join(__dirname, "../.env.docker-compose"), composeTemplate, "utf-8");

    // Run the docker-compose
    await utils.process.spawnAsync("docker", ["compose", "--env-file", ".env.docker-compose", "up", "-d"], {
        cwd: path.join(__dirname, "../"),
    });

    // Wait 5s...
    await utils.timers.wait(5);

    // Create the database in preparation of pushing the schema to a database
    await utils.db.setupDatabase(databaseUsername, databasePassword, databaseName, databaseHost, databasePort);

    // Start the migration
    await utils.process.spawnAsync("pnpm", ["run", "db:push"], {
        cwd: path.join(__dirname, "../"),
    });

    console.log("Successfully generated .env and .env.docker-compose files!");
    console.log("You may run 'service:*' and 'db:*' scripts on pnpm without running the setup again.");
}

main().catch(console.error);
