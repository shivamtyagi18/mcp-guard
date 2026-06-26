import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('--- Starting Mock Client Test ---');

  const proxyPath = path.join(__dirname, '../bin/mcp-guard.js');
  const serverPath = path.join(__dirname, 'mock-server.js');

  // Spawn mcp-guard proxy running the mock-server
  // We use process.execPath (which is the current node executable)
  const proxy = spawn(process.execPath, [
    proxyPath,
    '--prompt-method', 'applescript', // force applescript for the native dialog test
    '--',
    process.execPath,
    serverPath
  ], {
    stdio: ['pipe', 'pipe', 'inherit'] // Inherit stderr so we can see guard logs
  });

  const rl = readline.createInterface({
    input: proxy.stdout,
    terminal: false
  });

  let messageId = 1;
  const pendingRequests = new Map();

  rl.on('line', (line) => {
    console.log(`[CLIENT RECEIVED] ${line}`);
    try {
      const parsed = JSON.parse(line);
      if (parsed.id !== undefined) {
        const resolve = pendingRequests.get(parsed.id);
        if (resolve) {
          pendingRequests.delete(parsed.id);
          resolve(parsed);
        }
      }
    } catch (e) {
      console.error('[CLIENT ERROR] Failed to parse line:', line);
    }
  });

  function send(method, params = {}) {
    const id = messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    const promise = new Promise((resolve) => {
      pendingRequests.set(id, resolve);
    });
    console.log(`[CLIENT SENT] ${JSON.stringify(request)}`);
    proxy.stdin.write(JSON.stringify(request) + '\n');
    return promise;
  }

  // 1. Initialize
  await send('initialize');

  // 2. List tools
  await send('tools/list');

  // 3. Call low-risk tool: read_file
  console.log('\n--- Calling Low-Risk Tool (should be auto-allowed) ---');
  const readRes = await send('tools/call', {
    name: 'read_file',
    arguments: { path: '/Users/shivtatva/HomeProjects/mcp-guard/README.md' }
  });
  console.log('Result:', JSON.stringify(readRes, null, 2));

  // 4. Call high-risk tool: execute_command (triggers dialog popup)
  console.log('\n--- Calling High-Risk Tool (should trigger macOS pop-up prompt) ---');
  const execRes = await send('tools/call', {
    name: 'execute_command',
    arguments: { command: 'rm -rf /Users/shivtatva/HomeProjects/mcp-guard/scratch-temp' }
  });
  console.log('Result:', JSON.stringify(execRes, null, 2));

  console.log('\nClosing proxy...');
  proxy.stdin.end();
  proxy.kill();
  console.log('Test complete.');
}

run().catch(console.error);
