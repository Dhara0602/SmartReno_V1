/**
 * PDFExport — generates a professional PDF report using jsPDF + html2canvas.
 */
const PDFExport = (() => {
  const BRAND_CYAN   = [0, 212, 255];
  const BRAND_PURPLE = [124, 58, 237];
  const BG_DARK      = [10, 14, 26];
  const BG_CARD      = [26, 34, 53];
  const TEXT_LIGHT   = [240, 244, 255];
  const TEXT_MUTED   = [136, 146, 164];

  function formatGBP(n) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0 }).format(n);
  }

  function drawGradientRect(doc, x, y, w, h, color1, color2) {
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
      const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
      const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);
      doc.setFillColor(r, g, b);
      doc.rect(x + (w / steps) * i, y, w / steps + 0.5, h, 'F');
    }
  }

  async function generate(state) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PW = 210, PH = 297;
    const margin = 16;
    let y = 0;

    // ── Cover header ──────────────────────────────────────────────────────
    drawGradientRect(doc, 0, 0, PW, 52, [10, 14, 26], [17, 24, 39]);
    drawGradientRect(doc, 0, 48, PW, 4, BRAND_CYAN, BRAND_PURPLE);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...BRAND_CYAN);
    doc.text('SmartReno', margin, 22);

    doc.setFontSize(11);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('AI-Powered Home Renovation Report', margin, 31);

    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Generated: ${date}`, PW - margin, 22, { align: 'right' });
    doc.text(`smartreno.netlify.app`, PW - margin, 31, { align: 'right' });

    y = 60;

    // ── Room image thumbnail ──────────────────────────────────────────────
    if (state.imageData && state.imageData.base64) {
      try {
        const imgH = 58;
        const imgW = 90;
        doc.addImage(state.imageData.base64, 'JPEG', margin, y, imgW, imgH, '', 'MEDIUM');

        // Project info card beside image
        const infoX = margin + imgW + 10;
        const infoW = PW - infoX - margin;

        doc.setFillColor(...BG_CARD);
        doc.roundedRect(infoX, y, infoW, imgH, 3, 3, 'F');
        doc.setDrawColor(...BRAND_CYAN);
        doc.setLineWidth(0.5);
        doc.roundedRect(infoX, y, infoW, imgH, 3, 3, 'S');

        const ix = infoX + 8;
        let iy = y + 12;

        const addInfoRow = (label, value, valueColor = TEXT_LIGHT) => {
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...TEXT_MUTED);
          doc.text(label.toUpperCase(), ix, iy);
          iy += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(...valueColor);
          doc.text(value, ix, iy);
          iy += 9;
        };

        addInfoRow('Design Theme', capitalise(state.theme));
        addInfoRow('Budget Tier', capitalise(state.budget));
        addInfoRow('Style', state.analysis.styleNotes
          ? state.analysis.styleNotes.substring(0, 55) + '…'
          : '—', TEXT_MUTED);

        y += imgH + 10;
      } catch (e) {
        y += 5;
      }
    }

    // ── Section: AI Recommendations ───────────────────────────────────────
    y = sectionHeader(doc, 'AI Design Recommendations', y, PW, margin);

    // Color Palette
    if (state.analysis.colors && state.analysis.colors.length) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_MUTED);
      doc.text('RECOMMENDED COLOUR PALETTE', margin, y);
      y += 6;

      state.analysis.colors.forEach((hex, i) => {
        const rgb = hexToRgb(hex);
        if (!rgb) return;
        const swatchX = margin + i * 24;
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.roundedRect(swatchX, y, 20, 12, 2, 2, 'F');
        doc.setFontSize(6.5);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(hex.toUpperCase(), swatchX, y + 16, { align: 'left' });
      });
      y += 24;
    }

    // Lighting
    y = subSection(doc, 'Lighting Recommendations', state.analysis.lighting || [], y, margin, PW);
    y = subSection(doc, 'Flooring Options', state.analysis.flooring || [], y, margin, PW);

    // Style Notes
    if (state.analysis.styleNotes) {
      doc.setFillColor(...BG_CARD);
      const noteLines = doc.splitTextToSize(state.analysis.styleNotes, PW - margin * 2 - 16);
      const noteH = noteLines.length * 5.5 + 14;
      doc.roundedRect(margin, y, PW - margin * 2, noteH, 3, 3, 'F');
      doc.setDrawColor(...BRAND_CYAN);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin, y + noteH);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...TEXT_MUTED);
      doc.text(noteLines, margin + 6, y + 9);
      y += noteH + 10;
    }

    // ── Section: Budget Breakdown ─────────────────────────────────────────
    if (y > PH - 60) { doc.addPage(); y = 20; }
    y = sectionHeader(doc, 'Budget Breakdown', y, PW, margin);

    const calc = state.budgetCalc;
    const furniture = state.analysis.furniture || [];

    // Table header
    const cols = [margin, margin + 70, margin + 130, PW - margin];
    drawTableHeader(doc, ['Item', 'Description', 'Est. Cost'], cols, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    furniture.forEach((item, i) => {
      if (y > PH - 30) { doc.addPage(); y = 20; }
      if (i % 2 === 0) {
        doc.setFillColor(22, 33, 62);
        doc.rect(margin, y - 4, PW - margin * 2, 9, 'F');
      }
      doc.setTextColor(...TEXT_MUTED);
      doc.text(String(item.name).substring(0, 28), cols[0], y);
      doc.text(String(item.description || '').substring(0, 30), cols[1], y);
      doc.setTextColor(...BRAND_CYAN);
      doc.text(formatGBP(item.estimatedCost), cols[2] + 25, y, { align: 'right' });
      y += 9;
    });

    // Totals block
    y += 4;
    doc.setDrawColor(...BRAND_CYAN);
    doc.setLineWidth(0.3);
    doc.line(margin, y, PW - margin, y);
    y += 6;

    const addTotal = (label, value, bold = false, color = TEXT_MUTED) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 10 : 9);
      doc.setTextColor(...color);
      doc.text(label, margin + 2, y);
      doc.text(formatGBP(value), PW - margin, y, { align: 'right' });
      y += 7;
    };

    addTotal('Materials Subtotal', calc.materialsCost);
    addTotal(`Labour (${Math.round(calc.labourRate * 100)}% of materials)`, calc.labourCost);
    addTotal(`Contingency (${Math.round(calc.contingencyRate * 100)}%)`, calc.contingency);
    y += 2;
    doc.line(margin, y, PW - margin, y); y += 6;
    addTotal('TOTAL PROJECT ESTIMATE', calc.totalCost, true, BRAND_CYAN);

    // Budget status badge
    const badgeColors = {
      success: [[16, 185, 129], [6, 78, 59]],
      warning: [[245, 158, 11], [120, 53, 15]],
      danger:  [[239, 68, 68],  [127, 29, 29]],
    };
    const [badgeText, badgeBg] = badgeColors[calc.statusKey] || badgeColors.warning;
    y += 4;
    doc.setFillColor(...badgeBg);
    doc.roundedRect(margin, y, 60, 10, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...badgeText);
    doc.text(calc.statusLabel.toUpperCase(), margin + 30, y + 6.5, { align: 'center' });

    // ── Footer ────────────────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(`SmartReno | AI Home Renovation Planner | smartreno.netlify.app`, margin, PH - 8);
      doc.text(`Page ${p} of ${totalPages}`, PW - margin, PH - 8, { align: 'right' });
      doc.setDrawColor(...BRAND_CYAN);
      doc.setLineWidth(0.3);
      doc.line(margin, PH - 12, PW - margin, PH - 12);
    }

    doc.save(`SmartReno-Report-${Date.now()}.pdf`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sectionHeader(doc, title, y, PW, margin) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_CYAN);
    doc.text(title, margin, y);
    doc.setDrawColor(...BRAND_CYAN);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 2, margin + doc.getTextWidth(title), y + 2);
    return y + 12;
  }

  function subSection(doc, title, items, y, margin, PW) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(title.toUpperCase(), margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    items.forEach(item => {
      doc.setTextColor(...BRAND_CYAN);
      doc.text('›', margin, y);
      doc.setTextColor(...TEXT_MUTED);
      const lines = doc.splitTextToSize(item, PW - margin * 2 - 8);
      doc.text(lines, margin + 5, y);
      y += lines.length * 5 + 2;
    });
    return y + 4;
  }

  function drawTableHeader(doc, labels, cols, y) {
    doc.setFillColor(...BG_CARD);
    doc.rect(cols[0], y - 5, cols[cols.length - 1] - cols[0], 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_CYAN);
    labels.forEach((label, i) => {
      doc.text(label, cols[i], y);
    });
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function capitalise(str) {
    return (str || '').charAt(0).toUpperCase() + (str || '').slice(1);
  }

  return { generate };
})();

window.PDFExport = PDFExport;
