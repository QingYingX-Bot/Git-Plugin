import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import plugin from '../../../lib/plugins/plugin.js';

const pluginName = 'Git-Plugin';

let UpdatePlugin = null;

const loadOtherUpdate = async () => {
  if (UpdatePlugin) return UpdatePlugin;
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const otherUpdatePath = path.join(currentDir, '..', '..', 'other', 'update.js');
    const mod = await import(pathToFileURL(otherUpdatePath).href);
    UpdatePlugin = mod?.update ?? mod?.default;
  } catch (err) {
    logger.warn('[Git-Plugin] 未找到 plugins/other/update.js，插件更新命令不可用');
    logger.debug(err?.stack || err);
  }
  return UpdatePlugin;
};

export class GitUpdateApp extends plugin {
  constructor() {
    super({
      name: 'Git-Plugin-更新',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^[#/!！]?(?:gt|git)(?:插件)?(?:安?静)?(?:强制)?更新$',
          fnc: 'update',
          permission: 'master'
        },
        {
          reg: '^[#/!！]?(?:gt|git)update$',
          fnc: 'update',
          permission: 'master'
        }
      ]
    });
  }

  async update() {
    if (!this.e?.isMaster) return false;

    const Update = await loadOtherUpdate();
    if (!Update) return false;

    const quiet = /安?静/.test(this.e.msg);
    const force = /强制/.test(this.e.msg);
    this.e.msg = `#${quiet ? '静' : ''}${force ? '强制' : ''}更新${pluginName}`;

    const updater = new Update();
    updater.e = this.e;
    updater.reply = this.reply.bind(this);
    return updater.update();
  }
}
