import { getVercelOidcTokenSync } from "@vercel/oidc"

export function getBlobAuthOptions() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return {}
  }

  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) {
    return {}
  }

  return {
    oidcToken: getVercelOidcTokenSync(),
    storeId,
  }
}

export function hasBlobConfiguration() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}
