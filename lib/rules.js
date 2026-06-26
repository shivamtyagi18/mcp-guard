/**
 * Checks the risk level of an incoming JSON-RPC request.
 * 
 * @param {string} method - The JSON-RPC method (e.g., 'tools/call').
 * @param {string|null} toolName - The name of the tool being called (if method is 'tools/call').
 * @param {any} params - The params object from the JSON-RPC request.
 * @param {any} config - The active configuration object.
 * @returns {{ action: 'allow' | 'deny' | 'prompt', reason: string }} The decision and explanation.
 */
export function checkRequestRisk(method, toolName, params, config) {
  // If it's not a tool call, verify if the method itself is blocked or allowed
  if (method !== 'tools/call') {
    if (config.rules.alwaysDeny.includes(method)) {
      return { action: 'deny', reason: `RPC method '${method}' is explicitly blocked in configuration.` };
    }
    if (config.rules.alwaysAllow.includes(method)) {
      return { action: 'allow', reason: `RPC method '${method}' is safe.` };
    }
    // Default safe methods for general MCP operations
    const safeMethods = [
      'tools/list',
      'resources/list',
      'resources/read',
      'resources/templates/list',
      'resources/templates/get',
      'prompts/list',
      'prompts/get',
      'initialize',
      'initialized',
      'cancelled',
      'ping'
    ];
    if (safeMethods.includes(method) || method.startsWith('notifications/')) {
      return { action: 'allow', reason: `RPC system method '${method}' is allowed by default.` };
    }
    
    return { 
      action: config.defaultPolicy === 'deny' ? 'deny' : 'prompt', 
      reason: `Unknown RPC method '${method}'.` 
    };
  }

  // It's a tool call. Check toolName
  if (!toolName) {
    return { action: 'deny', reason: 'Invalid tools/call request: tool name is missing.' };
  }

  // 1. Check explicit matches
  if (config.rules.alwaysAllow.includes(toolName)) {
    return { action: 'allow', reason: `Tool '${toolName}' is explicitly allowed in configuration.` };
  }

  if (config.rules.alwaysDeny.includes(toolName)) {
    return { action: 'deny', reason: `Tool '${toolName}' is explicitly blocked in configuration.` };
  }

  if (config.rules.promptOnly.includes(toolName)) {
    return { action: 'prompt', reason: `Tool '${toolName}' is configured to always prompt.` };
  }

  // 2. Substring matching for common high-risk actions in tool name
  const highRiskKeywords = [
    'exec', 'run', 'spawn', 'shell', 'bash', 'cmd', 'terminal',
    'write', 'edit', 'patch', 'modify', 'delete', 'remove', 'unlink',
    'install', 'upgrade', 'deploy', 'query', 'sql', 'eval'
  ];
  
  const toolNameLower = toolName.toLowerCase();
  for (const keyword of highRiskKeywords) {
    if (toolNameLower.includes(keyword)) {
      return { 
        action: 'prompt', 
        reason: `Tool '${toolName}' matches high-risk keyword '${keyword}'.` 
      };
    }
  }

  // 3. Inspect arguments for high-risk patterns
  const argsString = JSON.stringify(params?.arguments || {});
  
  // Look for shell commands or absolute paths in arguments
  const suspiciousShellPatterns = [
    /rm\s+-rf/,
    /curl\s+/,
    /wget\s+/,
    /sudo\s+/,
    /chmod\s+/,
    /chown\s+/,
    /ssh\s+/,
    /\/etc\/(passwd|shadow|hosts|resolv\.conf)/,
    /~(?:\/.*)?\/\.(?:bash|zsh|ssh|git)/
  ];

  for (const pattern of suspiciousShellPatterns) {
    if (pattern.test(argsString)) {
      return { 
        action: 'prompt', 
        reason: `Tool arguments contain suspicious pattern: ${pattern.toString()}` 
      };
    }
  }

  // 4. Default policy fallback
  return {
    action: config.defaultPolicy,
    reason: `Tool '${toolName}' did not match any custom rules. Defaulting to '${config.defaultPolicy}'.`
  };
}
