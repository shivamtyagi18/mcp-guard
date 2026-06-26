import { spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';

/**
 * Escapes a string for use within double quotes in AppleScript.
 */
function escapeAppleScriptString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Truncates arguments string to prevent oversized dialogs.
 */
function formatArguments(args) {
  if (!args) return '{}';
  const str = JSON.stringify(args, null, 2);
  if (str.length > 800) {
    return str.slice(0, 800) + '\n... (truncated for preview)';
  }
  return str;
}

/**
 * Prompts the user using macOS AppleScript.
 * 
 * @param {string} toolName - The tool name.
 * @param {any} args - The tool arguments.
 * @param {string} reason - The reason prompting is required.
 * @returns {Promise<boolean>} True if allowed, false if blocked.
 */
function promptAppleScript(toolName, args, reason) {
  return new Promise((resolve) => {
    const formattedArgs = formatArguments(args);
    const escapedMessage = escapeAppleScriptString(
      `An AI Agent is requesting permission to execute a high-risk tool.\n\n` +
      `Tool: ${toolName}\n` +
      `Reason: ${reason}\n\n` +
      `Arguments:\n${formattedArgs}`
    );

    const script = `
      try
        display dialog "${escapedMessage}" with title "MCP Guard Alert" buttons {"Block", "Allow"} default button "Allow" with icon caution
      on error number -128
        return "button returned:Block"
      end try
    `;

    const osascript = spawn('osascript', ['-']);
    let output = '';

    osascript.stdout.on('data', (data) => {
      output += data.toString();
    });

    osascript.on('close', (code) => {
      if (code !== 0) {
        // Any error or user canceling is blocked
        resolve(false);
        return;
      }
      const trimmed = output.trim();
      resolve(trimmed.includes('button returned:Allow'));
    });

    osascript.stdin.write(script);
    osascript.stdin.end();
  });
}

/**
 * Prompts the user via /dev/tty (terminal fallback).
 * 
 * @param {string} toolName - The tool name.
 * @param {any} args - The tool arguments.
 * @param {string} reason - The reason prompting is required.
 * @returns {Promise<boolean>} True if allowed, false if blocked.
 */
function promptTTY(toolName, args, reason) {
  return new Promise((resolve) => {
    let ttyIn, ttyOut;
    try {
      ttyIn = fs.createReadStream('/dev/tty');
      ttyOut = fs.createWriteStream('/dev/tty');
    } catch (e) {
      // If we can't open /dev/tty, fail-safe to block
      resolve(false);
      return;
    }

    const rl = readline.createInterface({
      input: ttyIn,
      output: ttyOut,
      terminal: true
    });

    const formattedArgs = formatArguments(args);
    const questionText = 
      `\n\x1b[33m⚠️  [MCP GUARD] High-Risk Tool Execution Request\x1b[0m\n` +
      `\x1b[1mTool:\x1b[0m ${toolName}\n` +
      `\x1b[1mReason:\x1b[0m ${reason}\n` +
      `\x1b[1mArguments:\x1b[0m\n${formattedArgs}\n\n` +
      `Do you want to allow this action? (y/N): `;

    rl.question(questionText, (answer) => {
      rl.close();
      ttyIn.destroy();
      ttyOut.destroy();
      const allowed = answer.trim().toLowerCase() === 'y';
      resolve(allowed);
    });
  });
}

/**
 * Prompts the user using the preferred prompt method.
 * 
 * @param {string} toolName - The tool name.
 * @param {any} args - The tool arguments.
 * @param {string} reason - The reason prompting is required.
 * @param {string} method - The prompt method ('auto' | 'applescript' | 'tty').
 * @returns {Promise<boolean>} True if allowed, false if blocked.
 */
export async function promptUser(toolName, args, reason, method = 'auto') {
  // If method is auto, check if we are on macOS and try AppleScript first
  if (method === 'auto' || method === 'applescript') {
    if (process.platform === 'darwin') {
      const allowed = await promptAppleScript(toolName, args, reason);
      return allowed;
    }
  }

  // Fallback to TTY
  return await promptTTY(toolName, args, reason);
}
