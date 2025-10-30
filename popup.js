// 获取基金数据
async function getFundData(code) {
  try {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
    const text = await response.text();

    // 解析JSONP数据
    const jsonStr = text.match(/jsonpgz\((.*)\)/);
    if (!jsonStr) {
      throw new Error('基金代码不存在');
    }

    return JSON.parse(jsonStr[1]);
  } catch (error) {
    throw new Error('获取基金数据失败');
  }
}

// 保存基金列表
async function saveFunds(funds) {
  await chrome.storage.local.set({ funds });
}

// 获取基金列表
async function getFunds() {
  const result = await chrome.storage.local.get('funds');
  return result.funds || [];
}

// 渲染基金列表
function renderFunds(funds) {
  const fundList = document.getElementById('fundList');

  if (funds.length === 0) {
    fundList.innerHTML = '<div class="empty">还没有添加基金，输入代码开始吧</div>';
    return;
  }

  fundList.innerHTML = funds.map(fund => {
    const gszzl = parseFloat(fund.gszzl);
    const changeClass = gszzl >= 0 ? 'positive' : 'negative';
    const changeSymbol = gszzl >= 0 ? '+' : '';

    return `
      <div class="fund-item">
        <div class="fund-name">${fund.name}</div>
        <div class="fund-code">${fund.fundcode}</div>
        <div class="fund-info">
          <div class="info-item">
            <span class="info-label">净值</span>
            <span class="info-value">${fund.dwjz}</span>
          </div>
          <div class="info-item">
            <span class="info-label">估值</span>
            <span class="info-value ${changeClass}">${fund.gsz}</span>
          </div>
          <div class="info-item">
            <span class="info-label">涨跌幅</span>
            <span class="info-value ${changeClass}">${changeSymbol}${fund.gszzl}%</span>
          </div>
          <div class="info-item">
            <span class="info-label">估值时间</span>
            <span class="info-value">${fund.gztime}</span>
          </div>
        </div>
        <button class="delete-btn" data-code="${fund.fundcode}">删除</button>
      </div>
    `;
  }).join('');

  // 添加删除事件
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const code = e.target.dataset.code;
      const funds = await getFunds();
      const newFunds = funds.filter(f => f.fundcode !== code);
      await saveFunds(newFunds);
      await loadAndRenderFunds();
    });
  });
}

// 加载并渲染基金
async function loadAndRenderFunds() {
  const fundList = document.getElementById('fundList');
  fundList.innerHTML = '<div class="loading">加载中...</div>';

  const savedFunds = await getFunds();

  if (savedFunds.length === 0) {
    renderFunds([]);
    return;
  }

  // 获取最新数据
  const funds = [];
  for (const savedFund of savedFunds) {
    try {
      const data = await getFundData(savedFund.fundcode);
      funds.push(data);
    } catch (error) {
      funds.push(savedFund);
    }
  }

  await saveFunds(funds);
  renderFunds(funds);
}

// 添加基金
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
  fundList.innerHTML = '<div class="loading">查询中...</div>';

  try {
    const funds = await getFunds();

    // 检查是否已存在
    if (funds.some(f => f.fundcode === code)) {
      alert('该基金已添加');
      await loadAndRenderFunds();
      return;
    }

    const data = await getFundData(code);
    funds.push(data);
    await saveFunds(funds);

    input.value = '';
    await loadAndRenderFunds();
  } catch (error) {
    fundList.innerHTML = `<div class="error">${error.message}</div>`;
    setTimeout(() => loadAndRenderFunds(), 2000);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadAndRenderFunds();

  document.getElementById('addBtn').addEventListener('click', addFund);

  document.getElementById('fundCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addFund();
    }
  });

  // 每30秒自动刷新
  setInterval(loadAndRenderFunds, 30000);
});
