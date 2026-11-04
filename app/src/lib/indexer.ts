import { parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { getPublicClient } from 'wagmi/actions'
import { config } from '@/config'
import type { AppNetwork } from '@/lib/networks'

export const SPLITLINE_EVENTS = parseAbi([
  'event SplitCreated(uint256 indexed id, address indexed creator, address indexed depositAddress, string name, address[] recipients, uint16[] bps)',
  'event Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 indexed ref)',
  'event Swept(uint256 indexed id, uint256 amount)',
  'event Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount)',
])

export interface SplitInfo {
  id: bigint
  creator: Address
  depositAddress: Address
  name: string
  recipients: Address[]
  bps: number[]
  block: bigint
  txHash: Hex
}

export interface Activity {
  kind: 'Paid' | 'Swept' | 'Claimed'
  id: bigint
  amount: bigint
  block: bigint
  logIndex: number
  txHash: Hex
  payer?: Address
  ref?: Hex
  recipient?: Address
  to?: Address
}

export interface IndexerState {
  status: 'idle' | 'indexing' | 'live' | 'error'
  fromBlock: bigint
  scannedTo: bigint
  head: bigint
  splits: SplitInfo[]
  activity: Activity[]
  error?: string
}

/** Blocks per eth_getLogs request. The public Arc Testnet RPC accepted 5,000 and refused 10,000 when measured. */
const CHUNK = 2000n
const POLL_MS = 5000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Every network call gets a deadline so a hung RPC turns into a retry, never an endless spinner. */
const REQUEST_TIMEOUT_MS = 15_000
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), REQUEST_TIMEOUT_MS)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v)
const reviver = (_: string, v: unknown) =>
  v && typeof v === 'object' && '$b' in (v) ? BigInt((v as { $b: string }).$b) : v

class Indexer {
  state: IndexerState
  private listeners = new Set<() => void>()
  private seen = new Set<string>()
  private running = false
  private timer: ReturnType<typeof setInterval> | undefined
  private cacheKey: string

  constructor(private net: AppNetwork) {
    this.cacheKey = `spliteline:idx:v1:${net.chainId}:${net.address ?? 'none'}:${net.deployBlock}`
    this.state = this.load() ?? {
      status: net.address ? 'indexing' : 'idle',
      fromBlock: net.deployBlock,
      scannedTo: net.deployBlock > 0n ? net.deployBlock - 1n : 0n,
      head: net.deployBlock,
      splits: [],
      activity: [],
    }
    for (const s of this.state.splits) this.seen.add(`${s.txHash}:c:${s.id}`)
    for (const a of this.state.activity) this.seen.add(`${a.txHash}:${a.logIndex}`)
  }

  private load(): IndexerState | undefined {
    try {
      const raw = localStorage.getItem(this.cacheKey)
      if (!raw) return undefined
      const parsed = JSON.parse(raw, reviver) as IndexerState
      return { ...parsed, status: 'indexing', error: undefined }
    } catch {
      return undefined
    }
  }

  private save() {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.state, replacer))
    } catch {
      /* storage full or unavailable: the cache is optional */
    }
  }

  private set(patch: Partial<IndexerState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      void this.tick()
      this.timer = setInterval(() => void this.tick(), POLL_MS)
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }
  }

  getSnapshot = () => this.state

  refresh = () => this.tick()

  private async tick() {
    if (this.running || !this.net.address) return
    this.running = true
    try {
      await this.sync()
    } catch (error) {
      this.set({ status: 'error', error: (error as Error).message })
    } finally {
      this.running = false
    }
  }

  private async fetchRange(client: PublicClient, from: bigint, to: bigint) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await withTimeout(client.getLogs({ address: this.net.address, events: SPLITLINE_EVENTS, fromBlock: from, toBlock: to, strict: true }), 'Reading logs')
      } catch (error) {
        const text = String((error as Error).message ?? error)
        if (attempt >= 4) throw error
        await sleep(/rate limit|429|too many/i.test(text) ? 1200 * (attempt + 1) : 500)
      }
    }
  }

  private async sync() {
    const client = getPublicClient(config, { chainId: this.net.chainId as never }) as unknown as PublicClient
    const head = await withTimeout(client.getBlockNumber(), 'Reading the latest block')
    let cursor = this.state.scannedTo + 1n
    if (cursor > head) {
      this.set({ head, status: 'live', error: undefined })
      return
    }
    this.set({ head, status: head - cursor > CHUNK ? 'indexing' : this.state.status === 'live' ? 'live' : 'indexing', error: undefined })
    let changed = false
    while (cursor <= head) {
      const to = cursor + CHUNK - 1n > head ? head : cursor + CHUNK - 1n
      const logs = await this.fetchRange(client, cursor, to)
      const splits = [...this.state.splits]
      const activity = [...this.state.activity]
      for (const log of logs) {
        const txHash = log.transactionHash
        const key = log.eventName === 'SplitCreated' ? `${txHash}:c:${log.args.id}` : `${txHash}:${log.logIndex}`
        if (this.seen.has(key)) continue
        this.seen.add(key)
        changed = true
        const base = { block: log.blockNumber, logIndex: log.logIndex, txHash }
        if (log.eventName === 'SplitCreated') {
          splits.push({
            id: log.args.id,
            creator: log.args.creator,
            depositAddress: log.args.depositAddress,
            name: log.args.name,
            recipients: [...log.args.recipients],
            bps: log.args.bps.map(Number),
            block: log.blockNumber,
            txHash,
          })
        } else if (log.eventName === 'Paid') {
          activity.push({ kind: 'Paid', id: log.args.id, amount: log.args.amount, payer: log.args.payer, ref: log.args.ref, ...base })
        } else if (log.eventName === 'Swept') {
          activity.push({ kind: 'Swept', id: log.args.id, amount: log.args.amount, ...base })
        } else {
          activity.push({ kind: 'Claimed', id: log.args.id, amount: log.args.amount, recipient: log.args.recipient, to: log.args.to, ...base })
        }
      }
      splits.sort((a, b) => Number(a.id - b.id))
      activity.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : Number(a.block - b.block)))
      this.set({ splits, activity, scannedTo: to, head })
      cursor = to + 1n
    }
    this.set({ status: 'live', error: undefined })
    if (changed || this.state.scannedTo === head) this.save()
  }
}

const registry = new Map<string, Indexer>()

export function getIndexer(net: AppNetwork): Indexer {
  const key = `${net.chainId}:${net.address ?? 'none'}`
  let indexer = registry.get(key)
  if (!indexer) {
    indexer = new Indexer(net)
    registry.set(key, indexer)
  }
  return indexer
}
