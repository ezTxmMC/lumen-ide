/** The open “New Java/Kotlin class or package” dialog, if any. */

import { create } from 'zustand'

export interface NewJvmRequest {
  /** The folder the dialog was opened on. */
  dir: string
  mode: 'class' | 'package'
}

export const useNewJvm = create<{ request: NewJvmRequest | null }>(() => ({ request: null }))

export const openNewJvm = (dir: string, mode: NewJvmRequest['mode']) => useNewJvm.setState({ request: { dir, mode } })
export const closeNewJvm = () => useNewJvm.setState({ request: null })
