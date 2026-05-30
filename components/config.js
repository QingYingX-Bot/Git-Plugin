import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const pluginRoot = path.join(process.cwd(), 'plugins', 'Git-Plugin');
const defaultConfigPath = path.join(pluginRoot, 'config', 'default_config', 'git.yaml');
const userConfigPath = path.join(pluginRoot, 'config', 'config', 'git.yaml');

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergeDefaults = (value, defaults) => {
  if (!isPlainObject(defaults)) return value ?? defaults;
  const target = isPlainObject(value) ? { ...value } : {};
  for (const [key, defValue] of Object.entries(defaults)) {
    target[key] = mergeDefaults(target[key], defValue);
  }
  return target;
};

const readYaml = file => {
  if (!fs.existsSync(file)) return {};
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    logger.error(`[Git-Plugin] 读取配置失败: ${file}`);
    logger.error(err);
    return {};
  }
};

const ensureUserConfig = () => {
  fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
  if (!fs.existsSync(userConfigPath)) {
    fs.copyFileSync(defaultConfigPath, userConfigPath);
  }
};

export const getGitConfig = () => {
  ensureUserConfig();
  const defaults = readYaml(defaultConfigPath);
  const user = readYaml(userConfigPath);
  return mergeDefaults(user, defaults);
};

export const getPluginRoot = () => pluginRoot;
