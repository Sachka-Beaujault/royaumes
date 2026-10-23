import { beforeEach, describe, expect, it } from 'vitest'
import { REALM_TOPICS, type TransferRequest } from '@/modules/realm/contracts'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore, type EventStore } from '@/platform/event-store/event-store'
import { createDispatcher, type Dispatcher } from '@/platform/outbox/outbox'
import { createGuildService, type GuildService } from './application/guild-service'
import { GUILD_TOPICS, memberStream } from './contracts'
import { createEventStoreMemberRepository } from './infrastructure/event-store-member-repository'
import { createGuildHandlers } from './messages'

const NOW = Date.UTC(2026, 0, 1)

// Chaque test dispose d'un journal neuf, du service de la Guilde, et d'un distributeur
// auquel sont confiés les gestionnaires de la Guilde et un Village simulé : il prélève tant
// que l'or de chaque joueur suffit, et répond au demandeur comme le vrai Village.
let store: EventStore
let service: GuildService
let dispatcher: Dispatcher
let gold: Record<string, number>
let requests: TransferRequest[]
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  dispatcher = createDispatcher(db)
  service = createGuildService(createEventStoreMemberRepository(store), {
    dispatch: () => dispatcher.dispatch(),
    clock: () => NOW,
  })
  gold = { alice: 80, bob: 10 }
  requests = []
  dispatcher.register(createGuildHandlers(service))
  dispatcher.register({
    [REALM_TOPICS.withdraw]: async (message) => {
      const request = message.payload as unknown as TransferRequest
      requests.push(request)
      const wanted = request.resources.gold ?? 0
      const available = gold[request.playerId] ?? 0
      const refused = available < wanted
      if (!refused) gold[request.playerId] = available - wanted
      const result = {
        transferId: request.transferId,
        outcome: refused ? 'refused' : 'withdrawn',
        ...(refused ? { missing: { gold: wanted - available } } : {}),
      }
      await store.append(
        `village-test-${crypto.randomUUID()}`,
        0,
        [{ type: 'Answered', data: {} }],
        [{ topic: request.replyTo ?? '', payload: result }],
      )
    },
  })
})

describe('Guilde - saga de changement de guilde', () => {
  it("prélève 50 pièces d'or au Village, puis change le joueur de guilde", async () => {
    await service.join('alice', 'red')
    const result = await service.requestChange('alice', 'blue')

    expect(result).toEqual({ ok: true, view: { guild: 'blue', pendingTo: null, missing: null } })
    expect(requests).toEqual([
      {
        transferId: 'guild-alice:change-1',
        playerId: 'alice',
        resources: { gold: 50 },
        replyTo: GUILD_TOPICS.transferResult,
      },
    ])
    expect(gold.alice).toBe(30)
  })

  it("laisse le joueur dans sa guilde si son village n'a pas assez d'or", async () => {
    await service.join('bob', 'green')
    const result = await service.requestChange('bob', 'red')

    expect(result).toEqual({
      ok: true,
      view: { guild: 'green', pendingTo: null, missing: { gold: 40 } },
    })
    expect(gold.bob).toBe(10)
  })

  it('ne refait aucun changement si la réponse du Village est remise deux fois', async () => {
    await service.join('alice', 'red')
    await service.requestChange('alice', 'blue')
    const before = await store.read(memberStream('alice'))

    // Doublon de la réponse : la livraison au moins une fois le permet.
    const handlers = createGuildHandlers(service)
    await handlers[GUILD_TOPICS.transferResult]({
      id: 'doublon',
      attempt: 1,
      topic: GUILD_TOPICS.transferResult,
      payload: { transferId: 'guild-alice:change-1', outcome: 'withdrawn' },
    })

    expect(await store.read(memberStream('alice'))).toHaveLength(before.length)
  })

  it('présente une demande en attente tant que le Village n’a pas répondu', async () => {
    const paused = createGuildService(createEventStoreMemberRepository(store), {
      dispatch: async () => undefined,
      clock: () => NOW,
    })
    await paused.join('alice', 'red')
    const result = await paused.requestChange('alice', 'green')
    expect(result).toEqual({ ok: true, view: { guild: 'red', pendingTo: 'green', missing: null } })

    // La consultation de la guilde distribue la boîte d'envoi : la saga reprend.
    expect(await service.getView('alice')).toEqual({
      guild: 'green',
      pendingTo: null,
      missing: null,
    })
  })

  it('rejette un message mal formé, qui sera retenté puis abandonné', async () => {
    const handlers = createGuildHandlers(service)
    await expect(
      handlers[GUILD_TOPICS.transferResult]({
        id: 'm',
        attempt: 1,
        topic: GUILD_TOPICS.transferResult,
        payload: { transferId: '' },
      }),
    ).rejects.toThrow()
  })
})
