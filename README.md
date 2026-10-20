# jamesvnguyen.github.io

Personal site: articles, resume, and recent activity. Plain HTML, no build step.

## How articles work

Articles aren't stored here. The site reads them straight from GitHub when someone visits:

- Any Markdown file named `YYYY-MM-DD-title.md` in `k8s-tooling-101` shows up on the home page, newest first.
- The title comes from the file's first `# ` heading, the date from the filename, and the summary from the first paragraph.
- Pushing an edit to the article updates the site automatically, and the article shows an "Updated" date.

To publish from another repo too, add its name to `repos` at the top of `assets/site.js`.

## Files

- `index.html` – article list and recent activity
- `post.html` – renders one article
- `resume.html` – resume
- `assets/site.js` – loads articles and activity from GitHub
- `assets/style.css` – styles
