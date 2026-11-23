import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepo } from '../model/normalize.js';

const base = { name: 'x', owner: { login: 'x' }, default_branch: 'main' };

test('GitCode 与 Gitee 镜像共用同一张徽标', () => {
  const gitcode = normalizeRepo('gitcode', {
    ...base,
    full_name: 'gh_mirrors/le/Leonida',
    human_name: 'GitHub 加速计划 / le / Leonida',
    fork: false,
  });
  const gitee = normalizeRepo('gitee', {
    ...base,
    full_name: 'mirrors/fleet-handbook',
    human_name: 'Gitee 极速下载/fleet-handbook',
    fork: false,
  });

  assert.equal(gitcode.mirrorBadge, 'github-fast.png');
  assert.equal(gitee.mirrorBadge, 'github-fast.png');
  assert.equal(gitcode.mirrorBadge, gitee.mirrorBadge);
});

test('非镜像仓库没有徽标', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'openharmony/docs',
    human_name: 'OpenHarmony / docs',
    fork: false,
  });
  assert.equal(repo.mirrorBadge, '');
});
