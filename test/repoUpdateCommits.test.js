import assert from 'node:assert/strict'
import test from 'node:test'
import { collectChangedCommits, summarizeCommitActors } from '../model/repoUpdateCommits.js'

test('收集上次 sha 之后的多个提交', () => {
  const commits = [{ sha: 'newest' }, { sha: 'middle' }, { sha: 'oldbase' }]
  assert.deepEqual(collectChangedCommits(commits, 'oldbase'), commits.slice(0, 2))
})

test('汇总多个提交的作者和提交者', () => {
  const summary = summarizeCommitActors([
    { author: 'HanaHimeUnica', authorAvatar: 'a.png', committer: 'QingYingX', committerAvatar: 'b.png' },
    { author: 'QingYingX', authorAvatar: 'b.png', committer: 'QingYingX', committerAvatar: 'b.png' }
  ])

  assert.equal(summary.text, 'HanaHimeUnica、QingYingX')
  assert.equal(summary.avatar, 'a.png')
})
