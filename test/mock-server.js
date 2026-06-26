import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: null,
  terminal: false
});

rl.on('line', (line) => {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    return;
  }

  const { method, id, params } = parsed;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'Mock MCP Server',
          version: '1.0.0'
        }
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'read_file',
            description: 'Reads a file from disk (low-risk)',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              },
              required: ['path']
            }
          },
          {
            name: 'execute_command',
            description: 'Executes a command on the terminal (high-risk)',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' }
              },
              required: ['command']
            }
          }
        ]
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments;

    let result;
    if (toolName === 'read_file') {
      result = {
        content: [
          {
            type: 'text',
            text: `Mock file content for: ${args?.path}`
          }
        ]
      };
    } else if (toolName === 'execute_command') {
      result = {
        content: [
          {
            type: 'text',
            text: `Command executed: ${args?.command}`
          }
        ]
      };
    } else {
      const response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Tool not found: ${toolName}`
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});
