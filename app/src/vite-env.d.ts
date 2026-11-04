/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPLITLINE_ADDRESS_TESTNET?: string
  readonly VITE_SPLITLINE_DEPLOY_BLOCK_TESTNET?: string
  readonly VITE_SPLITLINE_ADDRESS_MAINNET?: string
  readonly VITE_SPLITLINE_DEPLOY_BLOCK_MAINNET?: string
  /** Public site URL used in shared payment links and embed code. Defaults to https://spliteline.xyz */
  readonly VITE_PUBLIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
