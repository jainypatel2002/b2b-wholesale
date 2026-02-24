'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion'

import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/components/auth/usePrefersReducedMotion'

interface ThreeDTitleProps {
  className?: string
}

export function ThreeDTitle({ className }: ThreeDTitleProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [isFinePointer, setIsFinePointer] = useState(false)

  const rotateXTarget = useMotionValue(0)
  const rotateYTarget = useMotionValue(0)

  const rotateX = useSpring(rotateXTarget, { stiffness: 150, damping: 18, mass: 0.3 })
  const rotateY = useSpring(rotateYTarget, { stiffness: 150, damping: 18, mass: 0.3 })
  const transform = useMotionTemplate`perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`

  useEffect(() => {
    if (typeof window === 'undefined') return

    const pointerQuery = window.matchMedia('(pointer: fine)')
    const onChange = () => setIsFinePointer(pointerQuery.matches)

    onChange()
    pointerQuery.addEventListener('change', onChange)

    return () => {
      pointerQuery.removeEventListener('change', onChange)
    }
  }, [])

  const canAnimate = !prefersReducedMotion
  const canParallax = canAnimate && isFinePointer

  const handlePointerMove = (event: React.MouseEvent<HTMLHeadingElement>) => {
    if (!canParallax) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    rotateXTarget.set(y * -4)
    rotateYTarget.set(x * 4)
  }

  const handlePointerLeave = () => {
    if (!canParallax) return
    rotateXTarget.set(0)
    rotateYTarget.set(0)
  }

  return (
    <motion.h1
      className={cn(
        'relative isolate inline-block overflow-hidden [transform-style:preserve-3d] text-[clamp(2.25rem,5vw,4.25rem)] font-black leading-[0.9] tracking-[-0.02em]',
        className
      )}
      initial={canAnimate ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
      animate={canAnimate ? { opacity: 1, y: [0, -3, 0] } : { opacity: 1, y: 0 }}
      transition={
        canAnimate
          ? {
            opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
            y: { duration: 6.5, repeat: Infinity, ease: 'easeInOut' },
          }
          : { duration: 0 }
      }
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      style={canParallax ? { transform } : undefined}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 translate-x-[1.5px] translate-y-[2.5px] text-slate-950/45 [text-shadow:0_14px_22px_rgba(2,6,23,0.5)]"
      >
        Your Supply Bridge
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-[0.75px] translate-y-[1.25px] text-cyan-200/30">
        Your Supply Bridge
      </span>
      <span className="relative block bg-gradient-to-br from-cyan-100 via-sky-100 to-blue-300 bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
        Your Supply Bridge
      </span>
      {canAnimate ? (
        <span
          aria-hidden
          className="auth-title-shimmer pointer-events-none absolute -inset-y-2 -left-2/3 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />
      ) : null}
    </motion.h1>
  )
}
