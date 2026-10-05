import { Dashboard } from './dashboard';
import { ExtensionStore } from '../services/storage';
// A removed host is remounted by TornObserver. One isolated-world bootstrap per document.
let dashboard: Dashboard | undefined;
void Dashboard.mount(new ExtensionStore()).then(value => { dashboard = value; }).catch(() => {
  console.warn('[TornDashboard] Unable to initialize. Reload Torn after loading the extension.');
});
window.addEventListener('pagehide', event => { if (!event.persisted) dashboard?.destroy(); });
