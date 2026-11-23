import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepo } from '../model/normalize.js';

const base = { name: 'x', owner: { login: 'x' }, default_branch: 'main' };

test('GitCode gh_mirrors 三段式识别为加速计划镜像', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'gh_mirrors/le/Leonida',
    human_name: 'GitHub 加速计划 / le / Leonida',
    fork: false,
  });
  assert.equal(repo.isMirror, true);
  assert.equal(repo.mirrorLabel, 'GitHub 加速计划');
  assert.equal(repo.mirrorOwner, 'gh_mirrors / le');
  assert.equal(repo.mirrorShortName, 'Leonida');
  assert.equal(repo.isFork, false);
});

test('GitCode GitHub_Trending 也识别为镜像', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'GitHub_Trending/vu/vue-admin-better',
    human_name: 'GitHub推荐项目精选 / vu / vue-admin-better',
    fork: false,
  });
  assert.equal(repo.isMirror, true);
  assert.equal(repo.mirrorLabel, 'GitHub 推荐精选');
  assert.equal(repo.mirrorShortName, 'vue-admin-better');
});

test('Gitee mirrors 两段式识别为极速下载镜像', () => {
  const repo = normalizeRepo('gitee', {
    ...base,
    full_name: 'mirrors/fleet-handbook',
    human_name: 'Gitee 极速下载/fleet-handbook',
    fork: false,
  });
  assert.equal(repo.isMirror, true);
  assert.equal(repo.mirrorLabel, 'Gitee 极速下载');
  assert.equal(repo.mirrorOwner, 'mirrors');
  assert.equal(repo.mirrorShortName, 'fleet-handbook');
});

test('普通仓库不误判为镜像', () => {
  for (const [platform, full_name, human_name] of [
    ['gitcode', 'openharmony/docs', 'OpenHarmony / docs'],
    ['gitee', 'XingYunStar/Yunzai-Bot-plugins-index', 'XingYunStar/Yunzai-Bot-plugins-index'],
  ]) {
    const repo = normalizeRepo(platform, { ...base, full_name, human_name, fork: false });
    assert.equal(repo.isMirror, false, `${full_name} 不应是镜像`);
    assert.equal(repo.mirrorLabel, '');
  }
});

test('GitHub 上即便 human_name 相同也不算镜像', () => {
  const repo = normalizeRepo('github', {
    ...base,
    full_name: 'gh_mirrors/le/Leonida',
    human_name: 'GitHub 加速计划 / le / Leonida',
    fork: false,
  });
  assert.equal(repo.isMirror, false);
});

test('镜像与 fork 是两个独立维度', () => {
  const repo = normalizeRepo('gitee', {
    ...base,
    full_name: 'mirrors/electron',
    human_name: 'Gitee 极速下载/electron',
    fork: true,
    parent: { full_name: 'upstream/electron' },
  });
  assert.equal(repo.isMirror, true);
  assert.equal(repo.isFork, true);
  assert.equal(repo.parentName, 'upstream/electron');
});
