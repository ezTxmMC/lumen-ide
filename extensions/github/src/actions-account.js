/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export function accountActions({ ctx, api, store, t, notify }) {
  /* ---------------------------------------------------------------- *
   * Account
   * ---------------------------------------------------------------- */

  async function signIn() {
    const answer = await ctx.ui.input(
      t('auth.title'),
      [{ id: 'token', label: t('auth.token'), type: 'password', required: true, mono: true, hint: t('auth.tokenHint') }],
      { description: t('auth.description', { url: `${api.hosts().web}/settings/tokens` }), submitLabel: t('auth.submit') },
    );
    const value = answer?.token?.trim();
    if (!value) {
      return;
    }
    const user = await api.verify(value).catch((err) => {
      notify(t('auth.invalid', { message: err.message }), 'error');
      return null;
    });
    if (!user) {
      return;
    }
    await ctx.secrets.set('token', value);
    api.reset();
    notify(t('auth.signedIn', { login: user.login }), 'success');
    await store.refreshAll();
  }

  async function signOut() {
    const sure = await ctx.ui.confirm(t('auth.signOutTitle'), t('auth.signOutBody'), { confirmLabel: t('auth.signOut') });
    if (!sure) {
      return;
    }
    await ctx.secrets.delete('token');
    api.reset();
    notify(t('auth.signedOut'), 'info');
    await store.refreshAll();
  }

  return { signIn, signOut };
}
