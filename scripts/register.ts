#!/usr/bin/env node
/**
 * Register global slash commands (SPEC §5). Run deliberately after deploy — never on container boot.
 *
 * Host: any machine with DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID — repo ember-discord-adapter
 */
import { emberGlobalCommands } from "../src/discord/slash-commands.js";

const DISCORD_API = "https://discord.com/api/v10";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const applicationId = requireEnv("DISCORD_APPLICATION_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");
  const commands = emberGlobalCommands();

  const url = `${DISCORD_API}/applications/${applicationId}/commands`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Discord register failed HTTP ${res.status}: ${text}`);
    process.exit(1);
  }

  console.info(`Registered ${commands.length} global command(s) for application ${applicationId}`);
  try {
    const body = JSON.parse(text) as unknown;
    console.info(JSON.stringify(body, null, 2));
  } catch {
    console.info(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
