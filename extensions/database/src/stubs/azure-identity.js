/**
 * Stands in for `@azure/identity`, which tedious imports for Azure AD sign-in.
 * The extension signs in with user name and password only; the real package
 * would add megabytes to the bundle for a path it never takes.
 */

class Unsupported {
  constructor() {
    throw new Error('Azure AD authentication is not supported by the Database extension')
  }
}

export const ClientSecretCredential = Unsupported
export const DefaultAzureCredential = Unsupported
export const ManagedIdentityCredential = Unsupported
export const UsernamePasswordCredential = Unsupported
