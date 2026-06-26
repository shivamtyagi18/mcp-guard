import { spawn } from 'child_process';
import readline from 'readline';
import { checkRequestRisk } from './rules.js';
import { promptUser } from './prompter.js';

/**
 * Starts the proxy, spawning the target MCP server and intercepting requests.
 * 
 * @param {string[]} targetCmdArgs - The command and arguments of the target MCP server.
 * @param {any} config - The active configuration.
 */
export function startProxy(targetCmdArgs, config) {
  if (targetCmdArgs.length === 0) {
    console.error('[mcp-guard] Error: No target server command specified.');
    process.exit(1);
  }

  const [cmd, ...args] = targetCmdArgs;
  
  // Spawn the actual MCP server
  const server = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'inherit'] // Pipe stdin/stdout, let stderr print directly to console
  });

  // Handle server process exit
  server.on('exit', (code, signal) => {
    if (signal) {
      process.exit(128 + signal);
    } else {
      process.exit(code || 0);
    }
  });

  server.on('error', (err) => {
    console.error(`[mcp-guard] Error: Failed to start target server: ${err.message}`);
    process.exit(1);
  });

  // Pipe server output directly back to client
  server.stdout.pipe(process.stdout);

  // Set up readline interface to parse client input line-by-line
  const rl = readline.createInterface({
    input: process.stdin,
    output: null, // Do not echo input
    terminal: false
  });

  // Handle client input stream close
  rl.on('close', () => {
    server.stdin.end();
  });

  // Queue of lines to process, to prevent concurrent prompt collisions
  const lineQueue = [];
  let isProcessing = false;

  rl.on('line', (line) => {
    lineQueue.push(line);
    processNextLine();
  });

  async function processNextLine() {
    if (isProcessing || lineQueue.length === 0) return;
    
    isProcessing = true;
    const line = lineQueue.shift();
    
    try {
      await handleLine(line);
    } catch (err) {
      console.error(`[mcp-guard] Internal error handling line: ${err.message}`);
      // Fallback: write to server to avoid hanging the client
      server.stdin.write(line + '\n');
    } finally {
      isProcessing = false;
      // Schedule the next line in the microtask queue
      process.nextTick(processNextLine);
    }
  }

  async function handleLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      // Not JSON-RPC, just forward to server as-is
      server.stdin.write(line + '\n');
      return;
    }

    // Verify if it is a JSON-RPC request (must have method, and id for requests)
    const isRequest = parsed && typeof parsed.method === 'string' && parsed.id !== undefined;
    
    if (!isRequest) {
      // It's a response, notification, or malformed. Forward directly.
      server.stdin.write(line + '\n');
      return;
    }

    const { method, id, params } = parsed;
    const toolName = method === 'tools/call' ? params?.name : null;

    // Check risk level of request
    const { action, reason } = checkRequestRisk(method, toolName, params, config);

    if (action === 'allow') {
      server.stdin.write(line + '\n');
      return;
    }

    if (action === 'deny') {
      const errorResponse = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603, // Internal error / custom block code
          message: `Blocked by MCP Guard: ${reason}`
        }
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
      return;
    }

    if (action === 'prompt') {
      // High-risk: Intercept and ask developer for approval
      rl.pause(); // Pause stream reading to handle backpressure while prompting
      
      try {
        const allowed = await promptUser(toolName, params?.arguments, reason, config.promptMethod);
        
        if (allowed) {
          server.stdin.write(line + '\n');
        } else {
          const errorResponse = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Execution denied by user: ${reason}`
            }
          };
          process.stdout.write(JSON.stringify(errorResponse) + '\n');
        }
      } finally {
        rl.resume();
      }
    }
  }

  // Forward process termination signals
  const cleanExit = () => {
    server.kill();
    process.exit(0);
  };
  
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}
