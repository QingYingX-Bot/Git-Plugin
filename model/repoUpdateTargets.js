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
      const item = targetMap.get(key) || { key, update, targets: new Set() }
      for (const target of targets) item.targets.add(target)
      targetMap.set(key, item)
    }
  }

  return [...targetMap.values()]
    .map(item => ({ key: item.key, update: item.update, targets: [...item.targets] }))
    .filter(item => item.targets.length)
}

function normalizeEntryTargets(entry = {}) {
  const targets = new Set()
  for (const group of (entry.groups || [])) {
    const target = normalizeOriginTarget(group, 'group')
    if (target) targets.add(target)
  }
  for (const friend of (entry.friends || [])) {
    const target = normalizeOriginTarget(friend, 'private')
    if (target) targets.add(target)
  }
  return [...targets]
}

function normalizeOriginTarget(value, type) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parts = raw.split(':')
  if (parts[0] === type && parts.length >= 2) return raw
  if (parts.length >= 3 && ['group', 'private'].includes(parts[1])) return raw
  return parts.length >= 2 ? `${parts[0]}:${type}:${parts.slice(1).join(':')}` : `${type}:${raw}`
}

function shouldPushUpdate(key, update, entry, entryKeys, excludeSet) {
  const ref = update.ref || {}
  const excludeKey = ref.branch ? `${ref.fullName}:${ref.branch}` : ref.fullName
  if (excludeSet.has(ref.fullName) || excludeSet.has(excludeKey)) return false
  if (entryKeys.size && !entryKeys.has(key) && !entry.autoScan) return false
  return true
}
