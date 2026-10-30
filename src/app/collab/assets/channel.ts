import { fromUint8Array, isValid, toUint8Array } from 'js-base64'
import * as v from 'valibot'
import type * as Y from 'yjs'

import type { SceneGraph } from '@open-pencil/scene-graph'
import { randomHex } from '@open-pencil/scene-graph/random'

import type { CollabRoomTransport } from '@/app/collab/transport/types'

const CHUNK = 64 * 1024
const FRAME = 128 * 1024
const positive = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
const offset = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const sha = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const hash = v.pipe(v.string(), v.regex(/^[a-f0-9]{40}$/))
const id = v.pipe(v.string(), v.minLength(8), v.maxLength(128))
const base = { v: v.literal(2), revision: positive, epoch: positive }
const request = {
  ...base,
  requestId: id,
  hash,
  sha256: sha,
  size: positive,
  offset,
  from: v.optional(id),
  to: v.optional(id)
}
const Packet = v.variant('type', [
  v.object({ ...request, type: v.literal('request') }),
  v.object({ ...request, type: v.literal('chunk'), data: v.pipe(v.string(), v.maxLength(90_000)) }),
  v.object({ ...base, type: v.literal('base') })
])
const Ref = v.object({
  sha256: sha,
  size: positive,
  sourceRevision: v.nullable(positive),
  sourceEpoch: v.nullable(positive)
})
export type AssetReference = v.InferOutput<typeof Ref>
type Packet = v.InferOutput<typeof Packet>
type Base = { revision: number; epoch: number }
const encode = (packet: Packet) => new TextEncoder().encode(JSON.stringify(packet))
const digest = async (bytes: Uint8Array) => {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function preserveBaseImages(source: SceneGraph, target: SceneGraph) {
  for (const [key, bytes] of source.images) target.images.set(key, bytes)
}
export interface ExternalAssetChannel {
  publish(hash: string, bytes: Uint8Array): void
  ensureAvailable(): Promise<void>
  dispose(): void
}
/** Client caches hold renderable images; Y.Doc and the server carry only verified identities. */
export function createExternalAssetChannel(options: {
  graph: SceneGraph
  doc: Y.Doc
  room: CollabRoomTransport
  base: Base
  render: () => void
}): ExternalAssetChannel {
  let current = options.base
  let disposed = false
  const refs = options.doc.getMap<unknown>('image-refs')
  const initial = new Set(options.graph.images.keys())
  const publishing = new Map<string, Promise<void>>()
  const loading = new Map<string, Promise<void>>()
  const receivers = new Map<
    string,
    {
      hash: string
      ref: AssetReference
      offset: number
      chunks: Uint8Array[]
      from?: string
      timer: ReturnType<typeof setTimeout> | null
      resolve: () => void
      reject: (error: Error) => void
    }
  >()
  const [send, receive] = options.room.makeAction('assets-v2')
  function transmit(packet: Packet) {
    if (disposed) return
    const bytes = encode(packet)
    if (bytes.length > FRAME) throw new Error('collab_asset_frame_invalid')
    send(bytes)
  }
  function requestNext(requestId: string) {
    const receiver = receivers.get(requestId)
    if (!receiver || disposed) return
    if (receiver.timer) clearTimeout(receiver.timer)
    receiver.timer = setTimeout(() => {
      receivers.delete(requestId)
      receiver.reject(new Error('collab_asset_unavailable'))
    }, 15_000)
    transmit({
      v: 2,
      type: 'request',
      ...current,
      requestId,
      hash: receiver.hash,
      sha256: receiver.ref.sha256,
      size: receiver.ref.size,
      offset: receiver.offset,
      ...(receiver.from ? { to: receiver.from } : {})
    })
  }
  async function install(requestId: string) {
    const receiver = receivers.get(requestId)
    if (!receiver) return
    if (receiver.timer) clearTimeout(receiver.timer)
    receivers.delete(requestId)
    try {
      const bytes = new Uint8Array(receiver.ref.size)
      let at = 0
      for (const part of receiver.chunks) {
        bytes.set(part, at)
        at += part.length
      }
      if (at !== receiver.ref.size || (await digest(bytes)) !== receiver.ref.sha256)
        throw new Error('collab_asset_hash_mismatch')
      if (disposed) throw new Error('collab_asset_closed')
      options.graph.images.set(receiver.hash, bytes)
      options.render()
      receiver.resolve()
    } catch {
      receiver.reject(new Error('collab_asset_integrity_failed'))
    }
  }
  async function obtain(key: string, ref: AssetReference) {
    const cached = options.graph.images.get(key)
    if (cached && cached.length === ref.size) {
      const actual = await digest(cached)
      if (actual === ref.sha256) {
        return
      }
    }
    await new Promise<void>((resolve, reject) => {
      const requestId = randomHex(16)
      receivers.set(requestId, {
        hash: key,
        ref,
        offset: 0,
        chunks: [],
        timer: null,
        resolve,
        reject
      })
      requestNext(requestId)
    })
  }
  function needed() {
    const keys = new Set<string>()
    for (const node of options.graph.getAllNodes())
      for (const fill of node.fills) if (fill.imageHash) keys.add(fill.imageHash)
    return keys
  }
  async function ensureAvailable() {
    await Promise.all(publishing.values())
    for (const key of needed()) {
      const value = v.safeParse(Ref, refs.get(key))
      if (!value.success) throw new Error('collab_asset_reference_missing')
      let pending = loading.get(key)
      if (!pending) {
        pending = obtain(key, value.output).finally(() => loading.delete(key))
        loading.set(key, pending)
      }
      await pending
    }
  }
  function serve(packet: Extract<Packet, { type: 'request' }>) {
    const cached = options.graph.images.get(packet.hash)
    if (!cached || cached.length !== packet.size || !packet.from || packet.offset >= cached.length)
      return
    // The receiver verifies full SHA256. A draft is not advertised as malware-clean.
    transmit({
      ...packet,
      type: 'chunk',
      to: packet.from,
      from: undefined,
      data: fromUint8Array(cached.subarray(packet.offset, packet.offset + CHUNK))
    })
  }
  function acceptChunk(packet: Extract<Packet, { type: 'chunk' }>) {
    const receiver = receivers.get(packet.requestId)
    if (
      !receiver ||
      receiver.hash !== packet.hash ||
      receiver.offset !== packet.offset ||
      (receiver.from && receiver.from !== packet.from) ||
      !isValid(packet.data)
    )
      return
    const chunk = toUint8Array(packet.data)
    if (chunk.length !== Math.min(CHUNK, receiver.ref.size - receiver.offset)) return
    receiver.from = packet.from
    receiver.chunks.push(chunk)
    receiver.offset += chunk.length
    if (receiver.offset === receiver.ref.size) void install(packet.requestId)
    else setTimeout(() => requestNext(packet.requestId), 16)
  }
  receive((bytes) => {
    if (disposed || bytes.length > FRAME) return
    const result = v.safeParse(
      v.pipe(v.string(), v.parseJson(), Packet),
      new TextDecoder().decode(bytes)
    )
    if (!result.success) return
    const packet = result.output
    if (packet.type === 'base') {
      if (packet.epoch !== current.epoch || packet.revision < current.revision) return
      const changed = packet.revision !== current.revision
      current = { revision: packet.revision, epoch: packet.epoch }
      if (changed) for (const requestId of receivers.keys()) requestNext(requestId)
      return
    }
    if (packet.revision !== current.revision || packet.epoch !== current.epoch) return
    const ref = v.safeParse(Ref, refs.get(packet.hash))
    if (!ref.success || ref.output.sha256 !== packet.sha256 || ref.output.size !== packet.size)
      return
    if (packet.type === 'request') {
      serve(packet)
      return
    }
    acceptChunk(packet)
  })
  options.room.onPeerLeave((peerId) => {
    for (const [requestId, receiver] of receivers) {
      if (options.room.assetProtocol !== 2 && receiver.from !== peerId) continue
      if (receiver.timer) clearTimeout(receiver.timer)
      receivers.delete(requestId)
      receiver.reject(new Error('collab_asset_peer_disconnected'))
    }
  })
  let scheduled = false
  const after = () => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!disposed)
        void ensureAvailable().catch(() => {
          /* checkpoint retries report the failure */
        })
    })
  }
  options.doc.on('afterTransaction', after)
  return {
    publish(key, bytes) {
      if (disposed || refs.has(key) || publishing.has(key)) return
      const work = digest(bytes)
        .then((sha256) => {
          if (disposed) return undefined
          refs.set(key, {
            sha256,
            size: bytes.length,
            sourceRevision: initial.has(key) ? current.revision : null,
            sourceEpoch: initial.has(key) ? current.epoch : null
          })
          return undefined
        })
        .finally(() => publishing.delete(key))
      publishing.set(key, work)
    },
    ensureAvailable,
    dispose() {
      disposed = true
      options.doc.off('afterTransaction', after)
      for (const receiver of receivers.values()) {
        if (receiver.timer) clearTimeout(receiver.timer)
        receiver.reject(new Error('collab_asset_closed'))
      }
      receivers.clear()
    }
  }
}
