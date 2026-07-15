import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRepoTarget, parseRepoUrl } from '../model/repoParser.js';

test('仓库地址末尾的 .git 不进入仓库名', () => {
  const expected = {
    platform: 'github',
    instance: '',
    owner: 'QingYingX-Bot',
    repo: 'Mys-plugin',
    fullName: 'QingYingX-Bot/Mys-plugin'
  };

  assert.deepEqual(
    parseRepoUrl('https://github.com/QingYingX-Bot/Mys-plugin.git', { useLowercaseRepo: false }),
    expected
  );
  assert.deepEqual(
    parseRepoTarget('github QingYingX-Bot/Mys-plugin.git', {
      config: { useLowercaseRepo: false }
    }),
    expected
  );
});
