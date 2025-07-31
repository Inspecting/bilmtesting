document.addEventListener("DOMContentLoaded", () => {
  // Welcome message
  const welcomeBox = document.getElementById("welcomeBox");
  if (welcomeBox && !localStorage.getItem("welcomeShown")) {
    welcomeBox.style.display = "block";
    localStorage.setItem("welcomeShown", "true");
  }

  // Continue Watching infinite scroll
  const section = document.getElementById("continueSection");
  const container = document.getElementById("continueContainer");
  let offset = 0;
  const limit = 15;
  const list = JSON.parse(localStorage.getItem("continueWatchingList") || "[]");

  function loadBatch() {
    const slice = list.slice(offset, offset + limit);
    slice.forEach(item => {
      const a = document.createElement("a");
      a.href = item.url;
      a.className = "movie-card";
      a.innerHTML = `
        <img src="\${item.poster}" alt="\${item.title}">
        <div class="movie-info">
          <h3>\${item.title}</h3>
          <p>\${item.date}</p>
        </div>
      `;
      container.appendChild(a);
    });
    offset += slice.length;
    if (offset >= list.length) {
      window.removeEventListener("scroll", onScroll);
    }
  }

  function onScroll() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
      loadBatch();
    }
  }

  if (list.length) {
    section.style.display = "block";
    loadBatch();
    window.addEventListener("scroll", onScroll);
  }
});
