const GAME_STORE_KEY = 'bilm:games:selection';

async function loadCatalog() {
  try {
    const res = await fetch('./catalog.json');
    if (!res.ok) throw new Error();
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function deriveCategory(game) {
  if (game.category) return game.category;
  const firstTag = String(game.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)[0];
  return firstTag ? firstTag.replace(/-/g, ' ') : 'General';
}

function normalizeGame(game, index) {
  const id = `game-${index}`;
  const embedSrc = String(game.embed || '').trim();
  return {
    id,
    title: game.title || 'Untitled',
    description: game.description || '',
    image: game.image || '',
    category: deriveCategory(game),
    embedSrc
  };
}

function persistGameSelection(games) {
  const map = {};
  games.forEach((game) => {
    map[game.id] = {
      title: game.title,
      description: game.description,
      image: game.image,
      url: game.embedSrc,
      embedMarkup: `<iframe src="${game.embedSrc}"></iframe>`
    };
  });

  try {
    sessionStorage.setItem(GAME_STORE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

function normalizeGroups(games) {
  const map = new Map();
  games.forEach((game) => {
    const group = game.category || 'General';
    if (!map.has(group)) map.set(group, []);
    map.get(group).push(game);
  });
  return [...map.entries()];
}

function card(game) {
  const base = window.BilmFoundation?.withBase || ((p) => p);
  const href = base(`/games/play.html?game=${encodeURIComponent(game.id)}`);
  return `<a class="game-card" href="${href}">
    <img src="${game.image || 'https://placehold.co/400x250/0f172a/e2e8f0?text=Bilm+Game'}" alt="${game.title} thumbnail" loading="lazy">
    <div class="game-copy"><h3>${game.title}</h3><p>${game.category}</p></div>
  </a>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-games' });
  const sectionsEl = document.getElementById('gameSections');
  const emptyEl = document.getElementById('gameEmpty');
  const statusEl = document.getElementById('gameStatus');
  const metaEl = document.getElementById('resultsMeta');
  const searchInput = document.getElementById('gameSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');

  const catalog = await loadCatalog();
  const allGames = catalog.map(normalizeGame).filter((game) => game.embedSrc);
  persistGameSelection(allGames);
  statusEl.textContent = `${allGames.length} games loaded`;

  function render(query = '') {
    const q = query.trim().toLowerCase();
    const filtered = allGames.filter((g) => !q || `${g.title} ${g.category} ${g.description}`.toLowerCase().includes(q));
    const grouped = normalizeGroups(filtered);
    sectionsEl.innerHTML = '';
    emptyEl.hidden = filtered.length !== 0;
    metaEl.hidden = !q;
    metaEl.textContent = q ? `${filtered.length} results for "${query}"` : '';

    grouped.forEach(([group, items]) => {
      const section = document.createElement('section');
      section.className = 'games-section surface-panel';
      section.innerHTML = `<h2>${group}</h2><div class="game-grid">${items.map(card).join('')}</div>`;
      sectionsEl.appendChild(section);
    });
  }

  searchInput.addEventListener('input', () => {
    clearBtn.hidden = !searchInput.value.trim();
    render(searchInput.value);
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden = true;
    render('');
    searchInput.focus();
  });

  render();
});
