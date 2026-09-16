import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.athanielDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('athaniel:translucency:support')
const hudWindowing = ipcRenderer.sendSync('athaniel:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

contextBridge.exposeInMainWorld('athanielDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  getConnection: profile => ipcRenderer.invoke('athaniel:connection', profile),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('athaniel:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('athaniel:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('athaniel:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('athaniel:backend:touch', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('athaniel:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('athaniel:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('athaniel:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('athaniel:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('athaniel:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('athaniel:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('athaniel:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('athaniel:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('athaniel:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('athaniel:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('athaniel:wake-indicator:get'),
    setState: state => ipcRenderer.send('athaniel:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('athaniel:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('athaniel:wake-indicator:state', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('athaniel:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('athaniel:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('athaniel:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('athaniel:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('athaniel:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('athaniel:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('athaniel:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('athaniel:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('athaniel:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('athaniel:hud:open', request),
    close: () => ipcRenderer.invoke('athaniel:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('athaniel:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('athaniel:hud:begin-move'),
    endMove: () => ipcRenderer.send('athaniel:hud:end-move'),
    moveBy: delta => ipcRenderer.send('athaniel:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('athaniel:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('athaniel:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('athaniel:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('athaniel:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('athaniel:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('athaniel:hud:goto', listener)

      return () => ipcRenderer.removeListener('athaniel:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('athaniel:hud:changed', listener)

      return () => ipcRenderer.removeListener('athaniel:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('athaniel:hud:cursor', listener)

      return () => ipcRenderer.removeListener('athaniel:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('athaniel:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('athaniel:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('athaniel:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('athaniel:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('athaniel:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('athaniel:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('athaniel:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('athaniel:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('athaniel:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('athaniel:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('athaniel:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('athaniel:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('athaniel:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('athaniel:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('athaniel:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('athaniel:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('athaniel:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('athaniel:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('athaniel:connections:list'),
    save: payload => ipcRenderer.invoke('athaniel:connections:save', payload),
    remove: id => ipcRenderer.invoke('athaniel:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('athaniel:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('athaniel:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('athaniel:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('athaniel:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('athaniel:connections:update-managed', id),
    // Fan out `athaniel update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('athaniel:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:connections:changed', listener)

      return () => ipcRenderer.removeListener('athaniel:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('athaniel:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('athaniel:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('athaniel:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('athaniel:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('athaniel:connection-config:oauth-logout', remoteUrl),
  // Athaniel Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('athaniel:cloud:status'),
    login: () => ipcRenderer.invoke('athaniel:cloud:login'),
    logout: () => ipcRenderer.invoke('athaniel:cloud:logout'),
    discover: org => ipcRenderer.invoke('athaniel:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('athaniel:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('athaniel:profile:get'),
    remember: name => ipcRenderer.invoke('athaniel:profile:remember', name),
    set: name => ipcRenderer.invoke('athaniel:profile:set', name)
  },
  api: request => ipcRenderer.invoke('athaniel:api', request),
  notify: payload => ipcRenderer.invoke('athaniel:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('athaniel:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('athaniel:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('athaniel:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('athaniel:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('athaniel:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('athaniel:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('athaniel:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('athaniel:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('athaniel:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('athaniel:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('athaniel:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('athaniel:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('athaniel:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('athaniel:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('athaniel:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('athaniel:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('athaniel:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('athaniel:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('athaniel:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext) => ipcRenderer.invoke('athaniel:saveImageBuffer', { data, ext }),
  saveClipboardImage: () => ipcRenderer.invoke('athaniel:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('athaniel:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('athaniel:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('athaniel:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('athaniel:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('athaniel:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('athaniel:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('athaniel:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('athaniel:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('athaniel:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('athaniel:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('athaniel:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('athaniel:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('athaniel:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('athaniel:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('athaniel:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('athaniel:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('athaniel:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('athaniel:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('athaniel:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('athaniel:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('athaniel:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('athaniel:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('athaniel:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('athaniel:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('athaniel:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('athaniel:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:zoom:changed', listener)

      return () => ipcRenderer.removeListener('athaniel:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('athaniel:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('athaniel:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('athaniel:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('athaniel:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('athaniel:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('athaniel:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('athaniel:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('athaniel:fs:desktopPluginsRoot'),
  logsRoot: () => ipcRenderer.invoke('athaniel:fs:logsRoot'),
  agentPluginsRoot: () => ipcRenderer.invoke('athaniel:fs:agentPluginsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('athaniel:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('athaniel:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('athaniel:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('athaniel:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('athaniel:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('athaniel:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('athaniel:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('athaniel:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('athaniel:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('athaniel:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('athaniel:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('athaniel:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('athaniel:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('athaniel:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('athaniel:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('athaniel:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('athaniel:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('athaniel:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('athaniel:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('athaniel:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('athaniel:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('athaniel:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('athaniel:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('athaniel:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('athaniel:git:review:createPr', repoPath)
    }
  },
  terminal: {
    cwd: id => ipcRenderer.invoke('athaniel:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('athaniel:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('athaniel:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('athaniel:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('athaniel:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `athaniel:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `athaniel:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('athaniel:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('athaniel:preview-nav', listener)

    return () => ipcRenderer.removeListener('athaniel:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('athaniel:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:open-updates', listener)

    return () => ipcRenderer.removeListener('athaniel:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:deep-link', listener)

    return () => ipcRenderer.removeListener('athaniel:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('athaniel:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('athaniel:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('athaniel:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:window-state-changed', listener)

    return () => ipcRenderer.removeListener('athaniel:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('athaniel:focus-session', listener)

    return () => ipcRenderer.removeListener('athaniel:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:notification-action', listener)

    return () => ipcRenderer.removeListener('athaniel:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:notification-activate', listener)

    return () => ipcRenderer.removeListener('athaniel:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('athaniel:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:backend-exit', listener)

    return () => ipcRenderer.removeListener('athaniel:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:connection:applied', listener)

    return () => ipcRenderer.removeListener('athaniel:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:power-resume', listener)

    return () => ipcRenderer.removeListener('athaniel:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('athaniel:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('athaniel:power-battery', listener)

    return () => ipcRenderer.removeListener('athaniel:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:boot-progress', listener)

    return () => ipcRenderer.removeListener('athaniel:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('athaniel:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('athaniel:bootstrap:continue-local'),
  resetBootstrap: () => ipcRenderer.invoke('athaniel:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('athaniel:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('athaniel:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('athaniel:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('athaniel:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('athaniel:version'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('athaniel:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('athaniel:uninstall:summary'),
    run: mode => ipcRenderer.invoke('athaniel:uninstall:run', { mode })
  },
  updates: {
    check: () => ipcRenderer.invoke('athaniel:updates:check'),
    apply: opts => ipcRenderer.invoke('athaniel:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('athaniel:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('athaniel:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('athaniel:updates:progress', listener)

      return () => ipcRenderer.removeListener('athaniel:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('athaniel:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('athaniel:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('athaniel:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('athaniel:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('athaniel:found-in-page', listener)

    return () => ipcRenderer.removeListener('athaniel:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('athaniel:open-find-bar', listener)

    return () => ipcRenderer.removeListener('athaniel:open-find-bar', listener)
  }
})
