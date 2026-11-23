import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepo } from '../model/normalize.js';

const base = {
  name: 'repo',
  owner: { login: 'someone' },
  default_branch: 'main',
};

test('GitHub fork 取 source 而不是父级 parent', () => {
  const repo = normalizeRepo('github', {
    ...base,
    full_name: 'me/repo',
    fork: true,
    parent: { full_name: 'middle/repo', html_url: 'https://github.com/middle/repo' },
    source: { full_name: 'origin/repo', html_url: 'https://github.com/origin/repo' },
  });
  assert.equal(repo.isFork, true);
  assert.equal(repo.parentName, 'origin/repo');
  assert.equal(repo.parentUrl, 'https://github.com/origin/repo');
});

test('GitHub 无 source 时回落到 parent', () => {
  const repo = normalizeRepo('github', {
    ...base,
    full_name: 'me/repo',
    fork: true,
    parent: { full_name: 'parent/repo', html_url: 'https://github.com/parent/repo' },
  });
  assert.equal(repo.parentName, 'parent/repo');
});

test('GitCode fork 识别 parent', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'zhong_ning/flutter_flutter_multi_wins_fix_bug',
    fork: true,
    parent: { full_name: 'CPF-Flutter/flutter_flutter', web_url: 'https://gitcode.com/CPF-Flutter/flutter_flutter' },
  });
  assert.equal(repo.isFork, true);
  assert.equal(repo.parentName, 'CPF-Flutter/flutter_flutter');
});

test('GitCode 只有 parentfull_name 字符串时也能取到', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'a/b',
    fork: true,
    parentfull_name: 'upstream/b',
  });
  assert.equal(repo.parentName, 'upstream/b');
});

test('Gitee fork 识别 parent', () => {
  const repo = normalizeRepo('gitee', {
    ...base,
    full_name: 'XingYunStar/Yunzai-Bot-plugins-index',
    fork: true,
    parent: { full_name: 'yhArcadia/Yunzai-Bot-plugins-index', html_url: 'https://gitee.com/yhArcadia/Yunzai-Bot-plugins-index' },
  });
  assert.equal(repo.isFork, true);
  assert.equal(repo.parentName, 'yhArcadia/Yunzai-Bot-plugins-index');
});

test('非 fork 仓库不带上游信息', () => {
  const repo = normalizeRepo('gitcode', {
    ...base,
    full_name: 'openharmony/docs',
    fork: false,
  });
  assert.equal(repo.isFork, false);
  assert.equal(repo.parentName, '');
  assert.equal(repo.parentUrl, '');
});

test('parent 为空对象时不抛错且不误判', () => {
  const repo = normalizeRepo('github', {
    ...base,
    full_name: 'a/b',
    fork: true,
    parent: null,
    source: null,
  });
  assert.equal(repo.isFork, true);
  assert.equal(repo.parentName, '');
});
