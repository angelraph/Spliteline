import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui'

const ITEMS: Array<{ q: string; a: ReactNode }> = [
  { q: 'Can a split ever be edited or canceled?', a: 'No. Recipients and shares are locked in at the moment a split is created. There is no owner, admin or upgrade function anywhere in the contract. If you add the wrong recipient, the fix is to create a new split, not edit the old one.' },
  { q: 'What is a deposit address?', a: 'Every split gets its own address. Anyone can send plain USDC to it from any wallet, exchange or agent, with no approval and no contract call. MetaMask\u2019s normal Send works. The USDC is counted the next time anyone claims, claims to another address, releases or sweeps that split.' },
  { q: 'What happens to USDC sent straight to the deposit address?', a: 'It waits there safely and the split page shows it as waiting. The next claim, claim to another address or release collects it automatically and shares it out. Anyone can also press Sweep to credit it right away.' },
  { q: 'Does MetaMask\u2019s normal Send work?', a: 'Yes. On Arc, a wallet\u2019s normal Send moves USDC as the network\u2019s native currency, and a deposit address accepts exactly that. The same USDC is also visible through the standard token interface, so the split sees it as a normal USDC deposit and shares it out on the next claim, release or sweep.' },
  { q: 'Why did my exchange withdrawal to a deposit address fail?', a: 'Deposit addresses are small smart contracts, so a transfer needs a little more gas than a send to an ordinary wallet (about 24,000 instead of 21,000). Wallets estimate this for you. A sender that hard-codes exactly 21,000 gas will fail, and nothing is lost: the transaction is rejected and the funds stay with the sender. Ask the sender to use at least 30,000 gas, or pay on the split page instead.' },
  { q: 'What if I send USDC to the contract address instead of the deposit address?', a: 'A plain Send to the contract address is rejected, so nothing is lost. A token-interface transfer to it cannot be refused and cannot be credited, so that USDC is stuck for good. Always use the split\u2019s deposit address, the Pay card, or a payment link.' },
  { q: 'Is there a minimum or a rounding rule for amounts?', a: 'USDC has 6 decimals, so amounts are whole multiples of 0.000001 USDC. The Pay card enforces this for you. A direct native Send with extra decimals (below 0.000001 USDC) still arrives, but that leftover fraction cannot move through the token interface and stays at the deposit address. It is worth less than a millionth of a dollar.' },
  { q: 'What are nested splits?', a: 'A recipient can be another split. Revenue then flows down: release the parent\u2019s share for the child, and the child splits it among its own recipients. Cycles cannot be built, nothing loops inside a single transaction, and the next claim on the child collects what arrived.' },
  { q: 'What happens if one recipient\u2019s wallet is blocklisted or broken?', a: 'Nothing happens to anyone else. Each recipient\u2019s accounting is independent, so one recipient being unable to receive funds never blocks another recipient. The affected recipient can use Claim to another address to send their share somewhere else.' },
  { q: 'Who can pay into a split?', a: 'Anyone. Split pages are public. Any wallet can pay on the split page, through a payment link or the embeddable widget, or just send USDC to the deposit address, whether it is a person, a customer or a script.' },
  { q: 'How does the Pay card send money?', a: 'By default it is one plain USDC transfer to the contract: your wallet just shows \u201csend X USDC\u201d, with no approval and no signature. If that is not available, it falls back to a signed permit (still one transaction), and then to approve then pay (two transactions).' },
  { q: 'Who can claim a recipient\u2019s share?', a: 'The recipient themselves, with Claim or Claim to another address. Anyone can also trigger Release for a recipient, which always pays that recipient\u2019s own address. Nobody else can redirect a recipient\u2019s funds.' },
  { q: 'Does Spliteline take a fee?', a: 'No. There is no fee logic anywhere in the contract. 100% of what is paid in goes to recipients according to their shares. You only pay the network fee, in USDC, for your own transactions.' },
  { q: 'Why USDC only?', a: 'Spliteline is built for Arc, where USDC is the native currency and also has a fixed ERC-20 interface over the same balance. The contract credits amounts in the 6-decimal token interface and pays out through it, so accounting and decimals stay unambiguous. Native USDC payments are converted exactly (1 USDC = 10^18 native units = 10^6 token units).' },
  { q: 'How many recipients can a split have?', a: 'Up to 20, enforced onchain. That keeps validation cheap and rounding dust below the number of recipients.' },
  { q: 'Has the contract been audited?', a: 'No. It has 223 Foundry tests (unit, fuzz and invariant) and went through automated and manual review, but that is not a substitute for an independent audit. Not audited. Use small amounts.' },
  { q: 'How does the app know who is owed what without a backend?', a: 'It does not have one. Every page reads straight from the contract\u2019s views and from its SplitCreated, Paid, Swept and Claimed events. The chain is the whole database.' },
  { q: 'Can software use Spliteline, not just people?', a: 'Yes. A script can bill a customer and forward revenue into a split with a plain USDC transfer to the deposit address, or with pay. No human needs to be in the loop.' },
  { q: 'Is Spliteline live on mainnet?', a: <>Spliteline runs on Arc mainnet and on Arc Testnet. Try everything on testnet first with test USDC, and use small amounts on mainnet because the contract is not audited. Real transactions from both networks are listed on the <Link to="/proof" className="font-semibold text-accent hover:underline">Proof</Link> page.</> },
]

function Item({ q, a, open, onToggle, id }: { q: string; a: ReactNode; open: boolean; onToggle: () => void; id: string }) {
  return (
    <li className="border-b border-line last:border-0">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-button`}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left sm:px-6"
        >
          <span className="text-[15px] font-semibold leading-snug text-ink sm:text-base">{q}</span>
          <ChevronDown className={clsx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180 text-accent')} aria-hidden />
        </button>
      </h2>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-button`} hidden={!open} className="px-4 pb-5 text-[15px] leading-relaxed text-muted sm:px-6">
        {a}
      </div>
    </li>
  )
}

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold sm:text-5xl">Frequently asked questions</h1>
      <p className="mt-3 text-base text-muted">Everything about how Spliteline works, and what it does not do.</p>
      <Card className="mt-8 overflow-hidden">
        <ul>
          {ITEMS.map((item, i) => (
            <Item key={item.q} id={`faq-${i}`} q={item.q} a={item.a} open={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
          ))}
        </ul>
      </Card>
      <p className="mt-6 text-sm text-muted">
        Still stuck? Read the <Link to="/docs" className="font-semibold text-accent hover:underline">docs</Link> or look through the code on{' '}
        <a href="https://github.com/angelraph/Spliteline" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">GitHub</a>.
      </p>
    </div>
  )
}
