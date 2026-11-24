'use client';
// Chart.js: complaint trend (line) + category analytics (bar)
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { CATEGORIES } from '@/lib/constants';

Chart.register(...registerables);
Chart.defaults.color = '#8fa0bd';
Chart.defaults.borderColor = '#233250';

export default function Charts({ complaints, days = 14 }) {
  const lineRef = useRef(null), barRef = useRef(null);
  const charts = useRef({});

  useEffect(() => {
    const unique = complaints.filter((c) => !c.duplicateOf);
    // trend: pichhle `days` din, din ke hisaab se
    const labels = [], counts = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      const next = d.getTime() + 86400000;
      counts.push(unique.filter((c) => { const t = Date.parse(c.occurredAt); return t >= d.getTime() && t < next; }).length);
    }
    const byCat = Object.keys(CATEGORIES).map((k) => unique.filter((c) => c.category === k).length);

    charts.current.line?.destroy();
    charts.current.bar?.destroy();
    charts.current.line = new Chart(lineRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Complaints / day', data: counts, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.15)', fill: true, tension: 0.3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    charts.current.bar = new Chart(barRef.current, {
      type: 'bar',
      data: { labels: Object.values(CATEGORIES).map((c) => c.label), datasets: [{ data: byCat, backgroundColor: Object.values(CATEGORIES).map((c) => c.color) }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    return () => { charts.current.line?.destroy(); charts.current.bar?.destroy(); };
  }, [complaints, days]);

  return (
    <div className="grid g-2">
      <div className="panel"><h2>Complaint trend</h2><div className="chart-box"><canvas ref={lineRef} aria-label="Complaint trend chart" /></div></div>
      <div className="panel"><h2>Category analytics</h2><div className="chart-box"><canvas ref={barRef} aria-label="Category analytics chart" /></div></div>
    </div>
  );
}
