import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '@/platform/db/client'
import { createEventStore, type EventStore } from '@/platform/event-store/event-store'
import { memberStream } from './contracts'
import { createGuildPersonalData } from './personal-data'

const T0 = Date.UTC(2026, 0, 1)

let db: Db
let store: EventStore
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
})

describe('Guilde - données personnelles', () => {
  it("exporte la guilde du joueur et l'historique de ses changements", async () => {
    await store.append(memberStream('alice'), 0, [
      { type: 'GuildJoined', data: { playerId: 'alice', guild: 'red', at: T0 } },
      { type: 'ChangeRequested', data: { attempt: 1, from: 'red', to: 'blue', at: T0 + 1 } },
      { type: 'GuildChanged', data: { attempt: 1, from: 'red', to: 'blue', at: T0 + 2 } },
    ])
    const exported = await createGuildPersonalData(store, db).export('alice')
    expect(exported).toEqual({
      guild: 'blue',
      history: [
        { kind: 'joined', guild: 'red', at: T0 },
        { kind: 'change-requested', guild: 'blue', at: T0 + 1 },
        { kind: 'changed', guild: 'blue', at: T0 + 2 },
      ],
      messages: [],
    })
  })

  it("n'exporte rien pour un joueur qui n'a jamais choisi de guilde", async () => {
    expect(await createGuildPersonalData(store, db).export('bob')).toBeNull()
  })
})
