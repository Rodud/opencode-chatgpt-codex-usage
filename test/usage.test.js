import assert from "node:assert/strict"
import test from "node:test"
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
