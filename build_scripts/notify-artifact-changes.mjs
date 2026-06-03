#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import {
  compareProviderArtifactChanges,
  hasProviderArtifactChanges,
  loadManifestFile,
  loadPreviousManifest,
  renderTelegramArtifactChangeMessage,
  sendTelegramMessage,
} from "./lib/notifications.mjs";

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      i += 1;
    }
  }
  return options;
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = process.cwd();

try {
  if (args["message-file"]) {
    const message = await fs.readFile(
      path.resolve(projectRoot, args["message-file"]),
      "utf8",
    );
    await sendIfConfigured({
      message,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    });
    process.exit(0);
  }

  const currentManifest = await loadManifestFile(
    path.resolve(projectRoot, args.current ?? ".release/artifacts-manifest.json"),
  );
  const previousManifest = await loadPreviousManifest({
    previousManifestPath: args["previous-manifest"]
      ? path.resolve(projectRoot, args["previous-manifest"])
      : undefined,
    previousReleaseDir: args["previous-release-dir"]
      ? path.resolve(projectRoot, args["previous-release-dir"])
      : undefined,
    previousRef: args["previous-ref"] === "false"
      ? undefined
      : (typeof args["previous-ref"] === "string" ? args["previous-ref"] : "origin/release"),
    cwd: projectRoot,
  });
  const changes = compareProviderArtifactChanges(previousManifest, currentManifest);

  if (!previousManifest) {
    console.log("No previous release baseline found; Telegram notification skipped.");
    process.exit(0);
  }
  if (!hasProviderArtifactChanges(changes)) {
    console.log("No provider artifact additions or removals detected.");
    process.exit(0);
  }

  const message = renderTelegramArtifactChangeMessage({
    changes,
    repository: args.repo ?? process.env.GITHUB_REPOSITORY,
    releaseBranch: args["release-branch"] ?? "release",
  });

  if (args.out) {
    await fs.mkdir(path.dirname(path.resolve(projectRoot, args.out)), {
      recursive: true,
    });
    await fs.writeFile(path.resolve(projectRoot, args.out), message);
    console.log(`Telegram notification message written to ${args.out}.`);
    process.exit(0);
  }

  if (args["dry-run"] || args["no-send"]) {
    console.log(message);
    process.exit(0);
  }

  await sendIfConfigured({
    message,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  });
  console.log(`Telegram notification sent for ${changes.added.length} additions and ${changes.removed.length} removals.`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}

async function sendIfConfigured({ message, botToken, chatId }) {
  if (!botToken || !chatId) {
    console.log("Telegram credentials not configured; skipping send.");
    return;
  }
  await sendTelegramMessage({
    botToken,
    chatId,
    text: message,
  });
}
