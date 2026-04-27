'use client';

import { useState } from 'react';

const SLOTS = ['delivery-log', 'serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

const CATEGORY_ORDER = ['serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

const LABELS = {
  'delivery-log': 'Delivery Log',
  serviceware: 'Serviceware',
  'add-ons': 'Add-ons',
  beverages: 'Beverages',
  coffee: 'Coffee',
  alcohol: 'Alcohol',
};

const SLOT_HELP = {
  'delivery-log': 'OPS Print Delivery Log',
  serviceware: 'OPS Serviceware',
  'add-ons': 'KITCHEN/OPS Add-on',
  beverages: 'KITCHEN/OPS Beverages',
  coffee: 'KITCHEN/OPS Coffee',
  alcohol: 'KITCHEN/OPS Alcohol',
};

const ICONS = {
  'delivery-log': '🚚',
  serviceware: '🥄',
  'add-ons': '➕',
  beverages: '🧃',
  coffee: '☕',
  alcohol: '🍷',
};

const CATEGORY_COLORS = {
  serviceware: { bg: '#E6F1FB', text: '#185FA5' },
  'add-ons': { bg: '#EEEDFE', text: '#534AB7' },
  beverages: { bg: '#EAF3DE', text: '#3B6D11' },
  coffee: { bg: '#FAECE7', text: '#993C1D' },
  alcohol: { bg: '#FAEEDA', text: '#854F0B' },
};

function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function downloadDateName() {
  return new Date().toISOString().slice(0, 10);
}

function shortFileName(name) {
  if (!name) return '';
  return name.length > 28 ? name.slice(0, 25) + '…' : name;
}

function hasItems(order, category) {
  return Array.isArray(order?.categories?.[category]) && order.categories[category].length > 0;
}

function orderHasAnyItems(order) {
  return CATEGORY_ORDER.some((category) => hasItems(order, category));
}

function DropSlot({ slot, file, state, onFile, onRemove }) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];

    if (droppedFile && droppedFile.type === 'application/pdf') {
      onFile(slot, droppedFile);
    }
  }

  return (
    <div>
      <div style={styles.slotTitle}>{LABELS[slot]}</div>

      <label
        style={{
          ...styles.dropBox,
          ...(dragging ? styles.dropBoxDragging : {}),
          ...(file ? styles.dropBoxLoaded : {}),
          ...(state === 'processing' ? styles.dropBoxProcessing : {}),
          ...(state === 'done' ? styles.dropBoxDone : {}),
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];

            if (selectedFile) {
              onFile(slot, selectedFile);
            }

            e.target.value = '';
          }}
        />

        {!file && (
          <>
            <div style={styles.dropIcon}>{ICONS[slot]}</div>
            <div style={styles.dropMainText}>Click or drag & drop</div>
            <div style={styles.dropSubText}>{SLOT_HELP[slot]}</div>
          </>
        )}

        {file && state !== 'processing' && state !== 'done' && (
          <div style={styles.loadedWrap}>
            <div style={styles.loadedCheck}>✓</div>
            <div style={styles.loadedName}>{shortFileName(file.name)}</div>
            <button
              type="button"
              style={styles.removeBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(slot);
              }}
            >
              Remove
            </button>
          </div>
        )}

        {file && state === 'processing' && (
          <div style={styles.loadedWrap}>
            <div style={{ ...styles.loadedCheck, background: '#1b5360' }}>⏳</div>
            <div style={styles.loadedName}>Reading report…</div>
            <div style={styles.dropSubText}>{shortFileName(file.name)}</div>
          </div>
        )}

        {file && state === 'done' && (
          <div style={styles.loadedWrap}>
            <div style={styles.loadedCheck}>✓</div>
            <div style={styles.loadedName}>Report loaded</div>
            <button
              type="button"
              style={styles.removeBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(slot);
              }}
            >
              Remove
            </button>
          </div>
        )}
      </label>
    </div>
  );
}

function Header({ date }) {
  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoBox}>
            <div style={styles.logoText}>BI-RITE</div>
            <div style={styles.logoSubText}>EAT GOOD FOOD</div>
          </div>

          <div style={styles.headerDivider} />

          <div>
            <div style={styles.appTitle}>Ops Bag Packing Tool</div>
            <div style={styles.appSubtitle}>OPERATIONS TOOL</div>
          </div>

          <div style={styles.headerDate}>{date}</div>
        </div>
      </header>

      <div style={styles.stepBar}>
        <div style={styles.stepInner}>
          <Step active number="1" label="Upload Reports" />
          <div style={styles.stepLine} />
          <Step number="2" label="Review Details" />
          <div style={styles.stepLine} />
          <Step number="3" label="Generate Packing Sheet" />
        </div>
      </div>
    </>
  );
}

function Step({ number, label, active }) {
  return (
    <div style={styles.stepItem}>
      <div style={{ ...styles.stepCircle, ...(active ? styles.stepCircleActive : {}) }}>{number}</div>
      <div style={{ ...styles.stepLabel, ...(active ? styles.stepLabelActive : {}) }}>{label}</div>
    </div>
  );
}

function CategorySection({ category, items }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div style={styles.resultCategory}>
      <div style={styles.resultCategoryTitleRow}>
        <span
          style={{
            ...styles.resultCategoryBadge,
            background: CATEGORY_COLORS[category].bg,
            color: CATEGORY_COLORS[category].text,
          }}
        >
          {LABELS[category]}
        </span>

        <span style={styles.sourceNote}>
          Source: {LABELS[category]} report
        </span>
      </div>

      {safeItems.length > 0 ? (
        <div style={styles.resultItemList}>
          {safeItems.map((item, index) => (
            <div key={`${category}-${item.name}-${index}`} style={styles.resultItem}>
              <span style={styles.checkBox} />
              <span style={styles.itemQty}>{item.qty}</span>
              <span style={styles.itemName}>{item.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.noItems}>No {LABELS[category].toLowerCase()}</div>
      )}
    </div>
  );
}

function PrintableCategoryHtml(category, items) {
  const safeItems = Array.isArray(items) ? items : [];
  const color = CATEGORY_COLORS[category];

  if (safeItems.length === 0) {
    return `
      <div class="print-category">
        <div class="print-category-title" style="background:${color.bg};color:${color.text};">${LABELS[category]}</div>
        <div class="print-no-items">No ${LABELS[category].toLowerCase()}</div>
      </div>
    `;
  }

  return `
    <div class="print-category">
      <div class="print-category-title" style="background:${color.bg};color:${color.text};">${LABELS[category]}</div>
      <div class="print-item-list">
        ${safeItems
          .map(
            (item) => `
              <div class="print-item">
                <span class="print-checkbox"></span>
                <span class="print-qty">${item.qty}</span>
                <span class="print-name">${escapeHtml(item.name)}</span>
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function Home() {
  const [files, setFiles] = useState({});
  const [slotStates, setSlotStates] = useState({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState(null);

  const loadedCount = Object.keys(files).length;

  function handleFile(slot, file) {
    setFiles((previous) => ({
      ...previous,
      [slot]: file,
    }));

    setSlotStates((previous) => ({
      ...previous,
      [slot]: 'loaded',
    }));
  }

  function removeFile(slot) {
    setFiles((previous) => {
      const next = { ...previous };
      delete next[slot];
      return next;
    });

    setSlotStates((previous) => {
      const next = { ...previous };
      delete next[slot];
      return next;
    });
  }

  async function handleGenerate() {
    if (!loadedCount) return;

    setLoading(true);
    setError('');
    setOrders(null);

    const loadedSlots = Object.keys(files);

    const processingStates = {};
    loadedSlots.forEach((slot) => {
      processingStates[slot] = 'processing';
    });
    setSlotStates(processingStates);

    const formData = new FormData();

    loadedSlots.forEach((slot) => {
      formData.append(slot, files[slot]);
    });

    try {
      setProgress(`Reading ${loadedCount} report${loadedCount !== 1 ? 's' : ''}…`);
      setProgressPct(25);

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      setProgress('Building packing sheet…');
      setProgressPct(75);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Something went wrong.');
      }

      const data = await response.json();

      const doneStates = {};
      loadedSlots.forEach((slot) => {
        doneStates[slot] = 'done';
      });
      setSlotStates(doneStates);

      setProgressPct(100);

      await new Promise((resolve) => setTimeout(resolve, 350));

      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err.message || 'Something went wrong.');

      const loadedStates = {};
      loadedSlots.forEach((slot) => {
        loadedStates[slot] = 'loaded';
      });
      setSlotStates(loadedStates);
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
    setProgress('');
    setProgressPct(0);
  }

  function handleDownload() {
    if (!orders) return;

    const orderCards = orders
      .filter(orderHasAnyItems)
      .map((order) => {
        return `
          <div class="print-order-card">
            <div class="print-order-header">
              <div>
                <div class="print-customer">${escapeHtml(order.customer_name || 'Unknown customer')}</div>
                <div class="print-order-meta">
                  Order #${escapeHtml(order.order_number)}
                  ${order.company ? ` · ${escapeHtml(order.company)}` : ''}
                </div>
              </div>
              <div class="print-window">${escapeHtml(order.time || 'No delivery window')}</div>
            </div>

            <div class="print-order-body">
              ${CATEGORY_ORDER.map((category) => PrintableCategoryHtml(category, order.categories?.[category])).join('')}
            </div>
          </div>
        `;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ops Bag Packing Sheet</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      background: #fff;
      padding: 22px;
    }

    .print-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #111;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }

    .print-logo {
      border: 3px solid #111;
      padding: 6px 14px 4px;
      display: inline-block;
      font-weight: 900;
      font-style: italic;
      font-size: 22px;
      letter-spacing: 1px;
    }

    .print-logo-sub {
      font-size: 7px;
      letter-spacing: 1px;
      text-align: center;
      margin-top: 1px;
    }

    .print-title-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .print-title {
      font-size: 20px;
      font-weight: 800;
    }

    .print-subtitle {
      font-size: 11px;
      color: #555;
      letter-spacing: 1.5px;
      margin-top: 2px;
      text-transform: uppercase;
    }

    .print-date {
      font-size: 12px;
      color: #444;
      text-align: right;
    }

    .print-summary {
      font-size: 12px;
      color: #555;
      margin-bottom: 14px;
    }

    .print-order-card {
      border: 1.5px solid #222;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .print-order-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      background: #f1f1ef;
      border-bottom: 1px solid #ccc;
      padding: 10px 12px;
    }

    .print-customer {
      font-size: 16px;
      font-weight: 800;
    }

    .print-order-meta {
      font-size: 11px;
      color: #555;
      margin-top: 2px;
    }

    .print-window {
      font-size: 13px;
      font-weight: 800;
      white-space: nowrap;
      border: 1px solid #222;
      padding: 4px 8px;
      border-radius: 4px;
      background: #fff;
    }

    .print-order-body {
      padding: 10px 12px;
    }

    .print-category {
      margin-bottom: 8px;
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 10px;
      align-items: flex-start;
    }

    .print-category-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 7px;
      border-radius: 4px;
      text-align: center;
    }

    .print-item-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .print-item {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      line-height: 1.25;
    }

    .print-checkbox {
      width: 13px;
      height: 13px;
      border: 1.7px solid #111;
      display: inline-block;
      flex-shrink: 0;
    }

    .print-qty {
      font-weight: 900;
      min-width: 26px;
      font-family: monospace;
      font-size: 13px;
    }

    .print-name {
      color: #111;
    }

    .print-no-items {
      font-size: 11px;
      color: #777;
      font-style: italic;
      padding-top: 3px;
    }

    @media print {
      @page {
        margin: 1.2cm;
      }

      body {
        padding: 0;
      }

      .print-order-card {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="print-top">
    <div class="print-title-wrap">
      <div>
        <div class="print-logo">BI-RITE</div>
        <div class="print-logo-sub">EAT GOOD FOOD</div>
      </div>
      <div>
        <div class="print-title">Ops Bag Packing Sheet</div>
        <div class="print-subtitle">Operations Tool</div>
      </div>
    </div>
    <div class="print-date">${escapeHtml(today())}</div>
  </div>

  <div class="print-summary">
    ${orders.length} order${orders.length !== 1 ? 's' : ''} · Sorted by delivery window · Items grouped by source report
  </div>

  ${orderCards}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `ops-packing-sheet-${downloadDateName()}.html`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  if (orders) {
    const safeOrders = orders.filter(orderHasAnyItems);

    return (
      <>
        <style>{globalStyles}</style>

        <main style={styles.page}>
          <Header date={today()} />

          <section style={styles.resultsWrap}>
            <div style={styles.resultsHeader}>
              <div>
                <div style={styles.resultsEyebrow}>Generated Packing Sheet</div>
                <h1 style={styles.resultsTitle}>Ops Bag Packing Sheet</h1>
                <div style={styles.resultsMeta}>
                  {today()} · {safeOrders.length} order{safeOrders.length !== 1 ? 's' : ''} · Sorted by delivery window
                </div>
              </div>

              <div style={styles.resultsActions}>
                <button style={styles.secondaryButton} onClick={handleDownload}>
                  ⬇ Download
                </button>
                <button style={styles.secondaryButton} onClick={() => window.print()}>
                  🖨 Print
                </button>
                <button style={styles.primarySmallButton} onClick={handleReset}>
                  ← New Reports
                </button>
              </div>
            </div>

            <div style={styles.accuracyNote}>
              Delivery Log is used only for delivery windows. Items stay grouped under the report they came from.
            </div>

            <div style={styles.orderList}>
              {safeOrders.map((order, index) => (
                <div key={`${order.order_number}-${index}`} className="order-card" style={styles.orderCard}>
                  <div style={styles.orderCardHeader}>
                    <div>
                      <div style={styles.orderCustomer}>{order.customer_name || 'Unknown customer'}</div>
                      <div style={styles.orderMeta}>
                        Order #{order.order_number}
                        {order.company ? ` · ${order.company}` : ''}
                      </div>
                    </div>

                    <div style={styles.deliveryWindow}>
                      {order.time || 'No delivery window'}
                    </div>
                  </div>

                  <div style={styles.orderCardBody}>
                    {CATEGORY_ORDER.map((category) => (
                      <CategorySection
                        key={category}
                        category={category}
                        items={order.categories?.[category] || []}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Footer />
        </main>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>

      <main style={styles.page}>
        <Header date={today()} />

        <section style={styles.uploadWrap}>
          <div style={styles.sectionEyebrow}>Step 1 — Upload your reports</div>

          <div style={styles.uploadGrid}>
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

          <div style={styles.helperBox}>
            <b>Accuracy rule:</b> Delivery Log is only used for delivery windows. Items are pulled only from their matching report.
          </div>

          <div style={styles.sectionEyebrow}>Step 2 — Generate</div>

          {loading && (
            <div style={styles.progressBox}>
              <div style={styles.progressTop}>
                <span>{progress}</span>
                <span>{progressPct}%</span>
              </div>

              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {error && <div style={styles.errorBox}>{error}</div>}

          <button
            style={{
              ...styles.generateButton,
              ...(!loadedCount || loading ? styles.generateButtonDisabled : {}),
            }}
            disabled={!loadedCount || loading}
            onClick={handleGenerate}
          >
            {loading
              ? 'Processing reports…'
              : loadedCount
                ? `⬇ Generate Packing Sheet — ${loadedCount} report${loadedCount !== 1 ? 's' : ''} loaded`
                : 'Generate Packing Sheet'}
          </button>
        </section>

        <Footer />
      </main>
    </>
  );
}

function Footer() {
  return (
    <footer style={styles.footer}>
      POWERED BY BI-RITE OPERATIONS · DESIGNED & CREATED BY GRIFFIN LAU
    </footer>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #06151b;
  }

  button,
  input {
    font-family: 'DM Sans', sans-serif;
  }

  .order-card {
    animation: fadeUp 0.22s ease-out both;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media print {
    header,
    footer,
    button,
    .no-print {
      display: none !important;
    }

    body,
    main {
      background: white !important;
    }
  }
`;

const styles = {
  page: {
    minHeight: '100vh',
    background: '#06151b',
    color: '#eaf7f4',
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    background: 'linear-gradient(90deg, #045b49 0%, #087c69 58%, #0a7d6c 100%)',
    borderBottom: '1px solid rgba(255,255,255,0.14)',
  },
  headerInner: {
    maxWidth: 980,
    margin: '0 auto',
    minHeight: 88,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    position: 'relative',
  },
  logoBox: {
    background: '#fff',
    border: '5px solid #050505',
    color: '#111',
    padding: '7px 15px 5px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  },
  logoText: {
    fontSize: 24,
    fontWeight: 900,
    fontStyle: 'italic',
    letterSpacing: 1.2,
    lineHeight: 1,
  },
  logoSubText: {
    fontSize: 7,
    fontWeight: 800,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
  },
  headerDivider: {
    width: 1,
    height: 46,
    background: 'rgba(255,255,255,0.22)',
  },
  appTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  appSubtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2.2,
  },
  headerDate: {
    marginLeft: 'auto',
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  stepBar: {
    background: '#08202a',
    borderBottom: '1px solid #123746',
  },
  stepInner: {
    maxWidth: 980,
    margin: '0 auto',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: '0 24px',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  stepCircle: {
    width: 27,
    height: 27,
    borderRadius: '50%',
    background: '#123746',
    color: '#527281',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 12,
  },
  stepCircleActive: {
    background: '#3fc1b4',
    color: '#ffffff',
  },
  stepLabel: {
    color: '#486b79',
    fontSize: 13,
    fontWeight: 800,
  },
  stepLabelActive: {
    color: '#37cfc0',
  },
  stepLine: {
    width: 48,
    height: 1,
    background: '#1b3f4d',
  },
  uploadWrap: {
    maxWidth: 980,
    margin: '0 auto',
    padding: '36px 24px 28px',
  },
  sectionEyebrow: {
    color: '#2fd3c5',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2.6,
    fontWeight: 900,
    marginBottom: 14,
  },
  uploadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 18,
    marginBottom: 24,
  },
  slotTitle: {
    color: '#8fbac8',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 7,
  },
  dropBox: {
    minHeight: 128,
    border: '1.5px dashed #1f6070',
    borderRadius: 9,
    background: '#08222d',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 15,
    transition: 'all 0.16s ease',
  },
  dropBoxDragging: {
    borderColor: '#3fc1b4',
    background: '#0a2e34',
    transform: 'translateY(-2px)',
  },
  dropBoxLoaded: {
    borderColor: '#3fc1b4',
    background: '#082821',
  },
  dropBoxProcessing: {
    borderColor: '#3fc1b4',
    background: '#0a2e34',
  },
  dropBoxDone: {
    borderColor: '#4dcfbf',
    background: '#07231f',
  },
  dropIcon: {
    fontSize: 28,
    lineHeight: 1,
  },
  dropMainText: {
    color: '#5b93a4',
    fontSize: 13,
    fontWeight: 700,
  },
  dropSubText: {
    color: '#2d6d80',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.35,
  },
  loadedWrap: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
  },
  loadedCheck: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#38b7a9',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  loadedName: {
    color: '#c9fff6',
    fontSize: 12,
    fontWeight: 800,
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  removeBtn: {
    background: 'transparent',
    border: '1px solid #2b6978',
    color: '#7fbecc',
    borderRadius: 5,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  helperBox: {
    border: '1px solid #164756',
    background: '#081e27',
    color: '#8fbac8',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.45,
    margin: '6px 0 28px',
  },
  progressBox: {
    background: '#08222d',
    border: '1px solid #164756',
    borderRadius: 8,
    padding: 13,
    marginBottom: 14,
  },
  progressTop: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#43cfc1',
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 8,
  },
  progressTrack: {
    height: 5,
    background: '#123746',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #169d8d, #4bd0c1)',
    transition: 'width 0.3s ease',
  },
  errorBox: {
    border: '1px solid #7d2f2f',
    background: '#2a1113',
    color: '#ffabab',
    borderRadius: 8,
    padding: 13,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 14,
  },
  generateButton: {
    width: '100%',
    minHeight: 58,
    border: 'none',
    borderRadius: 10,
    background: 'linear-gradient(90deg, #0d9a84, #47bdb1)',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 8px 26px rgba(27, 177, 158, 0.2)',
  },
  generateButtonDisabled: {
    background: '#102d3c',
    color: '#3e7080',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  resultsWrap: {
    maxWidth: 980,
    margin: '0 auto',
    padding: '36px 24px 28px',
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 18,
    alignItems: 'flex-start',
    marginBottom: 13,
  },
  resultsEyebrow: {
    color: '#2fd3c5',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    fontWeight: 900,
    marginBottom: 5,
  },
  resultsTitle: {
    margin: 0,
    fontSize: 25,
    fontWeight: 900,
    color: '#ffffff',
  },
  resultsMeta: {
    marginTop: 4,
    color: '#6f9bab',
    fontSize: 13,
    fontWeight: 700,
  },
  resultsActions: {
    display: 'flex',
    gap: 9,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    border: '1px solid #2b6978',
    background: '#08222d',
    color: '#eaf7f4',
    borderRadius: 7,
    padding: '9px 13px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  primarySmallButton: {
    border: '1px solid #3fc1b4',
    background: '#3fc1b4',
    color: '#062026',
    borderRadius: 7,
    padding: '9px 13px',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  accuracyNote: {
    border: '1px solid #164756',
    background: '#081e27',
    color: '#8fbac8',
    borderRadius: 8,
    padding: '11px 13px',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 17,
  },
  orderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  orderCard: {
    border: '1px solid #174453',
    background: '#081e27',
    borderRadius: 11,
    overflow: 'hidden',
  },
  orderCardHeader: {
    background: '#102d3c',
    borderBottom: '1px solid #174453',
    padding: '13px 15px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-start',
  },
  orderCustomer: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 900,
  },
  orderMeta: {
    color: '#7ca7b5',
    fontSize: 12,
    fontWeight: 700,
    marginTop: 3,
  },
  deliveryWindow: {
    color: '#062026',
    background: '#46c7b9',
    borderRadius: 6,
    padding: '5px 9px',
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  orderCardBody: {
    padding: 14,
    display: 'grid',
    gap: 10,
  },
  resultCategory: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr',
    gap: 11,
    alignItems: 'flex-start',
  },
  resultCategoryTitleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resultCategoryBadge: {
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    borderRadius: 5,
    padding: '5px 8px',
    textAlign: 'center',
  },
  sourceNote: {
    color: '#426f7d',
    fontSize: 10,
    fontWeight: 800,
  },
  resultItemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#06151b',
    border: '1px solid #123746',
    borderRadius: 6,
    padding: '7px 9px',
  },
  checkBox: {
    width: 14,
    height: 14,
    border: '1.7px solid #78acba',
    borderRadius: 2,
    flexShrink: 0,
    background: '#071921',
  },
  itemQty: {
    color: '#37cfc0',
    fontSize: 14,
    fontWeight: 900,
    fontFamily: 'monospace',
    minWidth: 28,
  },
  itemName: {
    color: '#d6eee9',
    fontSize: 13,
    fontWeight: 700,
  },
  noItems: {
    color: '#557f8e',
    fontSize: 12,
    fontStyle: 'italic',
    padding: '7px 0',
  },
  footer: {
    maxWidth: 980,
    margin: '0 auto',
    padding: '24px',
    textAlign: 'center',
    color: '#123746',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.6,
  },
};
