import { appRuntimeConfig } from '@/app/runtime/config'

import { joinTestCollabRoom } from './test'
import { joinTrysteroCollabRoom } from './trystero'
import type { JoinCollabRoom } from './types'

function usesTestTransport(): boolean {
  return import.meta.env.DEV && appRuntimeConfig.collaborationTransport === 'test'
}

/** workos: a host page can supply the transport (its own relay) instead of Trystero. */
let injectedJoin: JoinCollabRoom | null = null

export function setCollabTransportOverride(join: JoinCollabRoom | null): void {
  injectedJoin = join
}

export const hasCollabTransportOverride = () => injectedJoin !== null

export const joinCollabRoom: JoinCollabRoom = (roomId) =>
  injectedJoin
    ? injectedJoin(roomId)
    : usesTestTransport()
      ? joinTestCollabRoom(roomId)
      : joinTrysteroCollabRoom(roomId)

export type { CollabActionReceiver, CollabRoomTransport, JoinCollabRoom } from './types'
