/** @type {import('tailwindcss').Config} */
// Content globs must cover every place Tailwind class names appear as string
// literals: Jinja templates, the JS visualizations (which build HTML with
// utility classes), blog markdown (posts can embed raw HTML), and the
// projects data (project pages render fields from it).
module.exports = {
  content: [
    './templates/**/*.html',
    './static/js/**/*.js',
    './content/blog/**/*.md',
    './content/projects.json',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
