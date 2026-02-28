'use client'

const LOCK_COUNT_KEY = 'codexModalLockCount'
const BODY_OVERFLOW_KEY = 'codexPrevBodyOverflow'
const HTML_OVERFLOW_KEY = 'codexPrevHtmlOverflow'

/**
 * Acquire a shared body scroll lock. Supports nested modals by reference count.
 */
export function acquireBodyScrollLock(): () => void {
    if (typeof document === 'undefined') return () => {}

    const body = document.body
    const html = document.documentElement
    const currentCount = Number(body.dataset[LOCK_COUNT_KEY] || '0')

    if (currentCount === 0) {
        body.dataset[BODY_OVERFLOW_KEY] = body.style.overflow || ''
        html.dataset[HTML_OVERFLOW_KEY] = html.style.overflow || ''
        body.style.overflow = 'hidden'
        html.style.overflow = 'hidden'
    }

    body.dataset[LOCK_COUNT_KEY] = String(currentCount + 1)

    return () => {
        const activeCount = Number(body.dataset[LOCK_COUNT_KEY] || '0')
        const nextCount = Math.max(0, activeCount - 1)

        if (nextCount === 0) {
            body.style.overflow = body.dataset[BODY_OVERFLOW_KEY] || ''
            html.style.overflow = html.dataset[HTML_OVERFLOW_KEY] || ''
            delete body.dataset[LOCK_COUNT_KEY]
            delete body.dataset[BODY_OVERFLOW_KEY]
            delete html.dataset[HTML_OVERFLOW_KEY]
            return
        }

        body.dataset[LOCK_COUNT_KEY] = String(nextCount)
    }
}
