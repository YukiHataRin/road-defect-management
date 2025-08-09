// llm_chart.js
// 解析 LLM 報告中的 markdown 統計表格，自動產生圖表

document.addEventListener('DOMContentLoaded', function() {
  const reportResult = document.getElementById('reportResult');
  if (!reportResult) return;

  function parseMarkdownTable(md) {
    // 只支援標準 markdown 表格
    const lines = md.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
    const rows = lines.slice(2).map(line => line.split('|').map(cell => cell.trim()).filter(Boolean));
    return { headers, rows };
  }

  function findTableByHeader(headerKeywords) {
    // 從 innerText 找出包含指定欄位的 markdown 表格
    const codeBlocks = Array.from(reportResult.querySelectorAll('pre code'));
    for (const block of codeBlocks) {
      const md = block.textContent;
      const table = parseMarkdownTable(md);
      if (table && headerKeywords.every(k => table.headers.includes(k))) {
        return { block, table };
      }
    }
    return null;
  }

  function renderBarChart(container, labels, data, label, color) {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: color }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderCharts() {
    // 清除舊圖表
    reportResult.querySelectorAll('.llm-chart-container').forEach(e => e.remove());
    // 行政區瑕疵數長條圖
    const distTable = findTableByHeader(['行政區', '瑕疵數量', '平均嚴重度']);
    if (distTable) {
      const { table, block } = distTable;
      const labels = table.rows.map(r => r[0]);
      const data = table.rows.map(r => parseInt(r[1], 10));
      const chartDiv = document.createElement('div');
      chartDiv.className = 'llm-chart-container my-3';
      block.parentNode.parentNode.insertBefore(chartDiv, block.parentNode.nextSibling);
      renderBarChart(chartDiv, labels, data, '瑕疵數量', '#1976d2');
    }
    // 路段瑕疵數長條圖
    const roadTable = findTableByHeader(['路段名稱', '瑕疵數量', '平均嚴重度']);
    if (roadTable) {
      const { table, block } = roadTable;
      const labels = table.rows.map(r => r[1]);
      const data = table.rows.map(r => parseInt(r[2], 10));
      const chartDiv = document.createElement('div');
      chartDiv.className = 'llm-chart-container my-3';
      block.parentNode.parentNode.insertBefore(chartDiv, block.parentNode.nextSibling);
      renderBarChart(chartDiv, labels, data, '路段瑕疵數', '#43a047');
    }
  }

  // 監聽內容變化自動繪圖
  const observer = new MutationObserver(() => setTimeout(renderCharts, 100));
  observer.observe(reportResult, { childList: true, subtree: true });
});
