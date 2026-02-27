function read(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function titleFor(item) {
  return item?.query || item?.title || item?.name || item?.mediaTitle || 'Untitled item';
}

document.addEventListener('DOMContentLoaded', () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-settings-history' });

  const list = document.getElementById('historyList');
  const clearBtn = document.getElementById('clearAll');
  const tabs = [...document.querySelectorAll('.tab')];
  let active = 'bilm-search-history';

  const render = () => {
    const items = read(active);
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<li class="empty">No items in this list.</li>';
      return;
    }
    items.slice(0, 120).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = titleFor(item);
      list.appendChild(li);
    });
  };

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    active = tab.dataset.key;
    tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    render();
  }));

  clearBtn.addEventListener('click', () => {
    write(active, []);
    render();
  });

  render();
});
