import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepo } from '../model/normalize.js';

const base = { name: 'js-reverse-skill', owner: { login: 'Kevin' }, default_branch: 'main' };

test('Gitea 镜像识别出上游与同步信息', () => {
  const repo = normalizeRepo('gitea', {
    ...base,
    full_name: 'Kevin/js-reverse-skill',
    mirror: true,
    original_url: 'https://github.com/erma0/js-reverse-skill',
    mirror_interval: '8h0m0s',
    mirror_last_sync_at: '2026-11-23T17:41:53+08:00',
    fork: false,
  });

  assert.equal(repo.isMirror, true);
  assert.equal(repo.mirrorKind, 'gitea');
  assert.equal(repo.mirrorLabel, '镜像');
  assert.equal(repo.mirrorUpstream, 'https://github.com/erma0/js-reverse-skill');
  assert.equal(repo.mirrorInterval, '8h0m0s');
  assert.equal(repo.mirrorLastSync, '2026-11-23T17:41:53+08:00');
  // 镜像仓库不是 fork
  assert.equal(repo.isFork, false);
});

test('Gitea 普通仓库不算镜像', () => {
  const repo = normalizeRepo('gitea', {
    ...base,
    full_name: 'Kevin/normal-repo',
    mirror: false,
    fork: false,
  });
  assert.equal(repo.isMirror, false);
  assert.equal(repo.mirrorKind, '');
  assert.equal(repo.mirrorUpstream, '');
});

test('Gitea mirror 为 true 但没有 original_url 时不展示镜像', () => {
  const repo = normalizeRepo('gitea', {
    ...base,
    full_name: 'Kevin/x',
    mirror: true,
    fork: false,
  });
  assert.equal(repo.isMirror, false);
});

test('Gitea 镜像不会误走平台镜像分支', () => {
  const repo = normalizeRepo('gitea', {
    ...base,
    full_name: 'mirrors/electron',
    human_name: 'Gitee 极速下载/electron',
    mirror: true,
    original_url: 'https://github.com/electron/electron',
  });
  // 即使 full_name 长得像 Gitee 镜像，gitea 平台也不该命中平台规则
  assert.equal(repo.mirrorKind, 'gitea');
  assert.equal(repo.mirrorBadge, '');
  assert.equal(repo.mirrorUpstream, 'https://github.com/electron/electron');
});

test('平台镜像仍保持 kind=platform 且有角标', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'gh_mirrors/le/Leonida',
    human_name: 'GitHub 加速计划 / le / Leonida',
    fork: false,
  });
  assert.equal(repo.isMirror, true);
  assert.equal(repo.mirrorKind, 'platform');
  assert.equal(repo.mirrorBadge, 'github-fast.png');
  assert.equal(repo.mirrorUpstream, '');
});
