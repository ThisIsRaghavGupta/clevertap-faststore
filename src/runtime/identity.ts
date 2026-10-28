/**
 * Shopper identification from the FastStore session.
 *
 * Observed in @faststore/sdk 4.9.2 / 4.10.0 source: the session is persisted
 * with idb-keyval's default store (database "keyval-store", object store
 * "keyval") under the key "fs::session"; `session.person` is
 * { id, email, givenName, familyName } or null.
 */
import type { ResolvedConfig } from '../config'

export interface FastStorePerson {
  id?: string
  email?: string
  givenName?: string
  familyName?: string
}

const DB = 'keyval-store'
const STORE = 'keyval'
const KEY = 'fs::session'
/** localStorage key; stores a hash of the identity, never the raw email. */
export const MARKER_KEY = 'ct_fs_identified'
const MARKER_TTL_MS = 24 * 60 * 60 * 1000

export function readFastStorePerson(): Promise<FastStorePerson | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB)
      open.onerror = () => resolve(null)
      open.onupgradeneeded = () => {
        // The DB did not exist: do not create FastStore's store ourselves.
        open.transaction?.abort()
      }
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.close()
          return resolve(null)
        }
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
        req.onsuccess = () => {
          db.close()
          const person = req.result?.person
          resolve(person && typeof person === 'object' ? person : null)
        }
        req.onerror = () => {
          db.close()
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

/** FNV-1a 32-bit. Not cryptographic: only avoids storing the raw email. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function buildProfile(person: FastStorePerson, identityFrom: ResolvedConfig['identity']['identityFrom']) {
  const email = (person.email ?? '').trim()
  const first = (person.givenName ?? '').trim()
  const last = (person.familyName ?? '').trim()
  const profile: Record<string, string> = { Email: email }
  const name = [first, last].filter(Boolean).join(' ')
  // Without Name the dashboard header shows "Not Identified" (observed Oct-2026).
  if (name) profile.Name = name
  if (first) profile['First Name'] = first
  if (last) profile['Last Name'] = last
  if (identityFrom === 'email') profile.Identity = email
  if (identityFrom === 'userId' && person.id) profile.Identity = String(person.id)
  return profile
}

interface Marker {
  h: string
  t: number
}

function readMarker(): Marker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY)
    return raw ? (JSON.parse(raw) as Marker) : null
  } catch {
    return null
  }
}

function writeMarker(m: Marker | null) {
  try {
    if (m) localStorage.setItem(MARKER_KEY, JSON.stringify(m))
    else localStorage.removeItem(MARKER_KEY)
  } catch {
    /* storage blocked */
  }
}

export type IdentityOutcome = 'identified' | 'unchanged' | 'anonymous' | 'session-ended'

/**
 * One identity check. Calls onUserLogin when a logged-in person is found and
 * has not been identified in this browser in the last 24 h; runs the
 * configured session-end action when an identified person logs out.
 */
export async function checkIdentity(
  ct: any,
  cfg: ResolvedConfig['identity'],
  now: () => number = Date.now,
  read: () => Promise<FastStorePerson | null> = readFastStorePerson,
): Promise<IdentityOutcome> {
  const person = await read()
  const marker = readMarker()

  if (!person?.email) {
    if (!marker) return 'anonymous'
    writeMarker(null)
    if (cfg.onSessionEnd === 'logout' && typeof ct.logout === 'function') ct.logout()
    if (cfg.onSessionEnd === 'clear' && typeof ct.clear === 'function') ct.clear()
    return 'session-ended'
  }

  const profile = buildProfile(person, cfg.identityFrom)
  const h = fnv1a(`${profile.Email.toLowerCase()}|${profile.Identity ?? ''}`)
  if (marker && marker.h === h && now() - marker.t < MARKER_TTL_MS) return 'unchanged'

  ct.onUserLogin.push({ Site: profile })
  writeMarker({ h, t: now() })
  return 'identified'
}
