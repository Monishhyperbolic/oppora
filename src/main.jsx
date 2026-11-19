import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FileImage, FileText, LoaderCircle, RefreshCw, Send, Sparkles, TrendingUp, Users } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import './styles.css'

const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—'
const count = (n) => new Intl.NumberFormat('en-IN').format(Number(n || 0))
const colors = ['#6d5dfc', '#58d8b2', '#ffb86a', '#fb6c7e', '#93a8ff']

function Metric({ icon: Icon, label, value, detail, color = 'violet' }) {
  return <section className="metric"><div className={`metric-icon ${color}`}><Icon size={18} /></div><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></section>
}

function App() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [exporting, setExporting] = useState(false)
  const [range, setRange] = useState('Last 7 days')
  const dashboard = useRef(null)
  const load = async (selectedRange = range) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/dashboard?range=${encodeURIComponent(selectedRange)}`)
      const text = await res.text()
      let body
      try { body = JSON.parse(text) } catch { throw new Error(`Could not parse dashboard response (${res.status})`) }
      if (!res.ok) throw new Error(body.error || 'Could not load Oppora data')
      setData(body)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load('Last 7 days') }, [])
  const rates = useMemo(() => data ? { open: pct(data.totals.opened, data.totals.sent), reply: pct(data.totals.replied, data.totals.sent), bounce: pct(data.totals.bounced, data.totals.sent), interest: pct(data.totals.interested, data.totals.replied) } : {}, [data])
  const exportDashboard = async (kind) => {
    if (!dashboard.current) return
    setExporting(true)
    try {
      if (document.fonts?.ready) await document.fonts.ready
      dashboard.current.classList.add('report-export')
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const canvas = await html2canvas(dashboard.current, {
        scale: 2.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 1400,
      })
      const image = canvas.toDataURL('image/png', 1)
      if (kind === 'png') {
        const a = document.createElement('a')
        a.download = `oppora-report-${new Date().toISOString().slice(0, 10)}.png`
        a.href = image
        a.click()
      } else {
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
        const pageWidth = 277
        const pageHeight = 190
        const sliceHeight = Math.floor(canvas.width * pageHeight / pageWidth)
        let y = 0
        let page = 0
        while (y < canvas.height) {
          const slice = document.createElement('canvas')
          slice.width = canvas.width
          slice.height = Math.min(sliceHeight, canvas.height - y)
          slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
          if (page > 0) pdf.addPage()
          const renderedHeight = slice.height * pageWidth / canvas.width
          pdf.addImage(slice.toDataURL('image/png', 1), 'PNG', 10, 10, pageWidth, renderedHeight)
          y += sliceHeight
          page += 1
        }
        pdf.setProperties({ title: 'Oppora Outreach Performance Report', subject: `${range} campaign report` })
        pdf.save(`oppora-report-${new Date().toISOString().slice(0, 10)}.pdf`)
      }
    } finally {
      dashboard.current?.classList.remove('report-export')
      setExporting(false)
    }
  }
  if (loading) return <div className="loading"><LoaderCircle className="spin" /> Loading Oppora metrics…</div>
  if (error) return <main className="error"><h1>Couldn’t connect to Oppora</h1><p>{error}</p><button onClick={load}>Try again</button><p className="hint">Add <code>OPPORA_API_KEY</code> to <code>.env</code>, then restart the server.</p></main>
  const t = data.totals
  const mailboxCapacity = (data.mailboxes || []).reduce((a, m) => a + Number(m.dailyLimit || m.daily_limit || 0), 0)
  const mailboxSentYesterdayFromAccounts = (data.mailboxes || []).reduce((a, m) => {
    const sent = m.emailsSentYesterday ?? m.emails_sent_yesterday ?? m.dailySentYesterday ?? m.daily_sent_yesterday ?? 0
    return a + Number(sent)
  }, 0)
  const mailboxSentYesterday = Number(data.senderSentYesterday ?? mailboxSentYesterdayFromAccounts)
  const delivery = [{ name: 'Opened', value: t.opened }, { name: 'Not opened', value: Math.max(t.sent - t.opened - t.bounced, 0) }, { name: 'Bounced', value: t.bounced }]
  const chartData = data.daily || []
  const campaignChartData = (data.campaigns || []).filter(c => c.sent || c.opened || c.replied || c.clicked || c.bounced)
  return <div className="app-shell"><header><div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><span>oppora</span><em>Command Center</em></div><div className="header-actions"><span className={`live-dot ${data.mode}`}></span><span className="source">{data.mode === 'live' ? 'Live data' : 'Preview data'}</span><button className="icon-btn" title="Refresh data" onClick={load}><RefreshCw size={17}/></button><button className="export" onClick={() => exportDashboard('png')} disabled={exporting}><FileImage size={16}/> Image</button><button className="export primary" onClick={() => exportDashboard('pdf')} disabled={exporting}><FileText size={16}/> {exporting ? 'Exporting…' : 'PDF'}</button></div></header>
    <main ref={dashboard} className="dashboard"><div className="title-row"><div><div className="eyebrow">OUTREACH PERFORMANCE</div><h1>Marketing & revenue pulse</h1><p>Everything that matters, from deliverability to pipeline.</p></div><div className="date-control"><label htmlFor="report-range">{range}</label><select id="report-range" value={range} onChange={e => { setRange(e.target.value); load(e.target.value) }} aria-label="Date range"><option>All time</option><option>Last 30 days</option><option>Last 7 days</option></select></div></div>
      {data.mode === 'preview' && <div className="notice"><Sparkles size={16}/><span>Previewing the metrics in your daily email. Add an Oppora API key to unlock live campaign, pipeline, intent, and mailbox-health data.</span></div>}
      <div className="metrics"><Metric icon={Send} label="Emails sent" value={count(t.sent)} detail={`${count(t.campaigns)} campaigns`} /><Metric icon={TrendingUp} label="Open rate" value={rates.open} detail={`${count(t.opened)} unique opens`} color="mint"/><Metric icon={Users} label="Reply rate" value={rates.reply} detail={`${count(t.replied)} total replies`} color="orange"/><Metric icon={Sparkles} label="Interested" value={count(t.interested)} detail={`${rates.interest} of replies`} color="pink"/></div>
      <div className="grid top-grid">
        <section className="panel volume">
          <div className="panel-head"><div><h2>Outbound momentum</h2><p>Email volume and engagement trend</p></div><span className="badge">{chartData.length ? 'Historical activity' : 'Awaiting activity'}</span></div>
          <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="sent" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6d5dfc" stopOpacity=".36"/><stop offset="100%" stopColor="#6d5dfc" stopOpacity="0"/></linearGradient></defs><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={24}/><YAxis axisLine={false} tickLine={false} width={38}/><Tooltip/><Area type="monotone" dataKey="sent" stroke="#6d5dfc" fill="url(#sent)" strokeWidth={2.5}/><Area type="monotone" dataKey="opened" stroke="#58d8b2" fill="none" strokeWidth={2}/><Area type="monotone" dataKey="replied" stroke="#ffb86a" fill="none" strokeWidth={2}/><Area type="monotone" dataKey="bounced" stroke="#fb6c7e" fill="none" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
          <div className="legend"><span><i className="purple"/> Sent</span><span><i className="green"/> Opened</span><span><i className="orange"/> Replied</span><span><i className="pink"/> Bounced</span></div>
        </section>
        <section className="panel delivery"><div className="panel-head"><div><h2>Deliverability</h2><p>Where every send lands</p></div></div><div className="donut"><ResponsiveContainer width="142" height="142"><PieChart><Pie data={delivery} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={4} stroke="none">{delivery.map((x, i) => <Cell key={x.name} fill={colors[i]}/>)}</Pie></PieChart></ResponsiveContainer><div className="donut-total"><strong>{rates.open}</strong><span>open rate</span></div></div><div className="breakdown">{delivery.map((x, i) => <div key={x.name}><i style={{background: colors[i]}}/><span>{x.name}</span><b>{pct(x.value, t.sent)}</b></div>)}</div></section>
      </div>
      <div className="grid lower-grid">
        <section className="panel campaign-panel">
          <div className="panel-head"><div><h2>Campaigns</h2><p>All available campaign metrics</p></div><span className="campaign-count">{t.active} active</span></div>
          <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Total sent</th><th>Sent yesterday</th><th>Opened</th><th>Replied</th><th>Clicked</th><th>Bounced</th></tr></thead><tbody>{(data.campaigns || []).map(c => <tr key={c.id || c.name}><td><b>{c.name}</b></td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{count(c.sent)}</td><td>{count(c.emailsSentYesterday)}</td><td>{count(c.opened)}</td><td>{count(c.replied)}</td><td>{count(c.clicked)}</td><td>{count(c.bounced)}</td></tr>)}</tbody></table></div>
          {campaignChartData.length > 0 && <div className="campaign-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={campaignChartData} margin={{top:8,right:4,left:-24,bottom:35}}><XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={54} tick={{fontSize:10}}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="sent" fill="#6d5dfc" radius={[3,3,0,0]} name="Total sent"/><Bar dataKey="opened" fill="#58d8b2" radius={[3,3,0,0]} name="Opened"/><Bar dataKey="replied" fill="#ffb86a" radius={[3,3,0,0]} name="Replied"/></BarChart></ResponsiveContainer></div>}
        </section>
      <section className="panel health">
        <div className="panel-head">
          <div><h2>Sender health</h2><p>Warm-up {count(data.warmup?.enabled)} / {count(data.warmup?.total)} enabled · Sent yesterday {count(mailboxSentYesterday)}</p></div>
          <b className={mailboxCapacity && mailboxSentYesterday / mailboxCapacity > .85 ? 'danger' : ''}>{count(mailboxSentYesterday)} / {count(mailboxCapacity)} · {mailboxCapacity ? Math.round(mailboxSentYesterday / mailboxCapacity * 100) : 0}%</b>
        </div>
        {mailboxCapacity > 0 && <div className="capacity"><div style={{width: `${Math.min(100, mailboxCapacity ? mailboxSentYesterday / mailboxCapacity * 100 : 0)}%`}}/></div>}
        <div className="mailboxes">
          {(data.mailboxes || []).length ? (data.mailboxes || []).map(m => {
            const email = m.email || m.email_address || m.address || 'Unknown mailbox'
            const limit = Number(m.dailyLimit ?? m.daily_limit ?? 0)
            const sentYesterday = Number(m.emailsSentYesterday ?? m.emails_sent_yesterday ?? m.dailySentYesterday ?? m.daily_sent_yesterday ?? 0)
            const sentToday = Number(m.dailySent ?? m.daily_sent ?? m.emailsSentToday ?? m.emails_sent_today ?? m.sentToday ?? m.sent_today ?? 0)
            const usagePct = limit ? Math.round(sentToday / limit * 100) : 0
            const warmup = m.warmup ?? m.warmupEnabled ?? m.warmup_enabled ?? m.warm_up_enabled ?? m.warm_up ?? m.is_warmup_enabled
            const warmupStatus = warmup === true || warmup === 1 || warmup === 'true' || warmup === 'enabled' ? 'Warm-up on' : 'Warm-up off'
            const warmupReport = m.warmupReport
            const warmupHealth = warmupReport?.healthScore ?? warmupReport?.health_score ?? warmupReport?.score
            return <div className="mailbox" key={email}>
              <div>
                <span className={m.paused || m.sending_paused ? 'alert-dot' : 'ok-dot'} />
                <b>{email}</b>
                <small>{warmupStatus} · {m.connected === false ? 'Disconnected' : m.connected === true ? 'Connected' : 'Connection status unavailable'}</small>
              </div>
              <div className="usage">
                <span>Sent today</span>
                <b>{sentToday}{limit ? ` / ${limit}` : ''}</b>
                {limit > 0 && <div><i style={{width: `${Math.min(100, limit ? sentToday / limit * 100 : 0)}%`}}/></div>}
                {limit > 0 && <small>{usagePct}% of limit</small>}
                <small>Yesterday: {sentYesterday}</small>
                {warmupHealth != null && warmupHealth !== '' && <small>Warm-up health {warmupHealth}/100</small>}
              </div>
            </div>
          }) : <p className="warmup-empty">No sender accounts were returned by Oppora.</p>}
        </div>
      </section></div>
    </main></div>
}
createRoot(document.getElementById('root')).render(<App />)
