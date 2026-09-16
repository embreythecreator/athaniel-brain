import { describe, expect, it } from 'vitest'

import {
  normalizeAthanielOpenString,
  pathFromAthanielDeepLink,
  pathFromOpenDeepLink,
  resolveAthanielOpenPath
} from './athaniel-open-target'

describe('normalizeAthanielOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeAthanielOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeAthanielOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped athaniel:// deep links to the same path', () => {
    expect(normalizeAthanielOpenString('athaniel://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeAthanielOpenString('athaniel://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps athaniel://open/… deep links by stripping the open host', () => {
    expect(normalizeAthanielOpenString('athaniel://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeAthanielOpenString('athaniel://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved athaniel kinds and unsafe paths', () => {
    expect(normalizeAthanielOpenString('athaniel://blueprint/morning-brief')).toBeNull()
    expect(normalizeAthanielOpenString('athaniel://plugin/install')).toBeNull()
    expect(normalizeAthanielOpenString('https://example.com/x')).toBeNull()
    expect(normalizeAthanielOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeAthanielOpenString('index-network')).toBeNull()
  })
})

describe('resolveAthanielOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveAthanielOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveAthanielOpenPath({ href: 'athaniel://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromAthanielDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromAthanielDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from athaniel://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromAthanielDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromAthanielDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromAthanielDeepLink('plugin', 'install')).toBeNull()
  })
})
