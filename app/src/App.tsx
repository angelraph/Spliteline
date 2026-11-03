import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Landing } from '@/pages/Landing'
import { NotFound } from '@/pages/NotFound'
import { Skeleton } from '@/components/ui'

const Create = lazy(() => import('@/pages/Create').then((m) => ({ default: m.Create })))
const SplitPage = lazy(() => import('@/pages/SplitPage').then((m) => ({ default: m.SplitPage })))
const Claim = lazy(() => import('@/pages/Claim').then((m) => ({ default: m.Claim })))
const Docs = lazy(() => import('@/pages/Docs').then((m) => ({ default: m.Docs })))
const Faq = lazy(() => import('@/pages/Faq').then((m) => ({ default: m.Faq })))
const Proof = lazy(() => import('@/pages/Proof').then((m) => ({ default: m.Proof })))
const Embed = lazy(() => import('@/pages/Embed').then((m) => ({ default: m.Embed })))

const PageFallback = () => (
  <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
    <Skeleton className="h-10 w-2/3" />
    <Skeleton className="h-48 w-full" />
  </div>
)

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/embed/:id" element={<Embed />} />
            <Route element={<Layout />}>
              <Route index element={<Landing />} />
              <Route path="create" element={<Create />} />
              <Route path="s/:id" element={<SplitPage />} />
              <Route path="claim" element={<Claim />} />
              <Route path="docs" element={<Docs />} />
              <Route path="faq" element={<Faq />} />
              <Route path="proof" element={<Proof />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
