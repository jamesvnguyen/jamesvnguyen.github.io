// Articles are read straight from GitHub. Any Markdown file named
// YYYY-MM-DD-some-title.md in the repos below is published automatically.
const CONFIG = {
  user: "jamesvnguyen",
  repos: ["k8s-tooling-101"],
  branch: "main",
};

const POST_RE = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})-[^/]+\.md$/;
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

const rawUrl = (repo, path) => `${RAW}/${CONFIG.user}/${repo}/${CONFIG.branch}/${path}`;
const blobUrl = (repo, path) => `https://github.com/${CONFIG.user}/${repo}/blob/${CONFIG.branch}/${path}`;
const treeUrl = (repo, path) => `https://github.com/${CONFIG.user}/${repo}/tree/${CONFIG.branch}/${path}`;
const historyUrl = (repo, path) => `https://github.com/${CONFIG.user}/${repo}/commits/${CONFIG.branch}/${path}`;
const postLink = (repo, path) => `post.html?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`;

function formatDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function dateFromPath(path) {
  const m = path.match(POST_RE);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
function readingTime(text) {
  const prose = text.replace(/```[\s\S]*?```/g, " ");
  return Math.max(1, Math.round(prose.split(/\s+/).length / 220));
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Strips Markdown syntax from a line so it reads as plain text.
function plain(s) {
  return s.replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
}

// Splits a Markdown file into title (first "# " heading), summary (first paragraph) and body.
function parseArticle(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let title = "", i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && /^#\s+/.test(lines[i])) { title = lines[i].replace(/^#\s+/, "").trim(); i++; }
  const body = lines.slice(i).join("\n");
  const summary = (body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !/^[#|<`>\-]/.test(p)) || "");
  return { title, summary: plain(summary.replace(/\n/g, " ")), body };
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function listArticles() {
  const all = [];
  for (const repo of CONFIG.repos) {
    const tree = await getJSON(`${API}/repos/${CONFIG.user}/${repo}/git/trees/${CONFIG.branch}?recursive=1`);
    for (const item of tree.tree) {
      if (item.type === "blob" && POST_RE.test(item.path)) all.push({ repo, path: item.path, date: dateFromPath(item.path) });
    }
  }
  all.sort((a, b) => b.date - a.date);
  await Promise.all(all.map(async a => {
    try {
      const md = await getText(rawUrl(a.repo, a.path));
      Object.assign(a, parseArticle(md));
      a.minutes = readingTime(md);
    } catch { /* keep the filename-based fallback below */ }
    if (!a.title) a.title = a.path.split("/").pop().replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "").replace(/-/g, " ");
  }));
  return all;
}

const FALLBACK = repo => `<p class="status">Couldn’t load from GitHub right now. Browse the articles directly on <a href="https://github.com/${CONFIG.user}/${repo}">GitHub</a>.</p>`;

async function renderHome() {
  const listEl = document.getElementById("articles");
  const actEl = document.getElementById("activity");
  try {
    const articles = await listArticles();
    listEl.innerHTML = articles.length ? `<ol class="post-list">${articles.map(a => `
      <li>
        <a class="post-title" href="${postLink(a.repo, a.path)}">${escapeHtml(a.title)}</a>
        <p class="post-meta"><time datetime="${a.date.toISOString().slice(0, 10)}">${formatDate(a.date)}</time>${a.minutes ? ` · ${a.minutes} min read` : ""}</p>
        ${a.summary ? `<p class="post-summary">${escapeHtml(a.summary)}</p>` : ""}
      </li>`).join("")}</ol>` : `<p class="status">First articles are on the way.</p>`;
  } catch {
    listEl.innerHTML = FALLBACK(CONFIG.repos[0]);
  }
  try {
    const lists = await Promise.all(CONFIG.repos.map(repo =>
      getJSON(`${API}/repos/${CONFIG.user}/${repo}/commits?per_page=6`).then(cs => cs.map(c => ({ repo, c })))));
    const commits = lists.flat().sort((a, b) => new Date(b.c.commit.author.date) - new Date(a.c.commit.author.date)).slice(0, 6);
    actEl.innerHTML = commits.length ? `<ul class="activity">${commits.map(({ repo, c }) => `
      <li><time datetime="${c.commit.author.date}">${formatDate(new Date(c.commit.author.date))}</time>
      <a href="${c.html_url}">${escapeHtml(c.commit.message.split("\n")[0])} <span class="post-meta">in ${repo}</span></a></li>`).join("")}</ul>`
      : `<p class="status">No activity yet.</p>`;
  } catch {
    actEl.innerHTML = `<p class="status">See recent changes on <a href="https://github.com/${CONFIG.user}">GitHub</a>.</p>`;
  }
}

function slugify(text, used) {
  let base = text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "section";
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

async function renderPost() {
  const params = new URLSearchParams(location.search);
  const repo = params.get("repo") || CONFIG.repos[0];
  const path = params.get("path") || "";
  const el = document.getElementById("post");
  if (!CONFIG.repos.includes(repo) || !POST_RE.test(path) || path.includes("..")) {
    el.innerHTML = `<h1>Article not found</h1><p><a href="./">← All articles</a></p>`;
    return;
  }
  let md;
  try { md = await getText(rawUrl(repo, path)); }
  catch { el.innerHTML = `<h1>Article not found</h1>${FALLBACK(repo)}`; return; }

  const { title, summary, body } = parseArticle(md);
  const date = dateFromPath(path);
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const topic = folder.split("/").filter(Boolean).pop();
  document.title = `${title} · James Van Nguyen`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", summary);

  const html = DOMPurify.sanitize(marked.parse(body, { gfm: true }), { ADD_ATTR: ["valign"] });
  el.innerHTML = `
    <header class="page-head">
      <h1>${escapeHtml(title)}</h1>
      <p class="post-meta"><time datetime="${date.toISOString().slice(0, 10)}">${formatDate(date)}</time> · ${readingTime(md)} min read
        ${topic ? ` · <span class="tag">${escapeHtml(topic.toLowerCase())}</span>` : ""}</p>
      <p class="post-meta" id="updated"></p>
    </header>
    <p class="source-note">The example files for this lesson are in <a href="${treeUrl(repo, folder)}">${escapeHtml(repo)}/${escapeHtml(folder)}</a> on GitHub, so you can clone the repo and follow along.</p>
    <div id="toc-slot"></div>
    <div class="prose">${html}</div>
    <footer class="post-foot">
      <a href="./">← All articles</a>
      <span><a href="${blobUrl(repo, path)}">View source</a> · <a href="${historyUrl(repo, path)}">Change history</a></span>
    </footer>`;

  const prose = el.querySelector(".prose");

  // Links and images that point at files in the repo
  const base = new URL(`https://x/${folder}`);
  prose.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    if (/^(https?:|mailto:|#)/.test(href)) return;
    const p = new URL(href, base).pathname.slice(1);
    a.href = href.endsWith("/") ? treeUrl(repo, p) : blobUrl(repo, p);
  });
  prose.querySelectorAll("img[src]").forEach(img => {
    const src = img.getAttribute("src");
    if (!/^https?:/.test(src)) img.src = rawUrl(repo, new URL(src, base).pathname.slice(1));
  });

  // Heading anchors and a table of contents
  const used = new Set();
  const h2s = [...prose.querySelectorAll("h2, h3")].map(h => { h.id = slugify(h.textContent, used); return h; }).filter(h => h.tagName === "H2");
  if (h2s.length >= 4) {
    document.getElementById("toc-slot").innerHTML = `<details class="toc" open><summary>On this page</summary><ul>${
      h2s.map(h => `<li><a href="#${h.id}">${escapeHtml(h.textContent)}</a></li>`).join("")}</ul></details>`;
  }
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();

  // Mermaid diagrams and syntax highlighting
  const diagrams = [...prose.querySelectorAll("pre > code.language-mermaid")];
  diagrams.forEach(code => {
    const div = document.createElement("pre");
    div.className = "mermaid";
    div.textContent = code.textContent;
    code.parentElement.replaceWith(div);
  });
  if (diagrams.length && window.mermaid) {
    const dark = document.documentElement.dataset.theme === "dark";
    mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral" });
    mermaid.run({ nodes: prose.querySelectorAll(".mermaid") }).catch(() => {});
  }
  if (window.hljs) prose.querySelectorAll("pre code").forEach(c => hljs.highlightElement(c));

  // "Updated" date from the file's latest commit
  try {
    const [c] = await getJSON(`${API}/repos/${CONFIG.user}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`);
    if (c) {
      const updated = new Date(c.commit.author.date);
      if (updated.toISOString().slice(0, 10) !== date.toISOString().slice(0, 10)) {
        document.getElementById("updated").innerHTML = `Updated <a href="${historyUrl(repo, path)}">${formatDate(updated)}</a>`;
      }
    }
  } catch { /* the date is optional */ }
}

if (document.getElementById("articles")) renderHome();
if (document.getElementById("post")) renderPost();

// Light / dark toggle
const toggle = document.getElementById("theme-toggle");
if (toggle) {
  const label = () => { toggle.textContent = document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode"; };
  label();
  toggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    label();
    if (document.querySelector(".mermaid")) location.reload(); // redraw diagrams in the new colors
  });
}
