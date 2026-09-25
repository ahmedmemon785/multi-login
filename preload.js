const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig:       ()                      => ipcRenderer.invoke('get-config'),
  switchSession:   (siteId, sessionId)     => ipcRenderer.invoke('switch-session', siteId, sessionId),
  addSite:         (name, url)             => ipcRenderer.invoke('add-site', name, url),
  renameSite:      (siteId, name)          => ipcRenderer.invoke('rename-site', siteId, name),
  removeSite:      (siteId)               => ipcRenderer.invoke('remove-site', siteId),
  addSession:      (siteId, label)         => ipcRenderer.invoke('add-session', siteId, label),
  renameSession:   (sessionId, label)      => ipcRenderer.invoke('rename-session', sessionId, label),
  removeSession:   (sessionId)             => ipcRenderer.invoke('remove-session', sessionId),
  hideView:          ()      => ipcRenderer.invoke('hide-view'),
  showView:          ()      => ipcRenderer.invoke('show-view'),
  setSidebarWidth:   (w)     => ipcRenderer.invoke('set-sidebar-width', w),
  reloadSession:     ()      => ipcRenderer.invoke('reload-session'),
  hardReloadSession: ()      => ipcRenderer.invoke('hard-reload-session'),
  toggleMute:        (id)    => ipcRenderer.invoke('toggle-mute', id),
  onSessionLoading:    (cb)  => ipcRenderer.on('session-loading',   (_, id, loading)       => cb(id, loading)),
  onSessionActivated:  (cb)  => ipcRenderer.on('session-activated', (_, siteId, sessionId) => cb(siteId, sessionId)),
});
