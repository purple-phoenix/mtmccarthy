/** @type {import('tailwindcss').Config} */
// Content globs must cover every place Tailwind class names appear as string
// literals: Jinja templates, the JS visualizations (which build HTML with
// utility classes), and blog markdown (posts can embed raw HTML).
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
