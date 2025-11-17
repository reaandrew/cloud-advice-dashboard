# Screenshot Pages Script

This script uses Playwright to automatically visit all pages in the application and capture full-page screenshots with directory structure matching the URL paths. It supports both desktop and mobile (iPhone) views.

## Installation

First, install Playwright and required dependencies:

```bash
npm install
npx playwright install chromium
```

## Usage

Make sure your application is running first:

```bash
cd portal && node app.js
```

Then in another terminal, run the screenshot script:

```bash
# Capture both desktop and mobile screenshots (default)
npm run screenshot

# Capture only desktop screenshots
node scripts/screenshot-pages.js http://localhost:3000 ./screenshots desktop

# Capture only mobile screenshots
node scripts/screenshot-pages.js http://localhost:3000 ./screenshots mobile

# Capture both desktop and mobile
node scripts/screenshot-pages.js http://localhost:3000 ./screenshots all
```

## Arguments

1. **Base URL** (optional): The base URL of your application (default: `http://localhost:3000`)
2. **Output Directory** (optional): Where to save screenshots (default: `./screenshots`)
3. **Mode** (optional): Screenshot mode - `desktop`, `mobile`, or `all` (default: `all`)

## Examples

```bash
# Default settings (both desktop and mobile)
npm run screenshot

# Only desktop screenshots
node scripts/screenshot-pages.js http://localhost:8080 ./screenshots desktop

# Only mobile screenshots with custom URL
node scripts/screenshot-pages.js http://localhost:8080 ./screenshots mobile

# Production environment - both views
node scripts/screenshot-pages.js https://my-app.example.com ./production-screenshots all
```

## Mobile Screenshots

Mobile screenshots are captured using iPhone 15 Pro dimensions (393x852) and are automatically placed inside an iPhone frame mockup with:
- Rounded corners matching iPhone design
- Device notch at the top
- Dark device frame
- Proper screen aspect ratio

Mobile screenshots are saved with a `-mobile` suffix (e.g., `home-mobile.png`).

## Output Structure

Screenshots are saved with a directory structure matching the URL paths. When capturing both desktop and mobile, each page will have two screenshots:

```
screenshots/
├── home.png                          (/ - desktop)
├── home-mobile.png                   (/ - mobile with iPhone frame)
├── compliance.png                    (/compliance - desktop)
├── compliance-mobile.png             (/compliance - mobile)
├── compliance/
│   ├── tenants.png                   (/compliance/tenants - desktop)
│   ├── tenants-mobile.png            (/compliance/tenants - mobile)
│   ├── teams.png                     (/compliance/teams - desktop)
│   ├── teams-mobile.png              (/compliance/teams - mobile)
│   ├── tagging.png                   (/compliance/tagging - desktop)
│   ├── tagging-mobile.png            (/compliance/tagging - mobile)
│   ├── tagging/
│   │   └── teams.png                 (/compliance/tagging/teams)
│   ├── database.png                  (/compliance/database)
│   ├── loadbalancers.png             (/compliance/loadbalancers)
│   ├── loadbalancers/
│   │   ├── tls.png                   (/compliance/loadbalancers/tls)
│   │   └── types.png                 (/compliance/loadbalancers/types)
│   ├── kms.png                       (/compliance/kms)
│   └── autoscaling.png               (/compliance/autoscaling)
└── policies.png                      (/policies)
```

## Adding More URLs

To add more URLs to screenshot, edit the `URLS` array in `scripts/screenshot-pages.js`:

```javascript
const URLS = [
    '/',
    '/compliance',
    '/compliance/tenants',
    // Add your URLs here
    '/my-new-page',
];
```

## Configuration

You can modify the script to:
- Change viewport sizes (default desktop: 1920x1080, mobile: 393x852)
- Adjust iPhone frame design and dimensions
- Modify timeouts
- Add authentication
- Customize screenshot options (quality, format, etc.)
- Add more device types (tablet, etc.)

See the `DEVICES` configuration object in the script file for more details.
