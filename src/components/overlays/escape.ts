/**
 * Dialogs close on Escape through a capturing window listener, which runs
 * before anything inside them. A popover that wants Escape for itself (the
 * combobox list) marks itself with `data-lm-escape-owner`; dialogs ask here
 * first and leave the key alone while one is open.
 */
export function escapeOwnedByPopover(): boolean {
  return document.querySelector('[data-lm-escape-owner]') !== null
}
