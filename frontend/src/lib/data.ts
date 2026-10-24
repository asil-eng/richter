import type { AskResult, Note, RepoEntry, RiskModel, Snapshots } from './types'

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json() as Promise<T>
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { detail?: string }).detail ?? `${r.status}`)
  return data as T
}

// Demo data is served statically from data/ so the app runs without the backend;
// the API is the fallback for freshly analyzed repos.
export async function listRepos(): Promise<RepoEntry[]> {
  try {
    return await getJSON<RepoEntry[]>('/api/repos')
  } catch {
    return getJSON<RepoEntry[]>('/models/index.json')
  }
}

export async function loadModel(slug: string, fresh = false): Promise<RiskModel> {
  try {
    return await getJSON<RiskModel>(`/models/${slug}.json${fresh ? `?t=${Date.now()}` : ''}`)
  } catch {
    return getJSON<RiskModel>(`/api/model/${slug}`)
  }
}

export async function loadSnapshots(slug: string): Promise<Snapshots | null> {
  try {
    return await getJSON<Snapshots>(`/snapshots/${slug}.json`)
  } catch {
    return null
  }
}

// Precomputed AI notes (data/notes/<slug>.json) back the static demo when the API is
// unreachable or has no key. Live API answers always take priority.
interface NotesBundle {
  guard: Record<string, Note>
  unblock: Record<string, Note>
  ask: Record<string, AskResult>
}
const bundles = new Map<string, Promise<NotesBundle | null>>()
function notesBundle(slug: string) {
  if (!bundles.has(slug)) bundles.set(slug, getJSON<NotesBundle>(`/notes/${slug}.json`).catch(() => null))
  return bundles.get(slug)!
}
const normalize = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).join(' ')

export async function fetchNote(slug: string, file: string, kind: 'guard' | 'unblock'): Promise<Note> {
  try {
    return await postJSON<Note>('/api/note', { slug, file, kind })
  } catch (e) {
    const hit = (await notesBundle(slug))?.[kind][file]
    if (hit) return { ...hit, cached: true }
    throw e
  }
}

export async function askRepo(slug: string, question: string): Promise<AskResult> {
  try {
    return await postJSON<AskResult>('/api/ask', { slug, question })
  } catch (e) {
    const hit = (await notesBundle(slug))?.ask[normalize(question)]
    if (hit) return { ...hit, cached: true }
    throw e
  }
}

export interface Job {
  id: string
  stage: 'queued' | 'clone' | 'history' | 'score' | 'done' | 'error'
  detail: string
  slug?: string
}

export const startAnalyze = (url: string) => postJSON<Job>('/api/analyze', { url })
export const pollJob = (id: string) => getJSON<Job>(`/api/jobs/${id}`)
