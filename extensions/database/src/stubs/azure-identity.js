/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Stands in for `@azure/identity`, which tedious imports for Azure AD sign-in.
 * The extension signs in with user name and password only; the real package
 * would add megabytes to the bundle for a path it never takes.
 */

class Unsupported {
  constructor() {
    throw new Error('Azure AD authentication is not supported by the Database extension');
  }
}

export const ClientSecretCredential = Unsupported;
export const DefaultAzureCredential = Unsupported;
export const ManagedIdentityCredential = Unsupported;
export const UsernamePasswordCredential = Unsupported;
