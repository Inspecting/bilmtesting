const SEARCH_HISTORY_KEY = 'bilm-search-history';

function safeRead(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function normalizeType(item) {
  if (item?.type === 'tv') return 'tv';
  if (item?.type === 'movie') return 'movie';
  if (String(item?.link || '').includes('/tv/')) return 'tv';
  return 'movie';
}

function itemTitle(item) {
  return item?.title || item?.name || item?.mediaTitle || 'Untitled';
}

function itemYear(item) {
  const raw = item?.release_date || item?.first_air_date || item?.year;
  if (!raw) return 'N/A';
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? String(raw).slice(0, 4) : String(dt.getFullYear());
}

function itemPoster(item) {
  const fromPath = item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
  return item?.poster || item?.posterUrl || item?.coverImage || fromPath || 'https://placehold.co/300x450/0f172a/e2e8f0?text=Bilm';
}

function itemKey(item) {
  return item.key || `${normalizeType(item)}-${item.tmdbId || item.id || itemTitle(item)}`;
}

function cardTemplate(item, editMode, isSelected) {
  const link = item?.link || '#';
  const safe = document.createElement('article');
  safe.className = 'media-card';

  const checkbox = editMode
    ? `<input class="select-tile" type="checkbox" ${isSelected ? 'checked' : ''} data-key="${itemKey(item)}">`
    : '';

  safe.innerHTML = `${checkbox}
    <img src="${itemPoster(item)}" alt="${itemTitle(item)} poster" loading="lazy"/>
    <div class="media-copy">
      <h3>${itemTitle(item)}</h3>
      <div class="media-meta">${normalizeType(item).toUpperCase()} • ${itemYear(item)}</div>
      <a class="media-link" href="${link}">Open</a>
    </div>`;
  return safe;
}

function renderStats() {
  const grid = document.getElementById('statsGrid');
  const stats = [
    ['Continue Watching', safeRead('bilm-continue-watching').length],
    ['Favorites', safeRead('bilm-favorites').length],
    ['Watch Later', safeRead('bilm-watch-later').length],
    ['Search History', safeRead(SEARCH_HISTORY_KEY).length]
  ];
  grid.innerHTML = '';
  for (const [label, value] of stats) {
    const block = document.createElement('article');
    block.innerHTML = `<h3>${label}</h3><p>${value}</p>`;
    grid.appendChild(block);
  }
}

function wireLibrary(section) {
  const key = section.dataset.key;
  const row = section.querySelector('.library-row');
  const filterButtons = [...section.querySelectorAll('.filter-row button')];
  const editBtn = section.querySelector('.toggle-edit');
  const removeBtn = section.querySelector('.remove-selected');

  let filter = 'all';
  let editMode = false;
  let selected = new Set();

  const render = () => {
    const all = safeRead(key);
    const list = all.filter((item) => filter === 'all' || normalizeType(item) === filter);
    row.innerHTML = '';

    if (!list.length) {
      row.innerHTML = '<div class="empty-state">No items here yet.</div>';
      removeBtn.disabled = true;
      return;
    }

    list.forEach((item) => {
      row.appendChild(cardTemplate(item, editMode, selected.has(itemKey(item))));
    });

    row.querySelectorAll('.select-tile').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(checkbox.dataset.key);
        else selected.delete(checkbox.dataset.key);
        removeBtn.disabled = selected.size === 0;
      });
    });

    removeBtn.disabled = selected.size === 0;
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      filterButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
      selected = new Set();
      render();
    });
  });

  editBtn.addEventListener('click', () => {
    editMode = !editMode;
    editBtn.classList.toggle('is-active', editMode);
    editBtn.textContent = editMode ? 'Done' : 'Edit';
    removeBtn.hidden = !editMode;
    selected = new Set();
    render();
  });

  removeBtn.addEventListener('click', () => {
    const all = safeRead(key);
    const next = all.filter((item) => !selected.has(itemKey(item)));
    safeWrite(key, next);
    selected = new Set();
    renderStats();
    render();
  });

  render();
}

document.addEventListener('DOMContentLoaded', () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-home' });

  const form = document.getElementById('heroSearchForm');
  const input = document.getElementById('heroSearchInput');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    const settings = window.bilmTheme?.getSettings?.() || {};
    if (settings.searchHistory !== false && settings.incognito !== true) {
      const history = safeRead(SEARCH_HISTORY_KEY).filter((entry) => entry?.query !== query);
      safeWrite(SEARCH_HISTORY_KEY, [{ query, updatedAt: Date.now() }, ...history].slice(0, 50));
    }

    window.location.href = `${(window.BilmFoundation?.withBase || ((path) => path))('/search/')}?q=${encodeURIComponent(query)}`;
  });

  renderStats();
  document.querySelectorAll('.library').forEach(wireLibrary);
});
