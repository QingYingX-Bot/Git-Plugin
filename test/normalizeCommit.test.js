import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCommit } from '../model/normalize.js'

test('GitHub 提交优先使用账号作者并保留提交者', () => {
  const commit = normalizeCommit('github', {
    sha: 'd3ff8ba7',
    html_url: 'https://github.com/QingYingX-Bot/Mys-plugin/commit/d3ff8ba7',
    author: { login: 'HanaHimeUnica', avatar_url: 'https://avatar/author.png' },
    committer: { login: 'QingYingX', avatar_url: 'https://avatar/committer.png' },
    commit: {
      message: 'poop:删除检查ck命令',
      author: { name: 'AozakiArina', date: '2026-07-14T10:37:09Z' },
      committer: { name: 'QingYingX', date: '2026-07-15T12:31:39Z' }
    }
  })

  assert.equal(commit.author, 'HanaHimeUnica')
  assert.equal(commit.committer, 'QingYingX')
  assert.equal(commit.authorAvatar, 'https://avatar/author.png')
  assert.equal(commit.committerAvatar, 'https://avatar/committer.png')
})
