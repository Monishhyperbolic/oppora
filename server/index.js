import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pathToFileURL } from 'node:url'
import { decode as decodeToon } from '@toon-format/toon'

const app = express()
app.use(cors())

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
  ].map(([email, connected, warmup, dailyLimit, dailySent, paused]) => ({ email, connected, warmup, dailyLimit, dailySent, paused, warmupReport: email === 'reach@weaveandweavers.com' ? { healthScore: 97, risk: 'Excellent · low risk', spf: 'Pass', dkim: 'Pass', dmarc: 'Pass', blacklists: 'Clean · 2 checked', sent: 448, inbox: 427, replied: 128, rescued: 18, deliverability: 95, strategy: 'Progressive', day: 33, totalDays: 45 } : null })),
  funnel: { contacted: 400, opened: 96, replied: 5, interested: 0, opportunities: 0, won: 0, lost: 0 },
  daily: [{ date: 'Nov 12', sent: 63, opened: 16, replied: 1 }, { date: 'Nov 13', sent: 72, opened: 18, replied: 0 }, { date: 'Nov 14', sent: 57, opened: 14, replied: 1 }, { date: 'Nov 15', sent: 44, opened: 11, replied: 0 }, { date: 'Nov 16', sent: 81, opened: 21, replied: 2 }, { date: 'Nov 17', sent: 83, opened: 16, replied: 1 }, { date: 'Nov 18', sent: 0, opened: 0, replied: 0 }],
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
function normalize(raw) {
  const dashboard = raw.dashboard || {}, campaignAnalytics = raw.campaignAnalytics || {}, funnel = raw.funnel || {}, health = raw.health || {}
  const rawCampaigns = list(campaignAnalytics, 'campaigns', 'data', 'items')
  const yesterdayByCampaign = raw.yesterdayByCampaign || {}
  const campaigns = rawCampaigns.map((c) => {
    const id = c.id || c.campaign_id
    return { name: c.name || c.campaign_name || 'Untitled campaign', id, status: c.status || 'unknown', sent: number(c, 'sent', 'emails_sent'), opened: number(c, 'opened', 'emails_opened'), clicked: number(c, 'clicked', 'emails_clicked'), replied: number(c, 'replied', 'replies'), bounced: number(c, 'bounced'), unsubscribed: number(c, 'unsubscribed'), emailsSentYesterday: yesterdayByCampaign[id] }
  })
  const totals = { sent: number(dashboard, 'sent', 'emails_sent'), opened: number(dashboard, 'opened', 'emails_opened'), clicked: number(dashboard, 'clicked', 'emails_clicked'), replied: number(dashboard, 'replied', 'replies'), interested: number(dashboard, 'interested'), bounced: number(dashboard, 'bounced'), unsubscribed: number(dashboard, 'unsubscribed'), campaigns: number(dashboard, 'campaigns', 'total_campaigns') || campaigns.length, active: number(dashboard, 'active_campaigns'), leads: number(dashboard, 'leads', 'total_leads'), connections: number(dashboard, 'linkedin_connections', 'connections') }
  const mailboxes = list(health, 'accounts', 'mailboxes', 'data').map((mailbox) => ({
    ...mailbox,
    warmupReport: mailbox.warmup_report || mailbox.warmupReport || mailbox.health_report || mailbox.health || null,
  }))
  return { source: 'Live Oppora API', updatedAt: new Date().toISOString(), totals, campaigns, mailboxes, funnel: { contacted: number(funnel, 'contacted', 'total_contacted'), opened: number(funnel, 'opened'), replied: number(funnel, 'replied'), interested: number(funnel, 'interested'), opportunities: number(funnel, 'opportunities'), won: number(funnel, 'won'), lost: number(funnel, 'lost') }, daily: list(campaignAnalytics, 'daily', 'daily_volume', 'daily_activity'), replyOutcomes: campaignAnalytics.reply_outcomes || campaignAnalytics.replyOutcomes || {} }
}

function reportSent(report) {
  const candidates = [report, report?.summary, report?.totals, report?.analytics, report?.stats]
  for (const item of candidates) {
    const value = number(item, 'sent', 'emails_sent', 'total_sent')
    if (value) return value
  }
  return 0
}

function previousCalendarDay() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function dashboardHandler(_req, res) {
  if (!process.env.OPPORA_API_KEY) return res.json({ ...sample, mode: 'preview' })
  try {
    const [dashboard, campaignAnalytics, funnel, health] = await Promise.all([
      mcpCall('get_dashboard_analytics'), mcpCall('get_campaign_analytics'), mcpCall('get_pipeline_funnel'), mcpCall('get_email_account_health'),
    ])
    const campaignRows = list(campaignAnalytics, 'campaigns', 'data', 'items')
    const day = previousCalendarDay()
    const reports = await Promise.all(campaignRows.map(async (campaign) => {
      const id = campaign.id || campaign.campaign_id
      if (!id) return [id, null]
      try { return [id, reportSent(await mcpCall('get_campaign_report', { campaign_id: id, start_date: day, end_date: day }))] } catch { return [id, null] }
    }))
    res.json({ ...normalize({ dashboard, campaignAnalytics, funnel, health, yesterdayByCampaign: Object.fromEntries(reports) }), mode: 'live' })
  } catch (error) { res.status(502).json({ error: error.message }) }
}

app.get('/api/dashboard', dashboardHandler)

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) app.listen(process.env.PORT || 8787, () => console.log('Oppora API proxy listening on :8787'))

export default dashboardHandler
