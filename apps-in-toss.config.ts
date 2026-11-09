import { defineConfig } from '@apps-in-toss/web-framework/config';
import game from './game.config.json';
// 사천팝(~/sachunpop apps-in-toss.config.ts)과 같은 설정. webBundleDir = npm run build:toss 의 출력.
export default defineConfig({
  appName: game.appName,
  brand: { primaryColor: game.primaryColor },
  permissions: [],
  navigationBar: { withBackButton: false, withHomeButton: true, withTitle: false },
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never' },
  webBundleDir: 'dist/toss/web'
});
