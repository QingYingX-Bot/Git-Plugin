const allApps = {};

const moduleExports = await import('./apps/index.js').catch(err => {
  logger.error(`[Git-Plugin] 载入应用失败: ${err.message}`);
  logger.debug(err.stack);
  return {};
});

for (const [name, value] of Object.entries(moduleExports)) {
  if (typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value))) {
    allApps[name] = value;
  }
}

logger.info('[Git-Plugin] 插件载入成功');

export { allApps as apps };
