---
title: "Testing Modern Web Applications with Playwright"
date: "2024-05-01"
category: "Testing & Quality"
excerpt: "Learn how to build comprehensive test suites for modern web applications using Playwright, covering end-to-end testing, component testing, and best practices."
read_time: "12"
image_url: "/static/images/playwright-logo.png"
---

Testing is crucial for building reliable web applications. Playwright has emerged as a powerful tool for end-to-end testing, offering cross-browser support, reliable automation, and excellent developer experience. Whether you're building with React, Next.js, or traditional server-rendered apps, Playwright can help ensure your application works correctly.

## Why Playwright?

Playwright offers several advantages over other testing tools:

- **Cross-browser testing** (Chromium, Firefox, WebKit)
- **Auto-waiting** for elements and network requests
- **Reliable selectors** and built-in retry logic
- **Screenshot and video** capture for debugging
- **Network interception** for API mocking
- **Mobile device emulation**

## Setting Up Playwright

Install Playwright in your project:

```bash
npm init -y
npm install -D @playwright/test
npx playwright install
```

Create a `playwright.config.ts` file:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Writing Your First Test

Here's a simple test for a homepage:

```typescript
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  
  // Check page title
  await expect(page).toHaveTitle(/Matt McCarthy/);
  
  // Check heading
  const heading = page.getByRole('heading', { name: /Hi, I'm Matt/i });
  await expect(heading).toBeVisible();
  
  // Check navigation links
  const projectsLink = page.getByRole('link', { name: /projects/i });
  await expect(projectsLink).toBeVisible();
});
```

## Testing User Interactions

Test forms, buttons, and user flows:

```typescript
test('contact form submission', async ({ page }) => {
  await page.goto('/about#get-in-touch');
  
  // Fill out form
  await page.fill('input[name="name"]', 'John Doe');
  await page.fill('input[name="email"]', 'john@example.com');
  await page.fill('textarea[name="message"]', 'Test message');
  
  // Submit form
  await page.click('button[type="submit"]');
  
  // Verify success message
  await expect(page.getByText(/thank you/i)).toBeVisible();
});

test('navigation between pages', async ({ page }) => {
  await page.goto('/');
  
  // Click projects link
  await page.click('a[href="/projects"]');
  
  // Verify we're on projects page
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByRole('heading', { name: /my projects/i })).toBeVisible();
});
```

## Testing API Interactions

Mock API responses for reliable testing:

```typescript
test('projects page loads projects from API', async ({ page }) => {
  // Intercept API request
  await page.route('**/api/projects', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          title: 'Test Project',
          description: 'A test project',
          tags: ['React', 'TypeScript']
        }
      ])
    });
  });
  
  await page.goto('/projects');
  
  // Verify project is displayed
  await expect(page.getByText('Test Project')).toBeVisible();
});
```

## Component Testing

For React/Next.js applications, test components in isolation:

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import { ProjectCard } from './ProjectCard';

test('project card displays correctly', async ({ mount }) => {
  const component = await mount(
    <ProjectCard
      title="Test Project"
      description="Test description"
      tags={['React', 'TypeScript']}
    />
  );
  
  await expect(component.getByText('Test Project')).toBeVisible();
  await expect(component.getByText('Test description')).toBeVisible();
});
```

## Best Practices

### 1. Use Semantic Selectors

Prefer role-based and text-based selectors:

```typescript
// Good
await page.getByRole('button', { name: /submit/i }).click();
await page.getByLabel('Email').fill('test@example.com');

// Avoid
await page.click('#submit-button-123');
await page.fill('input[type="email"]', 'test@example.com');
```

### 2. Organize Tests Logically

Structure your test files by feature:

```
tests/
  ├── homepage.spec.ts
  ├── projects.spec.ts
  ├── blog.spec.ts
  └── contact.spec.ts
```

### 3. Use Page Object Model

Create reusable page objects:

```typescript
// pages/ProjectsPage.ts
export class ProjectsPage {
  constructor(private page: Page) {}
  
  async goto() {
    await this.page.goto('/projects');
  }
  
  async getProjectCard(title: string) {
    return this.page.getByRole('article').filter({ hasText: title });
  }
  
  async clickProject(title: string) {
    await this.getProjectCard(title).click();
  }
}

// tests/projects.spec.ts
test('viewing project details', async ({ page }) => {
  const projectsPage = new ProjectsPage(page);
  await projectsPage.goto();
  await projectsPage.clickProject('LSTM Stock Price Prediction');
  // ...
});
```

### 4. Handle Async Operations

Playwright auto-waits, but be explicit when needed:

```typescript
// Wait for network to be idle
await page.goto('/', { waitUntil: 'networkidle' });

// Wait for specific element
await page.waitForSelector('.loading-spinner', { state: 'hidden' });

// Wait for API response
await page.waitForResponse(response => 
  response.url().includes('/api/projects') && response.status() === 200
);
```

## Visual Regression Testing

Capture and compare screenshots:

```typescript
test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png');
});
```

## Running Tests

Run tests in different modes:

```bash
# Run all tests
npx playwright test

# Run in UI mode (interactive)
npx playwright test --ui

# Run specific test file
npx playwright test projects.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run on specific browser
npx playwright test --project=firefox
```

## CI/CD Integration

Add Playwright to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Real-World Example: Testing Thrive Beyond Coaching

In my Thrive Beyond Coaching project, I use Playwright to test:

- **Page navigation** across all routes
- **Contact form** submission and validation
- **Responsive design** on different screen sizes
- **Accessibility** with automated checks
- **Performance** metrics

This ensures the site works reliably for users seeking coaching services.

## Conclusion

Playwright makes comprehensive testing of modern web applications straightforward. Start with critical user flows, gradually expand coverage, and use Playwright's powerful features to catch bugs before they reach production. Good testing practices lead to more reliable applications and confident deployments.
