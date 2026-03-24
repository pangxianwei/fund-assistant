const MARKET_INDEXES = [
  { secid: '1.000001', code: '000001', name: '上证指数' },
  { secid: '0.399006', code: '399006', name: '创业板指' }
];
const MARKET_API_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const REFRESH_INTERVAL = 15000;

let isRefreshing = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function getChangeClass(value) {
  if (!Number.isFinite(value) || value === 0) {
    return 'neutral';
  }

  return value > 0 ? 'positive' : 'negative';
}

function formatSignedNumber(value, digits = 2, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '--';
  }

  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(digits)}${suffix}`;
}

function formatTurnover(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return '--';
  }

  if (number >= 1e12) {
    return `${(number / 1e12).toFixed(2)}万亿`;
  }

  if (number >= 1e8) {
    return `${(number / 1e8).toFixed(2)}亿`;
  }

  return number.toFixed(0);
}

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function hasRenderedMarketContent() {
  return Boolean(document.querySelector('#marketIndexes .market-card'));
}

function hasRenderedFundContent() {
  return Boolean(document.querySelector('#fundList .fund-item'));
}

function animateContainerUpdate(container) {
  if (!container || typeof container.animate !== 'function') {
    return;
  }

  container.animate(
    [
      { opacity: 0.9, transform: 'translateY(2px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ],
    {
      duration: 220,
      easing: 'ease-out'
    }
  );
}

function setRefreshButtonState(refreshing) {
  const refreshBtn = document.getElementById('refreshBtn');
  if (!refreshBtn) {
    return;
  }

  refreshBtn.disabled = refreshing;
  refreshBtn.textContent = refreshing ? '刷新中' : '刷新';
}

async function getFundData(code) {
  try {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
    const text = await response.text();

    const jsonStr = text.match(/jsonpgz\((.*)\)/);
    if (!jsonStr) {
      throw new Error('基金代码不存在');
    }

    return JSON.parse(jsonStr[1]);
  } catch (error) {
    throw new Error('获取基金数据失败');
  }
}

async function getMarketData() {
  const params = new URLSearchParams({
    fltt: '2',
    invt: '2',
    fields: 'f12,f14,f2,f3,f4,f6',
    secids: MARKET_INDEXES.map((item) => item.secid).join(',')
  });

  const response = await fetch(`${MARKET_API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('大盘接口请求失败');
  }

  const result = await response.json();
  const diff = result?.data?.diff;
  if (!Array.isArray(diff)) {
    throw new Error('大盘接口返回异常');
  }

  const marketMap = new Map(diff.map((item) => [String(item.f12), item]));

  return MARKET_INDEXES.map((config) => {
    const item = marketMap.get(config.code) || {};
    return {
      name: item.f14 || config.name,
      code: item.f12 || config.code,
      price: Number(item.f2),
      change: Number(item.f4),
      percent: Number(item.f3),
      turnover: Number(item.f6),
      updateTime: getCurrentTimeLabel()
    };
  });
}

async function saveFunds(funds) {
  await chrome.storage.local.set({ funds });
}

async function getFunds() {
  const result = await chrome.storage.local.get('funds');
  return result.funds || [];
}

function renderMarketIndices(indices) {
  const marketIndexes = document.getElementById('marketIndexes');

  marketIndexes.innerHTML = indices.map((index) => {
    const changeClass = getChangeClass(index.percent);

    return `
      <div class="market-card">
        <div class="market-header-row">
          <div>
            <div class="market-name">${escapeHtml(index.name)}</div>
            <div class="market-code">${escapeHtml(index.code)}</div>
          </div>
          <div class="market-update">${escapeHtml(index.updateTime)}</div>
        </div>
        <div class="market-price ${changeClass}">${Number.isFinite(index.price) ? index.price.toFixed(2) : '--'}</div>
        <div class="market-change ${changeClass}">${formatSignedNumber(index.change)} (${formatSignedNumber(index.percent, 2, '%')})</div>
        <div class="market-meta">成交额 ${formatTurnover(index.turnover)}</div>
      </div>
    `;
  }).join('');
}

function renderMarketError(message) {
  const marketIndexes = document.getElementById('marketIndexes');
  marketIndexes.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function renderFunds(funds) {
  const fundList = document.getElementById('fundList');

  if (funds.length === 0) {
    fundList.innerHTML = '<div class="empty">还没有添加基金，输入代码开始吧</div>';
    return;
  }

  fundList.innerHTML = funds.map((fund) => {
    const gszzl = Number(fund.gszzl);
    const changeClass = getChangeClass(gszzl);
    const changeText = Number.isFinite(gszzl) ? formatSignedNumber(gszzl, 2, '%') : '--';

    return `
      <div class="fund-item">
        <div class="fund-name">${escapeHtml(fund.name)}</div>
        <div class="fund-code">${escapeHtml(fund.fundcode)}</div>
        <div class="fund-info">
          <div class="info-item">
            <span class="info-label">净值</span>
            <span class="info-value">${escapeHtml(fund.dwjz || '--')}</span>
          </div>
          <div class="info-item">
            <span class="info-label">估值</span>
            <span class="info-value ${changeClass}">${escapeHtml(fund.gsz || '--')}</span>
          </div>
          <div class="info-item">
            <span class="info-label">涨跌幅</span>
            <span class="info-value ${changeClass}">${changeText}</span>
          </div>
          <div class="info-item">
            <span class="info-label">估值时间</span>
            <span class="info-value">${escapeHtml(fund.gztime || '--')}</span>
          </div>
        </div>
        <button class="delete-btn" data-code="${escapeHtml(fund.fundcode)}">删除</button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const { code } = event.target.dataset;
      const funds = await getFunds();
      const newFunds = funds.filter((fund) => fund.fundcode !== code);
      await saveFunds(newFunds);
      await refreshDashboard({ silent: true, animate: true });
    });
  });
}

async function loadAndRenderFunds(options = {}) {
  const { showLoading = false, animate = false } = options;
  const fundList = document.getElementById('fundList');
  const hadRenderedContent = hasRenderedFundContent();

  if (showLoading && !hadRenderedContent) {
    fundList.innerHTML = '<div class="loading">加载中...</div>';
  }

  const savedFunds = await getFunds();
  if (savedFunds.length === 0) {
    renderFunds([]);
    if (animate && hadRenderedContent) {
      animateContainerUpdate(fundList);
    }
    return;
  }

  const funds = await Promise.all(savedFunds.map(async (savedFund) => {
    try {
      return await getFundData(savedFund.fundcode);
    } catch (error) {
      return savedFund;
    }
  }));

  await saveFunds(funds);
  renderFunds(funds);

  if (animate && hadRenderedContent) {
    animateContainerUpdate(fundList);
  }
}

async function loadAndRenderMarketIndices(options = {}) {
  const { showLoading = false, animate = false } = options;
  const marketIndexes = document.getElementById('marketIndexes');
  const hadRenderedContent = hasRenderedMarketContent();

  if (showLoading && !hadRenderedContent) {
    marketIndexes.innerHTML = '<div class="loading">大盘加载中...</div>';
  }

  try {
    const indices = await getMarketData();
    renderMarketIndices(indices);

    if (animate && hadRenderedContent) {
      animateContainerUpdate(marketIndexes);
    }
  } catch (error) {
    if (!hadRenderedContent) {
      renderMarketError('大盘数据加载失败');
    }
  }
}

async function refreshDashboard(options = {}) {
  const { silent = false, animate = false } = options;
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  setRefreshButtonState(true);

  try {
    await Promise.allSettled([
      loadAndRenderMarketIndices({ showLoading: !silent, animate }),
      loadAndRenderFunds({ showLoading: !silent, animate })
    ]);
  } finally {
    isRefreshing = false;
    setRefreshButtonState(false);
  }
}

async function addFund() {
  const input = document.getElementById('fundCode');
  const code = input.value.trim();

  if (!code) {
    alert('请输入基金代码');
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    alert('请输入6位数字的基金代码');
    return;
  }

  const fundList = document.getElementById('fundList');
  if (!hasRenderedFundContent()) {
    fundList.innerHTML = '<div class="loading">查询中...</div>';
  }

  try {
    const funds = await getFunds();
    if (funds.some((fund) => fund.fundcode === code)) {
      alert('该基金已添加');
      await refreshDashboard({ silent: true, animate: true });
      return;
    }

    const data = await getFundData(code);
    funds.push(data);
    await saveFunds(funds);

    input.value = '';
    await refreshDashboard({ silent: true, animate: true });
  } catch (error) {
    fundList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setTimeout(() => refreshDashboard({ silent: true, animate: true }), 2000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setRefreshButtonState(false);
  refreshDashboard({ silent: false, animate: false });

  document.getElementById('addBtn').addEventListener('click', addFund);
  document.getElementById('refreshBtn').addEventListener('click', () => {
    refreshDashboard({ silent: true, animate: true });
  });
  document.getElementById('fundCode').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      addFund();
    }
  });

  setInterval(() => refreshDashboard({ silent: true, animate: true }), REFRESH_INTERVAL);
});
