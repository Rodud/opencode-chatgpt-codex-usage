import { readFile } from "node:fs/promises"
import path from "node:path"

export const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"

export type WindowUsage = {
  usedPercent: number | null
  remainingPercent: number | null
  windowSeconds: number | null
  resetAt: number | null
}

export type Usage = {
  plan: string | null
  allowed: boolean | null
  limitReached: boolean | null
  primary: WindowUsage | null
  secondary: WindowUsage | null
  error?: string
}

type Auth = {
  type?: string
  access?: string
  accountId?: string
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

const booleanOrNull = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null)

export const accountIdFromToken = (token: string): string | undefined => {
  const payload = token.split(".")[1]
  if (!payload) return undefined

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!record(claims)) return undefined

    const direct = stringOrNull(claims.chatgpt_account_id)
    if (direct) return direct

    const authClaims = record(claims["https://api.openai.com/auth"])
      ? claims["https://api.openai.com/auth"]
      : undefined
    const nested = record(authClaims) ? stringOrNull(authClaims.chatgpt_account_id) : null
    if (nested) return nested

    const organizations = Array.isArray(claims.organizations) ? claims.organizations : []
    const organization = organizations.find((item) => record(item) && stringOrNull(item.id))
    return record(organization) ? stringOrNull(organization.id) ?? undefined : undefined
  } catch {
    return undefined
  }
}

const parseWindow = (value: unknown): WindowUsage | null => {
  if (!record(value)) return null

  const usedPercent = numberOrNull(value.used_percent)

  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.max(0, Math.min(100, 100 - usedPercent)),
    windowSeconds: numberOrNull(value.limit_window_seconds),
    resetAt: numberOrNull(value.reset_at),
  }
}

export const parseUsage = (value: unknown): Usage => {
  const data = record(value) ? value : {}
  const rateLimit = record(data.rate_limit) ? data.rate_limit : {}

  return {
    plan: stringOrNull(data.plan_type),
    allowed: booleanOrNull(rateLimit.allowed),
    limitReached: booleanOrNull(rateLimit.limit_reached),
    primary: parseWindow(rateLimit.primary_window),
    secondary: parseWindow(rateLimit.secondary_window),
  }
}

const readAuth = async (): Promise<Auth> => {
  const environmentToken = stringOrNull(process.env.CHATGPT_ACCESS_TOKEN)
  if (environmentToken) {
    return {
      type: "oauth",
      access: environmentToken,
      accountId: stringOrNull(process.env.CHATGPT_ACCOUNT_ID) ?? accountIdFromToken(environmentToken),
    }
  }

  const dataHome = process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? "", ".local", "share")
  const authPath = path.join(dataHome, "opencode", "auth.json")
  const contents = process.env.OPENCODE_AUTH_CONTENT ?? (await readFile(authPath, "utf8"))
  const data: unknown = JSON.parse(contents)
  const openai = record(data) && record(data.openai) ? data.openai : {}
  const access = stringOrNull(openai.access)

  return {
    type: stringOrNull(openai.type) ?? undefined,
    access: access ?? undefined,
    accountId: stringOrNull(openai.accountId) ?? (access ? accountIdFromToken(access) : undefined),
  }
}

export const getUsage = async (): Promise<Usage> => {
  const auth = await readAuth()
  if (auth.type !== "oauth" || !auth.access) {
    throw new Error("Connect ChatGPT from /connect first")
  }

  const headers = new Headers({
    Authorization: `Bearer ${auth.access}`,
    Accept: "application/json",
  })
  if (auth.accountId) headers.set("ChatGPT-Account-ID", auth.accountId)

  const response = await fetch(USAGE_URL, { headers, signal: AbortSignal.timeout(10_000) })
  if (response.status === 401 || response.status === 403) {
    throw new Error("ChatGPT session expired; reconnect from /connect")
  }
  if (!response.ok) throw new Error(`Usage request failed (${response.status})`)

  return parseUsage(await response.json())
}
