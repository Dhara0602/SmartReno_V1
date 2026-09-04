/**
 * app.js — main orchestrator for the SmartReno 5-stage workflow.
 */
(() => {
  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    imageData:   null,  // { base64, mimeType }
    theme:       null,  // string
    budget:      null,  // string
    analysis:    null,  // analysis object from ClaudeService
    isFallback:  false,
    budgetCalc:  null,
    currentStage: 1,
  };

  const TOTAL_STAGES = 5;

  // ── Toast ──────────────────────────────────────────────────────────────────
  const ICONS = { error: '✕', success: '✓', warning: '⚠', info: 'ℹ' };

  function toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span>${escHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 320); }, duration);
  }
  window.SmartReno = { toast };

  // ── Stage navigation ───────────────────────────────────────────────────────
  function goToStage(n) {
    document.querySelectorAll('.stage').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`stage-${n}`);
    if (target) target.classList.add('active');
    state.currentStage = n;
    updateProgressBar(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProgressBar(n) {
    const fill  = document.getElementById('progress-fill');
    const label = document.getElementById('stage-label');
    const labels = ['', 'Capture', 'Preferences', 'Analysis', 'Visualize', 'Budget'];
    if (fill)  fill.style.width  = `${(n / TOTAL_STAGES) * 100}%`;
    if (label) label.textContent = `${n} / ${TOTAL_STAGES} — ${labels[n] || ''}`;
  }

  // ── Stage 1: Capture ───────────────────────────────────────────────────────
  function initStage1() {
    CameraModule.init('camera-container', (imageData) => {
      state.imageData = imageData;
      goToStage(2);
    });
  }

  // ── Stage 2: Preferences ──────────────────────────────────────────────────
  function initStage2() {
    // Theme cards
    document.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.theme = card.dataset.theme;
        updateAnalyseCTA();
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
    });

    // Budget cards
    document.querySelectorAll('.budget-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.budget-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.budget = card.dataset.budget;
        updateAnalyseCTA();
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
    });

    document.getElementById('btn-back-capture').addEventListener('click', () => goToStage(1));
    document.getElementById('btn-analyse').addEventListener('click', runAnalysis);
  }

  function updateAnalyseCTA() {
    const btn = document.getElementById('btn-analyse');
    if (btn) btn.disabled = !(state.theme && state.budget);
  }

  // ── Stage 3: Analysis ─────────────────────────────────────────────────────
  const LOADING_MESSAGES = [
    'Analyzing room dimensions and layout…',
    'Detecting lighting conditions…',
    'Identifying existing color palette…',
    'Generating design recommendations…',
    'Calculating furniture placement…',
    'Building cost estimates…',
    'Almost done…',
  ];

  let _loadingInterval = null;

  function startLoadingMessages() {
    let i = 0;
    const el = document.getElementById('loading-message');
    if (el) el.textContent = LOADING_MESSAGES[0];
    _loadingInterval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      if (el) el.textContent = LOADING_MESSAGES[i];
    }, 1800);
  }

  function stopLoadingMessages() {
    clearInterval(_loadingInterval);
    _loadingInterval = null;
  }

  async function runAnalysis() {
    if (!state.imageData || !state.theme || !state.budget) {
      toast('Please complete all preferences first.', 'warning');
      return;
    }

    goToStage(3);

    const loadingEl = document.getElementById('analysis-loading');
    const resultsEl = document.getElementById('analysis-results');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (resultsEl) resultsEl.classList.remove('visible');
    startLoadingMessages();

    try {
      const result = await ClaudeService.analyseRoom({
        imageBase64: state.imageData.base64,
        mimeType:    state.imageData.mimeType,
        theme:       state.theme,
        budget:      state.budget,
      });

      state.analysis   = result.data;
      state.isFallback = result.isFallback;

      stopLoadingMessages();
      if (loadingEl) loadingEl.style.display = 'none';

      renderAnalysisResults(result.data);
      if (resultsEl) resultsEl.classList.add('visible');

      if (result.isFallback) {
        toast('Using curated design suggestions — AI analysis temporarily unavailable.', 'warning', 6000);
      }
    } catch (err) {
      stopLoadingMessages();
      if (loadingEl) loadingEl.style.display = 'none';
      toast(err.message || 'Analysis failed. Please try again.', 'error');
    }
  }

  function renderAnalysisResults(data) {
    // Colors
    const swatchContainer = document.getElementById('color-swatches');
    if (swatchContainer && data.colors) {
      swatchContainer.innerHTML = data.colors.map(hex => `
        <div class="swatch">
          <div class="swatch-color" style="background:${escAttr(hex)}" title="${escHtml(hex)}"></div>
          <span class="swatch-hex">${escHtml(hex)}</span>
        </div>`).join('');
    }

    // Lighting
    renderList('lighting-list', data.lighting);

    // Flooring
    renderList('flooring-list', data.flooring);

    // Furniture
    const furnitureEl = document.getElementById('furniture-list');
    if (furnitureEl && data.furniture) {
      furnitureEl.innerHTML = data.furniture.map(item => `
        <div class="furniture-item">
          <div class="furniture-info">
            <div class="furniture-name">${escHtml(item.name)}</div>
            <div class="furniture-desc">${escHtml(item.description || '')}</div>
          </div>
          <div class="furniture-cost">£${item.estimatedCost}</div>
        </div>`).join('');
    }

    // Style notes
    const notesEl = document.getElementById('style-notes');
    if (notesEl && data.styleNotes) notesEl.textContent = data.styleNotes;
  }

  function renderList(id, items) {
    const el = document.getElementById(id);
    if (!el || !items) return;
    el.innerHTML = items.map(text => `
      <div class="result-list-item">${escHtml(text)}</div>`).join('');
  }

  // ── Stage 4: 3D Visualizer ────────────────────────────────────────────────
  let _visualizerReady = false;

  async function initStage4() {
    if (_visualizerReady) return;
    _visualizerReady = true;

    const furniture = state.analysis ? state.analysis.furniture || [] : [];

    await ARVisualizer.init('three-canvas', furniture, {
      onSelect: (item) => {
        const ctrl = document.getElementById('selected-item-controls');
        const nameEl = document.getElementById('selected-item-name');
        if (!ctrl) return;
        if (item) {
          ctrl.classList.add('visible');
          if (nameEl) nameEl.textContent = item.name;
        } else {
          ctrl.classList.remove('visible');
        }
      },
    });

    // Populate side panel
    const panel = document.getElementById('furniture-panel');
    if (panel) {
      panel.innerHTML = `<div class="panel-label">Click an item to place it in the room</div>`;
      furniture.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'furniture-panel-item';
        div.dataset.index = i;
        div.innerHTML = `
          <div class="fpi-name">${escHtml(item.name)}</div>
          <div class="fpi-cost">£${item.estimatedCost}</div>
          <div class="fpi-action">Click to place</div>`;
        div.addEventListener('click', () => {
          ARVisualizer.addFurnitureItem(item, i);
          div.classList.add('placed');
          div.querySelector('.fpi-action').textContent = '✓ Placed';
        });
        panel.appendChild(div);
      });
    }

    // Controls
    document.getElementById('ctrl-rotate').addEventListener('click', () => ARVisualizer.rotateSelected(15));
    document.getElementById('ctrl-scale-up').addEventListener('click', () => ARVisualizer.scaleSelected(1.15));
    document.getElementById('ctrl-scale-dn').addEventListener('click', () => ARVisualizer.scaleSelected(0.85));
    document.getElementById('ctrl-delete').addEventListener('click', () => ARVisualizer.deleteSelected());
  }

  // ── Stage 5: Budget ───────────────────────────────────────────────────────
  function initStage5() {
    const furniture = state.analysis ? state.analysis.furniture || [] : [];
    const tableEl = document.getElementById('budget-table');
    const totalEl = document.getElementById('budget-total-value');
    const badgeEl = document.getElementById('budget-status-badge');
    const themeEl = document.getElementById('budget-theme');
    const budgetEl = document.getElementById('budget-tier');

    if (themeEl)  themeEl.textContent  = capitalise(state.theme || '—');
    if (budgetEl) budgetEl.textContent = capitalise(state.budget || '—');

    if (tableEl) {
      const calc = BudgetService.renderTable(furniture, state.budget, tableEl);
      state.budgetCalc = calc;

      if (totalEl) totalEl.textContent = BudgetService.formatGBP(calc.totalCost);
      if (badgeEl) {
        badgeEl.textContent = calc.statusLabel;
        badgeEl.className   = `badge badge-${calc.statusKey}`;
      }
    }

    // Recommendations grid
    const recGrid = document.getElementById('rec-grid');
    if (recGrid && state.analysis) {
      const items = [
        { label: 'Theme', value: capitalise(state.theme) },
        { label: 'Top Colour', value: (state.analysis.colors || ['—'])[0] },
        { label: 'Flooring', value: (state.analysis.flooring || ['—'])[0].split(' ').slice(0, 4).join(' ') + '…' },
        { label: 'Key Lighting', value: (state.analysis.lighting || ['—'])[0].substring(0, 50) + '…' },
      ];
      recGrid.innerHTML = items.map(r => `
        <div class="rec-item">
          <div class="rec-item-label">${escHtml(r.label)}</div>
          ${escHtml(r.value)}
        </div>`).join('');
    }
  }

  // ── PDF Download ──────────────────────────────────────────────────────────
  async function downloadPDF() {
    const btn = document.getElementById('btn-download-pdf');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating PDF…'; }
    try {
      await PDFExport.generate({
        imageData:   state.imageData,
        theme:       state.theme,
        budget:      state.budget,
        analysis:    state.analysis,
        budgetCalc:  state.budgetCalc,
      });
      toast('PDF downloaded successfully!', 'success');
    } catch (err) {
      toast('Could not generate PDF: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Download PDF Report'; }
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetApp() {
    state.imageData   = null;
    state.theme       = null;
    state.budget      = null;
    state.analysis    = null;
    state.isFallback  = false;
    state.budgetCalc  = null;

    // Reset theme/budget selections
    document.querySelectorAll('.theme-card, .budget-card').forEach(c => c.classList.remove('selected'));
    const analyseBtn = document.getElementById('btn-analyse');
    if (analyseBtn) analyseBtn.disabled = true;

    // Destroy visualizer
    if (_visualizerReady) {
      ARVisualizer.destroy();
      _visualizerReady = false;
    }

    // Reinit camera
    CameraModule.destroy();
    CameraModule.init('camera-container', (imageData) => {
      state.imageData = imageData;
      goToStage(2);
    });

    goToStage(1);
  }

  // ── Wire Stage-level buttons ───────────────────────────────────────────────
  function wireStageButtons() {
    // Stage 3 → 4
    const btn34 = document.getElementById('btn-go-visualize');
    if (btn34) btn34.addEventListener('click', async () => {
      goToStage(4);
      await initStage4();
    });

    // Stage 4 → 5
    const btn45 = document.getElementById('btn-go-budget');
    if (btn45) btn45.addEventListener('click', () => {
      goToStage(5);
      initStage5();
    });

    // Stage 5 — download & reset
    const btnPdf = document.getElementById('btn-download-pdf');
    if (btnPdf) btnPdf.addEventListener('click', downloadPDF);

    const btnReset = document.getElementById('btn-start-over');
    if (btnReset) btnReset.addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.remove('hidden');
    });

    const btnConfirm = document.getElementById('btn-confirm-reset');
    if (btnConfirm) btnConfirm.addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.add('hidden');
      resetApp();
    });

    const btnCancel = document.getElementById('btn-cancel-reset');
    if (btnCancel) btnCancel.addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.add('hidden');
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function capitalise(str) {
    return String(str).charAt(0).toUpperCase() + String(str).slice(1);
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    goToStage(1);
    initStage1();
    initStage2();
    wireStageButtons();
  });
})();
