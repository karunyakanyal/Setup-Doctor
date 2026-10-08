import { useEffect, useRef } from 'react'

function DeleteBugModal({ bug, isOpen, onConfirm, onCancel }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !bug) {
      triggerRef.current = typeof document !== 'undefined' ? document.activeElement : null
      return undefined
    }

    const previousElement = triggerRef.current || (typeof document !== 'undefined' ? document.activeElement : null)

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }

      if (event.key === 'Tab') {
        if (!dialogRef.current) return
        const focusableElements = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (
        previousElement &&
        typeof previousElement.focus === 'function' &&
        document.body.contains(previousElement)
      ) {
        previousElement.focus()
      }
    }
  }, [isOpen, bug, onCancel])

  if (!isOpen || !bug) {
    return null
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  return (
    <div className="bug-confirm-backdrop" onMouseDown={handleBackdropClick}>
      <section
        ref={dialogRef}
        className="bug-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bug-delete-title"
        aria-describedby="bug-delete-description"
      >
        <h2 id="bug-delete-title">Delete saved problem?</h2>
        <p id="bug-delete-description">
          “{bug.problem || 'This saved problem'}” will be deleted. This cannot be undone.
        </p>
        <div className="bug-confirm-actions">
          <button
            className="secondary-button"
            type="button"
            aria-label="Cancel deleting saved problem"
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="bug-delete-confirm"
            type="button"
            aria-label="Delete saved problem"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  )
}

export default DeleteBugModal
