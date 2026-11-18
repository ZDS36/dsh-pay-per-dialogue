window.__ModuleLoader__.load({
  id: '@local/dsh-usage-cost',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch {
      ReactDOM = null
    }

    const NS = 'usage.cost'
    const CLIENT_VERSION = (() => {
      try {
        const boot = globalThis.__DSH_BOOT__
        if (boot && typeof boot.version === 'string' && boot.version !== '') return boot.version
      } catch {
        // fall through to the build this bundle shipped against
      }
      return '0.2.1-rc.2'
    })()
    const BALANCE_TTL_MS = 20 * 1000
    const SESSIONS_TTL_MS = 20 * 1000
    const POLL_MS = 60 * 1000

    // ---------------------------------------------------------------------
    // Prices — CNY per 1,000,000 tokens, from the DeepSeek API price page.
    // Peak hours are Beijing time, Monday–Friday 09:00–12:00 and 14:00–18:00;
    // every other time (including weekends) bills at half the peak rate.
    // DeepSeek bills no separate cache-write line, so a write is priced as a
    // cache miss.
    // ---------------------------------------------------------------------
    const PRICE_TABLE = {
      'deepseek-flash': {
        peak: { input: 2, cacheRead: 0.04, cacheWrite: 2, output: 8 },
        offpeak: { input: 1, cacheRead: 0.02, cacheWrite: 1, output: 4 },
      },
      'deepseek-v4-pro': {
        peak: { input: 9, cacheRead: 0.3, cacheWrite: 9, output: 27 },
        offpeak: { input: 4.5, cacheRead: 0.15, cacheWrite: 4.5, output: 13.5 },
      },
    }

    // Statutory holidays (Beijing dates) bill at the off-peak rate all day.
    // 2026 schedule: 国务院办公厅 国办发明电〔2025〕7号. Update yearly.
    const HOLIDAYS = new Set([
      '2026-01-01', '2026-01-02',
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
      '2026-04-06',
      '2026-05-01', '2026-05-04', '2026-05-05',
      '2026-06-19',
      '2026-09-25',
      '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
    ])

    /** Beijing wall clock parts for one epoch millisecond. */
    function beijingParts(ms) {
      const shifted = new Date(ms + 8 * 60 * 60 * 1000)
      const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
      const day = String(shifted.getUTCDate()).padStart(2, '0')
      return {
        weekday: shifted.getUTCDay(),
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        date: shifted.getUTCFullYear() + '-' + month + '-' + day,
      }
    }

    function isPeak(ms) {
      const { weekday, minutes, date } = beijingParts(ms)
      if (weekday === 0 || weekday === 6) return false
      if (HOLIDAYS.has(date)) return false
      return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
    }

    function modelEntry(model) {
      const id = String(model || '').toLowerCase()
      if (id.includes('pro')) return PRICE_TABLE['deepseek-v4-pro']
      return PRICE_TABLE['deepseek-flash']
    }

    /**
     * Rates for one model at the tariff in force at `at`. A Session has one
     * aggregate token count, so its last activity time decides which tariff
     * the entire conversation is priced at.
     */
    function priceOf(model, at) {
      const ms = typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : Date.now()
      const peak = isPeak(ms)
      return { ...modelEntry(model)[peak ? 'peak' : 'offpeak'], tariff: peak ? 'peak' : 'offpeak' }
    }

    /** Whole days since the built-in table was last confirmed against the price page. */
    function priceAgeDays() {
      const start = Date.parse(PRICE_VERSION + 'T00:00:00+08:00')
      if (!Number.isFinite(start)) return 0
      return Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000))
    }

    // ---------------------------------------------------------------------
    // Formatting
    // ---------------------------------------------------------------------
    function num(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    }

    function totalTokens(usage) {
      if (!usage) return 0
      return num(usage.uncachedInputTokens) + num(usage.cacheReadTokens)
        + num(usage.cacheWriteTokens) + num(usage.outputTokens)
    }

    function trimDecimal(value) {
      if (value >= 100) return String(Math.round(value))
      if (value >= 10) return value.toFixed(1).replace(/\.0$/, '')
      return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    }

    function formatTokens(value) {
      const tokens = num(value)
      if (tokens === 0) return '0'
      if (tokens < 1000) return String(Math.round(tokens))
      if (tokens < 1e6) return trimDecimal(tokens / 1e3) + 'K'
      if (tokens < 1e9) return trimDecimal(tokens / 1e6) + 'M'
      return trimDecimal(tokens / 1e9) + 'B'
    }

    function formatExactTokens(value) {
      return Math.round(num(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function formatCost(value) {
      const cost = Number.isFinite(value) ? value : 0
      if (cost <= 0) return '¥0'
      if (cost < 0.01) return '¥' + cost.toFixed(4)
      if (cost < 1) return '¥' + cost.toFixed(3)
      if (cost < 100) return '¥' + cost.toFixed(2)
      return '¥' + cost.toFixed(1)
    }

    function currencySymbol(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return String(currency || '') + ' '
    }

    function formatWallet(wallet) {
      if (!wallet) return ''
      const value = Number.parseFloat(wallet.balance)
      if (!Number.isFinite(value)) return currencySymbol(wallet.currency) + wallet.balance
      const fixed = value.toFixed(2).split('.')
      const grouped = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      return currencySymbol(wallet.currency) + grouped + '.' + fixed[1]
    }

    function formatWallets(wallets) {
      return (wallets || [])
        .filter((wallet) => wallet && typeof wallet.balance === 'string')
        .map(formatWallet)
        .join(' · ')
    }

    function formatBonus(wallets) {
      return (wallets || [])
        .filter((wallet) => wallet && Number.parseFloat(wallet.balance) > 0)
        .map(formatWallet)
        .join(' · ')
    }

    function clockOf(at) {
      if (!at) return '—'
      try {
        return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      } catch {
        return '—'
      }
    }

    // ---------------------------------------------------------------------
    // Usage math
    // ---------------------------------------------------------------------
    function zeroUsage() {
      return { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
    }

    function addUsage(left, right) {
      return {
        uncachedInputTokens: left.uncachedInputTokens + num(right.uncachedInputTokens),
        cacheReadTokens: left.cacheReadTokens + num(right.cacheReadTokens),
        cacheWriteTokens: left.cacheWriteTokens + num(right.cacheWriteTokens),
        outputTokens: left.outputTokens + num(right.outputTokens),
      }
    }

    function costOf(usage, model, at) {
      if (!usage) return 0
      const price = priceOf(model, at)
      return (
        num(usage.uncachedInputTokens) * price.input
        + num(usage.cacheReadTokens) * price.cacheRead
        + num(usage.cacheWriteTokens) * price.cacheWrite
        + num(usage.outputTokens) * price.output
      ) / 1e6
    }

    function pickModel(selection) {
      if (!selection || typeof selection !== 'object') return undefined
      const used = selection.lastUsed
      if (used && typeof used.model === 'string') return used.model
      const next = selection.next
      if (next && typeof next.model === 'string') return next.model
      return undefined
    }

    // ---------------------------------------------------------------------
    // Cost ledger — every observed growth of a Session's cumulative usage is
    // priced once, at the rates in force at that observation, and the result
    // is frozen. A later price-table change therefore never rewrites history;
    // only growth observed after the change uses the new rates.
    // ---------------------------------------------------------------------
    const PRICE_VERSION = '2026-10-19'
    const PRICE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
    const PRICE_MAX_AGE_DAYS = 180
    const LEDGER_KEY = 'dsh-usage-cost:ledger:v1'
    let ledger = loadLedger()
    let ledgerTimer = null
    let ledgerDirty = false

    function loadLedger() {
      try {
        if (typeof localStorage === 'undefined') return {}
        const raw = localStorage.getItem(LEDGER_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function persistLedger() {
      if (!ledgerDirty) return
      ledgerDirty = false
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
      } catch {
        // A full or blocked storage must never break rendering.
      }
    }

    function schedulePersist() {
      ledgerDirty = true
      if (ledgerTimer !== null) return
      ledgerTimer = setTimeout(() => {
        ledgerTimer = null
        persistLedger()
      }, 800)
    }

    function ledgerCost(sessionId) {
      const entry = ledger[sessionId]
      return entry && Number.isFinite(entry.cost) ? entry.cost : undefined
    }

    /**
     * Fold one observation of a Session's cumulative usage into its ledger.
     * @returns whether the ledger changed.
     */
    function recordUsage(sessionId, model, usage, at) {
      if (!sessionId || !usage) return false
      const tokens = {
        u: num(usage.uncachedInputTokens),
        r: num(usage.cacheReadTokens),
        w: num(usage.cacheWriteTokens),
        o: num(usage.outputTokens),
      }
      const when = typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : Date.now()
      const current = ledger[sessionId]
      if (!current || !current.tokens) {
        ledger[sessionId] = {
          v: PRICE_VERSION,
          model: model || '',
          tokens,
          cost: costOf(usage, model, when),
          at: when,
        }
        schedulePersist()
        return true
      }
      const previous = current.tokens
      const grown = Math.max(0, tokens.u - num(previous.u))
        + Math.max(0, tokens.r - num(previous.r))
        + Math.max(0, tokens.w - num(previous.w))
        + Math.max(0, tokens.o - num(previous.o))
      if (grown === 0) return false
      const price = priceOf(model || current.model, when)
      const added = (
        Math.max(0, tokens.u - num(previous.u)) * price.input
        + Math.max(0, tokens.r - num(previous.r)) * price.cacheRead
        + Math.max(0, tokens.w - num(previous.w)) * price.cacheWrite
        + Math.max(0, tokens.o - num(previous.o)) * price.output
      ) / 1e6
      ledger[sessionId] = {
        v: PRICE_VERSION,
        model: model || current.model || '',
        tokens: {
          u: Math.max(num(previous.u), tokens.u),
          r: Math.max(num(previous.r), tokens.r),
          w: Math.max(num(previous.w), tokens.w),
          o: Math.max(num(previous.o), tokens.o),
        },
        cost: (Number.isFinite(current.cost) ? current.cost : 0) + added,
        at: when,
      }
      schedulePersist()
      return true
    }

    // ---------------------------------------------------------------------
    // Workspace resolution
    // ---------------------------------------------------------------------
    function normalizePath(value) {
      if (typeof value !== 'string' || value === '') return ''
      return value.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
    }

    function findWorkspace(snapshot, sessionId, cwd) {
      const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : []
      const direct = items.find((workspace) =>
        (workspace.sessionIds || []).includes(sessionId)
        || (workspace.archivedSessionIds || []).includes(sessionId))
      if (direct) return direct
      const target = normalizePath(cwd)
      if (target === '') return undefined
      const exact = items.find((workspace) => normalizePath(workspace.path) === target)
      if (exact) return exact
      return items.find((workspace) => {
        const root = normalizePath(workspace.path)
        return root !== '' && target.startsWith(root + '\\')
      })
    }

    function workspaceTotals(workspace, byId) {
      const totals = { cost: 0, tokens: 0, usage: zeroUsage(), sessions: 0 }
      if (!workspace) return totals
      const ids = new Set([...(workspace.sessionIds || []), ...(workspace.archivedSessionIds || [])])
      const root = normalizePath(workspace.path)
      for (const entry of Object.values(byId)) {
        if (!entry || !entry.usage) continue
        const entryPath = normalizePath(entry.cwd)
        const member = ids.has(entry.sessionId)
          || (root !== '' && entryPath !== '' && (entryPath === root || entryPath.startsWith(root + '\\')))
        if (!member) continue
        totals.sessions += 1
        totals.usage = addUsage(totals.usage, entry.usage)
        totals.tokens += totalTokens(entry.usage)
        totals.cost += ledgerCost(entry.sessionId) ?? costOf(entry.usage, entry.model, entry.updatedAt)
      }
      return totals
    }

    // ---------------------------------------------------------------------
    // Shared observable store for Remote-backed data
    // ---------------------------------------------------------------------
    let snapshot = {
      balance: { phase: 'idle', loading: false, signedOut: false, wallets: [], bonus: [], at: 0, error: null },
      sessions: { phase: 'idle', loading: false, byId: {}, at: 0, error: null },
    }
    const listeners = new Set()

    function publish(next) {
      snapshot = next
      for (const listener of listeners) listener()
    }

    function publishSlice(key, value) {
      publish({ ...snapshot, [key]: value })
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function useSnapshot() {
      return React.useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
    }

    const api = {
      ensureBalance() {},
      ensureSessions() {},
      refreshAll() {},
      touchLedger() {},
    }

    const runtime = { ctx: null, remote: null }
    let balanceInflight = null
    let sessionsInflight = null

    /** The mounted Remote facade, read lazily so namespaces mounted after apply are visible. */
    function remoteFace() {
      const ctx = runtime.ctx
      return (ctx && ctx.remote) || runtime.remote
    }

    async function loadBalance() {
      if (balanceInflight !== null) return balanceInflight
      const current = snapshot.balance
      balanceInflight = (async () => {
        publishSlice('balance', { ...current, loading: true, error: null })
        try {
          const account = remoteFace()?.account
          if (!account || typeof account.getBalance !== 'function') {
            throw new Error('account remote unavailable')
          }
          const locale = runtime.ctx && runtime.ctx.locale
            ? runtime.ctx.locale.getSnapshot().active
            : 'en'
          const result = await account.getBalance({
            version: CLIENT_VERSION,
            locale,
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          })
          if (!result || !result.ok) {
            throw new Error((result && result.error && result.error.message) || 'balance request failed')
          }
          const value = result.value
          if (value === null) {
            publishSlice('balance', {
              phase: 'ready', loading: false, signedOut: true, wallets: [], bonus: [], at: Date.now(), error: null,
            })
          } else if (value && value.status === 'ready') {
            publishSlice('balance', {
              phase: 'ready',
              loading: false,
              signedOut: false,
              wallets: Array.isArray(value.value) ? value.value : [],
              bonus: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
              at: Date.now(),
              error: null,
            })
          } else {
            publishSlice('balance', {
              ...snapshot.balance, phase: 'failed', loading: false, error: 'balance query failed',
            })
          }
        } catch (error) {
          publishSlice('balance', {
            ...snapshot.balance,
            phase: 'failed',
            loading: false,
            error: String((error && error.message) || error),
          })
        } finally {
          balanceInflight = null
        }
      })()
      return balanceInflight
    }

    async function loadSessions() {
      if (sessionsInflight !== null) return sessionsInflight
      sessionsInflight = (async () => {
        publishSlice('sessions', { ...snapshot.sessions, loading: true, error: null })
        try {
          const session = remoteFace()?.session
          if (!session || typeof session.list !== 'function') {
            throw new Error('session remote unavailable')
          }
          const result = await session.list({})
          if (!result || !result.ok) {
            throw new Error((result && result.error && result.error.message) || 'session list failed')
          }
          const items = result.value && Array.isArray(result.value.items) ? result.value.items : []
          const byId = {}
          for (const item of items) {
            if (!item || typeof item.sessionId !== 'string') continue
            const values = item.projections && item.projections.values ? item.projections.values : undefined
            byId[item.sessionId] = {
              sessionId: item.sessionId,
              cwd: item.cwd,
              updatedAt: item.updatedAt,
              running: item.running === true,
              usage: values && values.tokenUsage ? values.tokenUsage : undefined,
              model: pickModel(values && values.modelSelection),
            }
          }
          for (const entry of Object.values(byId)) {
            recordUsage(entry.sessionId, entry.model, entry.usage, entry.updatedAt)
          }
          publishSlice('sessions', {
            phase: 'ready', loading: false, byId, at: Date.now(), error: null,
          })
        } catch (error) {
          publishSlice('sessions', {
            ...snapshot.sessions,
            phase: 'failed',
            loading: false,
            error: String((error && error.message) || error),
          })
        } finally {
          sessionsInflight = null
        }
      })()
      return sessionsInflight
    }

    function fresh(at, ttl) {
      return at > 0 && Date.now() - at < ttl
    }

    api.ensureBalance = (force) => {
      if (!force && fresh(snapshot.balance.at, BALANCE_TTL_MS)) return Promise.resolve()
      return loadBalance()
    }

    api.ensureSessions = (force) => {
      if (!force && fresh(snapshot.sessions.at, SESSIONS_TTL_MS)) return Promise.resolve()
      return loadSessions()
    }

    api.refreshAll = (force) => Promise.all([api.ensureBalance(force), api.ensureSessions(force)])

    api.touchLedger = () => {
      publish({ ...snapshot })
    }

    // ---------------------------------------------------------------------
    // Locale copy
    // ---------------------------------------------------------------------
    const zh = {
      'pill.balance': '余额 {value}',
      'pill.session': '本会话 {cost}',
      'details.title': '用量与费用',
      'details.refresh': '刷新',
      'details.balance': '账户余额',
      'details.bonus': '赠送余额',
      'details.sessionCost': '本会话费用（估算）',
      'details.sessionTokens': '本会话 Token',
      'details.workspaceCost': '本项目费用（估算）',
      'details.workspaceTokens': '本项目 Token',
      'details.workspaceSessions': '本项目会话',
      'details.input': '未缓存输入',
      'details.cacheRead': '缓存读取',
      'details.cacheWrite': '缓存写入',
      'details.output': '输出',
      'details.model': '模型',
      'details.updated': '更新于',
      'details.reason': '失败原因',
      'details.peak': '高峰',
      'details.offpeak': '空闲',
      'details.priceNote': '按{tariff}价计算（每百万 Token）：未缓存输入 ¥{input}、缓存读取 ¥{read}、输出 ¥{output}。高峰为北京时间周一至周五 9:00–12:00、14:00–18:00（法定节假日除外），其余时段及周末按空闲价（半价）。',
      'details.frozen': '已发生费用按当时单价冻结；以后调整价格只影响新增用量，不改写历史。',
      'details.pricePageLabel': '官方价格：',
      'details.pricePage': '模型 & 价格',
      'details.stale': '内置价格表已超过 180 天未核对，请点上方链接确认最新价格。',
      'details.priceVersion': '单价版本',
      'details.signedOut': '未登录',
      'details.failed': '读取失败',
      'details.loading': '读取中…',
      'files.label': '项目 {cost}',
      'files.title': '本项目合计\n费用（估算）：{cost}\n点击查看明细',
      'hover.project': '本项目',
      'hover.session': '本会话',
      'hover.loading': '统计中…',
    }

    const en = {
      'pill.balance': 'Balance {value}',
      'pill.session': 'Chat {cost}',
      'details.title': 'Usage & balance',
      'details.refresh': 'Refresh',
      'details.balance': 'Account balance',
      'details.bonus': 'Bonus balance',
      'details.sessionCost': 'This chat (estimated)',
      'details.sessionTokens': 'This chat tokens',
      'details.workspaceCost': 'This project (estimated)',
      'details.workspaceTokens': 'Project tokens',
      'details.workspaceSessions': 'Project chats',
      'details.input': 'Uncached input',
      'details.cacheRead': 'Cache read',
      'details.cacheWrite': 'Cache write',
      'details.output': 'Output',
      'details.model': 'Model',
      'details.updated': 'Updated',
      'details.reason': 'Reason',
      'details.peak': 'peak',
      'details.offpeak': 'off-peak',
      'details.priceNote': 'Priced at the {tariff} rate (per 1M tokens): uncached input ¥{input}, cache read ¥{read}, output ¥{output}. Peak is Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00, excluding statutory holidays; all other hours and weekends bill at half.',
      'details.frozen': 'Observed cost is frozen at the rates in force then; later price changes affect only new usage and never rewrite history.',
      'details.pricePageLabel': 'Official pricing: ',
      'details.pricePage': 'Models & pricing',
      'details.stale': 'The built-in rate table has not been checked for over 180 days; verify it at the link above.',
      'details.priceVersion': 'Rate table',
      'details.signedOut': 'Signed out',
      'details.failed': 'Unavailable',
      'details.loading': 'Loading…',
      'files.label': 'Project {cost}',
      'files.title': 'Project total\nCost (estimated): {cost}\nClick for details',
      'hover.project': 'Project',
      'hover.session': 'Chat',
      'hover.loading': 'Loading…',
    }

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------
    const CSS = [
      '.uc_root{display:inline-flex;min-width:0}',
      '.uc_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm,6px);max-width:100%;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
      '.uc_pill:hover,.uc_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary)}',
      '.uc_pill svg{flex:none;width:14px;height:14px}',
      '.uc_sep{color:var(--dsw-alias-separator-primary,var(--dsw-alias-border-l2));margin:0 4px}',
      '.uc_panel{box-sizing:border-box;border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-secondary);padding:12px 14px;font-size:12px;line-height:18px;display:block;max-height:min(70vh,480px);overflow:auto}',
      '.uc_floating{position:fixed;z-index:1100}',
      '.uc_title{color:var(--dsw-alias-label-primary);font-weight:500;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:12px}',
      '.uc_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 0 8px}',
      '.uc_details{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 16px;margin:0}',
      '.uc_details dt{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:0;min-width:0}',
      '.uc_details dd{color:var(--dsw-alias-label-secondary);margin:0;text-align:right;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}',
      '.uc_note{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin-top:8px;font-size:11px;line-height:16px}',
      '.uc_link{color:var(--dsw-alias-brand-primary);text-decoration:none}',
      '.uc_link:hover{text-decoration:underline}',
      '.uc_refresh{border:none;background:0 0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:pointer;padding:0 6px;border-radius:var(--dsw-radius-xs,4px);font:inherit}',
      '.uc_refresh:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.uc_anchor{position:relative;display:inline-flex;min-width:0}',
      '.uc_filesChip{box-sizing:border-box;border:none;background:0 0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:pointer;font:inherit;font-size:11px;line-height:20px;font-variant-numeric:tabular-nums;white-space:nowrap;border-radius:var(--dsw-radius-sm,6px);padding:0 6px;display:inline-flex;align-items:center;gap:4px}',
      '.uc_filesChip:hover,.uc_filesChip[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary)}',
      '.uc_filesChip svg{flex:none;width:13px;height:13px}',
      '.uc_hover{display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:16px}',
      '.uc_hoverRow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0}',
      '.uc_hoverKey{color:#adb2b8;flex:none}',
      '.uc_hoverValue{color:#fff;font-variant-numeric:tabular-nums;text-align:right;min-width:0;overflow-wrap:anywhere}',
      '.uc_wsTip{position:fixed;z-index:1200;pointer-events:none;display:flex;align-items:baseline;gap:8px;box-sizing:border-box;max-width:180px;padding:6px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;white-space:nowrap}',
      '.uc_wsTipLabel{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}',
      '.uc_wsTipValue{font-variant-numeric:tabular-nums;font-weight:500}',
    ].join('')

    // ---------------------------------------------------------------------
    // Small original icons
    // ---------------------------------------------------------------------
    function CoinIcon() {
      return h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 6.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M8 4.6v6.8M5.9 7.1h4.2M5.9 9h4.2', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))
    }

    function TrendIcon() {
      return h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', { d: 'M2.5 12.5h11M4 10.2l3-3.1 2.2 2 2.8-3.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    // ---------------------------------------------------------------------
    // Anchored floating panel
    // ---------------------------------------------------------------------
    function useAnchoredPanel(prefer, width) {
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const [pos, setPos] = React.useState(null)
      const toggle = React.useCallback(() => {
        setPos((current) => {
          if (current !== null) return null
          const anchor = anchorRef.current
          if (!anchor || typeof window === 'undefined') return null
          const rect = anchor.getBoundingClientRect()
          const w = Math.max(220, Math.min(width, window.innerWidth - 24))
          const left = Math.max(12, Math.min(rect.left, window.innerWidth - w - 12))
          if (prefer === 'above') {
            return { left, width: w, bottom: Math.max(12, window.innerHeight - rect.top + 6) }
          }
          return { left, width: w, top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 120)) }
        })
      }, [prefer, width])

      React.useEffect(() => {
        if (pos === null || typeof document === 'undefined') return undefined
        const dismiss = (event) => {
          const anchor = anchorRef.current
          const panel = panelRef.current
          const target = event && event.target
          if (anchor && target && anchor.contains(target)) return
          if (panel && target && panel.contains(target)) return
          setPos(null)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setPos(null)
        }
        document.addEventListener('pointerdown', dismiss, true)
        document.addEventListener('click', dismiss, true)
        document.addEventListener('keydown', onKey)
        window.addEventListener('scroll', dismiss, true)
        return () => {
          document.removeEventListener('pointerdown', dismiss, true)
          document.removeEventListener('click', dismiss, true)
          document.removeEventListener('keydown', onKey)
          window.removeEventListener('scroll', dismiss, true)
        }
      }, [pos])

      return { anchorRef, panelRef, pos, toggle }
    }

    function renderFloating(element) {
      if (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined') {
        return ReactDOM.createPortal(element, document.body)
      }
      return element
    }

    function FloatingPanel(props) {
      const { t, panelRef, pos, children } = props
      if (pos === null) return null
      const style = { left: pos.left + 'px', width: pos.width + 'px' }
      if (pos.top !== undefined) style.top = pos.top + 'px'
      if (pos.bottom !== undefined) style.bottom = pos.bottom + 'px'
      return renderFloating(h('div', {
        ref: panelRef,
        className: 'uc_panel uc_floating',
        role: 'dialog',
        'aria-label': t('details.title'),
        style,
      }, children))
    }

    // ---------------------------------------------------------------------
    // Presentation helpers
    // ---------------------------------------------------------------------
    function balanceText(balance, t) {
      if (!balance || balance.phase === 'idle') return '—'
      if (balance.signedOut) return t('details.signedOut')
      const wallets = formatWallets(balance.wallets)
      if (wallets !== '') return wallets
      if (balance.phase === 'failed') return t('details.failed')
      if (balance.phase === 'ready') return '¥0'
      return '—'
    }

    function pushRows(rows, key, label, value) {
      if (value === undefined || value === null) return
      rows.push(h('dt', { key: 'k:' + key }, label))
      rows.push(h('dd', { key: 'v:' + key }, value))
    }

    function UsagePanel(props) {
      const { t, balance, sessionCost, sessionModel, sessionAt, workspaceTotals: project, onRefresh, refreshing } = props
      const rows = []
      pushRows(rows, 'balance', t('details.balance'), balanceText(balance, t))
      if (balance && balance.phase === 'failed' && balance.error) {
        pushRows(rows, 'reason', t('details.reason'), String(balance.error).slice(0, 160))
      }
      const bonus = formatBonus(balance && balance.bonus)
      if (bonus !== '') pushRows(rows, 'bonus', t('details.bonus'), bonus)
      if (sessionCost !== undefined) {
        pushRows(rows, 'sessionCost', t('details.sessionCost'), formatCost(sessionCost))
      }
      if (sessionModel) pushRows(rows, 'model', t('details.model'), sessionModel)
      if (project) {
        pushRows(rows, 'projectCost', t('details.workspaceCost'), formatCost(project.cost))
      }
      if (balance && balance.at) pushRows(rows, 'updated', t('details.updated'), clockOf(balance.at))
      pushRows(rows, 'priceVersion', t('details.priceVersion'), PRICE_VERSION)
      const price = priceOf(sessionModel, sessionAt)
      const tariffLabel = price.tariff === 'peak' ? t('details.peak') : t('details.offpeak')
      return h(React.Fragment, null,
        h('div', { className: 'uc_title' },
          h('span', null, t('details.title')),
          h('button', {
            type: 'button', className: 'uc_refresh', onClick: onRefresh, disabled: refreshing === true,
          }, t('details.refresh'))),
        h('div', { className: 'uc_rule', 'aria-hidden': true }),
        h('dl', { className: 'uc_details' }, rows),
        h('div', { className: 'uc_note' }, t('details.priceNote', {
          tariff: tariffLabel,
          input: String(price.input),
          read: String(price.cacheRead),
          write: String(price.cacheWrite),
          output: String(price.output),
        })),
        h('div', { className: 'uc_note' }, t('details.frozen')),
        h('div', { className: 'uc_note' },
          t('details.pricePageLabel'),
          h('a', {
            href: PRICE_URL,
            target: '_blank',
            rel: 'noreferrer',
            className: 'uc_link',
          }, t('details.pricePage'))),
        priceAgeDays() > PRICE_MAX_AGE_DAYS
          ? h('div', { className: 'uc_note' }, t('details.stale'))
          : null)
    }

    // ---------------------------------------------------------------------
    // Composer dock: balance + current chat cost
    // ---------------------------------------------------------------------
    function ComposerUsage(props) {
      const { t, sessionId } = props
      const usage = props.useProjection('tokenUsage')
      const model = pickModel(props.useProjection('modelSelection'))
      const workspaces = props.useWorkspaces((state) => state)
      const snap = useSnapshot()
      const panel = useAnchoredPanel('above', 380)
      React.useEffect(() => {
        api.ensureBalance()
        api.ensureSessions()
      }, [])

      const balance = snap.balance
      const workspace = findWorkspace(workspaces, sessionId)
      const project = workspace ? workspaceTotals(workspace, snap.sessions.byId) : undefined
      const entry = snap.sessions.byId[sessionId]
      const sessionAt = (entry && entry.updatedAt) || Date.now()
      React.useEffect(() => {
        if (!usage) return
        const known = ledgerCost(sessionId) !== undefined
        const changed = recordUsage(sessionId, model, usage, known ? Date.now() : sessionAt)
        if (changed) api.touchLedger()
      }, [usage, model, sessionId])
      const cost = ledgerCost(sessionId) ?? (usage ? costOf(usage, model, sessionAt) : 0)
      const balanceLabel = balanceText(balance, t)
      const sessionLabel = usage
        ? t('pill.session', { cost: formatCost(cost) })
        : '—'

      return h(React.Fragment, null,
        h('span', { className: 'uc_root', 'data-composer-stat': 'usage-cost' },
          h('button', {
            ref: panel.anchorRef,
            type: 'button',
            className: 'uc_pill',
            'aria-expanded': panel.pos !== null,
            'aria-label': t('pill.balance', { value: balanceLabel }) + ' · ' + sessionLabel,
            title: t('details.title'),
            onClick: panel.toggle,
          },
          h(CoinIcon),
          h('span', null, t('pill.balance', { value: balanceLabel })),
          h('span', { className: 'uc_sep', 'aria-hidden': true }, '·'),
          h(TrendIcon),
          h('span', null, sessionLabel))),
        h(FloatingPanel, { t, panelRef: panel.panelRef, pos: panel.pos },
          h(UsagePanel, {
            t,
            balance,
            sessionCost: ledgerCost(sessionId) ?? (usage ? costOf(usage, model, sessionAt) : undefined),
            sessionModel: model,
            sessionAt,
            workspaceTotals: project,
            refreshing: balance.loading || snap.sessions.loading,
            onRefresh: () => { api.refreshAll(true) },
          })))
    }

    // ---------------------------------------------------------------------
    // Sidebar Session-row hover: this chat and its project
    // ---------------------------------------------------------------------
    function SessionUsageHover(props) {
      const { t, sessionId } = props
      const workspaces = props.useWorkspaces((state) => state)
      const snap = useSnapshot()
      React.useEffect(() => {
        api.ensureSessions()
      }, [])

      const entry = snap.sessions.byId[sessionId]
      const workspace = findWorkspace(workspaces, sessionId, entry && entry.cwd)
      const project = workspace ? workspaceTotals(workspace, snap.sessions.byId) : undefined
      const sessionUsage = entry && entry.usage
      const loading = snap.sessions.phase === 'idle' || snap.sessions.loading

      if (!entry && !workspace && !loading) return null
      const sessionValue = sessionUsage
        ? formatCost(ledgerCost(entry.sessionId) ?? costOf(sessionUsage, entry.model, entry.updatedAt))
        : (loading ? t('hover.loading') : undefined)
      const projectValue = project && project.sessions > 0
        ? formatCost(project.cost)
        : (loading ? t('hover.loading') : undefined)
      if (sessionValue === undefined && projectValue === undefined) return null

      const rows = []
      if (projectValue !== undefined) {
        rows.push(h('div', { className: 'uc_hoverRow', key: 'project' },
          h('span', { className: 'uc_hoverKey' }, t('hover.project')),
          h('span', { className: 'uc_hoverValue', 'data-usage-cost': 'project' }, projectValue)))
      }
      if (sessionValue !== undefined) {
        rows.push(h('div', { className: 'uc_hoverRow', key: 'session' },
          h('span', { className: 'uc_hoverKey' }, t('hover.session')),
          h('span', { className: 'uc_hoverValue', 'data-usage-cost': 'session' }, sessionValue)))
      }
      return h('div', { className: 'uc_hover' }, rows)
    }

    // ---------------------------------------------------------------------
    // Right-sidebar Files header: hover the chip for the project total
    // ---------------------------------------------------------------------
    function FilesUsageChip(props) {
      const { t, sessionId } = props
      const workspaces = props.useWorkspaces((state) => state)
      const snap = useSnapshot()
      const panel = useAnchoredPanel('below', 320)
      React.useEffect(() => {
        api.ensureSessions()
      }, [])

      const entry = snap.sessions.byId[sessionId]
      const workspace = findWorkspace(workspaces, sessionId, entry && entry.cwd)
      if (!workspace) return null
      const project = workspaceTotals(workspace, snap.sessions.byId)
      const cost = formatCost(project.cost)
      const label = t('files.label', { cost })
      const title = t('files.title', { cost })

      return h(React.Fragment, null,
        h('span', { className: 'uc_anchor' },
          h('button', {
            ref: panel.anchorRef,
            type: 'button',
            className: 'uc_filesChip',
            title,
            'aria-label': title,
            'aria-expanded': panel.pos !== null,
            onClick: panel.toggle,
          },
          h(TrendIcon),
          h('span', null, label))),
        h(FloatingPanel, { t, panelRef: panel.panelRef, pos: panel.pos },
          h(UsagePanel, {
            t,
            balance: snap.balance,
            sessionCost: entry
              ? (ledgerCost(entry.sessionId) ?? (entry.usage ? costOf(entry.usage, entry.model, entry.updatedAt) : undefined))
              : undefined,
            sessionModel: entry && entry.model,
            sessionAt: entry && entry.updatedAt,
            workspaceTotals: project,
            refreshing: snap.sessions.loading || snap.balance.loading,
            onRefresh: () => { api.refreshAll(true) },
          })))
    }

    // ---------------------------------------------------------------------
    // Left-sidebar Workspace rows have no plugin seat. Hit-test the row
    // attribute the workspace browser already publishes and float one cost
    // line beside it; nothing inside the sidebar is created or changed.
    // ---------------------------------------------------------------------
    function WorkspaceCostTip(props) {
      const { t } = props
      const workspaces = props.useWorkspaces((state) => state)
      const snap = useSnapshot()
      const [tip, setTip] = React.useState(null)
      React.useEffect(() => {
        api.ensureSessions()
      }, [])
      React.useEffect(() => {
        if (typeof document === 'undefined') return undefined
        let frame = 0
        let lastX = 0
        let lastY = 0
        const clear = () => setTip((current) => (current === null ? current : null))
        const place = () => {
          frame = 0
          if (typeof document.elementFromPoint !== 'function') return
          const element = document.elementFromPoint(lastX, lastY)
          const row = element instanceof Element ? element.closest('[data-row-key^="workspace:"]') : null
          if (!row) {
            clear()
            return
          }
          const key = row.getAttribute('data-row-key') || ''
          const workspaceId = key.slice('workspace:'.length)
          if (workspaceId === '') {
            clear()
            return
          }
          const rect = row.getBoundingClientRect()
          const left = Math.max(8, Math.min(rect.left + 24, window.innerWidth - 188))
          const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 44))
          setTip((current) => (
            current !== null
              && current.workspaceId === workspaceId
              && Math.abs(current.left - left) < 1
              && Math.abs(current.top - top) < 1
              ? current
              : { workspaceId, left, top }
          ))
        }
        const move = (event) => {
          lastX = event.clientX
          lastY = event.clientY
          if (frame !== 0) return
          frame = requestAnimationFrame(place)
        }
        document.addEventListener('pointermove', move, { passive: true })
        document.addEventListener('pointerdown', clear, true)
        window.addEventListener('scroll', clear, true)
        return () => {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerdown', clear, true)
          window.removeEventListener('scroll', clear, true)
          if (frame !== 0) cancelAnimationFrame(frame)
        }
      }, [])

      const items = workspaces && Array.isArray(workspaces.items) ? workspaces.items : []
      const workspace = tip === null ? undefined : items.find((item) => item.workspaceId === tip.workspaceId)
      if (tip === null || workspace === undefined) return null
      const project = workspaceTotals(workspace, snap.sessions.byId)
      return h('div', {
        className: 'uc_wsTip',
        style: { left: tip.left + 'px', top: tip.top + 'px' },
        role: 'tooltip',
      },
      h('span', { className: 'uc_wsTipLabel' }, t('hover.project')),
      h('span', { className: 'uc_wsTipValue' }, formatCost(project.cost)))
    }

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------
    function apply(ctx) {
      runtime.ctx = ctx
      runtime.remote = ctx.remote
        || (typeof ctx.get === 'function' ? ctx.get('remote') : null)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-cost: dictionaries')

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const tag = document.createElement('style')
        tag.dataset.plugin = '@local/dsh-usage-cost'
        tag.dataset.pluginCss = '@local/dsh-usage-cost/usage-cost.css'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'usage-cost: styles')

      ctx.effect(() => {
        if (typeof window === 'undefined') return () => {}
        const flush = () => persistLedger()
        window.addEventListener('beforeunload', flush)
        return () => {
          window.removeEventListener('beforeunload', flush)
          if (ledgerTimer !== null) {
            clearTimeout(ledgerTimer)
            ledgerTimer = null
          }
          persistLedger()
        }
      }, 'usage-cost: ledger persistence')

      ctx.effect(() => {
        api.refreshAll(true)
        const timer = setInterval(() => {
          api.refreshAll(false)
        }, POLL_MS)
        return () => clearInterval(timer)
      }, 'usage-cost: polling')

      ctx.effect(() => ctx.on('connection/reset', () => {
        api.refreshAll(true)
      }), 'usage-cost: reconnect refresh')

      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'usage-cost',
        order: 2,
        locale: NS,
      }, ComposerUsage))

      ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
        name: 'sidebar.session.row.hover',
        id: 'usage-cost',
        order: 20,
        locale: NS,
      }, SessionUsageHover))

      ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.files.actions',
        id: 'usage-cost',
        order: 5,
        locale: NS,
      }, FilesUsageChip))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'usage-cost.workspace-tip',
        order: 40,
        locale: NS,
      }, WorkspaceCostTip))
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account', 'remote.session'],
      apply,
    }
  },
})
