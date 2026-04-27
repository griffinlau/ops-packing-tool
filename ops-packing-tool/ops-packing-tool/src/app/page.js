'use client';
import { useState } from 'react';

const SLOTS = ['delivery-log', 'serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

const ICONS = {
  'delivery-log': '🚚',
  serviceware: '🥄',
  'add-ons': '➕',
  beverages: '🧃',
  coffee: '☕',
  alcohol: '🍷',
};

const LABELS = {
  'delivery-log': 'Delivery Log',
  serviceware: 'Serviceware',
  'add-ons': 'Add-ons',
  alcohol: 'Alcohol',
  beverages: 'Beverages',
  coffee: 'Coffee',
};

const DARK_STYLES = {
  'delivery-log': { bg: '#102c2f', color: '#4EA99B' },
  serviceware: { bg: '#1a2e4a', color: '#7ab8e8' },
  'add-ons': { bg: '#1e1a3a', color: '#a09bec' },
  alcohol: { bg: '#2e2010', color: '#d4a055' },
  beverages: { bg: '#132510', color: '#7ab85a' },
  coffee: { bg: '#2a1510', color: '#d48060' },
};

const PRINT_STYLES = {
  'delivery-log': { bg: '#E0F5F1', color: '#1B6B5A' },
  serviceware: { bg: '#E6F1FB', color: '#185FA5' },
  'add-ons': { bg: '#EEEDFE', color: '#534AB7' },
  alcohol: { bg: '#FAEEDA', color: '#854F0B' },
  beverages: { bg: '#EAF3DE', color: '#3B6D11' },
  coffee: { bg: '#FAECE7', color: '#993C1D' },
};

const CATEGORY_ORDER = ['serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function DropSlot({ slot, file, state, onFile, onRemove }) {
  const [drag, setDrag] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);

    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') {
      onFile(slot, f);
    }
  }

  const shortName = file
    ? file.name.length > 20
      ? file.name.slice(0, 17) + '…'
      : file.name
    : '';

  return (
    <div>
      <div style={styles.slotLabel}>{LABELS[slot]}</div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        style={{
          ...styles.dropTarget,
          ...(drag ? styles.dropTargetDrag : {}),
          ...(file ? styles.dropTargetLoaded : {}),
          ...(state === 'processing' ? styles.dropTargetProcessing : {}),
          ...(state === 'done' ? styles.dropTargetDone : {}),
        }}
      >
        <input
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) onFile(slot, f);
            e.target.value = '';
          }}
        />

        {!file && (
          <>
            <span style={{ fontSize: 24 }}>{ICONS[slot]}</span>
            <span style={styles.slotHint}>Drop or click</span>
          </>
        )}

        {file && state !== 'processing' && state !== 'done' && (
          <div style={styles.fileLoadedInner}>
            <div style={styles.fileCheck}>✓</div>
            <div style={styles.fileLoadedName}>{shortName}</div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(slot);
              }}
              style={styles.fileRemove}
            >
              Remove
            </button>
          </div>
        )}

        {file && state === 'processing' && (
          <div style={styles.fileLoadedInner}>
            <div style={{ ...styles.fileCheck, background: '#1e3545', fontSize: 14 }}>⏳</div>
            <div style={{ ...styles.fileLoadedName, color: '#6a8a9a' }}>Reading…</div>
            <div style={{ fontSize: 10, color: '#3a5a6a' }}>{shortName}</div>
          </div>
        )}

        {file && state === 'done' && (
          <div style={styles.fileLoadedInner}>
            <div style={{ ...styles.fileCheck, background: '#1B6B5A' }}>✓</div>
            <div style={styles.fileLoadedName}>Done</div>
          </div>
        )}
      </label>
    </div>
  );
}

export default function Home() {
  const [files, setFiles] = useState({});
  const [slotStates, setSlotStates] = useState({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState(null);

  const fileCount = Object.keys(files).length;

  function handleFile(slot, file) {
    setFiles((prev) => ({ ...prev, [slot]: file }));
    setSlotStates((prev) => ({ ...prev, [slot]: 'loaded' }));
  }

  function removeFile(slot) {
    setFiles((prev) => {
      const n = { ...prev };
      delete n[slot];
      return n;
    });

    setSlotStates((prev) => {
      const n = { ...prev };
      delete n[slot];
      return n;
    });
  }

  async function handleGenerate() {
    if (!fileCount) return;

    setLoading(true);
    setError('');
    setOrders(null);

    const fd = new FormData();
    const loadedSlots = Object.keys(files);

    const processing = {};
    loadedSlots.forEach((s) => (processing[s] = 'processing'));
    setSlotStates(processing);

    loadedSlots.forEach((slot) => fd.append(slot, files[slot]));

    try {
      setProgress(`Reading ${fileCount} report${fileCount !== 1 ? 's' : ''} with AI…`);
      setProgressPct(30);

      const res = await fetch('/api/generate', {
        method: 'POST',
        body: fd,
      });

      setProgressPct(80);
      setProgress('Building packing sheet…');

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Something went wrong.');
      }

      const data = await res.json();

      const done = {};
      loadedSlots.forEach((s) => (done[s] = 'done'));
      setSlotStates(done);
      setProgressPct(100);

      await new Promise((r) => setTimeout(r, 400));
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message);

      const loaded = {};
      loadedSlots.forEach((s) => (loaded[s] = 'loaded'));
      setSlotStates(loaded);
    } finally {
      setLoading(false);
      setProgress('');
      setProgressPct(0);
    }
  }

  function handleReset() {
    setFiles({});
    setSlotStates({});
    setOrders(null);
    setError('');
  }

  function handleDownload() {
    const dateStr = today();

    const cards = orders
      .map((order) => {
        const cats = CATEGORY_ORDER.filter((cat) => order.categories[cat]?.length > 0);

        return `<div style="border:1px solid #ddd;border-radius:10px;overflow:hidden;margin-bottom:10px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f8f6;padding:9px 14px;border-bottom:1px solid #eee">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-family:monospace;font-size:11px;background:#eee;padding:2px 7px;border-radius:4px;color:#666">#${order.order_number}</span>
            <span style="font-size:14px;font-weight:700">${order.customer_name}</span>
          </div>
          <span style="font-size:13px;font-weight:700;color:${order.time ? '#1a1a1a' : '#aaa'}">${order.time || '—'}</span>
        </div>
        <div style="padding:10px 14px;display:flex;flex-direction:column;gap:7px">
          ${cats
            .map((cat) => {
              const s = PRINT_STYLES[cat];

              return `<div style="display:flex;gap:10px;align-items:flex-start">
              <span style="background:${s.bg};color:${s.color};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:3px 9px;border-radius:4px;white-space:nowrap;margin-top:2px;flex-shrink:0">${LABELS[cat]}</span>
              <div style="display:flex;flex-wrap:wrap;gap:5px">${order.categories[cat]
                .map(
                  (i) =>
                    `<span style="display:inline-flex;align-items:center;gap:5px;background:#f5f5f3;border:1px solid #e5e5e0;border-radius:6px;padding:3px 10px;font-size:12px"><b style="font-family:monospace">${i.qty}</b> <span style="color:#666">${i.name}</span></span>`
                )
                .join('')}</div>
            </div>`;
            })
            .join('')}
        </div>
      </div>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ops Packing Sheet</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#111}h1{font-size:18px;font-weight:700;margin-bottom:4px}.meta{font-size:12px;color:#888;margin-bottom:20px}@media print{@page{margin:1.5cm}}</style>
</head><body><h1>Ops bag packing sheet</h1><div class="meta">${dateStr} · ${orders.length} orders</div>${cards}</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `ops-packing-sheet-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();

    URL.revokeObjectURL(url);
  }

  if (orders) {
    return (
      <>
        <style>{globalStyles}</style>

        <main style={{ minHeight: '100vh', background: '#08131a', fontFamily: "'DM Sans', sans-serif" }}>
          <Header date={today()} />

          <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 60px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e8f4f0' }}>Packing Sheet</h2>
                <div style={{ fontSize: 13, color: '#6a8a9a', marginTop: 4 }}>
                  {today()} · {orders.length} orders · sorted by delivery window
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleDownload} style={styles.btnOut}>
                  ⬇ Download
                </button>
                <button onClick={() => window.print()} style={styles.btnOut}>
                  🖨 Print
                </button>
                <button onClick={handleReset} style={{ ...styles.btnOut, ...styles.btnAccent }}>
                  ← New reports
                </button>
              </div>
            </div>

            <div className="order-cards">
              {orders.map((order, idx) => {
                const cats = CATEGORY_ORDER.filter((cat) => order.categories[cat]?.length > 0);

                return (
                  <div key={order.order_number} className="order-card" style={{ animationDelay: `${idx * 70}ms` }}>
                    <div style={styles.orderHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={styles.orderNum}>#{order.order_number}</span>
                        <span style={styles.orderName}>{order.customer_name}</span>
                      </div>

                      <span style={{ fontSize: 13, fontWeight: 600, color: order.time ? '#4EA99B' : '#3a5a6a' }}>
                        {order.time || '—'}
                      </span>
                    </div>

                    <div style={styles.orderBody}>
                      {cats.map((cat) => {
                        const s = DARK_STYLES[cat];

                        return (
                          <div key={cat} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ ...styles.catBadge, background: s.bg, color: s.color }}>{LABELS[cat]}</span>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {order.categories[cat].map((item, i) => (
                                <div key={i} style={styles.itemPill}>
                                  <span style={styles.itemQty}>{item.qty}</span>
                                  <span style={styles.itemName}>{item.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>

      <main style={{ minHeight: '100vh', background: '#08131a', fontFamily: "'DM Sans', sans-serif" }}>
        <Header date={today()} />

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 60px' }}>
          <div style={styles.stepLabel}>Step 1 — Upload your reports, including the delivery log</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 28 }}>
            {SLOTS.map((slot) => (
              <DropSlot
                key={slot}
                slot={slot}
                file={files[slot] || null}
                state={slotStates[slot] || null}
                onFile={handleFile}
                onRemove={removeFile}
              />
            ))}
          </div>

          <div style={styles.divider} />

          <div style={styles.stepLabel}>Step 2 — Generate</div>

          {loading && (
            <div style={styles.progressRow}>
              <div style={styles.progressDot} />

              <div style={{ fontSize: 13, color: '#4EA99B', fontWeight: 500 }}>{progress}</div>

              <div style={{ flex: 1, height: 3, background: '#1e3545', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg,#1B6B5A,#4EA99B)',
                    width: progressPct + '%',
                    transition: 'width 0.4s ease',
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          )}

          {error && <div style={styles.errorBox}>{error}</div>}

          <button
            onClick={handleGenerate}
            disabled={!fileCount || loading}
            style={{
              ...styles.generateBtn,
              ...(!fileCount || loading ? styles.generateBtnDisabled : {}),
            }}
          >
            {loading
              ? 'Processing reports…'
              : `Generate packing sheet${fileCount ? ` — ${fileCount} report${fileCount !== 1 ? 's' : ''} loaded` : ''}`}
          </button>
        </div>
      </main>
    </>
  );
}

function Header({ date }) {
  return (
    <header style={styles.header}>
      <div>
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '0.01em' }}>Ops Bag Packing Tool</div>
        <div
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          Operations · Bi-Rite
        </div>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{date}</div>
    </header>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background: #08131a;
  }

  input,
  select,
  button,
  textarea {
    font-family: 'DM Sans', sans-serif;
  }

  .order-card {
    background: #0f1e28;
    border: 1px solid #1e3545;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 10px;
    opacity: 0;
    transform: translateY(14px);
    animation: slideUp 0.4s ease forwards;
    transition: box-shadow 0.2s, border-color 0.2s;
  }

  .order-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    border-color: #2a4a5a;
  }

  @keyframes slideUp {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media print {
    header,
    button {
      display: none !important;
    }

    body,
    main {
      background: #fff !important;
    }

    .order-card {
      background: #fff !important;
      border-color: #ddd !important;
      opacity: 1 !important;
      transform: none !important;
      animation: none !important;
    }
  }
`;

const styles = {
  header: {
    background: 'linear-gradient(135deg, #0a2e26 0%, #0f3d30 50%, #113d32 100%)',
    borderBottom: '1px solid rgba(78,169,155,0.2)',
    padding: '0 32px',
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: '#4EA99B',
    marginBottom: 14,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#6a8a9a',
    textAlign: 'center',
    marginBottom: 8,
  },
  dropTarget: {
    border: '1.5px dashed #2a4a5a',
    borderRadius: 10,
    padding: '20px 10px',
    textAlign: 'center',
    cursor: 'pointer',
    background: '#0f1e28',
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'all 0.2s',
  },
  dropTargetDrag: {
    borderColor: '#4EA99B',
    borderStyle: 'solid',
    background: 'rgba(78,169,155,0.08)',
    transform: 'translateY(-2px)',
  },
  dropTargetLoaded: {
    borderColor: '#4EA99B',
    borderStyle: 'solid',
    background: '#0a1f1a',
  },
  dropTargetProcessing: {
    borderColor: '#4EA99B',
    borderStyle: 'solid',
    background: '#0a1f1a',
    animation: 'none',
  },
  dropTargetDone: {
    borderColor: '#1B6B5A',
    borderStyle: 'solid',
    background: '#081a14',
  },
  slotHint: {
    fontSize: 11,
    color: '#3a5a6a',
    lineHeight: 1.4,
  },
  fileLoadedInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  fileCheck: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#4EA99B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: '#fff',
    fontWeight: 700,
    flexShrink: 0,
  },
  fileLoadedName: {
    fontSize: 10,
    color: '#4EA99B',
    wordBreak: 'break-all',
    textAlign: 'center',
    lineHeight: 1.3,
    fontWeight: 500,
  },
  fileRemove: {
    fontSize: 10,
    color: '#3a5a6a',
    background: 'none',
    border: '1px solid #1e3545',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, #1e3545, transparent)',
    margin: '8px 0 24px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: '12px 16px',
    background: '#0f1e28',
    borderRadius: 8,
    border: '1px solid #1e3545',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4EA99B',
    flexShrink: 0,
  },
  errorBox: {
    background: '#1a0f0f',
    border: '1px solid #4a1f1f',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#f08080',
    fontSize: 13,
    marginBottom: 16,
  },
  generateBtn: {
    width: '100%',
    padding: 14,
    background: 'linear-gradient(135deg, #1B6B5A 0%, #4EA99B 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    boxShadow: '0 2px 16px rgba(78,169,155,0.25)',
  },
  generateBtnDisabled: {
    background: '#152434',
    color: '#3a5a6a',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },
  btnOut: {
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    background: 'none',
    border: '1px solid #2a4a5a',
    borderRadius: 8,
    color: '#e8f4f0',
    cursor: 'pointer',
  },
  btnAccent: {
    background: '#4EA99B',
    borderColor: '#4EA99B',
    color: '#fff',
  },
  orderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: '#152434',
    borderBottom: '1px solid #1e3545',
  },
  orderNum: {
    fontFamily: 'monospace',
    fontSize: 11,
    background: '#08131a',
    color: '#6a8a9a',
    padding: '2px 8px',
    borderRadius: 4,
  },
  orderName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e8f4f0',
  },
  orderBody: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  catBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '3px 9px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    marginTop: 2,
    flexShrink: 0,
  },
  itemPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#152434',
    border: '1px solid #1e3545',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
  },
  itemQty: {
    fontWeight: 700,
    color: '#4EA99B',
    fontSize: 12,
  },
  itemName: {
    color: '#6a8a9a',
  },
};
