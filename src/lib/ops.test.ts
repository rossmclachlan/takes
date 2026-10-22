import { describe, expect, it } from 'vitest'
import { applyOps, enqueue, newId, type Library } from './ops'
import { ideaGroups, inboxQueue, songGroups } from './library'
import type { Op, Take } from './types'

function take(id: string, over: Partial<Take> = {}): Take {
  return {
    id, title: id, audio: `${id}.m4a`, duration: 60, peaks: null, recorded_at: '2024-01-01 00:00:00.000Z',
    source_path: '', kind: 'inbox', status: '', tags: [], notes: '', song: '', sorted_at: '', created: '', updated: '', ...over,
  }
}

const lib = (takes: Take[]): Library => ({ takes: Object.fromEntries(takes.map((t) => [t.id, t])), tags: {}, markers: {} })

describe('enqueue', () => {
  it('folds updates to the same record into one', () => {
    let q: Op[] = []
    q = enqueue(q, { kind: 'update', col: 'demo_takes', id: 'a', data: { notes: 'h' } })
    q = enqueue(q, { kind: 'update', col: 'demo_takes', id: 'a', data: { notes: 'hello', title: 'x' } })
    expect(q).toEqual([{ kind: 'update', col: 'demo_takes', id: 'a', data: { notes: 'hello', title: 'x' } }])
  })

  it('keeps order when other changes came in between', () => {
    // Sorted as an idea, then tagged with a brand-new tag: the tag must reach the NAS first.
    let q: Op[] = []
    q = enqueue(q, { kind: 'update', col: 'demo_takes', id: 'a', data: { kind: 'idea' } })
    q = enqueue(q, { kind: 'create', col: 'demo_tags', id: 't', data: { name: 'riff' } })
    q = enqueue(q, { kind: 'update', col: 'demo_takes', id: 'a', data: { tags: ['t'] } })
    expect(q.map((o) => `${o.kind}:${o.id}`)).toEqual(['update:a', 'create:t', 'update:a'])
  })

  it('keeps a create a create when it is edited before sending', () => {
    let q: Op[] = [{ kind: 'create', col: 'demo_markers', id: 'm', data: { take: 'a', seconds: 4, text: '' } }]
    q = enqueue(q, { kind: 'update', col: 'demo_markers', id: 'm', data: { text: 'hook' } })
    expect(q).toEqual([{ kind: 'create', col: 'demo_markers', id: 'm', data: { take: 'a', seconds: 4, text: 'hook' } }])
  })

  it('drops a record that was made and deleted before reaching the NAS', () => {
    let q: Op[] = [{ kind: 'create', col: 'demo_tags', id: 't', data: { name: 'x' } }]
    q = enqueue(q, { kind: 'update', col: 'demo_tags', id: 't', data: { name: 'y' } })
    q = enqueue(q, { kind: 'delete', col: 'demo_tags', id: 't' })
    expect(q).toEqual([])
  })
})

describe('applyOps', () => {
  it('shows unsent changes on top of the server copy', () => {
    const out = applyOps(lib([take('a'), take('b')]), [
      { kind: 'update', col: 'demo_takes', id: 'a', data: { kind: 'idea' } },
      { kind: 'update', col: 'demo_takes', id: 'gone', data: { kind: 'idea' } },
    ])
    expect(out.takes.a.kind).toBe('idea')
    expect(out.takes.b.kind).toBe('inbox')
    expect(out.takes.gone).toBeUndefined()
  })

  it('removes a deleted tag from the takes that had it', () => {
    const base = { ...lib([take('a', { tags: ['t1', 't2'] })]), tags: { t1: { id: 't1', name: 'guitar', color: '' }, t2: { id: 't2', name: 'keys', color: '' } } }
    const out = applyOps(base, [{ kind: 'delete', col: 'demo_tags', id: 't1' }])
    expect(out.takes.a.tags).toEqual(['t2'])
    expect(out.tags.t1).toBeUndefined()
  })
})

describe('library views', () => {
  it('plays the inbox oldest first with skipped takes at the back', () => {
    const l = lib([
      take('new', { recorded_at: '2024-03-01 00:00:00.000Z' }),
      take('old', { recorded_at: '2023-01-01 00:00:00.000Z' }),
      take('mid', { recorded_at: '2023-06-01 00:00:00.000Z' }),
      take('done', { kind: 'song' }),
    ])
    expect(inboxQueue(l, ['old']).map((t) => t.id)).toEqual(['mid', 'new', 'old'])
  })

  it('groups songs by status and leaves extra takes under their song', () => {
    const l = lib([
      take('s1', { kind: 'song', status: 'done' }),
      take('s2', { kind: 'song', status: 'working_on', title: 'Harbour Lights' }),
      take('s2b', { kind: 'song', status: 'working_on', song: 's2' }),
    ])
    const groups = songGroups(l, '', 'all')
    expect(groups.map((g) => [g.key, g.takes.map((t) => t.id)])).toEqual([['working_on', ['s2']], ['done', ['s1']]])
    expect(songGroups(l, 'harbour', 'all').flatMap((g) => g.takes.map((t) => t.id))).toEqual(['s2'])
  })

  it('shows an idea under each of its tags, untagged last', () => {
    const l = {
      ...lib([take('i1', { kind: 'idea', tags: ['g', 'k'] }), take('i2', { kind: 'idea' }), take('i3', { kind: 'idea', tags: ['g'] })]),
      tags: { g: { id: 'g', name: 'guitar', color: '' }, k: { id: 'k', name: 'keys', color: '' } },
    }
    const groups = ideaGroups(l, '', 'all')
    expect(groups.map((g) => [g.label, g.takes.map((t) => t.id).sort()])).toEqual([
      ['guitar', ['i1', 'i3']],
      ['keys', ['i1']],
      ['Untagged', ['i2']],
    ])
    // Searching a tag name finds the idea; it still shows under each of its tags.
    expect(ideaGroups(l, 'keys', 'all').map((g) => [g.label, g.takes.map((t) => t.id)])).toEqual([['guitar', ['i1']], ['keys', ['i1']]])
  })
})

it('makes PocketBase-shaped ids', () => {
  expect(newId()).toMatch(/^[a-z0-9]{15}$/)
})
