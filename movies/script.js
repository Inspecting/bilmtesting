// Metadata helper
function getMetadata() {
  const b = document.body;
  return {
    title: b.dataset.title || document.title,
    poster: b.dataset.poster || "",
    date: b.dataset.year || ""
  };
}

// Save function
function saveToContinueWatching() {
  const meta = getMetadata();
  const entry = {
    title: meta.title,
    poster: meta.poster,
    date: meta.date,
    url: window.location.href,
    time: Date.now()
  };
  let list = JSON.parse(localStorage.getItem("continueWatchingList") || "[]");
  list = list.filter(e => e.url !== entry.url);
  list.unshift(entry);
  localStorage.setItem("continueWatchingList", JSON.stringify(list));
}

// Overlay click
document.getElementById("playerOverlay")?.addEventListener("click", function() {
  saveToContinueWatching();
  this.remove();
}, { once: true });
