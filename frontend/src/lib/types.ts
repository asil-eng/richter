export interface FileNode {
  id: string
  dir: string
  lang?: string
  loc: number
  pagerank: number
  importance: number
  structural: number
  human: number
  magnitude: number
  blast_size: number
  blast: [number, number][] // [node index, hops]
  churn: number
  authors: number
  fixes: number
  fix_ratio: number
  bus_factor: boolean
  last_commit: number
}

export interface CoChange {
  a: number
  b: number
  shared: number
  confidence: number
  ghost: boolean
}

export interface RiskModel {
  scoring_version: string
  repo: {
    url: string
    name: string
    head: string
    commits: number
    authors: number
    first_ts: number
    last_ts: number
    analyzed_at: number
  }
  summary: {
    files: number
    edges: number
    cochange_pairs: number
    ghost_edges: number
    bus_factor_files: number
    languages?: Record<string, number> // absent in models built before multi-language support
  }
  nodes: FileNode[]
  edges: [number, number][]
  cochange: CoChange[]
}

export interface RepoEntry {
  slug: string
  name: string
  summary: RiskModel['summary']
  commits: number
  has_snapshots: boolean
}

export interface Snapshots {
  scoring_version: string
  frames: {
    ts: number
    sha: string
    commits: number
    importance: (number | null)[] // aligned with model.nodes; null = file not born yet
    magnitude: (number | null)[]
  }[]
  activity: { ts: number; commits: number; fixes: number }[]
}

export interface Note {
  source: 'ai' | 'rules'
  cached?: boolean
  headline: string
  what_breaks?: string[]
  why?: string
  checklist?: string[]
  diagnosis?: string
  plan?: string[]
  owner_hint?: string
}

export interface AskResult {
  answer: string
  files: string[]
  dropped: number
  cached: boolean
}

export type View = 'graph' | 'risk' | 'city'
