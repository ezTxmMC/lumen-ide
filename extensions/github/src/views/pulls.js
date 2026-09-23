/** The pull-request view: open pull requests with filters, checks and actions. */

import { gate, labelText, repoLine } from './common.js'
import { relativeTime } from '../i18n.js'

const CHECK_TONE = { success: 'success', failure: 'danger', pending: 'warning' }
const CHECK_ICON = { success: 'circle-check', failure: 'circle-x', pending: 'circle-dot' }

export function createPullsView({ ctx, store, actions, t }) {
  function row(pull) {
    const check = store.state.pulls.checks[pull.number]
    const payload = pull.number
    return {
      type: 'item',
      id: `pull:${pull.number}`,
      label: `#${pull.number} ${pull.title}`,
      description: `${pull.user?.login ?? '?'} · ${pull.head?.ref ?? ''} → ${pull.base?.ref ?? ''} · ${relativeTime(ctx, Date.parse(pull.updated_at))}`,
      tooltip: [pull.title, pull.html_url, check ? t(`checks.${check}`) : t('checks.none')].join('\n'),
      icon: pull.draft ? 'git-pull-request-draft' : 'git-pull-request',
      iconTone: CHECK_TONE[check] ?? (pull.draft ? 'muted' : 'success'),
      badge: pull.draft ? t('pull.draft') : labelText(pull.labels),
      badgeTone: pull.draft ? 'muted' : 'accent',
      onClick: { action: 'show', title: t('pull.show'), payload },
      actions: [
        ...(check ? [{ action: 'show', title: t(`checks.${check}`), icon: CHECK_ICON[check], payload }] : []),
        { action: 'checkout', title: t('pull.checkout'), icon: 'log-in', payload },
        { action: 'browser', title: t('action.openInBrowser'), icon: 'external-link', payload: pull.html_url },
      ],
      menu: [
        { action: 'show', title: t('pull.show'), payload },
        { action: 'browser', title: t('action.openInBrowser'), payload: pull.html_url },
        { action: 'checkout', title: t('pull.checkout'), payload },
        { action: 'approve', title: t('pull.approve'), payload },
        { action: 'requestChanges', title: t('pull.requestChanges'), payload },
        { action: 'comment', title: t('pull.commentAction'), payload },
        { action: 'merge', title: t('pull.merge'), payload, danger: true },
      ],
    }
  }

  function render() {
    const blocked = gate(store, 'pulls', t)
    const toolbar = [
      { action: 'create', title: t('pull.createTitle'), icon: 'plus' },
      { action: 'refresh', title: t('action.refresh'), icon: 'refresh-cw' },
    ]
    if (blocked) return { title: t('view.pulls'), toolbar, nodes: blocked }
    const pulls = store.visiblePulls()
    const { filter, loading, loaded } = store.state.pulls
    return {
      title: t('view.pulls'),
      badge: store.state.pulls.items.length || undefined,
      toolbar,
      nodes: [
        ...repoLine(store, t),
        {
          type: 'select',
          id: 'filter',
          value: filter,
          options: [
            { value: 'all', label: t('filter.allPulls') },
            { value: 'mine', label: t('filter.minePulls') },
            { value: 'review', label: t('filter.reviewRequested') },
          ],
          change: { action: 'filter', title: t('filter.label') },
        },
        ...(loading ? [{ type: 'progress', label: t('busy.loading') }] : []),
        ...pulls.map(row),
        ...(!pulls.length && loaded && !loading ? [{ type: 'empty', title: t('empty.noPulls'), icon: 'git-pull-request' }] : []),
        { type: 'buttons', buttons: [{ action: 'create', title: t('pull.createTitle'), icon: 'git-pull-request-arrow', variant: 'secondary' }] },
      ],
    }
  }

  const handlers = {
    refresh: () => store.refreshAll(),
    signIn: () => actions.signIn(),
    create: () => actions.createPull(),
    filter: (_payload, inputs) => store.setFilter('pulls', String(inputs.filter ?? 'all')),
    show: (number) => actions.showPull(number),
    browser: (url) => actions.openUrl(String(url)),
    checkout: (number) => actions.checkoutPull(number),
    approve: (number) => actions.reviewPull(number, 'APPROVE'),
    requestChanges: (number) => actions.reviewPull(number, 'REQUEST_CHANGES'),
    comment: (number) => actions.comment(number),
    merge: (number) => actions.mergePull(number),
  }

  async function onAction(event) {
    const handler = handlers[event.action]
    if (handler) await handler(event.payload, event.inputs ?? {})
  }

  return { render, onAction }
}
