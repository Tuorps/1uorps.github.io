const yearEl = document.getElementById("year");
yearEl.textContent = new Date().getFullYear();

const identifiedSection = document.getElementById("identifiedSection");
const rareSection = document.getElementById("rareSection");
const categoriesSection = document.getElementById("categoriesSection");

// Modal elements
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalMedia = document.getElementById("modalMedia");
const modalTitle = document.getElementById("modalTitle");
const modalDesc = document.getElementById("modalDesc");

// Behavior knobs
const CATEGORIES_INCLUDE_FEATURED = false; // if true, Rare/Identified ALSO appear in Categories (duplicates)

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function norm(s) {
  return String(s || "").trim();
}

async function loadContent() {
  const res = await fetch("content.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load content.json");
  const data = await res.json();

  // Backward-compat if you ever revert to old array format
  if (Array.isArray(data)) return { categories: [], items: data, sectionDescriptions: {} };

  return {
    categories: Array.isArray(data.categories) ? data.categories : [],
    items: Array.isArray(data.items) ? data.items : [],
    sectionDescriptions: (data.sectionDescriptions && typeof data.sectionDescriptions === "object")
      ? data.sectionDescriptions
      : {}
  };
}

function sectionHeader(title, subText = "") {
  return `
    <div class="sectionHeader">
      <h2 class="sectionTitle">${escapeHtml(title)}</h2>
      ${subText ? `<p class="sectionSub">${escapeHtml(subText)}</p>` : ``}
    </div>
  `;
}

function isVideoFile(path = "") {
  const p = String(path).toLowerCase();
  return p.endsWith(".mp4") || p.endsWith(".webm") || p.endsWith(".mov");
}

function cardTemplate(item) {
  const title = escapeHtml(item.title || "");
  const desc = escapeHtml(item.description || "");

  const previewPath = (item.preview || item.gif || "").trim(); // supports old "gif" too
  const hasPreview = !!previewPath;

  const primaryMedia =
    item.type === "video"
      ? `
        <video
          class="previewVideo"
          muted
          loop
          playsinline
          preload="metadata"
          poster="${escapeHtml(item.poster || "")}"
          data-src="${escapeHtml(item.src || "")}"
        ></video>`
      : `<img loading="lazy" src="${escapeHtml(item.src || "")}" alt="${title} preview" />`;

  let previewMedia = "";
  if (hasPreview) {
    if (isVideoFile(previewPath)) {
      // Looped silent preview video (loads only when visible)
      previewMedia = `
        <video
          class="sidePreviewVideo"
          muted
          loop
          playsinline
          preload="metadata"
          data-src="${escapeHtml(previewPath)}"
        ></video>
      `;
    } else {
      // Fallback image preview (gif/webp/jpg/png)
      previewMedia = `<img loading="lazy" src="${escapeHtml(previewPath)}" alt="${title} preview clip" />`;
    }
  }

  const mediaHtml = hasPreview
    ? `
      <div class="mediaSplit">
        <div class="mediaBox" data-media="main">${primaryMedia}</div>
        <div class="mediaBox" data-media="preview">${previewMedia}</div>
      </div>
    `
    : `
      <div class="media">
        ${primaryMedia}
      </div>
    `;

  return `
    <article
      class="card"
      data-type="${escapeHtml(item.type || "image")}"
      data-src="${escapeHtml(item.src || "")}"
      data-preview="${escapeHtml(previewPath)}"
      data-poster="${escapeHtml(item.poster || "")}"
      data-title="${title}"
      data-desc="${desc}"
    >
      ${mediaHtml}
      <div class="content">
        <h3 class="title">${title}</h3>
        <p class="desc">${desc}</p>
      </div>
    </article>
  `;
}




function renderGrid(items) {
  if (!items.length) return `<div class="empty">Nothing here yet.</div>`;
  return `<div class="grid">${items.map(cardTemplate).join("")}</div>`;
}

function setupVideoLazyPlay() {
  const videos = [
    ...document.querySelectorAll(".previewVideo"),
    ...document.querySelectorAll(".sidePreviewVideo")
  ];
  if (!videos.length) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (!v.src) v.src = v.dataset.src; // only load when visible
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  }, { threshold: 0.35 });

  videos.forEach(v => io.observe(v));
}


/* ===== Modal ===== */
/* ===== Modal ===== */
function openModalFromCard(card, opts = {}) {
  const type = card.dataset.type || "image";
  const src = card.dataset.src || "";
  const preview = card.dataset.preview || "";
  const poster = card.dataset.poster || "";
  const title = card.dataset.title || "";
  const desc = card.dataset.desc || "";

  const mediaKind = opts.mediaKind || "main"; // "main" or "preview"
  const chosenSrc = (mediaKind === "preview" && preview) ? preview : src;

  modalTitle.textContent = title;
  modalDesc.textContent = desc;

  modalMedia.innerHTML = "";

  if (mediaKind === "preview" && preview) {
    if (isVideoFile(chosenSrc)) {
      const v = document.createElement("video");
      v.controls = true;
      v.playsInline = true;
      v.src = chosenSrc;
      modalMedia.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = chosenSrc;
      img.alt = title || "Preview";
      modalMedia.appendChild(img);
    }
  } else if (type === "video") {
    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.src = chosenSrc;
    if (poster) v.poster = poster;
    modalMedia.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = chosenSrc;
    img.alt = title || "Preview";
    modalMedia.appendChild(img);
  }

  modal.classList.add("isOpen");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("isOpen");
  modal.setAttribute("aria-hidden", "true");
  modalMedia.innerHTML = "";
  document.body.style.overflow = "";
}

// Close when clicking backdrop
modalBackdrop.addEventListener("click", (e) => {
  e.stopPropagation();
  closeModal();
});

// Close when clicking X
modalClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closeModal();
});

// Close on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("isOpen")) closeModal();
});



function setupCardClicks() {
  document.addEventListener("click", (e) => {
    if (modal.classList.contains("isOpen") || e.target.closest("#modal")) return;

    const card = e.target.closest(".card");
    if (!card) return;

    const box = e.target.closest(".mediaBox");
    const mediaKind = box?.dataset?.media || "main"; // "main" or "preview"

    openModalFromCard(card, { mediaKind });
  });
}




/* ===== Sections ===== */
function renderIdentified(items, sectionDescriptions) {
  const identifiedItems = items.filter(x => !!x.identified);

  if (!identifiedItems.length) {
    identifiedSection.style.display = "none";
    identifiedSection.innerHTML = "";
    return;
  }

  identifiedSection.style.display = "";
  identifiedSection.innerHTML =
    sectionHeader("Identified", norm(sectionDescriptions.identified)) +
    renderGrid(identifiedItems);
}

function renderRare(items, sectionDescriptions) {
  const rareItems = items.filter(x => !!x.rare && !x.identified);

  if (!rareItems.length) {
    rareSection.style.display = "none";
    rareSection.innerHTML = "";
    return;
  }

  rareSection.style.display = "";
  rareSection.innerHTML =
    sectionHeader("Rare Series", norm(sectionDescriptions.rare)) +
    renderGrid(rareItems);
}

function buildCategoryOrder(categoriesFromJson, items) {
  const base = (categoriesFromJson || []).map(norm).filter(Boolean);

  const used = new Set(base.map(c => c.toLowerCase()));
  const extras = [];

  for (const it of items) {
    const c = norm(it.category || "Uncategorized");
    if (!c) continue;
    const key = c.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      extras.push(c);
    }
  }

  extras.sort((a, b) => a.localeCompare(b));
  return [...base, ...extras];
}

function renderCategories(items, categoriesFromJson, sectionDescriptions) {
  const sourceItems = CATEGORIES_INCLUDE_FEATURED
    ? items
    : items.filter(x => !x.identified && !x.rare);

  const map = new Map();
  sourceItems.forEach(it => {
    const cat = norm(it.category || "") || "Uncategorized";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(it);
  });

  const order = buildCategoryOrder(categoriesFromJson, sourceItems);

  const blocks = order
    .filter(catName => (map.get(catName) || []).length > 0)
    .map(catName => {
      const group = map.get(catName) || [];
      return `
        <div class="categoryBlock">
          <h3 class="categoryTitle">${escapeHtml(catName)}</h3>
          ${renderGrid(group)}
        </div>
      `;
    }).join("");

  categoriesSection.style.display = "";
  categoriesSection.innerHTML =
    sectionHeader("Categories", norm(sectionDescriptions.categories)) +
    (blocks || `<div class="empty">No category items yet.</div>`);
}

(async function init() {
  try {
    const data = await loadContent();
    const items = data.items || [];
    const categories = data.categories || [];
    const sectionDescriptions = data.sectionDescriptions || {};

    renderIdentified(items, sectionDescriptions);
    renderRare(items, sectionDescriptions);
    renderCategories(items, categories, sectionDescriptions);

    setupVideoLazyPlay();
    setupCardClicks();
  } catch (e) {
    const msg = `Error loading previews: ${escapeHtml(e.message)}`;
    identifiedSection.style.display = "";
    identifiedSection.innerHTML = `<div class="empty">${msg}</div>`;
    rareSection.style.display = "none";
    rareSection.innerHTML = "";
    categoriesSection.style.display = "none";
    categoriesSection.innerHTML = "";
  }
  
})();
