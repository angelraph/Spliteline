import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Callout, Code, DocSection, Formula, H3, RefList } from '@/components/docs/parts'
import { CodeBlock } from '@/components/landing/Sections'
import { AddressLink } from '@/components/bits'
import { NETWORKS } from '@/lib/networks'
import { requireChain } from '@/onchain-facts'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'how-it-works', label: 'How v2 works' },
  { id: 'reference', label: 'Contract reference' },
  { id: 'arc', label: 'Arc-specific notes' },
  { id: 'security', label: 'Security and limits' },
  { id: 'integrating', label: 'Integrating' },
]

const fn = (sig: string) => <Code>{sig}</Code>

const FUNCTIONS: Array<[string, string]> = [
  ['createSplit(string name, address[] recipients, uint16[] bps) returns (uint256 id, address depositAddress)', 'Creates an immutable split and its deposit address. 1 to 20 recipients, each share above 0, shares add up to exactly 10000 (100.00%), no zero address, no duplicates. Anyone can call it.'],
  ['pay(uint256 id, uint256 amount, bytes32 ref)', 'Pays USDC into a split with transferFrom. The caller must have approved the contract. Reverts on a zero amount.'],
  ['payWithPermit(uint256 id, uint256 amount, bytes32 ref, uint256 deadline, uint8 v, bytes32 r, bytes32 s)', 'The same payment in one transaction using an EIP-2612 permit signature. If the permit was already used by someone else, an existing allowance is enough.'],
  ['sweep(uint256 id) returns (uint256 amount)', 'Moves everything waiting at the split’s deposit address into the split and credits it like a payment. Anyone can call it. Reverts with NothingToSweep when the address is empty.'],
  ['claim(uint256 id)', 'Pays the caller what they are owed to their own address. Sweeps the deposit address first.'],
  ['claimTo(uint256 id, address to)', 'Same as claim but pays any address you choose, except zero and the contract itself.'],
  ['release(uint256 id, address recipient)', 'Anyone can call it. Always pays the recipient’s own address. This is how nested splits and automations are paid.'],
  ['getSplit(uint256 id) view', 'Returns name, recipients, bps, depositAddress and totalReceived.'],
  ['owed(uint256 id, address recipient) view', 'Credited revenue the recipient has not yet taken. It does not include USDC still waiting at the deposit address, which the next claim picks up.'],
  ['released(uint256 id, address recipient) view', 'Lifetime amount already paid out against this recipient.'],
  ['bpsOf(uint256 id, address recipient) view', 'The recipient’s share in basis points, or 0 if they are not a recipient.'],
  ['depositAddressOf(uint256 id) view', 'The split’s deposit address.'],
  ['predictDepositAddress(address creator, string name, address[] recipients, uint16[] bps) view', 'The deposit address a split will get, before it exists. It does not depend on the split id.'],
  ['nextId() view', 'The id the next split will get. Ids start at 1.'],
  ['USDC, MAX_RECIPIENTS, DEPOSIT_IMPLEMENTATION (views)', 'The hardcoded USDC address, the limit of 20, and the clone implementation.'],
]

const EVENTS: Array<[string, string]> = [
  ['SplitCreated(uint256 indexed id, address indexed creator, address indexed depositAddress, string name, address[] recipients, uint16[] bps)', 'A split and its deposit address were created.'],
  ['Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 indexed ref)', 'USDC was paid in with pay or payWithPermit. ref is the reference you passed.'],
  ['Swept(uint256 indexed id, uint256 amount)', 'USDC from the deposit address was credited to the split, by sweep or automatically during a claim or release.'],
  ['Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount)', 'A payout. to equals recipient for claim and release.'],
]

const ERRORS: Array<[string, string]> = [
  ['InvalidBps', 'A share is 0 or the shares do not add up to exactly 10000.'],
  ['DuplicateRecipient', 'The same address is listed twice.'],
  ['InvalidRecipient', 'A recipient is the zero address, the Splitline contract, the USDC token, the clone implementation or the split’s own deposit address.'],
  ['InvalidRecipientCount', 'Fewer than 1 or more than 20 recipients.'],
  ['LengthMismatch', 'Recipients and shares have different lengths.'],
  ['NameTooLong', 'The name is longer than 64 bytes.'],
  ['SplitAlreadyExists', 'You already created a split with this exact name, recipients and shares. Change the name.'],
  ['SplitNotFound', 'No split has that id.'],
  ['ZeroAmount', 'The payment amount is 0.'],
  ['NothingToSweep', 'The deposit address holds no USDC.'],
  ['NotRecipient', 'The account is not a recipient of the split.'],
  ['NothingOwed', 'Nothing can be claimed right now.'],
  ['InvalidDestination', 'claimTo destination is the zero address or the contract itself.'],
]

const INTEGRATE = `import { erc20Abi, parseUnits } from 'viem'

const USDC = '0x3600000000000000000000000000000000000000' // Arc USDC, 6 decimals

// Pay with approve + pay
await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [SPLITLINE, amount] })
await wallet.writeContract({ address: SPLITLINE, abi: splitlineAbi, functionName: 'pay', args: [id, amount, ref] })

// Or one transaction: sign an EIP-2612 permit, then payWithPermit
const signature = await wallet.signTypedData({
  domain: { name: 'USDC', version: '2', chainId, verifyingContract: USDC },
  types: { Permit: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ] },
  primaryType: 'Permit',
  message: { owner, spender: SPLITLINE, value: amount, nonce, deadline },
})

// No contract call at all: send USDC straight to the deposit address
await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [depositAddress, amount] })

// Recipients claim. This also collects whatever sits at the deposit address
await wallet.writeContract({ address: SPLITLINE, abi: splitlineAbi, functionName: 'claim', args: [id] })

// Read history: start at the deployment block and use small ranges
const logs = await client.getLogs({ address: SPLITLINE, events, fromBlock, toBlock: fromBlock + 1999n })`

function SideNav({ active }: { active: string }) {
  return (
    <>
      {/* Phones and tablets: a sticky row of chips */}
      <nav aria-label="On this page" className="sticky top-16 z-30 -mx-4 mb-6 border-b border-line bg-bg/90 backdrop-blur-xl lg:hidden">
        <ul className="flex gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className={clsx('flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium', active === s.id ? 'bg-white/[0.08] text-ink' : 'text-muted')}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="On this page" className="sticky top-24 hidden self-start lg:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-subtle">On this page</p>
        <ul className="space-y-0.5 border-l border-line">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={clsx('-ml-px block border-l py-1.5 pl-4 text-sm transition', active === s.id ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

export function Docs() {
  const [active, setActive] = useState(SECTIONS[0].id)

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e))
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-90px 0px -65% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const testnet = NETWORKS.find((n) => n.key === 'testnet')
  const mainnet = NETWORKS.find((n) => n.key === 'mainnet')

  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <SideNav active={active} />
      <article className="min-w-0 max-w-3xl">
        <header className="pb-8">
          <h1 className="text-4xl font-bold sm:text-5xl">Docs</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            Spliteline is an immutable, pull-based USDC revenue-split contract on Arc. This page covers how version 2 works, its exact contract surface, the Arc-specific details behind it, and how to integrate.
          </p>
        </header>

        <DocSection id="overview" title="Overview">
          <p>
            A <strong className="text-ink">split</strong> is created once with a name, up to 20 recipients and a share for each in basis points that add up to exactly 10,000 (100.00%). After that it can never be edited. There is no owner, no admin function, no fee and no upgrade path anywhere in the contract.
          </p>
          <p>
            Anyone can pay USDC into a split, and each split also has its own <strong className="text-ink">deposit address</strong> that accepts a plain USDC transfer from any wallet, exchange or agent. Each recipient can claim their exact proportional share of everything the split has ever received. Anyone can also push a payout to a recipient with <Code>release</Code>.
          </p>
        </DocSection>

        <DocSection id="how-it-works" title="How v2 works">
          <H3>Cumulative accounting</H3>
          <p>Spliteline never tracks which payment belongs to which recipient. Every payment adds to the split’s <Code>totalReceived</Code> and what a recipient is owed is computed fresh each time:</p>
          <Formula>owed = totalReceived * bps / 10000 - released</Formula>
          <p>The division rounds down, so a recipient’s entitlement only ever grows and can never go negative. Rounding dust stays below the number of recipients in total and is picked up as more revenue arrives.</p>

          <H3>A deposit address per split</H3>
          <p>
            Each split gets a minimal EIP-1167 clone deployed at creation with CREATE2. Its only function forwards its whole USDC balance to the Spliteline contract, and only the contract can call it. The address depends on the creator, the name, the recipients and their shares, not on the split id, so it can be computed before the split exists with <Code>predictDepositAddress</Code> and cannot be shifted by someone else creating a split in the meantime.
          </p>

          <H3>Auto-sweep</H3>
          <p>
            <Code>claim</Code>, <Code>claimTo</Code> and <Code>release</Code> first collect any USDC waiting at the split’s deposit address, credit it and emit <Code>Swept</Code>, then compute what is owed. An empty address is simply skipped. If the deposit address itself cannot transfer (for example it is blocklisted by USDC), the payout carries on with revenue that is already credited. The public <Code>sweep</Code> remains available and reverts when there is nothing to sweep.
          </p>

          <H3>Nested splits</H3>
          <p>
            A recipient can be another split’s deposit address. <Code>release(parent, childDeposit)</Code> sends the child’s share to the child’s deposit address, and the child is credited by the next sweep, claim or release on it. Nothing loops inside a single transaction. Cycles cannot be built: a split’s deposit address depends on its recipients’ addresses, so two splits cannot each list the other, and a split cannot list its own deposit address.
          </p>

          <H3>Pull payouts, with a push escape hatch</H3>
          <p>
            <Code>claim</Code> and <Code>claimTo</Code> are pull: the recipient decides when to collect and where it goes. <Code>release</Code> is push: anyone can call it and it always pays the recipient’s own address. Every recipient’s accounting is independent, so one reverting or blocklisted recipient can never block anyone else. A blocklisted recipient can use <Code>claimTo</Code> to move their share to another address.
          </p>
        </DocSection>

        <DocSection id="reference" title="Contract reference">
          <p>
            Source: <a className="font-semibold text-accent hover:underline" href="https://github.com/angelraph/Spliteline/tree/v2/v2/contracts" target="_blank" rel="noopener noreferrer">v2/contracts</a> in the repository. The contract is named <Code>Splitline</Code> in code.
          </p>
          <H3>Functions</H3>
          <RefList head={['Function', 'What it does']} rows={FUNCTIONS.map(([a, b]) => [fn(a), b])} />
          <H3>Events</H3>
          <RefList head={['Event', 'When']} rows={EVENTS.map(([a, b]) => [fn(a), b])} />
          <H3>Errors</H3>
          <RefList head={['Error', 'Meaning']} rows={ERRORS.map(([a, b]) => [fn(a), b])} />
          <H3>Deployments</H3>
          <RefList
            head={['Network', 'Contract']}
            rows={[
              [<span key="t">{testnet?.label ?? 'Arc Testnet'}</span>, testnet?.address ? <AddressLink key="ta" address={testnet.address} /> : 'Not deployed'],
              [<span key="m">{mainnet?.label ?? 'Arc'}</span>, mainnet?.address ? <AddressLink key="ma" address={mainnet.address} /> : 'Coming soon on mainnet'],
            ]}
          />
        </DocSection>

        <DocSection id="arc" title="Arc-specific notes">
          <p>
            On Arc, USDC is the native gas token and has two interfaces over one balance: a native 18-decimal one used for gas, and an ERC-20 interface at the fixed address <Code>0x3600000000000000000000000000000000000000</Code> with 6 decimals. Spliteline only uses the ERC-20 interface. It is not payable and never accepts native value.
          </p>
          <p>The address is a constant in the contract rather than a constructor argument. It is fixed network-wide, so making it configurable would only add a way to misconfigure an otherwise immutable contract.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Arc USDC supports EIP-2612. Its permit domain uses the name <Code>USDC</Code> and version <Code>2</Code>.</li>
            <li>Network fees are paid in USDC, so a wallet needs a little USDC to send any transaction.</li>
            <li>Chain IDs: Arc Testnet {requireChain(5042002).chainId}, Arc mainnet {requireChain(5042).chainId}.</li>
            <li>USDC can blocklist addresses. That only affects the blocklisted address; see the nested and auto-sweep notes above.</li>
          </ul>
        </DocSection>

        <DocSection id="security" title="Security and limits">
          <ul className="list-disc space-y-2 pl-5">
            <li>Built on OpenZeppelin v5: <Code>SafeERC20</Code> and <Code>ReentrancyGuard</Code> on every state-changing function, custom errors, and checks-effects-interactions.</li>
            <li>167 Foundry tests covering every function and revert path, fuzz tests on share validation, rounding and nested accounting, and invariant tests that the contract balance always equals paid plus swept minus claimed.</li>
            <li>Reviewed with automated and manual passes, but <strong className="text-ink">not independently audited</strong>.</li>
            <li>Up to 20 recipients and names up to 64 bytes. Rounding dust is below the recipient count per split.</li>
            <li>USDC sent straight to the Spliteline contract address, rather than to a split’s deposit address or through <Code>pay</Code>, cannot be credited and is stuck for good. There is no rescue function by design.</li>
            <li>A split cannot be changed. A wrong recipient can only be replaced by creating a new split.</li>
            <li>Listing a deposit address that does not exist yet only works if exactly that split is created later. Nest splits that already exist.</li>
          </ul>
          <Callout tone="warn">
            <strong className="text-ink">Not audited. Use small amounts.</strong> Mainnet transactions move real USDC and cannot be reversed.
          </Callout>
        </DocSection>

        <DocSection id="integrating" title="Integrating">
          <p>
            Anyone can pay a split, so the simplest integration is a plain USDC transfer to its deposit address. Everything else is optional. For anything that needs to read state, use the views above and the four events.
          </p>
          <CodeBlock code={INTEGRATE} />
          <H3>Payment links and embeds</H3>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              A payment link is <Code>/s/ID?amount=10&amp;ref=invoice-1042</Code>. It opens the split with the amount and reference filled in. Mainnet links add <Code>net=mainnet</Code>.
            </li>
            <li>
              The embeddable widget lives at <Code>/embed/ID</Code> and accepts the same <Code>amount</Code> and <Code>ref</Code> parameters. Copy the ready-made iframe snippet from any split page.
            </li>
          </ul>
          <p>
            Ready to try it? <Link to="/create" className="font-semibold text-accent hover:underline">Create a split</Link> on testnet.
          </p>
        </DocSection>
      </article>
    </div>
  )
}
