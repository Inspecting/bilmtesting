const TMDB_API_KEY = '3ade810499876bb5672f40e54960e6a2';
const TV_SECTIONS = [
  { title: 'Trending', endpoint: '/trending/tv/week', slug: 'trending' },
  { title: 'Popular', endpoint: '/tv/popular', slug: 'popular' },
  { title: 'Top Rated', endpoint: '/tv/top_rated', slug: 'top-rated' },
  { title: 'Airing Today', endpoint: '/tv/airing_today', slug: 'airing-today' }
];

function withBase(path) {
  return (window.BilmFoundation?.withBase || ((p) => p))(path);
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchShows(endpoint) {
  const url = `https://api.themoviedb.org/3${endpoint}?api_key=${TMDB_API_KEY}`;
  const data = await fetchJSON(url);
  return (data?.results || []).slice(0, 18);
}

function createCard(item) {
  const el = document.createElement('article');
  el.className = 'media-card';
  const poster = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : 'https://placehold.co/300x450/0f172a/e2e8f0?text=Bilm';

  el.innerHTML = `
    <img src="${poster}" alt="${item.name || 'TV show'} poster" loading="lazy">
    <div class="media-card-body">
      <h3>${item.name || 'Untitled'}</h3>
      <p class="media-meta">${(item.first_air_date || '').slice(0, 4) || 'N/A'} • ★ ${(item.vote_average || 0).toFixed(1)}</p>
      <a class="media-link" href="${withBase('/tv/show.html')}?id=${item.id}">Open details</a>
    </div>
  `;
  return el;
}

function renderFilters() {
  const wrap = document.getElementById('quickFilters');
  wrap.innerHTML = '';
  TV_SECTIONS.forEach((section) => {
    const link = document.createElement('a');
    link.href = `#section-${section.slug}`;
    link.className = 'filter-chip';
    link.textContent = section.title;
    wrap.appendChild(link);
  });
}

async function renderSections() {
  const container = document.getElementById('sections');
  container.innerHTML = '';

  for (const section of TV_SECTIONS) {
    const data = await fetchShows(section.endpoint);

    const block = document.createElement('section');
    block.id = `section-${section.slug}`;
    block.className = 'catalog-section surface-panel';

    const header = document.createElement('div');
    header.className = 'section-head';
    header.innerHTML = `
      <h2>${section.title}</h2>
      <a class="view-more" href="${withBase('/tv/category.html')}?section=${encodeURIComponent(section.slug)}&title=${encodeURIComponent(section.title)}">View more</a>
    `;

    const row = document.createElement('div');
    row.className = 'card-row';
    if (!data.length) {
      row.innerHTML = '<p class="card-row-empty">Unable to load right now. Please try again in a moment.</p>';
    } else {
      data.forEach((item) => row.appendChild(createCard(item)));
    }

    block.appendChild(header);
    block.appendChild(row);
    container.appendChild(block);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  window.BilmFoundation?.initPage?.({ bodyClass: 'page-tv' });

  const showId = new URLSearchParams(window.location.search).get('id');
  if (showId) {
    window.location.replace(`${withBase('/tv/show.html')}?id=${encodeURIComponent(showId)}`);
    return;
  }

  renderFilters();
  await renderSections();
});
