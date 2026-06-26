#!/usr/bin/env node

import { loadConfig } from '../lib/config.js';
import { startProxy } from '../lib/proxy.js';
import path from 'path';

function printHelp() {
  console.log(`
mcp-guard - Local Firewall & Security Proxy for AI Agents (Model Context Protocol)

Usage:
  mcp-guard [options] -- <command> [args...]
  mcp-guard [options] -c <server-name>

Options:
  -c, --config-name <name>   Use target command and args registered under <name> in config.
  --prompt-method <method>   Set prompt method: 'auto', 'applescript', or 'tty'.
  -h, --help                 Show this help screen.
  -v, --version              Show version.

Examples:
  # Intercept node-based MCP server:
  mcp-guard -- node /path/to/server.js --option value
  
  # Intercept npx-based MCP server:
  mcp-guard -- npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb
  
  # Run registered server 'postgres' from ~/.config/mcp-guard/config.json:
  mcp-guard -c postgres
`);
}

function printVersion() {
  console.log('mcp-guard version 0.1.0');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    printVersion();
    process.exit(0);
  }

  // Find '--' separator
  const dashDashIndex = args.indexOf('--');
  let targetCmdArgs = [];
  let promptMethodOverride = null;
  let configName = null;

  // Simple manual CLI arg parsing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') {
      targetCmdArgs = args.slice(i + 1);
      break;
    }
    if (args[i] === '-c' || args[i] === '--config-name') {
      configName = args[i + 1];
      i++;
    } else if (args[i] === '--prompt-method') {
      promptMethodOverride = args[i + 1];
      i++;
    }
  }

  // Load config
  const config = loadConfig();
  if (promptMethodOverride) {
    config.promptMethod = promptMethodOverride;
  }

  // Resolve target command
  if (targetCmdArgs.length === 0 && configName) {
    const serverConf = config.servers?.[configName];
    if (!serverConf) {
      console.error(`[mcp-guard] Error: Server configuration '${configName}' not found in configuration files.`);
      process.exit(1);
    }
    if (!serverConf.command) {
      console.error(`[mcp-guard] Error: Server configuration '${configName}' is missing 'command' property.`);
      process.exit(1);
    }
    targetCmdArgs = [serverConf.command, ...(serverConf.args || [])];
  }

  if (targetCmdArgs.length === 0) {
    console.error('[mcp-guard] Error: No target server command specified. Use -- followed by the command, or -c.');
    printHelp();
    process.exit(1);
  }

  startProxy(targetCmdArgs, config);
}

main().catch((err) => {
  console.error('[mcp-guard] Fatal error:', err);
  process.exit(1);
});
