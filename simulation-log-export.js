"use strict";

(function attachSimulationLogExport(root) {
  function parsePixelValue(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function measureLogRowHeight(rowLike) {
    const style = rowLike?.style || {};
    const fontSize = parsePixelValue(style.fontSize, 13);
    const lineHeight = parsePixelValue(style.lineHeight, fontSize * 1.4);
    const paddingTop = parsePixelValue(style.paddingTop, 0);
    const paddingBottom = parsePixelValue(style.paddingBottom, 0);
    return Math.max(lineHeight + paddingTop + paddingBottom, fontSize + paddingTop + paddingBottom);
  }

  function buildSequentialLogLayout(rows, startY = 0) {
    let cursorY = startY;
    const layoutRows = rows.map((rowLike) => {
      const height = measureLogRowHeight(rowLike);
      const row = {
        source: rowLike,
        top: cursorY,
        height
      };
      cursorY += height;
      return row;
    });
    return {
      rows: layoutRows,
      totalHeight: cursorY
    };
  }

  const MIN_EXPORT_WIDTH = 720;

  function createExportSnapshot(livePanel) {
    if (!livePanel || !livePanel.ownerDocument || !livePanel.ownerDocument.body) {
      throw new Error("Gunluk export kopyasi olusturulamadi.");
    }

    const visibleWidth = Math.max(
      1,
      Math.ceil(livePanel.getBoundingClientRect?.().width || livePanel.offsetWidth || 0)
    );
    const panelWidth = Math.max(visibleWidth, MIN_EXPORT_WIDTH);
    const ownerDocument = livePanel.ownerDocument;
    const host = ownerDocument.createElement("div");
    const panel = livePanel.cloneNode(true);
    const logHead = panel.querySelector(".log-head");
    const logHeadTitle = panel.querySelector(".log-head-title");
    const logOutput = panel.querySelector("#logOutput");

    if (!logOutput) {
      throw new Error("Gunluk export kopyasi hazirlanamadi.");
    }

    Object.assign(host.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      width: `${panelWidth}px`,
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1"
    });

    Object.assign(panel.style, {
      position: "relative",
      inset: "auto",
      width: `${panelWidth}px`,
      maxWidth: "none",
      height: "auto",
      maxHeight: "none",
      overflow: "visible"
    });

    Object.assign(logOutput.style, {
      minHeight: "0",
      height: "auto",
      maxHeight: "none",
      overflow: "visible"
    });

    logOutput.scrollTop = 0;
    host.appendChild(panel);
    ownerDocument.body.appendChild(host);

    return {
      host,
      panel,
      logHead,
      logHeadTitle,
      logOutput,
      panelWidth,
      dispose() {
        host.remove();
      }
    };
  }

  root.SimulationLogExport = {
    createExportSnapshot,
    buildSequentialLogLayout
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createExportSnapshot,
      buildSequentialLogLayout
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
