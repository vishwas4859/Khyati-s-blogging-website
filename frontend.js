const bookData = [
  { title: "Normal People", color: "#7b2d42", h: 200, w: 38 },
  { title: "Rebecca", color: "#2c3e50", h: 220, w: 34 },
  { title: "Name of Wind", color: "#4a3728", h: 240, w: 42 },
  { title: "Midnight Library", color: "#1a3a4a", h: 190, w: 36 },
  { title: "ACOTAR", color: "#3d2c4e", h: 230, w: 40 },
];

let reviews = [];
let allComments = {};
let selectedCover = "📖";
let selectedStars = 5;
let isAdmin = false;
let currentFilter = "all";
let editingId = null;
let currentPostId = null;
const likedPostIds = new Set(JSON.parse(localStorage.getItem("likedPostIds") || "[]"));

function persistLikedPostIds() {
  localStorage.setItem("likedPostIds", JSON.stringify([...likedPostIds]));
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function genreLabel(genre) {
  return genre.replaceAll("-", " ");
}

function genreColor(genre) {
  const colors = {
    "literary-fiction": "linear-gradient(135deg,#2c1f2e,#4a2c38)",
    romance: "linear-gradient(135deg,#5c2030,#7b2d42)",
    fantasy: "linear-gradient(135deg,#1a2c3e,#2d3f58)",
    classics: "linear-gradient(135deg,#2c2010,#4a3828)",
    mystery: "linear-gradient(135deg,#1a1a2e,#2d2d4a)",
    "non-fiction": "linear-gradient(135deg,#1a2e1a,#2d4a2d)",
  };
  return colors[genre] || "linear-gradient(135deg,var(--deep),#3a2c42)";
}

function starsHtml(count) {
  return Array.from({ length: 5 }, (_, index) => `<span class="star">${index < count ? "⭐" : "☆"}</span>`).join("");
}

async function api(path, options = {}) {
  const config = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {},
  };

  if (options.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, config);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function syncLikedState() {
  reviews = reviews.map((review) => ({
    ...review,
    liked: likedPostIds.has(Number(review.id)),
  }));
}

function applyAuthUi() {
  document.getElementById("loginBtn").style.display = isAdmin ? "none" : "";
  document.getElementById("logoutBtn").style.display = isAdmin ? "" : "none";
  document.getElementById("nb-admin").style.display = isAdmin ? "" : "none";
}

async function loadAppData() {
  const data = await api("/api/bootstrap");
  reviews = data.reviews || [];
  allComments = data.commentsByPost || {};
  isAdmin = Boolean(data.session?.isAdmin);
  syncLikedState();
  applyAuthUi();
}

function currentPageName() {
  const active = document.querySelector(".page.active");
  return active?.id?.replace("page-", "") || "home";
}

function rerenderCurrentPage() {
  renderReviews();
  renderSidebar();

  if (currentPostId) {
    renderPost(currentPostId);
  }

  if (currentPageName() === "about") {
    const aboutStat = document.getElementById("aStatReviews");
    if (aboutStat) {
      aboutStat.textContent = reviews.filter((review) => review.status === "published").length;
    }
  }

  if (isAdmin) {
    updateAdminStats();
    if (document.getElementById("adm-posts").style.display !== "none") {
      renderAdminTable();
    }
    if (document.getElementById("adm-comments").style.display !== "none") {
      renderAdminComments();
    }
  }
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

function buildHeroBooks() {
  const wrap = document.getElementById("heroBooks");
  if (!wrap) {
    return;
  }

  wrap.innerHTML = bookData
    .map(
      (book) => `
        <div class="book-spine" style="background:${book.color};width:${book.w}px;height:${book.h}px">
          <span class="book-spine-title">${escapeHtml(book.title)}</span>
        </div>
      `,
    )
    .join("");
}

function goPage(name) {
  if (name === "admin" && !isAdmin) {
    openModal();
    toast("🔐 Sign in to open the admin portal.");
    return;
  }

  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");
  document.querySelectorAll('.nav-btn[id^="nb-"]').forEach((button) => button.classList.remove("active"));
  const navButton = document.getElementById(`nb-${name}`);
  if (navButton) {
    navButton.classList.add("active");
  }

  window.scrollTo(0, 0);

  if (name === "home") {
    renderReviews();
    renderSidebar();
  }

  if (name === "about") {
    const aboutStat = document.getElementById("aStatReviews");
    if (aboutStat) {
      aboutStat.textContent = reviews.filter((review) => review.status === "published").length;
    }
  }

  if (name === "admin") {
    switchAdmin("overview", document.querySelectorAll(".a-nav-item")[0]);
    updateAdminStats();
  }
}

function openModal() {
  document.getElementById("loginModal").classList.add("open");
}

function closeModal() {
  document.getElementById("loginModal").classList.remove("open");
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;

  try {
    await api("/api/login", {
      method: "POST",
      body: { email, password },
    });
    await loadAppData();
    closeModal();
    toast("📖 Welcome back, Celeste.");
    goPage("admin");
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

async function doLogout() {
  try {
    await api("/api/logout", { method: "POST" });
    await loadAppData();
    currentPostId = null;
    goPage("home");
    toast("👋 Signed out.");
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

function renderReviews() {
  const visible = reviews.filter(
    (review) => review.status === "published" && (currentFilter === "all" || review.genre === currentFilter),
  );
  const grid = document.getElementById("reviewsGrid");
  if (!grid) {
    return;
  }

  if (visible.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);font-style:italic;padding:20px 0">No reviews in this genre yet — check back soon.</p>';
    return;
  }

  grid.innerHTML = visible
    .map(
      (review) => `
        <div class="review-card">
          <div class="book-cover" style="background:${genreColor(review.genre)}">${escapeHtml(review.emoji)}</div>
          <div class="review-body">
            <div class="review-meta">
              <span class="genre-tag">${escapeHtml(genreLabel(review.genre))}</span>
              <span class="review-date">${escapeHtml(review.date)}</span>
            </div>
            <div class="star-row">${starsHtml(review.stars)}</div>
            <div class="review-title">${escapeHtml(review.title)}</div>
            <div class="review-author">by ${escapeHtml(review.bookAuthor)}</div>
            <div class="review-excerpt">${escapeHtml(review.excerpt)}</div>
            <div class="review-footer">
              <div class="reviewer-info">
                <div class="reviewer-avatar">📖</div>
                <div class="reviewer-name">Celeste Ashford</div>
              </div>
              <div class="card-actions">
                <button class="like-mini" onclick="quickLike(event,${review.id})">${review.liked ? "🩷" : "🤍"} ${review.likes}</button>
                <button class="read-more" onclick="openReview(${review.id})">Read review →</button>
              </div>
            </div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebarContent");
  if (!sidebar) {
    return;
  }

  const loved = [...reviews]
    .filter((review) => review.status === "published")
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 4);

  sidebar.innerHTML = `
    <div class="sidebar-card">
      <div class="sidebar-title">📖 Currently Reading</div>
      <div class="reading-now">
        <div class="reading-cover" style="background:linear-gradient(135deg,#4a3728,#2c1f1a)">🌿</div>
        <div>
          <div class="reading-title">Braiding Sweetgrass</div>
          <div class="reading-auth">Robin Wall Kimmerer</div>
          <div class="progress-bar"><div class="progress-fill" style="width:68%"></div></div>
          <div class="progress-label">68% through · review coming soon</div>
        </div>
      </div>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-title">⭐ Most Loved</div>
      <ul class="top-list">
        ${loved
          .map(
            (review, index) => `
              <li>
                <span class="top-num">${index + 1}</span>
                <div class="top-info">
                  <div class="top-book-title">${escapeHtml(review.title.substring(0, 38))}${review.title.length > 38 ? "…" : ""}</div>
                  <div class="top-book-auth">${escapeHtml(review.bookAuthor)} · 🩷 ${review.likes}</div>
                </div>
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-title">✨ Reading Moods</div>
      <div class="mood-tags">
        <span class="mood-tag">Cry Your Eyes Out</span>
        <span class="mood-tag">Slow & Atmospheric</span>
        <span class="mood-tag">Cannot Put Down</span>
        <span class="mood-tag">Late Night Read</span>
        <span class="mood-tag">Comfort Reread</span>
        <span class="mood-tag">Life Changing</span>
      </div>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-title">💬 Quote of the Week</div>
      <div class="quote-block">
        <div class="quote-text">"A reader lives a thousand lives before he dies. The man who never reads lives only one."</div>
        <div class="quote-attr">— George R.R. Martin</div>
      </div>
    </div>
  `;
}

function filterGenre(genre, button) {
  currentFilter = genre;
  document.querySelectorAll(".genre-chip").forEach((chip) => chip.classList.remove("active"));
  button.classList.add("active");
  renderReviews();
}

async function updateReviewLike(reviewId, source) {
  const review = reviews.find((item) => item.id === reviewId);
  if (!review) {
    return;
  }

  const liked = !likedPostIds.has(reviewId);

  try {
    const data = await api(`/api/reviews/${reviewId}/like`, {
      method: "POST",
      body: { liked },
    });

    if (liked) {
      likedPostIds.add(reviewId);
    } else {
      likedPostIds.delete(reviewId);
    }

    persistLikedPostIds();
    review.likes = data.likes;
    review.liked = liked;
    renderReviews();
    renderSidebar();
    if (source === "post") {
      renderPost(reviewId);
    }
    toast(liked ? "🩷 Added to your favourites!" : "🤍 Removed.");
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

function quickLike(event, reviewId) {
  event.stopPropagation();
  updateReviewLike(reviewId, "home");
}

function scrollToReviews() {
  document.getElementById("mainWrap").scrollIntoView({ behavior: "smooth" });
}

function renderReviewBody(review) {
  return escapeHtml(review.content)
    .replace(/^\[VERDICT\] (.+)$/gm, `<div class="verdict-box"><div class="verdict-stars">${"⭐".repeat(review.stars)}</div><div><div class="verdict-title">The Verdict</div><div class="verdict-text">$1</div></div></div>`)
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function renderPost(reviewId) {
  const review = reviews.find((item) => item.id === reviewId);
  if (!review || review.status !== "published") {
    goPage("home");
    return;
  }

  currentPostId = reviewId;
  const comments = allComments[reviewId] || [];
  const body = renderReviewBody(review);

  document.getElementById("postContent").innerHTML = `
    <button class="back-btn" onclick="goPage('home')">← Back to reviews</button>
    <div class="review-page-header">
      <div class="review-book-cover-lg" style="background:${genreColor(review.genre)}">${escapeHtml(review.emoji)}</div>
      <span class="review-page-genre">${escapeHtml(genreLabel(review.genre))}</span>
      <h1 class="review-page-title">${escapeHtml(review.title)}</h1>
      <div class="review-page-bookauthor">by ${escapeHtml(review.bookAuthor)}</div>
      <div class="review-page-stars">${starsHtml(review.stars)}</div>
      <div class="review-page-meta">
        <span>📖 Celeste Ashford</span>
        <span>📅 ${escapeHtml(review.date)}</span>
        <span>🩷 ${review.likes} likes</span>
      </div>
    </div>
    <div class="page-divider"></div>
    <div class="review-page-body"><p>${body}</p></div>
    <div class="like-section">
      <button class="like-btn-lg ${review.liked ? "liked" : ""}" onclick="likeReview(${reviewId})">
        ${review.liked ? "🩷 Loved it" : "🤍 Love this review"} <span>${review.likes}</span>
      </button>
    </div>
    <div class="comments-section">
      <div class="comments-heading">💬 ${comments.length} Reader${comments.length !== 1 ? "s" : ""} Responded</div>
      <div class="comment-form-area">
        <textarea class="c-input" rows="3" placeholder="Share your thoughts on this book…" id="cInput-${reviewId}"></textarea>
        <button class="btn-publish" style="font-size:.88rem;padding:9px 22px" onclick="addComment(${reviewId})">Post Comment →</button>
      </div>
      <div id="cList-${reviewId}">
        ${comments
          .map(
            (comment) => `
              <div class="comment-item">
                <div class="c-avatar">${escapeHtml(comment.avatar)}</div>
                <div class="c-bubble">
                  <div class="c-name">${escapeHtml(comment.name)}</div>
                  <div class="c-text">${escapeHtml(comment.text)}</div>
                  <div class="c-time">${escapeHtml(comment.time)}</div>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function openReview(reviewId) {
  renderPost(reviewId);
  goPage("post");
}

function likeReview(reviewId) {
  updateReviewLike(reviewId, "post");
}

async function addComment(postId) {
  const input = document.getElementById(`cInput-${postId}`);
  const text = input.value.trim();
  if (!text) {
    return;
  }

  try {
    const data = await api(`/api/reviews/${postId}/comments`, {
      method: "POST",
      body: { name: "You", avatar: "📖", text },
    });

    if (!allComments[postId]) {
      allComments[postId] = [];
    }
    allComments[postId].unshift(data.comment);
    input.value = "";
    renderPost(postId);
    toast("💬 Comment posted!");
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

function switchAdmin(tab, button) {
  ["overview", "write", "posts", "comments"].forEach((name) => {
    const section = document.getElementById(`adm-${name}`);
    if (section) {
      section.style.display = "none";
    }
  });

  const target = document.getElementById(`adm-${tab}`);
  if (target) {
    target.style.display = "";
  }

  document.querySelectorAll(".a-nav-item").forEach((item) => item.classList.remove("active"));
  if (button) {
    button.classList.add("active");
  }

  if (tab === "posts") {
    renderAdminTable();
  }
  if (tab === "comments") {
    renderAdminComments();
  }
  if (tab === "overview") {
    updateAdminStats();
  }
}

function updateAdminStats() {
  const publishedCount = reviews.filter((review) => review.status === "published").length;
  const commentCount = Object.values(allComments).reduce((total, comments) => total + comments.length, 0);
  const likeCount = reviews.reduce((total, review) => total + review.likes, 0);

  const postsEl = document.getElementById("adminStatPosts");
  const commentsEl = document.getElementById("adminStatComments");
  const likesEl = document.getElementById("adminStatLikes");
  const activityEl = document.getElementById("adminActivity");

  if (postsEl) {
    postsEl.textContent = publishedCount;
  }
  if (commentsEl) {
    commentsEl.textContent = commentCount;
  }
  if (likesEl) {
    likesEl.textContent = likeCount;
  }
  if (activityEl) {
    activityEl.innerHTML = [...reviews]
      .sort((a, b) => b.id - a.id)
      .slice(0, 5)
      .map((review) => `<div>📝 ${escapeHtml(review.title.substring(0, 45))}${review.title.length > 45 ? "…" : ""} <span style="opacity:.6">— ${escapeHtml(review.date)}</span></div>`)
      .join("");
  }
}

function renderAdminTable() {
  const tbody = document.getElementById("postsTableBody");
  if (!tbody) {
    return;
  }

  tbody.innerHTML = reviews
    .map(
      (review) => `
        <tr>
          <td style="max-width:220px;color:var(--text)">
            <span style="font-size:1.2rem;margin-right:6px">${escapeHtml(review.emoji)}</span>${escapeHtml(review.title.substring(0, 32))}${review.title.length > 32 ? "…" : ""}
          </td>
          <td style="font-style:italic;color:var(--muted);font-size:.85rem">${escapeHtml(review.bookAuthor)}</td>
          <td style="color:var(--muted);font-size:.82rem">${escapeHtml(genreLabel(review.genre))}</td>
          <td style="font-size:.82rem">${"⭐".repeat(review.stars)}</td>
          <td style="color:var(--muted);font-size:.78rem">${escapeHtml(review.date)}</td>
          <td><span class="s-badge ${review.status === "published" ? "s-published" : "s-draft"}">${escapeHtml(review.status)}</span></td>
          <td>
            <div class="t-actions">
              <button class="t-edit" onclick="editReview(${review.id})">Edit</button>
              <button class="t-del" onclick="deleteReview(${review.id})">Delete</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function editReview(reviewId) {
  const review = reviews.find((item) => item.id === reviewId);
  if (!review) {
    return;
  }

  switchAdmin("write", document.querySelectorAll(".a-nav-item")[1]);
  document.getElementById("rTitle").value = review.title;
  document.getElementById("rBookAuthor").value = review.bookAuthor;
  document.getElementById("rGenre").value = review.genre;
  document.getElementById("rStatus").value = review.status;
  document.getElementById("rContent").value = review.content;
  selectedCover = review.emoji;
  selectedStars = review.stars;
  editingId = reviewId;
  document.querySelectorAll(".cover-opt").forEach((button) => {
    button.classList.toggle("sel", button.textContent === review.emoji);
  });
  setStars(review.stars);
  toast("📝 Review loaded for editing.");
}

async function deleteReview(reviewId) {
  if (!confirm("Delete this review permanently?")) {
    return;
  }

  try {
    await api(`/api/reviews/${reviewId}`, { method: "DELETE" });
    await loadAppData();
    renderAdminTable();
    updateAdminStats();
    toast("🗑️ Review deleted.");
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

function renderAdminComments() {
  const wrap = document.getElementById("adminCommentsWrap");
  if (!wrap) {
    return;
  }

  let html = "";
  reviews.forEach((review) => {
    const comments = allComments[review.id] || [];
    if (comments.length === 0) {
      return;
    }

    html += `<div class="a-card"><div class="a-card-title">💬 "${escapeHtml(review.title.substring(0, 40))}${review.title.length > 40 ? "…" : ""}"</div>`;
    comments.forEach((comment) => {
      html += `
        <div class="comment-item">
          <div class="c-avatar">${escapeHtml(comment.avatar)}</div>
          <div class="c-bubble">
            <div class="c-name">${escapeHtml(comment.name)}</div>
            <div class="c-text">${escapeHtml(comment.text)}</div>
            <div class="c-time">${escapeHtml(comment.time)}</div>
          </div>
        </div>
      `;
    });
    html += "</div>";
  });

  wrap.innerHTML = html || '<p style="color:var(--muted);font-style:italic">No comments yet.</p>';
}

function pickCover(button, emoji) {
  document.querySelectorAll(".cover-opt").forEach((item) => item.classList.remove("sel"));
  button.classList.add("sel");
  selectedCover = emoji;
}

function setStars(count) {
  selectedStars = count;
  document.querySelectorAll(".star-btn").forEach((button, index) => {
    button.classList.toggle("on", index < count);
  });
}

function insertMd(open, close) {
  const textarea = document.getElementById("rContent");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  textarea.value = `${textarea.value.substring(0, start)}${open}${selectedText}${close}${textarea.value.substring(end)}`;
  textarea.focus();
}

function resetEditor() {
  ["rTitle", "rBookAuthor", "rContent"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("rGenre").value = "";
  document.getElementById("rStatus").value = "published";
  selectedCover = "📖";
  selectedStars = 5;
  editingId = null;
  document.querySelectorAll(".cover-opt").forEach((button, index) => {
    button.classList.toggle("sel", index === 0);
  });
  setStars(5);
}

async function saveReview(status) {
  const payload = {
    title: document.getElementById("rTitle").value.trim(),
    bookAuthor: document.getElementById("rBookAuthor").value.trim(),
    genre: document.getElementById("rGenre").value,
    status,
    emoji: selectedCover,
    stars: selectedStars,
    content: document.getElementById("rContent").value.trim(),
  };

  if (!payload.title || !payload.genre || !payload.content) {
    toast("❗ Please fill in all required fields.");
    return;
  }

  try {
    if (editingId) {
      await api(`/api/reviews/${editingId}`, {
        method: "PUT",
        body: payload,
      });
      toast("✅ Review updated!");
    } else {
      await api("/api/reviews", {
        method: "POST",
        body: payload,
      });
      toast(status === "published" ? "📖 Review published!" : "💾 Saved as draft.");
    }

    resetEditor();
    await loadAppData();
    updateAdminStats();
    renderReviews();
    renderSidebar();
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

function initCursor() {
  const cursor = document.getElementById("cur");
  const ring = document.getElementById("cur-ring");
  document.addEventListener("mousemove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    setTimeout(() => {
      ring.style.left = `${event.clientX}px`;
      ring.style.top = `${event.clientY}px`;
    }, 90);
  });
}

async function init() {
  initCursor();
  buildHeroBooks();
  setStars(5);

  try {
    await loadAppData();
    rerenderCurrentPage();
  } catch (error) {
    toast(`❌ ${error.message}`);
  }
}

init();
