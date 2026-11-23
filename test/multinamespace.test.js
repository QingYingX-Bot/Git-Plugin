import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRepoTarget, parseRepoUrl } from '../model/repoParser.js';
import { normalizeRepoSlug, splitFullName } from '../model/platform.js';

test('GitCode 镜像仓库三段式路径保留完整 namespace', () => {
  const config = { useLowercaseRepo: false };

  for (const url of [
    'https://gitcode.com/gh_mirrors/le/Leonida',
    'https://gitcode.com/gh_mirrors/le/Leonida?source_module=home_hot_selection'
  ]) {
    assert.deepEqual(parseRepoUrl(url, config), {
      platform: 'gitcode',
      instance: '',
      owner: 'gh_mirrors/le',
      repo: 'Leonida',
      fullName: 'gh_mirrors/le/Leonida'
    });
  }
});

test('两段式地址仍按 owner/repo 解析', () => {
  assert.deepEqual(parseRepoUrl('https://gitcode.com/openharmony/docs', { useLowercaseRepo: false }), {
    platform: 'gitcode',
    instance: '',
    owner: 'openharmony',
    repo: 'docs',
    fullName: 'openharmony/docs'
  });
});

test('命令形式支持三段式 slug', () => {
  const ref = parseRepoTarget('gitcode gh_mirrors/le/Leonida', {
    config: { useLowercaseRepo: false }
  });
  assert.equal(ref.owner, 'gh_mirrors/le');
  assert.equal(ref.repo, 'Leonida');
});

test('splitFullName 把最后一段当 repo，其余归 owner', () => {
  assert.deepEqual(splitFullName('gh_mirrors/le/Leonida'), { owner: 'gh_mirrors/le', repo: 'Leonida' });
  assert.deepEqual(splitFullName('owner/repo'), { owner: 'owner', repo: 'repo' });
  assert.deepEqual(splitFullName(''), { owner: '', repo: '' });
});

test('normalizeRepoSlug 允许多级但仍拒绝非法输入', () => {
  assert.equal(normalizeRepoSlug('a/b', false), 'a/b');
  assert.equal(normalizeRepoSlug('a/b/c', false), 'a/b/c');
  assert.equal(normalizeRepoSlug('/a/b/', false), 'a/b');
  assert.equal(normalizeRepoSlug('a/b.git', false), 'a/b');

  for (const bad of ['a', '', 'a//b', 'a/../b', 'a/./b', 'a/b c']) {
    assert.equal(normalizeRepoSlug(bad, false), '', `应拒绝 ${JSON.stringify(bad)}`);
  }
});
