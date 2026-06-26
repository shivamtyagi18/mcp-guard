import fs from 'fs';
import path from 'path';
import os from 'os';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', 'mcp-guard');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const LOCAL_CONFIG_FILENAME = '.mcp-guard.json';

const DEFAULT_CONFIG = {
  defaultPolicy: 'prompt',
  promptMethod: 'auto', // 'auto' | 'applescript' | 'tty'
  rules: {
    alwaysAllow: [
      'tools/list',
      'resources/list',
      'resources/templates/list',
      'prompts/list',
      'initialize',
      'ping'
    ],
    alwaysDeny: [],
    promptOnly: [
      // Common high-risk tools across various MCP implementations
      'execute_command',
      'run_command',
      'run_terminal_command',
      'bash',
      'shell',
      'write_file',
      'write_to_file',
      'edit_file',
      'replace_file_content',
      'multi_replace_file_content',
      'delete_file',
      'delete_directory',
      'modify_system',
      'install_package',
      'npm_install',
      'pip_install'
    ]
  },
  servers: {}
};

/**
 * Loads configuration by merging default, global, and local configs.
 * @param {string} cwd - Current working directory for looking up local config.
 * @returns {typeof DEFAULT_CONFIG} The merged configuration object.
 */
export function loadConfig(cwd = process.cwd()) {
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // 1. Load global config
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const globalData = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf8'));
      config = mergeConfigs(config, globalData);
    } else {
      // Ensure global config directory exists and write default config
      fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
  } catch (error) {
    console.error(`[mcp-guard] Warning: Failed to read global config: ${error.message}`);
  }

  // 2. Load local config
  try {
    const localConfigPath = path.join(cwd, LOCAL_CONFIG_FILENAME);
    if (fs.existsSync(localConfigPath)) {
      const localData = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      config = mergeConfigs(config, localData);
    }
  } catch (error) {
    console.error(`[mcp-guard] Warning: Failed to read local config: ${error.message}`);
  }

  return config;
}

/**
 * Deep merges target config with source config override.
 */
function mergeConfigs(target, source) {
  if (!source) return target;
  
  const merged = { ...target };

  if (source.defaultPolicy) {
    merged.defaultPolicy = source.defaultPolicy;
  }
  if (source.promptMethod) {
    merged.promptMethod = source.promptMethod;
  }

  if (source.rules) {
    merged.rules = {
      alwaysAllow: Array.from(new Set([...(target.rules.alwaysAllow || []), ...(source.rules.alwaysAllow || [])])),
      alwaysDeny: Array.from(new Set([...(target.rules.alwaysDeny || []), ...(source.rules.alwaysDeny || [])])),
      promptOnly: Array.from(new Set([...(target.rules.promptOnly || []), ...(source.rules.promptOnly || [])]))
    };
  }

  if (source.servers) {
    merged.servers = { ...target.servers, ...source.servers };
  }

  return merged;
}
