import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Modal-dialog focus management for the element in `ref`:
//  - moves focus into the dialog on open (first focusable, else the container),
//  - keeps Tab / Shift+Tab cycling inside it,
//  - closes on Escape,
//  - restores focus to the previously-focused element on close (unmount).
// `onClose` is read via a ref so a new closure each render doesn't re-run the
// effect (which would steal focus back to the top on every keystroke).
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const prevFocused = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    ;(focusables()[0] || node).focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      if (prevFocused && document.contains(prevFocused)) prevFocused.focus()
    }
  }, [ref])
}
