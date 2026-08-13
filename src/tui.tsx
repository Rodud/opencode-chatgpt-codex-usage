/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { createSignal } from "solid-js"
import { getUsage, type Usage, type WindowUsage } from "./usage.js"

const REFRESH_INTERVAL_MS = 30 * 1000

type Skin = {
  panel: RGBA
  border: RGBA
  text: RGBA
  muted: RGBA
  accent: RGBA
  success: RGBA
  error: RGBA
}

const color = (value: unknown, fallback: RGBA): RGBA => (value instanceof RGBA ? value : fallback)

const skin = (theme: Record<string, unknown>): Skin => {
  const defaults = {
    panel: RGBA.fromInts(29, 29, 29, 255),
    border: RGBA.fromInts(74, 74, 74, 255),
    text: RGBA.fromInts(240, 240, 240, 255),
    muted: RGBA.fromInts(165, 165, 165, 255),
    accent: RGBA.fromInts(95, 135, 255, 255),
    success: RGBA.fromInts(95, 200, 125, 255),
    error: RGBA.fromInts(235, 95, 95, 255),
  }

  return {
    panel: color(theme.backgroundPanel, defaults.panel),
    border: color(theme.border, defaults.border),
    text: color(theme.text, defaults.text),
    muted: color(theme.textMuted, defaults.muted),
    accent: color(theme.primary, defaults.accent),
    success: color(theme.success, defaults.success),
    error: color(theme.error, defaults.error),
  }
}

const formatPercent = (value: number | null): string => (value === null ? "--" : `${Math.round(value)}%`)

const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return "window unknown"
  const hours = Math.floor(seconds / 3600)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d window`
  if (hours > 0) return `${hours}h window`
  return `${Math.max(1, Math.floor(seconds / 60))}m window`
}

const formatReset = (timestamp: number | null): string => {
  if (timestamp === null) return "reset unknown"
  return `reset ${new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

const Window = (props: { label: string; value: WindowUsage; skin: Skin }) => (
  <box flexDirection="column" gap={0}>
    <text fg={props.skin.text}>{props.label}</text>
    <text fg={props.skin.accent}>
      {formatPercent(props.value.remainingPercent)} left
      <span style={{ fg: props.skin.muted }}> ({formatPercent(props.value.usedPercent)} used)</span>
    </text>
    <text fg={props.skin.muted}>{formatDuration(props.value.windowSeconds)}</text>
    <text fg={props.skin.muted}>{formatReset(props.value.resetAt)}</text>
  </box>
)

const Panel = (props: {
  usage: () => Usage | null
  loading: () => boolean
  theme: Record<string, unknown>
}) => {
  const colors = skin(props.theme)
  const statusColor = () => {
    const value = props.usage()
    return value?.allowed === false || value?.limitReached === true ? colors.error : colors.success
  }

  return (
    <box
      border
      borderColor={colors.border}
      backgroundColor={colors.panel}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
      gap={1}
    >
      {(() => {
        const value = props.usage()

        return (
          <>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={colors.accent}>
                <b>Codex usage</b>
              </text>
              <text fg={colors.muted}>{props.loading() ? "refreshing" : "30s refresh"}</text>
            </box>

            {value?.error ? <text fg={colors.error}>{value.error}</text> : null}
            {!value && props.loading() ? <text fg={colors.muted}>Loading usage...</text> : null}
            {!value && !props.loading() ? <text fg={colors.muted}>Usage unavailable</text> : null}

            {value && !value.error ? (
              <>
                <text fg={colors.muted}>
                  Plan: <span style={{ fg: colors.text }}>{value.plan ?? "unknown"}</span>
                </text>
                <text fg={statusColor()}>
                  {value.allowed === true
                    ? "Allowed"
                    : value.allowed === false
                      ? "Not allowed"
                      : "Allowed unknown"}
                  {value.limitReached === true ? " | limit reached" : ""}
                </text>
                {value.primary ? <Window label="Primary" value={value.primary} skin={colors} /> : null}
                {value.secondary ? (
                  <Window label="Secondary" value={value.secondary} skin={colors} />
                ) : null}
              </>
            ) : null}
          </>
        )
      }) as unknown as JSX.Element}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  let timer: ReturnType<typeof setInterval> | undefined
  let refreshing: Promise<void> | undefined
  const [usage, setUsage] = createSignal<Usage | null>(null)
  const [loading, setLoading] = createSignal(true)

  const refresh = (): Promise<void> => {
    if (refreshing) return refreshing

    refreshing = (async () => {
      setLoading(true)
      try {
        setUsage(await getUsage())
      } catch (error) {
        setUsage({
          plan: null,
          allowed: null,
          limitReached: null,
          primary: null,
          secondary: null,
          error: error instanceof Error ? error.message : "Usage request failed",
        })
      } finally {
        setLoading(false)
      }
    })().finally(() => {
      refreshing = undefined
    })

    return refreshing
  }

  await refresh()
  timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  api.lifecycle.onDispose(() => {
    if (timer) clearInterval(timer)
  })

  const slot: TuiSlotPlugin = {
    order: 150,
    slots: {
      sidebar_content(ctx) {
        return <Panel usage={usage} loading={loading} theme={ctx.theme.current} />
      },
    },
  }

  api.slots.register(slot)
}

const plugin: TuiPluginModule & { id: string } = {
  id: "chatgpt-codex-usage",
  tui,
}

export default plugin
