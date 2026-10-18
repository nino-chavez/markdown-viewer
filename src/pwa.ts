type FileLaunch = { files: Pick<FileSystemFileHandle, 'getFile'>[] };
type LaunchWindow = Window & {
  launchQueue?: { setConsumer: (consumer: (launch: FileLaunch) => void) => void };
};
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// File handles stay in memory. The existing reader validates the selected bytes.
export function receiveFileLaunches(
  target: LaunchWindow,
  openFiles: (files: File[]) => Promise<void>,
  report: (message: string, error?: boolean) => void,
) {
  let pending = Promise.resolve();
  target.launchQueue?.setConsumer(({ files }) => {
    if (!files.length) return;
    // Finder can send another launch while the previous files are still loading.
    pending = pending.then(async () => {
      if (files.length > 1000) {
        report('Choose up to 1,000 files at a time.', true);
        return;
      }
      const selected: File[] = [];
      let unreadable = 0;
      for (const handle of files) {
        try { selected.push(await handle.getFile()); }
        catch { unreadable++; }
      }
      if (selected.length) await openFiles(selected);
      if (unreadable) report('Some files could not be read. Choose Open file to select them again.', true);
    }).catch(() => report('Could not open these files. Choose Open file to try again.', true));
  });
}

export function setupPWA(openFiles: (files: File[]) => Promise<void>, report: (message: string, error?: boolean) => void) {
  // The downloadable HTML has no manifest and keeps its zero-network behavior.
  if (!document.querySelector('link[rel="manifest"]')) return;
  receiveFileLaunches(window, openFiles, report);

  const controls = document.getElementById('app-controls')!;
  const install = document.getElementById('install-app') as HTMLButtonElement;
  const help = document.getElementById('app-help') as HTMLButtonElement;
  const dialog = document.getElementById('app-dialog') as HTMLDialogElement;
  const status = document.getElementById('offline-status')!;
  const standalone = matchMedia('(display-mode: standalone)');
  let prompt: InstallPrompt | undefined;
  let returnFocus: HTMLElement | null = null;
  const openHelp = () => { returnFocus = document.activeElement as HTMLElement; dialog.showModal(); };
  controls.hidden = false;
  install.hidden = standalone.matches;
  standalone.addEventListener('change', () => { install.hidden = standalone.matches; });
  help.onclick = openHelp;
  document.getElementById('close-app-help')!.onclick = () => dialog.close();
  dialog.addEventListener('close', () => returnFocus?.focus());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => { prompt = undefined; install.hidden = true; });
  install.onclick = async () => {
    if (!prompt) { openHelp(); return; }
    const current = prompt;
    prompt = undefined;
    try { await current.prompt(); await current.userChoice; }
    catch { openHelp(); }
  };

  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Use the HTML download for offline reading in this browser.';
    return;
  }
  status.textContent = 'Preparing offline reading…';
  void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(async registration => {
    const showUpdate = () => {
      if (registration.waiting) status.textContent = 'Update ready. Close all viewer windows to apply it.';
    };
    const watchInstall = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') showUpdate();
        if (worker.state === 'redundant' && !registration.active) {
          status.textContent = 'Offline setup failed. Reopen while online to retry.';
        }
      });
    };
    registration.addEventListener('updatefound', watchInstall);
    watchInstall();
    await navigator.serviceWorker.ready;
    status.textContent = 'Ready for offline reading.';
    showUpdate();
  }).catch(() => { status.textContent = 'Offline setup failed. Reopen while online to retry.'; });
}
