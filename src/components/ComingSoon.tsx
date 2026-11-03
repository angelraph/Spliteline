import { Link } from 'react-router-dom'
import { Button, Card } from '@/components/ui'
import { useNetwork } from '@/hooks/useNetwork'
import { DEFAULT_NETWORK } from '@/lib/networks'
import markUrl from '@/assets/mark.png'

/** Shown instead of an error when the selected network has no Splitline address configured yet. */
export function ComingSoon({ compact = false, heading = 'h1' }: { compact?: boolean; heading?: 'h1' | 'h2' }) {
  const Heading = heading
  const { network, setNetworkKey } = useNetwork()
  const isMainnet = !network.isTestnet
  return (
    <Card className={compact ? 'p-6 text-center' : 'mx-auto max-w-lg p-8 text-center sm:p-10'}>
      <img src={markUrl} alt="" width={56} height={56} className="mx-auto size-14 rounded-2xl" />
      <Heading className="mt-5 text-2xl font-bold sm:text-3xl">{isMainnet ? 'Coming soon on mainnet' : `Not live on ${network.label} yet`}</Heading>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {isMainnet
          ? 'Spliteline v2 is not deployed on Arc mainnet yet. Everything works today on Arc Testnet, so you can try it with test USDC.'
          : `Spliteline is not deployed on ${network.label} yet.`}
      </p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row min-[420px]:items-center">
        {isMainnet && (
          <Button onClick={() => setNetworkKey(DEFAULT_NETWORK.key)}>Switch to {DEFAULT_NETWORK.label}</Button>
        )}
        <Link to="/docs">
          <Button variant="secondary" full>Read the docs</Button>
        </Link>
      </div>
    </Card>
  )
}
