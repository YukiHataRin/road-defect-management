// llm_report_toc.js
// 自動產生 LLM 報告 TOC 目錄，並支援標題摺疊/展開與高亮目前區塊

document.addEventListener('DOMContentLoaded', function() {
	const reportResult = document.getElementById('reportResult');
	const toc = document.getElementById('llmReportTOC');
	if (!reportResult || !toc) return;

	function buildTOC() {
		const headers = reportResult.querySelectorAll('h1, h2, h3, h4, h5, h6');
		toc.innerHTML = '<div class="toc-title">目錄</div>';
		if (headers.length === 0) {
			toc.style.display = 'none';
			return;
		}
		headers.forEach((h, idx) => {
			const id = 'llm-toc-' + idx;
			h.id = id;
			const link = document.createElement('a');
			link.href = '#' + id;
			link.textContent = h.textContent;
			link.className = 'toc-link toc-' + h.tagName.toLowerCase();
			link.onclick = e => {
				e.preventDefault();
				document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
			};
			toc.appendChild(link);
		});
		toc.style.display = '';
		// 高亮目前區塊
		function highlightTOC() {
			let scrollPos = window.scrollY || document.documentElement.scrollTop;
			let currentIdx = 0;
			headers.forEach((h, idx) => {
				if (h.getBoundingClientRect().top + window.scrollY - 120 < scrollPos) {
					currentIdx = idx;
				}
			});
			toc.querySelectorAll('.toc-link').forEach((a, i) => {
				if (i === currentIdx) a.classList.add('active');
				else a.classList.remove('active');
			});
		}
		window.addEventListener('scroll', highlightTOC);
		highlightTOC();
	}

	function enableCollapsible() {
		const headers = reportResult.querySelectorAll('h2, h3');
		headers.forEach(h => {
			h.style.cursor = 'pointer';
			let next = h.nextElementSibling;
			let section = [];
			while (next && !/^H[1-3]$/.test(next.tagName)) {
				section.push(next);
				next = next.nextElementSibling;
			}
			h.onclick = () => {
				section.forEach(el => {
					el.style.display = (el.style.display === 'none') ? '' : 'none';
				});
				h.classList.toggle('collapsed');
			};
		});
	}

	// 監聽內容變化
	const observer = new MutationObserver(() => {
		buildTOC();
		enableCollapsible();
	});
	observer.observe(reportResult, { childList: true, subtree: true });
});
