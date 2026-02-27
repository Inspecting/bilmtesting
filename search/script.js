const TMDB_API_KEY = '3ade810499876bb5672f40e54960e6a2';
const INCOGNITO_SEARCH_MAP_KEY = 'bilm-incognito-search-map';

function resolveSearchQuery(raw) {
  const settings = window.bilmTheme?.getSettings?.() || {};
  if (!raw || settings.incognito !== true) return raw || '';
  try {
    const map = JSON.parse(sessionStorage.getItem(INCOGNITO_SEARCH_MAP_KEY) || '{}') || {};
    return map[raw] || raw;
  } catch {
    return raw;
  }
}

function scoreItem(item, query, sortMode) {
  if (sortMode === 'year') return Number(item.year) || 0;
  const title = String(item.title || '').toLowerCase();
  const normalized = String(query || '').toLowerCase();
  if (title === normalized) return 1000;
  if (title.startsWith(normalized)) return 700;
  if (title.includes(normalized)) return 500;
  return 100;
}

function card(item) {
  const article = document.createElement('article');
  article.className = 'search-card';
  article.innerHTML = `
    <img src="${item.poster}" alt="${item.title} poster" loading="lazy" />
    <div class="search-card-body">
      <h3 class="search-card-title">${item.title}</h3>
      <div class="search-card-meta">${item.type.toUpperCase()} • ${item.year || 'N/A'}</div>
      <a class="search-card-link" href="${item.link}">Open details</a>
    </div>
  `;
  return article;
}

async function fetchTMDB(type, query) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const res = await fetch(`https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  const base = window.BilmFoundation?.withBase || ((path) => path);
  return (data.results || []).slice(0, 30).map((item) => ({
    title: type === 'movie' ? item.title : item.name,
    year: (type === 'movie' ? item.release_date : item.first_air_date || '').slice(0, 4),
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://placehold.co/300x450/0f172a/e2e8f0?text=Bilm',
    type,
    link: `${base(type === 'movie' ? '/movies/show.html' : '/tv/show.html')}?id=${item.id}`
  }));
}

document.addEventListener('DOMContentLoaded', async () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-search' });

  const title = document.getElementById('resultsTitle');
  const message = document.getElementById('resultsMessage');
  const grid = document.getElementById('combinedResults');

  const queryRaw = new URLSearchParams(window.location.search).get('q') || '';
  const query = resolveSearchQuery(queryRaw).trim();

  let filter = 'all';
  let sort = 'relevance';
  let movies = [];
  let shows = [];

  title.textContent = query ? `Results for “${query}”` : 'Search';

  if (!query) {
    message.hidden = false;
    message.textContent = 'Enter a search term to begin.';
    return;
  }

  [movies, shows] = await Promise.all([fetchTMDB('movie', query), fetchTMDB('tv', query)]);

  const render = () => {
    let list = [...movies, ...shows];
    if (filter === 'movies') list = movies;
    if (filter === 'tv') list = shows;
    list.sort((a, b) => scoreItem(b, query, sort) - scoreItem(a, query, sort));

    grid.innerHTML = '';
    if (!list.length) {
      message.hidden = false;
      message.textContent = 'No results found.';
      return;
    }

    message.hidden = true;
    list.forEach((item) => grid.appendChild(card(item)));
  };

  document.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      document.querySelectorAll('.filter-button').forEach((b) => b.classList.toggle('active', b === button));
      render();
    });
  });

  document.querySelectorAll('.sort-button').forEach((button) => {
    button.addEventListener('click', () => {
      sort = button.dataset.sort;
      document.querySelectorAll('.sort-button').forEach((b) => b.classList.toggle('active', b === button));
      render();
    });
  });

  render();
});
