import { makeRepoBranchKey } from './platform.js'

export function collectRepoUpdateTargets(list = [], updates = new Map(), buildRef) {
  const targetMap = new Map()

  for (const entry of list) {
    const targets = normalizeEntryTargets(entry)
    if (!targets.length) continue

    const excludeSet = new Set((entry.exclude || []).map(s => String(s || '').trim()).filter(Boolean))
    const entryKeys = new Set((entry.repos || []).map(r => {
      const ref = buildRef(r)
      return ref ? makeRepoBranchKey(ref) : ''
    }).filter(Boolean))

    for (const [key, update] of updates) {
      if (!shouldPushUpdate(key, update, entry, entryKeys, excludeSet)) continue
      const item = targetMap.get(key) || { key, update, targets: new Map() }
      for (const target of targets) addTarget(item.targets, target)
      targetMap.set(key, item)
    }
  }

  return [...targetMap.values()]
    .map(item => ({ key: item.key, update: item.update, targets: [...item.targets.values()] }))
    .filter(item => item.targets.length)
}

function normalizeEntryTargets(entry = {}) {
  const targets = new Map()
  for (const group of (entry.groups || [])) {
    addTarget(targets, normalizeOriginTarget(group, 'group'))
  }
  for (const friend of (entry.friends || [])) {
    addTarget(targets, normalizeOriginTarget(friend, 'private'))
  }
  return [...targets.values()]
}

function normalizeOriginTarget(value, type) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parts = raw.split(':')
  if (parts[0] === type && parts.length >= 2) return raw
  if (parts.length >= 3 && ['group', 'private'].includes(parts[1])) return raw
  return parts.length >= 2 ? `${parts[0]}:${type}:${parts.slice(1).join(':')}` : `${type}:${raw}`
}

function addTarget(targets, target) {
  if (!target) return
  const key = targetDedupKey(target)
  if (!key) return
  const current = targets.get(key)
  if (!current || preferTarget(target, current)) targets.set(key, target)
}

function targetDedupKey(target) {
  const parts = String(target || '').split(':')
  if (parts.length >= 3) return `${parts[1]}:${parts.slice(2).join(':')}`
  if (parts.length === 2) return `${parts[0]}:${parts[1]}`
  return String(target || '')
}

function preferTarget(next, current) {
  const nextParts = String(next || '').split(':')
  const currentParts = String(current || '').split(':')
  return nextParts.length >= 3 && currentParts.length < 3
}

function shouldPushUpdate(key, update, entry, entryKeys, excludeSet) {
  const ref = update.ref || {}
  const excludeKey = ref.branch ? `${ref.fullName}:${ref.branch}` : ref.fullName
  if (excludeSet.has(ref.fullName) || excludeSet.has(excludeKey)) return false
  if (entryKeys.size && !entryKeys.has(key) && !entry.autoScan) return false
  return true
}
