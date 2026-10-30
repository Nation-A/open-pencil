import { describe, expect, test } from 'bun:test'

import * as Y from 'yjs'

import { SceneGraph } from '@open-pencil/scene-graph'

import { createExternalAssetChannel } from '@/app/collab/assets/channel'
import type { CollabActionReceiver, CollabRoomTransport } from '@/app/collab/transport/types'

const key = 'a'.repeat(40)
function graph() {
  const value = new SceneGraph()
  const page = value.getPages()[0]
  if (!page) throw new Error('missing page')
  value.createNode('RECTANGLE', page.id, {
    fills: [
      {
        type: 'IMAGE',
        visible: true,
        opacity: 1,
        color: { r: 0, g: 0, b: 0, a: 1 },
        imageHash: key,
        imageScaleMode: 'FILL'
      }
    ]
  })
  return value
}
function pair(corrupt = false, disconnectAfterFirst = false) {
  const handlers = new Map<string, CollabActionReceiver>()
  const leaves = new Map<string, (id: string) => void>()
  let frames = 0,
    maxFrame = 0
  const room = (id: string): CollabRoomTransport => ({
    makeAction: () => [
      (bytes) => {
        frames++
        maxFrame = Math.max(maxFrame, bytes.length)
        const packet = JSON.parse(new TextDecoder().decode(bytes))
        const target = packet.to ?? (id === 'provider-0001' ? 'receiver-0001' : 'provider-0001')
        if (corrupt && packet.type === 'chunk') packet.data = 'AA=='
        packet.from = id
        queueMicrotask(() => {
          handlers.get(target)?.(new TextEncoder().encode(JSON.stringify(packet)), id)
          if (disconnectAfterFirst && packet.type === 'chunk') leaves.get(target)?.(id)
        })
      },
      (handler) => {
        handlers.set(id, handler)
      }
    ],
    onPeerJoin: () => {
      /* This transport contract has no canvas or discovery events. */
    },
    onPeerLeave: (handler) => {
      leaves.set(id, handler)
    },
    signalingConnected: () => true,
    discoveryMs: 0,
    media: null,
    leave: async () => {
      /* This transport contract has no canvas or discovery events. */
    }
  })
  return { room, leaves, stats: () => ({ frames, maxFrame }) }
}
describe('external collaboration assets', () => {
  test('hydrates a referenced 65MiB image without binary Y.Doc state before checkpoint', async () => {
    const transport = pair(),
      hostGraph = graph(),
      peerGraph = graph()
    const bytes = new Uint8Array(65 * 1024 * 1024).fill(83)
    hostGraph.images.set(key, bytes)
    const hostDoc = new Y.Doc(),
      peerDoc = new Y.Doc()
    const host = createExternalAssetChannel({
      graph: hostGraph,
      doc: hostDoc,
      room: transport.room('provider-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* This transport contract has no canvas or discovery events. */
      }
    })
    host.publish(key, bytes)
    await host.ensureAvailable()
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(hostDoc))
    const peer = createExternalAssetChannel({
      graph: peerGraph,
      doc: peerDoc,
      room: transport.room('receiver-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* This transport contract has no canvas or discovery events. */
      }
    })
    try {
      expect(peerGraph.images.has(key)).toBe(false)
      await peer.ensureAvailable()
      expect(peerGraph.images.get(key)).toEqual(bytes)
      expect(hostDoc.getMap('images').size).toBe(0)
      expect(Y.encodeStateAsUpdate(hostDoc).length).toBeLessThan(1024)
      expect(transport.stats().maxFrame).toBeLessThan(128 * 1024)
      expect(transport.stats().frames).toBe(2080)
    } finally {
      host.dispose()
      peer.dispose()
      hostDoc.destroy()
      peerDoc.destroy()
    }
  }, 60000)
  test('refuses checkpoint after full-file hash mismatch and installs no blank substitute', async () => {
    const transport = pair(true),
      hostGraph = graph(),
      peerGraph = graph()
    const bytes = new Uint8Array([83])
    hostGraph.images.set(key, bytes)
    const hostDoc = new Y.Doc(),
      peerDoc = new Y.Doc()
    const host = createExternalAssetChannel({
      graph: hostGraph,
      doc: hostDoc,
      room: transport.room('provider-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* This transport contract has no canvas or discovery events. */
      }
    })
    host.publish(key, bytes)
    await host.ensureAvailable()
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(hostDoc))
    const peer = createExternalAssetChannel({
      graph: peerGraph,
      doc: peerDoc,
      room: transport.room('receiver-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* This transport contract has no canvas or discovery events. */
      }
    })
    try {
      await expect(peer.ensureAvailable()).rejects.toThrow('collab_asset_integrity_failed')
      expect(peerGraph.images.has(key)).toBe(false)
    } finally {
      host.dispose()
      peer.dispose()
      hostDoc.destroy()
      peerDoc.destroy()
    }
  })
  test('cancels an incomplete download when its provider leaves', async () => {
    const transport = pair(false, true),
      hostGraph = graph(),
      peerGraph = graph()
    const bytes = new Uint8Array(65537).fill(83)
    hostGraph.images.set(key, bytes)
    const hostDoc = new Y.Doc(),
      peerDoc = new Y.Doc()
    const host = createExternalAssetChannel({
      graph: hostGraph,
      doc: hostDoc,
      room: transport.room('provider-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* No canvas in this contract. */
      }
    })
    host.publish(key, bytes)
    await host.ensureAvailable()
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(hostDoc))
    const peer = createExternalAssetChannel({
      graph: peerGraph,
      doc: peerDoc,
      room: transport.room('receiver-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* No canvas in this contract. */
      }
    })
    try {
      await expect(peer.ensureAvailable()).rejects.toThrow('collab_asset_peer_disconnected')
      expect(peerGraph.images.has(key)).toBe(false)
    } finally {
      host.dispose()
      peer.dispose()
      hostDoc.destroy()
      peerDoc.destroy()
    }
  })
  test('refuses checkpoint when a referenced asset has no verified identity', async () => {
    const doc = new Y.Doc(),
      transport = pair()
    const channel = createExternalAssetChannel({
      graph: graph(),
      doc,
      room: transport.room('receiver-0001'),
      base: { revision: 1, epoch: 1 },
      render: () => {
        /* This transport contract has no canvas or discovery events. */
      }
    })
    try {
      await expect(channel.ensureAvailable()).rejects.toThrow('collab_asset_reference_missing')
    } finally {
      channel.dispose()
      doc.destroy()
    }
  })
})
