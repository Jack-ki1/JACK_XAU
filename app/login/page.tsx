'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/overview')
  }, [router])

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#05070A] p-6">
      <div className="text-center">
        <div className="text-[#2DD4BF] text-xs font-mono tracking-[0.24em] uppercase">JACK TRADE</div>
        <div className="mt-3 text-[#7C8896] text-sm font-mono">Redirecting to your dashboard…</div>
      </div>
    </div>
  )
}