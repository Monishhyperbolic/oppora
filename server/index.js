import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pathToFileURL } from 'node:url'
import { decode as decodeToon } from '@toon-format/toon'

const app = express()
app.use(cors())

const campaignDirectory = [
  ['Monish spiritual Uk', 15530, 'active'],
  ['Monish -Uk- heritage', 15510, 'active'],
  ['monish - california - Google map leads', 14625, 'active'],
  ['Monish-spiritual living', 14115, 'active'],
  ['Monish-heritage living', 14013, 'active'],
  ['Rayyan - Alabama, USA - Spiritual Living', 13254, 'paused'],
  ['Rayyan - Texas, USA - Spiritual Living', 12793, 'paused'],
  ['Rayyan - Texas, USA - Heritage Living', 12782, 'paused'],
  ['Rayyan - Alabama, USA - Heritage Living', 12766, 'paused'],
]

const sample = {
  source: 'Preview data from your 18 Nov 2026 daily report',
  updatedAt: '2026-11-18T07:47:00+05:30',
  totals: { sent: 400, opened: 96, clicked: 0, replied: 5, interested: 0, bounced: 1, unsubscribed: 2, campaigns: 9, active: 5, leads: 0, connections: 0 },
  campaigns: [
    ['Monish spiritual Uk', 15530, 'active', 0, 0, 0, 0, 0, 0],
    ['Monish -Uk- heritage', 15510, 'active', 40, 1, 0, 1, 0, 0],
    ['monish - california - Google map leads', 14625, 'active', 15, 6, 0, 0, 0, 1],
    ['Monish-spiritual living', 14115, 'active', 7, 3, 0, 0, 0, 0],
    ['Monish-heritage living', 14013, 'active', 31, 6, 0, 0, 0, 0],
    ['Rayyan - Alabama, USA - Spiritual Living', 13254, 'paused', 24, 6, 0, 0, 0, 1],
    ['Rayyan - Texas, USA - Spiritual Living', 12793, 'paused', 33, 4, 0, 0, 0, 1],
    ['Rayyan - Texas, USA - Heritage Living', 12782, 'paused', 128, 40, 0, 3, 0, 0],
    ['Rayyan - Alabama, USA - Heritage Living', 12766, 'paused', 122, 30, 0, 1, 1, 0],
  ].map(([name, id, status, sent, opened, clicked, replied, bounced, unsubscribed]) => ({ name, id, status, sent, opened, clicked, replied, bounced, unsubscribed, emailsSentYesterday: null })),
  mailboxes: [
    ['reach@weaveandweavers.com', true, true, 30, 0, false], ['wholesale@weaveandweavers.com', true, true, 30, 0, false],
    ['exports@weaveandweavers.com', true, true, 30, 0, false], ['hello@weaveandweavers.com', true, true, 40, 40, false],
  ].map(([email, connected, warmup, dailyLimit, dailySent, paused]) => ({ email, connected, warmup, dailyLimit, dailySent, emailsSentYesterday: dailySent, paused, warmupReport: email === 'reach@weaveandweavers.com' ? { healthScore: 97, risk: 'Excellent · low risk', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', blacklists: 'Clean · 2 checked', sent: 448, inbox: 427, replied: 128, rescued: 18, deliverability: 95, strategy: 'Progressive', day: 33, totalDays: 45 } : null })),
  funnel: { contacted: 400, opened: 96, replied: 5, interested: 0, opportunities: 0, won: 0, lost: 0 },
  daily: Array.from({ length: 30 }, (_, index) => {
    const date = new Date(2026, 9, 20 + index)
    const sent = index === 29 ? 0 : 38 + ((index * 17) % 55)
    const opened = sent ? Math.round(sent * (0.22 + (index % 4) * 0.025)) : 0
    const replied = sent ? (index % 9 === 0 ? 2 : index % 5 === 0 ? 1 : 0) : 0
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sent,
      opened,
      replied,
    }
  }),
  replyOutcomes: { interested: 0, notInterested: 0, outOfOffice: 0, wrongPerson: 0, other: 5 },
}

async function mcpCall(name, args = {}) {
  const key = process.env.OPPORA_API_KEY
  if (!key) throw new Error('Missing OPPORA_API_KEY')
  const response = await fetch('https://api.oppora.ai/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  })
  if (!response.ok) throw new Error(`Oppora API returned ${response.status}`)
  const body = await response.text()
  const json = parseRpcResponse(body)
  if (json.error) throw new Error(json.error.message)
  const content = json.result?.content || []
  const text = content.map((item) => item.text || '').join('\n')
  try { return JSON.parse(text) } catch {}
  try { return decodeToon(text) } catch {}
  return json.result?.structuredContent || {}
}

function parseRpcResponse(body) {
  const candidates = [body.trim()]

  for (const block of body.split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => /^data:/i.test(line.trim()))
      .map((line) => line.trim().replace(/^data:\s*/i, ''))
    if (dataLines.length) candidates.push(dataLines.join('\n'))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }

  throw new Error('Oppora API returned an invalid MCP response')
}

function number(obj, ...keys) { for (const key of keys) if (Number.isFinite(Number(obj?.[key]))) return Number(obj[key]); return 0 }
function list(obj, ...keys) { for (const key of keys) if (Array.isArray(obj?.[key])) return obj[key]; return [] }

function mailboxEmail(mailbox) {
  if (!mailbox || typeof mailbox !== 'object') return ''
  const value = mailbox.email || mailbox.email_address || mailbox.emailAddress || mailbox.address ||
    mailbox.sender_email || mailbox.senderEmail || mailbox.from_email || mailbox.fromEmail ||
    mailbox.sender_address || mailbox.senderAddress || mailbox.mailbox_email || mailbox.mailboxEmail ||
    mailbox.account_email || mailbox.accountEmail || mailbox.sender || mailbox.account || mailbox.mailbox
  return typeof value === 'string' ? value : value?.email || value?.email_address || value?.emailAddress ||
    value?.address || value?.sender_email || value?.from_email || ''
}

function collectMailboxRows(value, rows = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return rows
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => collectMailboxRows(item, rows, seen))
    return rows
  }
  if (mailboxEmail(value)) rows.push(value)
  for (const child of Object.values(value)) collectMailboxRows(child, rows, seen)
  return rows
}

function nestedNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return 0
  for (const key of keys) {
    const value = obj[key]
    if (Number.isFinite(Number(value))) return Number(value)
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const nested = nestedNumber(value, keys)
      if (nested) return nested
    }
  }
  return 0
}

function nestedNumberOrNull(obj, keys, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return null
  seen.add(obj)
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && Number.isFinite(Number(obj[key]))) {
      return Number(obj[key])
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const nested = nestedNumberOrNull(value, keys, seen)
      if (nested !== null) return nested
    }
  }
  return null
}

function senderEmail(sender) {
  if (!sender || typeof sender !== 'object') return ''
  return mailboxEmail(sender) ||
    (typeof sender.mailbox === 'string' ? sender.mailbox : mailboxEmail(sender.mailbox))
}

function senderId(sender) {
  if (!sender || typeof sender !== 'object') return ''
  const value = sender.id ?? sender.mailbox_id ?? sender.mailboxId ?? sender.email_account_id ?? sender.emailAccountId ??
    sender.account_id ?? sender.accountId ?? sender.sender_id ?? sender.senderId
  return value == null ? '' : String(value)
}

function collectSenderSentRows(value, rows = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return rows
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => collectSenderSentRows(item, rows, seen))
    return rows
  }
  const email = senderEmail(value)
  const id = senderId(value)
  if (email || id) {
    const sent = nestedNumberOrNull(value, [
      'sent', 'emails_sent', 'total_sent', 'send_count', 'emailsSent', 'email_sent',
      'totalEmailsSent', 'sent_count', 'emailsSentCount',
    ])
    if (sent !== null) rows.push({ email, id, sent })
  }
  for (const child of Object.values(value)) collectSenderSentRows(child, rows, seen)
  return rows
}

function collectMailboxReferences(value, rows = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return rows
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item) => collectMailboxReferences(item, rows, seen))
    return rows
  }
  const email = senderEmail(value)
  const id = senderId(value)
  if (email || id) {
    const duplicate = rows.find((row) => (email && row.email === email) || (id && row.id === id))
    if (!duplicate) rows.push({ email, id })
  }
  for (const child of Object.values(value)) collectMailboxReferences(child, rows, seen)
  return rows
}

function normalize(raw) {
  const dashboard = raw.dashboard || {}, campaignAnalytics = raw.campaignAnalytics || {}, funnel = raw.funnel || {}, health = raw.health || {}
  const yesterdayByMailbox = raw.yesterdayByMailbox || { byEmail: {}, byId: {} }
  const rawCampaigns = list(campaignAnalytics, 'campaigns', 'data', 'items').length
    ? list(campaignAnalytics, 'campaigns', 'data', 'items')
    : list(dashboard, 'top_campaigns')
  const yesterdayByCampaign = raw.yesterdayByCampaign || {}
  const campaignReports = raw.campaignReports || {}
  const campaignsById = new Map(rawCampaigns.map((c) => {
    const id = c.id || c.campaign_id
    return [String(id), c]
  }).filter(([id]) => id && id !== 'undefined'))
  const campaigns = campaignDirectory.map(([directoryName, id, directoryStatus]) => {
    const c = campaignsById.get(String(id)) || {}
    const report = campaignReports[String(id)] || {}
    return {
      name: c.name || c.campaign_name || directoryName,
      id,
      status: c.status || directoryStatus,
      sent: number(c, 'sent', 'emails_sent', 'total_sent') || reportSent(report),
      opened: number(c, 'opened', 'emails_opened', 'total_opened') || reportMetric(report, 'opened', 'emails_opened', 'total_opened'),
      clicked: number(c, 'clicked', 'emails_clicked', 'total_clicked') || reportMetric(report, 'clicked', 'emails_clicked', 'total_clicked'),
      replied: number(c, 'replied', 'replies', 'total_replied') || reportMetric(report, 'replied', 'replies', 'total_replied'),
      bounced: number(c, 'bounced', 'total_bounced') || reportMetric(report, 'bounced', 'emails_bounced', 'total_bounced'),
      unsubscribed: number(c, 'unsubscribed', 'total_unsubscribed') || reportMetric(report, 'unsubscribed', 'emails_unsubscribed', 'total_unsubscribed'),
      emailsSentYesterday: yesterdayByCampaign[id],
    }
  })
  const overview = dashboard.overview || {}
  const emailMetrics = dashboard.email_metrics || {}
  const linkedin = dashboard.linkedin || {}
  const funnelRows = funnel.funnel || {}
  const totals = { sent: number(emailMetrics, 'total_sent', 'sent', 'emails_sent'), opened: number(emailMetrics, 'total_opened', 'opened', 'emails_opened'), clicked: number(emailMetrics, 'total_clicked', 'clicked', 'emails_clicked'), replied: number(emailMetrics, 'total_replied', 'replied', 'replies'), interested: number(emailMetrics, 'total_interested', 'interested'), bounced: number(emailMetrics, 'total_bounced', 'bounced'), unsubscribed: number(emailMetrics, 'total_unsubscribed', 'unsubscribed'), campaigns: number(overview, 'total_campaigns', 'campaigns') || campaigns.length, active: campaigns.filter((campaign) => campaign.status === 'active').length, leads: number(overview, 'total_leads', 'leads'), connections: number(linkedin, 'total_connected', 'linkedin_connections', 'connections') }
  const mailboxRows = collectMailboxRows(health)
  const mailboxes = mailboxRows.filter((mailbox, index, rows) => mailbox && rows.findIndex((row) => mailboxEmail(row) === mailboxEmail(mailbox)) === index).map((mailbox) => {
    const warmupValue = mailbox.warmup_enabled ?? mailbox.warmupEnabled ?? mailbox.is_warmup_enabled ??
      (typeof mailbox.warmup === 'object' ? (mailbox.warmup.enabled ?? mailbox.warmup.active ?? mailbox.warmup.status) : mailbox.warmup) ??
      mailbox.warm_up_enabled ?? mailbox.warmup_status
    const warmupEnabled = warmupValue === true || warmupValue === 1 || warmupValue === 'true' ||
      warmupValue === 'enabled' || warmupValue === 'active'
    const dailyLimit = mailbox.daily_limit ?? mailbox.dailyLimit ?? mailbox.daily_send_limit ??
      mailbox.dailySendingLimit ?? mailbox.daily_sending_limit ?? mailbox.dailyCapacity ??
      mailbox.sending_limit ?? mailbox.limit
    const sentYesterday = mailbox.emails_sent_yesterday ?? mailbox.emailsSentYesterday ??
      mailbox.daily_sent_yesterday ?? mailbox.dailySentYesterday ?? mailbox.sent_yesterday ??
      mailbox.sentYesterday ?? mailbox.yesterday_sent ?? mailbox.yesterdaySent ??
      nestedNumberOrNull(mailbox, ['emails_sent_yesterday', 'emailsSentYesterday', 'daily_sent_yesterday', 'dailySentYesterday', 'sent_yesterday', 'sentYesterday', 'yesterday_sent', 'yesterdaySent'])
    const emailKey = mailboxEmail(mailbox).trim().toLowerCase()
    const mailboxId = senderId(mailbox)
    const campaignSentYesterday = Object.prototype.hasOwnProperty.call(yesterdayByMailbox.byEmail, emailKey)
      ? yesterdayByMailbox.byEmail[emailKey]
      : Object.prototype.hasOwnProperty.call(yesterdayByMailbox.byId, mailboxId)
        ? yesterdayByMailbox.byId[mailboxId]
        : undefined
    const attributedSentYesterday = campaignSentYesterday !== undefined ? campaignSentYesterday : sentYesterday
    const sentToday = mailbox.daily_sent ?? mailbox.dailySent ?? mailbox.emails_sent_today ??
      mailbox.emailsSentToday ?? mailbox.sent_today ?? mailbox.sentToday ??
      nestedNumber(mailbox, ['emails_sent_today', 'emailsSentToday', 'daily_sent', 'dailySent', 'sent_today', 'sentToday'])
    const report = mailbox.warmup_report || mailbox.warmupReport || mailbox.health_report ||
      mailbox.healthReport || mailbox.health || null
    return ({
    ...mailbox,
    email: mailboxEmail(mailbox),
    dailyLimit,
    dailySent: sentToday,
    emailsSentYesterday: attributedSentYesterday,
    dailySentYesterday: attributedSentYesterday,
    paused: mailbox.sending_paused ?? mailbox.paused ?? mailbox.is_paused,
    warmup: warmupEnabled,
    warmupEnabled,
    warmupCount: number(mailbox, 'warmup_count', 'warmupCount', 'warmup_emails'),
    dailyUsagePct: mailbox.daily_usage_pct ?? mailbox.dailyUsagePct ?? (Number(dailyLimit) ? Math.round(Number(sentYesterday) / Number(dailyLimit) * 100) : 0),
    warmupReport: report,
  })})
  const warmupEnabledCount = mailboxes.filter((mailbox) => mailbox.warmupEnabled).length
  return { source: 'Live Oppora API', updatedAt: new Date().toISOString(), totals, campaigns, mailboxes, senderAttribution: yesterdayByMailbox, warmup: { enabled: warmupEnabledCount, disabled: Math.max(mailboxes.length - warmupEnabledCount, 0), total: mailboxes.length }, funnel: { contacted: number(funnelRows, 'open', 'contacted', 'total_contacted'), opened: number(funnelRows, 'opened'), replied: number(funnelRows, 'in_progress', 'replied'), interested: number(funnelRows, 'interested'), opportunities: number(funnelRows, 'in_progress', 'opportunities'), won: number(funnelRows, 'won'), lost: number(funnelRows, 'lost') }, daily: list(campaignAnalytics, 'daily', 'daily_volume', 'daily_activity'), replyOutcomes: campaignAnalytics.reply_outcomes || campaignAnalytics.replyOutcomes || {} }
}

function reportSent(report) {
  const candidates = [report?.funnel, report?.summary, report?.totals, report?.analytics, report?.stats, report]
  for (const item of candidates) {
    const value = number(item, 'sent', 'emails_sent', 'total_sent')
    if (value) return value
  }
  return 0
}

function previousCalendarDay() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function rangeDates(range) {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  if (range === 'Last 7 days') start.setUTCDate(start.getUTCDate() - 6)
  else if (range === 'Last 30 days') start.setUTCDate(start.getUTCDate() - 29)
  const iso = (date) => date.toISOString().slice(0, 10)
  return {
    start: range === 'All time' ? '2024-01-01' : iso(start),
    end: iso(end),
  }
}

function reportMetric(report, ...keys) {
  const candidates = [report?.funnel, report?.summary, report?.totals, report?.analytics, report?.stats, report]
  for (const item of candidates) {
    const value = number(item, ...keys)
    if (value) return value
  }
  return 0
}

function reportSeries(report) {
  const rows = []
  const seen = new Set()
  const toIsoDate = (value) => {
    const text = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
  }
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const dateValue = value.date || value.day || value.created_at || value.report_date || value.reported_date ||
      value.timestamp || value.start_date || value.activity_date || value.record_date || value.date_key ||
      value.reportDate || value.activityDate
    if (dateValue) {
      const isoDate = toIsoDate(dateValue)
      if (isoDate && !seen.has(isoDate)) {
        seen.add(isoDate)
        const candidates = [value, value.funnel, value.summary, value.totals, value.analytics, value.stats]
        for (const nested of Object.values(value)) {
          if (nested && typeof nested === 'object') candidates.push(nested)
        }
        const metric = (...keys) => {
          for (const candidate of candidates) {
            const result = number(candidate, ...keys)
            if (result) return result
          }
          return 0
        }
        rows.push({
          date: isoDate,
          sent: metric('sent', 'emails_sent', 'total_sent', 'send_count', 'emailsSent', 'email_sent', 'totalEmailsSent', 'sent_count', 'emailsSentCount'),
          opened: metric('opened', 'emails_opened', 'total_opened', 'open_count', 'emailsOpened', 'totalEmailsOpened', 'unique_opens', 'unique_opened'),
          replied: metric('replied', 'replies', 'total_replied', 'reply_count', 'emailsReplied', 'totalReplies', 'replies_count'),
          clicked: metric('clicked', 'emails_clicked', 'total_clicked', 'click_count', 'clicks', 'emailsClicked', 'click_count'),
          bounced: metric('bounced', 'emails_bounced', 'total_bounced', 'bounce_count', 'bounces', 'email_bounced'),
          unsubscribed: metric('unsubscribed', 'emails_unsubscribed', 'total_unsubscribed', 'unsubscribe_count', 'unsubscribes'),
          interested: metric('interested', 'total_interested', 'positive_replies', 'interested_replies'),
        })
      }
    }
    // If this object represents a dated row, its metrics are already captured above.
    // Do not recurse through the row again, which can add the same date twice.
    if (!dateValue) {
      for (const child of Object.values(value)) visit(child)
    }
  }
  visit(report)
  return rows
}

async function dashboardHandler(req, res) {
  if (!process.env.OPPORA_API_KEY) {
    const range = req.query.range || 'Last 7 days'
    const days = range === 'Last 7 days' ? 7 : range === 'Last 30 days' ? 30 : sample.daily.length
    return res.json({ ...sample, daily: sample.daily.slice(-days), mode: 'preview', range })
  }
  try {
    const range = req.query.range || 'Last 7 days'
    const dates = rangeDates(range)
    const [dashboard, campaignAnalytics, funnel, health, campaignList] = await Promise.all([
      mcpCall('get_dashboard_analytics'),
      mcpCall('get_campaign_analytics'),
      mcpCall('get_pipeline_funnel'),
      mcpCall('get_email_account_health'),
      mcpCall('list_campaigns').catch(() => null),
    ])
    const campaignRowsById = new Map()
    for (const campaign of [
      ...list(campaignList, 'campaigns', 'data', 'items'),
      ...list(campaignAnalytics, 'campaigns', 'data', 'items'),
      ...list(dashboard, 'top_campaigns'),
    ]) {
      const id = campaign.id || campaign.campaign_id
      if (id) campaignRowsById.set(String(id), campaign)
    }
    const campaignRows = [...campaignRowsById.values()]
    const reports = await Promise.all(campaignRows.map(async (campaign) => {
      const id = campaign.id || campaign.campaign_id
      if (!id) return [id, null, [], null, null]
      try {
        const report = await mcpCall('get_campaign_report', {
          campaign_id: id,
          start_date: range === 'All time' ? dates.start : dates.start,
          end_date: dates.end,
        })
        const yesterday = previousCalendarDay()
        const yesterdayReport = await mcpCall('get_campaign_report', {
          campaign_id: id,
          start_date: yesterday,
          end_date: yesterday,
        }).catch(() => null)
        const yesterdaySeries = reportSeries(yesterdayReport)
        const yesterdayRow = yesterdaySeries.find((row) => row.date === yesterday)
        const mailboxReferences = collectMailboxReferences({ campaign, report, yesterdayReport })
        return [id, reportSent(report), reportSeries(report), report, yesterdayRow?.sent ?? reportSent(yesterdayReport), collectSenderSentRows(yesterdayReport), mailboxReferences]
      } catch { return [id, null, [], null, null, [], []] }
    }))
    const yesterdayByCampaign = Object.fromEntries(reports.map(([id, , , , yesterdaySent]) => [id, yesterdaySent]))
    const yesterdayByMailbox = { byEmail: {}, byId: {} }
    for (const [, , , , , senderRows] of reports) {
      for (const sender of senderRows || []) {
        if (sender.email) {
          const email = sender.email.trim().toLowerCase()
          yesterdayByMailbox.byEmail[email] = (yesterdayByMailbox.byEmail[email] || 0) + sender.sent
        }
        if (sender.id) {
          yesterdayByMailbox.byId[sender.id] = (yesterdayByMailbox.byId[sender.id] || 0) + sender.sent
        }
      }
    }
    for (const [id, , , , yesterdaySent, , mailboxReferences] of reports) {
      if (!yesterdaySent) continue
      const references = (mailboxReferences || []).filter((reference) => reference.email || reference.id)
      if (references.length !== 1) continue
      const reference = references[0]
      if (reference.email) {
        const email = reference.email.trim().toLowerCase()
        if (!Object.prototype.hasOwnProperty.call(yesterdayByMailbox.byEmail, email)) {
          yesterdayByMailbox.byEmail[email] = Number(yesterdaySent) || 0
        }
      } else if (reference.id) {
        if (!Object.prototype.hasOwnProperty.call(yesterdayByMailbox.byId, reference.id)) {
          yesterdayByMailbox.byId[reference.id] = Number(yesterdaySent) || 0
        }
      }
    }
    const campaignReports = Object.fromEntries(reports.filter(([, , , report]) => report).map(([id, , , report]) => [String(id), report]))
    const dailyByDate = new Map()
    for (const [, , series] of reports) {
      for (const row of series) {
        const current = dailyByDate.get(row.date) || { date: row.date, sent: 0, opened: 0, replied: 0, clicked: 0, bounced: 0, unsubscribed: 0, interested: 0 }
        current.sent += row.sent
        current.opened += row.opened
        current.replied += row.replied
        current.clicked += row.clicked
        current.bounced += row.bounced
        current.unsubscribed += row.unsubscribed
        current.interested += row.interested
        dailyByDate.set(row.date, current)
      }
    }
    if (!dailyByDate.size) {
      for (const row of reportSeries(campaignAnalytics)) {
        const current = dailyByDate.get(row.date) || { date: row.date, sent: 0, opened: 0, replied: 0, clicked: 0, bounced: 0, unsubscribed: 0, interested: 0 }
        current.sent += row.sent
        current.opened += row.opened
        current.replied += row.replied
        current.clicked += row.clicked
        current.bounced += row.bounced
        current.unsubscribed += row.unsubscribed
        current.interested += row.interested
        dailyByDate.set(row.date, current)
      }
    }
    if (!dailyByDate.size) {
      for (const row of reportSeries(dashboard)) {
        const current = dailyByDate.get(row.date) || { date: row.date, sent: 0, opened: 0, replied: 0, clicked: 0, bounced: 0, unsubscribed: 0, interested: 0 }
        current.sent += row.sent
        current.opened += row.opened
        current.replied += row.replied
        current.clicked += row.clicked
        current.bounced += row.bounced
        current.unsubscribed += row.unsubscribed
        current.interested += row.interested
        dailyByDate.set(row.date, current)
      }
    }
    const normalized = normalize({ dashboard, campaignAnalytics, funnel, health, yesterdayByCampaign, yesterdayByMailbox, campaignReports })
    let formattedDaily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date))

    if (range !== 'All time') {
      const byDate = new Map(formattedDaily.map((row) => [String(row.date).slice(0, 10), row]))
      const complete = []
      const start = new Date(`${dates.start}T12:00:00Z`)
      const end = new Date(`${dates.end}T12:00:00Z`)
      for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        const iso = day.toISOString().slice(0, 10)
        const row = byDate.get(iso) || { date: iso, sent: 0, opened: 0, replied: 0 }
        complete.push({
          ...row,
          date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        })
      }
      formattedDaily = complete
    } else {
      formattedDaily = formattedDaily.map((row) => ({
        ...row,
        date: /^\d{4}-\d{2}-\d{2}/.test(row.date)
          ? new Date(`${row.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
          : row.date,
      }))
    }
    const senderSentYesterday = Object.values(yesterdayByCampaign).reduce((total, sent) => total + Number(sent || 0), 0)
    const senderSentToday = normalized.mailboxes.reduce((total, mailbox) => total + Number(mailbox.dailySent ?? mailbox.daily_sent ?? 0), 0)
    if (!formattedDaily.some((row) => Number(row.sent || 0) > 0)) {
      if (range !== 'All time') {
        const yesterday = previousCalendarDay()
        const today = new Date().toISOString().slice(0, 10)
        const yesterdayLabel = new Date(`${yesterday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        const todayLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
        for (const row of formattedDaily) {
          if (row.date === yesterdayLabel) row.sent = senderSentYesterday
          if (row.date === todayLabel) row.sent = senderSentToday
        }
      } else if (senderSentYesterday || senderSentToday) {
        formattedDaily = [
          { date: new Date(`${previousCalendarDay()}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), sent: senderSentYesterday, opened: 0, replied: 0 },
          { date: new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), sent: senderSentToday, opened: 0, replied: 0 },
        ]
      }
    }
    if (formattedDaily.length) normalized.daily = formattedDaily
    res.json({ ...normalized, senderSentYesterday, senderSentToday, mode: 'live', range })
  } catch (error) { res.status(502).json({ error: error.message }) }
}

app.get('/api/dashboard', dashboardHandler)

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) app.listen(process.env.PORT || 8787, () => console.log('Oppora API proxy listening on :8787'))

export default dashboardHandler
