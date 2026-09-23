import { createContext, useContext } from 'react'

/** The window a component is drawn in: the main one, or a pop-out's. */
export interface Owner {
  win: Window
  doc: Document
}

const MAIN: Owner = { win: window, doc: document }

export const OwnerContext = createContext<Owner>(MAIN)

/**
 * Overlays (menus, dropdowns), global listeners and measuring belong to the
 * window that holds the component — a popped-out view's context menu opens in
 * its own window, and a drag there follows that window's pointer.
 */
export const useOwner = () => useContext(OwnerContext)

/** The window an element sits in, for code that has an element but no hook. */
export const windowOf = (el: Element | null | undefined): Window & typeof globalThis =>
  (el?.ownerDocument.defaultView as (Window & typeof globalThis) | null | undefined) ?? window
