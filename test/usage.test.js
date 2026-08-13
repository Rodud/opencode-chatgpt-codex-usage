import assert from "node:assert/strict"
import test from "node:test"
import { parseRefreshInterval } from "../dist/refresh.js"
import { accountIdFromToken, parseUsage } from "../dist/usage.js"

const token = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`

test("parses usage windows and calculates the remaining percentage", () => {
  assert.deepEqual(
    parseUsage({
      plan_type: "plus",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 37.5,
          limit_window_seconds: 18_000,
          reset_at: 1_800_000_000,
        },
      },
    }),
    {
      plan: "plus",
      allowed: true,
      limitReached: false,
      primary: {
        usedPercent: 37.5,
        remainingPercent: 62.5,
        windowSeconds: 18_000,
        resetAt: 1_800_000_000,
      },
      secondary: null,
    },
  )
})

test("tolerates missing and malformed endpoint fields", () => {
  assert.deepEqual(parseUsage(null), {
    plan: null,
    allowed: null,
    limitReached: null,
    primary: null,
    secondary: null,
  })
})

test("extracts account IDs from supported JWT claim shapes", () => {
  assert.equal(accountIdFromToken(token({ chatgpt_account_id: "direct" })), "direct")
  assert.equal(
    accountIdFromToken(token({ "https://api.openai.com/auth": { chatgpt_account_id: "nested" } })),
    "nested",
  )
  assert.equal(accountIdFromToken(token({ organizations: [{ id: "organization" }] })), "organization")
  assert.equal(accountIdFromToken("not-a-jwt"), undefined)
})

test("parses refresh interval duration strings", () => {
  assert.deepEqual(parseRefreshInterval("45s"), { milliseconds: 45_000, label: "45s" })
  assert.deepEqual(parseRefreshInterval(" 5M "), { milliseconds: 300_000, label: "5m" })
  assert.deepEqual(parseRefreshInterval("2h"), { milliseconds: 7_200_000, label: "2h" })
  assert.deepEqual(parseRefreshInterval("1d"), { milliseconds: 86_400_000, label: "1d" })
})

test("clamps refresh intervals below ten seconds", () => {
  assert.deepEqual(parseRefreshInterval("5s"), { milliseconds: 10_000, label: "10s" })
  assert.deepEqual(parseRefreshInterval("0s"), { milliseconds: 10_000, label: "10s" })
})

test("uses the default refresh interval for invalid values", () => {
  const expected = { milliseconds: 30_000, label: "30s" }

  assert.deepEqual(parseRefreshInterval(undefined), expected)
  assert.deepEqual(parseRefreshInterval("soon"), expected)
  assert.deepEqual(parseRefreshInterval("-5s"), expected)
  assert.deepEqual(parseRefreshInterval("999d"), expected)
})
