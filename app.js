(() => {
'use strict';

const CHAT_MEDIA_BUCKET = 'xifre-chat-media';
const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_MESSAGE_MAX_CHARS = 2000;
const CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT = 1800;
const CHAT_IMAGE_MARKER_PREFIX = '[[XIFRE_IMAGE:';
const CONFIG = {
url: 'https://doppekualeyvrlbtumze.supabase.co',
key: 'sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let currentConversationData = null;
let currentMembers = [];
let messageChannel = null;
let typingChannel = null;
let messagePoll = null;
let typingStopTimer = null;
let peopleSearchTimer = null;
let confirmResolver = null;
let menuMessage = null;
let replyTarget = null;
let pendingProfileAvatarFile = null;
let pendingGroupAvatarFile = null;
let pendingProfileAvatarURL = null;
let pendingGroupAvatarURL = null;
let authActionInFlight = false;
let startPromise = null;
let appStarted = false;
let domainSessionSignOut = false;
let conversationCache = [];
let friendCache = [];
let memberCache = new Map();
let currentMentionIds = new Set();
let mentionEverywhere = false;
let mentionPickerIndex = 0;
let selectedMember = null;
let selectedConversationForMenu = null;
let conversationSearchTimer = null;
let conversationListPoll = null;
let friendRequestsPoll = null;
let memberFriendStatus = 'none';
let lastFriendRequestsSignature = null;
let lastFriendCacheRenderSignature = null;
let conversationFilter = '';
let emojiPickerMode = 'compose';
let emojiPickerMessageId = null;
let sendInFlight = false;
let logoutInFlight = false;
let conversationLoadSequence = 0;
let conversationOpenSequence = 0;
const messageLoadSequences = new Map();
const reactionLoadSequences = new Map();
let friendRequestLoadPromise = null;
let friendRequestRefreshQueued = false;
let friendRequestsLoadedOnce = false;
let friendRequestKnownIds = new Set();
let memberStatusRequestToken = 0;
let removeProfileAvatarRequested = false;
let removeGroupAvatarRequested = false;
let editingMessageId = null;
let presenceChannel = null;
let presenceSetupPromise = null;
let presenceTrackTimer = null;
let presenceRenderTimer = null;
let presencePayloads = new Map();
let presenceActivityAt = Date.now();
let presenceLastTrackAt = 0;
let presenceOwnerId = null;
const presenceTabId = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const PRESENCE_IDLE_MS = 5 * 60 * 1000;
let pendingExternalUrl = '';
let pendingChatAttachment = null;
let pendingChatAttachmentObjectUrl = null;
let pendingChatAttachmentGeneration = 0;
let keyboardOpen = false;
let keyboardShift = false;
let keyboardSymbols = false;
let remoteTypingUsers = new Map();
let remoteTypingTimers = new Map();
const signedChatMediaCache = new Map();
let keyboardWordUsageCache = null;
let keyboardWordUsageOwner = null;

const screens = ['landing', 'login', 'register', 'email'];

function normalizeUsername(value) {
return String(value || '').trim().toLowerCase();
}

const ALLOWED_EMAIL_DOMAIN = 'vedrunaimmaculada.cat';
function isAllowedEmailDomain(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^@\s]+@vedrunaimmaculada\.cat$/.test(email);
}
function emailHandle(value) {
  const email = String(value || '').trim().toLowerCase();
  return isAllowedEmailDomain(email) ? email.split('@')[0] : '';
}
function profileHandle(profile = {}) {
  return String(profile.email_handle || emailHandle(profile.email) || emailHandle(currentUser?.email) || 'usuario').replace(/^@/, '');
}

function esc(value) {
const div = document.createElement('div');
div.textContent = value ?? '';
return div.innerHTML;
}

function escapeRegExp(value) {
return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidUuid(value) {
return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function getMemberId(member) {
return String(member?.user_id || member?.id || '');
}

function avatarHTML(name, url, kind = 'private', className = '', color = '') {
  const fallbackName = kind === 'group' ? 'Grupo' : 'Usuario';
  const safeName = String(name || fallbackName).trim() || fallbackName;
  const initial = kind === 'group' ? '#' : (safeName.charAt(0).toUpperCase() || 'X');
  const safeUrl = String(url || '').trim();
  const palette = ['avatar-blue', 'avatar-yellow', 'avatar-red', 'avatar-green', 'avatar-orange'];
  let hash = 0;
  for (const ch of safeName) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  const colorClass = kind === 'group'
    ? 'avatar-group'
    : (palette.includes(color) ? color : palette[Math.abs(hash) % palette.length]);
  const extraClass = String(className || '').trim();
  const wrapperClass = ['avatar-media', extraClass, colorClass].filter(Boolean).map(esc).join(' ');
  const fallbackExtra = kind === 'group' ? ' group-fallback' : '';
  const image = safeUrl
    ? `<img class="avatar-img" src="${esc(safeUrl)}" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
    : '';
  const hidden = safeUrl ? ' hidden' : '';
  return `<span class="${wrapperClass}" aria-label="${esc(safeName)}">${image}<span class="avatar-fallback${fallbackExtra} ${esc(colorClass)}"${hidden}>${esc(initial)}</span></span>`;
}

function avatarInto(element, name, url, kind = 'private', color = '') {
if (!element) return;
element.innerHTML = avatarHTML(name, url, kind, '', color);
}


function presenceDotHTML(userId, extraClass = '') {
  const id = String(userId || '');
  if (!isValidUuid(id)) return '';
  return `<span class="presence-dot presence-offline ${esc(extraClass)}" data-presence-user="${esc(id)}" title="Desconectado" aria-label="Desconectado"></span>`;
}

function presenceAvatarHTML(name, url, kind = 'private', avatarClass = '', color = '', userId = '', wrapClass = '') {
  return `<span class="presence-avatar-wrap ${esc(wrapClass)}">${avatarHTML(name, url, kind, avatarClass, color)}${presenceDotHTML(userId)}</span>`;
}

function ensurePresenceDot(elementOrSelector, userId, extraClass = '') {
  const element = typeof elementOrSelector === 'string' ? $(elementOrSelector) : elementOrSelector;
  if (!element) return;
  element.querySelectorAll(':scope > .presence-dot').forEach(dot => dot.remove());
  element.classList.remove('presence-anchor');
  const id = String(userId || '');
  if (!isValidUuid(id)) return;
  element.classList.add('presence-anchor');
  element.insertAdjacentHTML('beforeend', presenceDotHTML(id, extraClass));
  updatePresenceDot(element.querySelector(':scope > .presence-dot'));
}

function parsePresenceTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 100000000000 ? value * 1000 : value;
  }
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPresenceStatus(userId) {
  const id = String(userId || '');
  const records = presencePayloads.get(id) || [];
  if (!records.length) return 'offline';
  const now = Date.now();
  const activelyVisible = records.some(record => {
    const last = parsePresenceTimestamp(record.last_active_at);
    return record.visible === true && (record.status === 'online' || record.status == null) && last > 0 && now - last < PRESENCE_IDLE_MS;
  });
  return activelyVisible ? 'online' : 'away';
}

function updatePresenceDot(dot) {
  if (!dot) return;
  const status = getPresenceStatus(dot.dataset.presenceUser);
  dot.classList.remove('presence-online', 'presence-away', 'presence-offline');
  dot.classList.add(`presence-${status}`);
  const labels = { online: 'En línea', away: 'Ausente', offline: 'Desconectado' };
  dot.title = labels[status] || labels.offline;
  dot.setAttribute('aria-label', labels[status] || labels.offline);
}

function renderPresenceIndicators() {
  $$('[data-presence-user]').forEach(updatePresenceDot);
}

function rebuildPresencePayloads() {
  const next = new Map();
  if (presenceChannel) {
    const state = presenceChannel.presenceState() || {};
    for (const [presenceKey, rawMetas] of Object.entries(state)) {
      const metas = Array.isArray(rawMetas) ? rawMetas : (rawMetas ? [rawMetas] : []);
      for (const meta of metas) {
        // Supabase Presence returns an array of tracked metadata per presence key.
        // Use the payload user id first, falling back to our stable userId:tabId key.
        const keyUserId = String(presenceKey || '').split(':')[0];
        const id = String(meta?.user_id || meta?.userId || meta?.user?.id || keyUserId || '');
        if (!isValidUuid(id)) continue;
        if (!next.has(id)) next.set(id, []);
        next.get(id).push(meta || {});
      }
    }
  }
  // Keep the local tab's latest state until the server sync catches up.
  if (presenceOwnerId) {
    const local = (presencePayloads.get(presenceOwnerId) || []).find(item => item.tab_id === presenceTabId);
    if (local) {
      if (!next.has(presenceOwnerId)) next.set(presenceOwnerId, []);
      if (!next.get(presenceOwnerId).some(item => item.tab_id === presenceTabId)) next.get(presenceOwnerId).push(local);
    }
  }
  presencePayloads = next;
  renderPresenceIndicators();
}

async function trackPresence(force = false) {
  if (!currentUser || !presenceChannel) return;
  const now = Date.now();
  if (!force && now - presenceLastTrackAt < 12000) return;
  const visible = document.visibilityState === 'visible';
  const recent = now - presenceActivityAt < PRESENCE_IDLE_MS;
  const payload = {
    user_id: String(currentUser.id),
    tab_id: presenceTabId,
    visible,
    status: visible && recent ? 'online' : 'away',
    last_active_at: presenceActivityAt
  };
  presenceLastTrackAt = now;
  const ownId = String(currentUser.id);
  const rows = (presencePayloads.get(ownId) || []).filter(item => item.tab_id !== presenceTabId);
  rows.push(payload);
  presencePayloads.set(ownId, rows);
  renderPresenceIndicators();
  try {
    const channel = presenceChannel;
    const response = await channel.track(payload);
    if (channel !== presenceChannel) return;
    if (response?.status && response.status !== 'ok') {
      console.warn('PRESENCE TRACK STATUS', response.status, response.error || '');
    }
  } catch (error) {
    console.warn('PRESENCE TRACK', error);
  }
}

function notePresenceActivity() {
  if (!currentUser || document.visibilityState !== 'visible') return;
  presenceActivityAt = Date.now();
  void trackPresence(false);
  renderPresenceIndicators();
}

async function setupPresenceTracking() {
  if (!currentUser || !supabase) return;
  const requestedOwner = String(currentUser.id);
  if (presenceChannel && presenceOwnerId === requestedOwner) return;
  if (presenceSetupPromise) {
    try { await presenceSetupPromise; } catch (_) { /* handled by the creator */ }
    if (presenceChannel && presenceOwnerId === requestedOwner) return;
  }

  presenceSetupPromise = (async () => {
    stopPresenceTracking();
    if (!currentUser || String(currentUser.id) !== requestedOwner) return;
    presenceOwnerId = requestedOwner;
    presenceActivityAt = Date.now();
    presenceLastTrackAt = 0;

    // Private Realtime channels need the current Auth JWT when subscribing.
    try {
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!currentUser || String(currentUser.id) !== requestedOwner) return;
      const accessToken = sessionResult.data?.session?.access_token;
      if (accessToken) await supabase.realtime.setAuth(accessToken);
    } catch (error) {
      console.warn('PRESENCE AUTH', error);
    }
    if (!currentUser || String(currentUser.id) !== requestedOwner) return;

    const topic = 'xifre:presence:global';
    const channel = supabase.channel(topic, {
      config: {
        private: true,
        presence: { enabled: true, key: `${requestedOwner}:${presenceTabId}` }
      }
    });
    presenceChannel = channel;
    channel
      .on('presence', { event: 'sync' }, rebuildPresencePayloads)
      .on('presence', { event: 'join' }, rebuildPresencePayloads)
      .on('presence', { event: 'leave' }, rebuildPresencePayloads)
      .subscribe((status, error) => {
        if (channel !== presenceChannel) return;
        if (status === 'SUBSCRIBED') {
          presenceLastTrackAt = 0;
          void trackPresence(true);
          // Reconcile after the server has applied the initial presence sync.
          setTimeout(() => { if (channel === presenceChannel) rebuildPresencePayloads(); }, 250);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('PRESENCE CHANNEL', status, error || '');
        }
      });

    if (presenceTrackTimer) clearInterval(presenceTrackTimer);
    if (presenceRenderTimer) clearInterval(presenceRenderTimer);
    // Heartbeats keep the connected session visible; user activity determines online vs away.
    presenceTrackTimer = setInterval(() => {
      if (currentUser && String(currentUser.id) === requestedOwner) void trackPresence(true);
    }, 30000);
    presenceRenderTimer = setInterval(renderPresenceIndicators, 15000);
  })();

  try {
    await presenceSetupPromise;
  } catch (error) {
    console.warn('PRESENCE SETUP', error);
  } finally {
    presenceSetupPromise = null;
  }
}

function stopPresenceTracking() {
  if (presenceTrackTimer) clearInterval(presenceTrackTimer);
  if (presenceRenderTimer) clearInterval(presenceRenderTimer);
  presenceTrackTimer = null;
  presenceRenderTimer = null;
  const channel = presenceChannel;
  presenceChannel = null;
  presenceOwnerId = null;
  presenceLastTrackAt = 0;
  presencePayloads = new Map();
  if (channel && supabase) void supabase.removeChannel(channel).catch(error => console.warn('PRESENCE CLEANUP', error));
  renderPresenceIndicators();
}

function presenceDotForFriendOrMember(item) {
  return String(item?.user_id || item?.id || '');
}

function conversationPeerId(conversation) {
  if (!conversation || conversation.type === 'group') return '';
  const possible = conversation.other_user_id || conversation.peer_user_id || conversation.user_id || conversation.recipient_id;
  if (isValidUuid(possible)) return String(possible);
  const username = normalizeUsername(conversation.username || conversation.displayName || conversation.display_name);
  const match = friendCache.find(friend => normalizeUsername(friend.username) === username);
  return String(match?.id || '');
}

function openExternalLinkWarning(rawUrl) {
  try {
    let value = String(rawUrl || '').trim();
    if (/^www\./i.test(value)) value = `https://${value}`;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten enlaces HTTP o HTTPS.');
    pendingExternalUrl = url.href;
    setText('external-link-host', url.hostname);
    setText('external-link-url', url.href);
    closeEmojiPicker();
    openModal('external-link-modal');
    $('#external-link-cancel')?.focus({ preventScroll: true });
  } catch (error) {
    toast('Este enlace no es válido o no es compatible.', 'error');
  }
}

function closeExternalLinkWarning() {
  pendingExternalUrl = '';
  closeModal('external-link-modal');
}

function confirmExternalLink() {
  const value = pendingExternalUrl;
  if (!value) return closeExternalLinkWarning();
  let safeUrl;
  try {
    safeUrl = new URL(value);
    if (!['http:', 'https:'].includes(safeUrl.protocol)) throw new Error('Protocolo no permitido');
  } catch {
    closeExternalLinkWarning();
    return toast('Este enlace no es válido.', 'error');
  }
  closeExternalLinkWarning();
  // Open only after an explicit click in the warning dialog; never let message HTML navigate directly.
  window.open(safeUrl.href, '_blank', 'noopener,noreferrer');
}

function setText(id, value) {
const el = typeof id === 'string' ? $(`#${id}`) : id;
if (el) el.textContent = value ?? '';
}

function setMessage(id, value = '', type = '') {
const el = $(`#${id}`);
if (!el) return;
el.textContent = value;
el.className = type ? `inline-message ${type}` : 'inline-message';
}

function setModalMessage(id, value = '', type = '') {
const el = $(`#${id}`);
if (!el) return;
el.textContent = value;
el.className = type ? `modal-message ${type}` : 'modal-message';
}

function setLoading(button, loading) {
if (!button) return;
button.disabled = !!loading;
button.classList.toggle('loading', !!loading);
button.setAttribute('aria-busy', loading ? 'true' : 'false');
}

function toast(text, type = 'info') {
const container = $('#toast-container');
if (!container) return;
const node = document.createElement('div');
node.className = `toast toast-${type}`;
node.textContent = text;
container.appendChild(node);
requestAnimationFrame(() => node.classList.add('show'));
setTimeout(() => node.remove(), 3400);
}

function friendlyError(error) {
const message = String(error?.message || '');
const lower = message.toLowerCase();
if (lower.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.';
if (lower.includes('email not confirmed')) return 'Primero confirma tu correo electrónico.';
if (lower.includes('user already registered')) return 'Ese correo ya está registrado.';
if (lower.includes('solo se permiten cuentas del dominio vedruna') || lower.includes('vedrunaimmaculada.cat')) return 'Solo se permiten cuentas del dominio vedruna';
if (lower.includes('rate limit') || lower.includes('too many requests') || Number(error?.status) === 429) return 'Se ha alcanzado temporalmente el límite de peticiones de Supabase. Espera un poco antes de volver a intentarlo.';
return message || 'No se pudo completar la operación.';
}

function formatTime(timestamp) {
if (!timestamp) return '';
return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = yesterday.getTime();
  if (dateDay === todayDay) return time;
  if (dateDay === yesterdayDay) return `Ayer a las ${time}`;
  return `${date.getDate()}/${date.getMonth() + 1} a las ${time}`;
}

function formatExactMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatListTime(timestamp) {
if (!timestamp) return '';
const date = new Date(timestamp);
const now = new Date();
return date.toDateString() === now.toDateString()
? formatTime(timestamp)
: date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function showScreen(name) {
if (!screens.includes(name)) name = 'landing';
// The application shell is not part of `screens`; always deactivate it when
// returning to landing/login/register/email, otherwise it remains above the landing.
$('#main-screen')?.classList.remove('active');
screens.forEach(key => document.getElementById(`${key}-screen`)?.classList.toggle('active', key === name));
}

function showMain() {
screens.forEach(key => document.getElementById(`${key}-screen`)?.classList.remove('active'));
$('#main-screen')?.classList.add('active');
}

function getRedirectURL() {
return window.location.origin + window.location.pathname;
}

/* ------------------------------------------------------------------------ */
/* Theme */
/* ------------------------------------------------------------------------ */
function currentTheme() {
return localStorage.getItem('xifre-theme') || 'dark';
}

function applyTheme(theme) {
const value = theme === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = value;
localStorage.setItem('xifre-theme', value);
$$('.theme-card').forEach(card => card.classList.toggle('active', card.dataset.themeChoice === value));
}

/* ------------------------------------------------------------------------ */
/* Auth */
/* ------------------------------------------------------------------------ */
async function checkUsernameAvailable(username) {
const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1);
if (error) throw error;
return !(data || []).length;
}

async function register() {
if (authActionInFlight || !supabase) return;
const button = $('#register-button');
const username = normalizeUsername($('#register-username')?.value);
const email = String($('#register-email')?.value || '').trim();
const password = String($('#register-password')?.value || '');
setMessage('register-message', '');

if (!/^[a-z0-9_]{3,20}$/.test(username)) return setMessage('register-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
if (!isAllowedEmailDomain(email)) return setMessage('register-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
if (password.length < 6) return setMessage('register-message', 'La contraseña debe tener al menos 6 caracteres.', 'error');

authActionInFlight = true;
setLoading(button, true);
try {
if (!(await checkUsernameAvailable(username))) {
setMessage('register-message', 'Ese username ya está ocupado.', 'error');
return;
}
const { data, error } = await supabase.auth.signUp({
email,
password,
options: { data: { username }, emailRedirectTo: getRedirectURL() }
});
if (error) throw error;
if (data?.session) {
await startApplication(data.session);
} else {
sessionStorage.setItem('xifre_pending_email', email);
setText('confirmation-email', email);
showScreen('email');
}
} catch (error) {
console.error('REGISTER', error);
setMessage('register-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
authActionInFlight = false;
}
}

async function login() {
if (authActionInFlight || !supabase) return;

const button = $('#login-button');
const email = String($('#login-email')?.value || '').trim();
const password = String($('#login-password')?.value || '');
setMessage('login-message', '');

if (!email || !password) {
setMessage('login-message', 'Introduce el correo y la contraseña.', 'error');
return;
}
if (!isAllowedEmailDomain(email)) {
setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
return;
}

authActionInFlight = true;
setLoading(button, true);

try {
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
const session = data?.session;
if (!session?.user) throw new Error('No se recibió una sesión válida.');

currentUser = session.user;
appStarted = true;
sessionStorage.removeItem('xifre_pending_email');
showMain();

// La sesión ya está abierta. El resto se carga en segundo plano.
void startApplication(session);
} catch (error) {
console.error('LOGIN', error);
setMessage('login-message', friendlyError(error), 'error');
if (String(error?.message || '').toLowerCase().includes('email not confirmed')) {
sessionStorage.setItem('xifre_pending_email', email);
setText('confirmation-email', email);
showScreen('email');
}
} finally {
setLoading(button, false);
authActionInFlight = false;
}
}

async function resendConfirmation() {
const email = sessionStorage.getItem('xifre_pending_email') || '';
if (!email) return showScreen('register');
if (!isAllowedEmailDomain(email)) return toast('Solo se permiten cuentas del dominio vedruna', 'error');
const button = $('#resend-confirmation');
setLoading(button, true);
try {
const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: getRedirectURL() } });
if (error) throw error;
toast('Correo de confirmación reenviado.', 'success');
} catch (error) {
toast(friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function loadProfile() {
if (!currentUser) return;
const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').eq('id', currentUser.id).maybeSingle();
if (error) console.warn('PROFILE LOAD', error);
currentProfile = data || {
id: currentUser.id,
username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
display_name: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
avatar_url: null,
avatar_color: 'avatar-blue',
email_handle: emailHandle(currentUser.email)
};
currentProfile.display_name = currentProfile.username;
syncProfileUI();
}

function syncProfileUI() {
const username = currentProfile?.username || 'usuario';
const handle = profileHandle({ ...(currentProfile || {}), email: currentUser?.email });
setText('profile-name', username);
setText('profile-username', `@${handle}`);
setText('bottom-profile-name', username);
setText('bottom-profile-username', `@${handle}`);
setText('settings-nav-name', username);
setText('settings-nav-username', `@${handle}`);
setText('settings-preview-username', `@${handle}`);
avatarInto($('#profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#profile-avatar'), currentUser?.id);
avatarInto($('#bottom-profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#bottom-profile-avatar'), currentUser?.id, 'presence-dot-small');
avatarInto($('#settings-nav-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
ensurePresenceDot($('#settings-nav-avatar'), currentUser?.id, 'presence-dot-small');
if (!pendingProfileAvatarFile) avatarInto($('#settings-avatar-preview'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
const settingsUsername = $('#settings-username');
if (settingsUsername && document.activeElement !== settingsUsername) settingsUsername.value = username;
}

async function startApplication(session = null) {
if (!supabase) return false;
if (startPromise) return startPromise;

startPromise = (async () => {
let sessionUser = session?.user || null;
if (!sessionUser) {
const result = await supabase.auth.getSession();
sessionUser = result.data?.session?.user || null;
}
if (!sessionUser) throw new Error('No hay una sesión autenticada.');
if (!isAllowedEmailDomain(sessionUser.email)) {
  // Marcar el sign-out para que el listener de Auth no nos mande a la landing.
  domainSessionSignOut = true;
  currentUser = null;
  currentProfile = null;
  appStarted = false;
  try { await supabase.auth.signOut({ scope: 'local' }); } catch (signOutError) { console.warn('DOMAIN SESSION SIGNOUT', signOutError); }
  showScreen('login');
  setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
  return false;
}

currentUser = sessionUser;
appStarted = true;
void setupPresenceTracking();
applyTheme(currentTheme());
showMain();

const results = await Promise.allSettled([
loadProfile(),
loadFriends(),
loadConversations()
]);
results.forEach(result => {
if (result.status === 'rejected') console.warn('STARTUP LOAD', result.reason);
});

if (conversationListPoll) clearInterval(conversationListPoll);
conversationListPoll = setInterval(() => { if (document.visibilityState === 'visible' && currentUser) loadConversations().catch(() => {}); }, 4000);
// Load requests as soon as the app starts, not only after opening the modal.
void loadFriendRequests().catch(error => console.warn('INITIAL REQUEST LOAD', error));
if (friendRequestsPoll) clearInterval(friendRequestsPoll);
friendRequestsPoll = setInterval(() => {
  if (document.visibilityState !== 'visible' || !currentUser) return;
  void loadFriendRequests().catch(error => console.warn('REQUEST POLL', error));
  if (!$('#people-modal')?.classList.contains('hidden')) {
    void loadFriends().catch(error => console.warn('FRIEND POLL', error));
  }
}, 6500);

try {
await restoreConversation();
} catch (restoreError) {
console.warn('RESTORE CONVERSATION', restoreError);
}
return true;
})().catch(async error => {
console.error('START APPLICATION', error);
try {
const { data } = await supabase.auth.getSession();
if (data?.session?.user) {
currentUser = data.session.user;
appStarted = true;
showMain();
return true;
}
} catch (sessionError) {
console.warn('SESSION CHECK', sessionError);
}
appStarted = false;
currentUser = null;
return false;
}).finally(() => {
startPromise = null;
});
return startPromise;
}

async function logout() {
  if (!currentUser || logoutInFlight) return;
  const confirmed = await askConfirm('Cerrar sesión', '¿Quieres cerrar tu sesión de XIFRE? Volverás a la página principal.', 'Cerrar sesión');
  if (!confirmed) return;
  logoutInFlight = true;
  stopPresenceTracking();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('LOGOUT', error);
    toast(`No se pudo cerrar la sesión: ${friendlyError(error)}`, 'error');
    logoutInFlight = false;
    return;
  }
  stopChatRealtime();
  if (conversationListPoll) clearInterval(conversationListPoll);
  if (friendRequestsPoll) clearInterval(friendRequestsPoll);
  conversationListPoll = null;
  friendRequestsPoll = null;
  currentUser = null;
  currentProfile = null;
  currentConversation = null;
  currentConversationData = null;
  currentMembers = [];
  signedChatMediaCache.clear();
  keyboardWordUsageCache = null;
  keyboardWordUsageOwner = null;
  clearPendingChatAttachment(false);
  closeAttachmentMenu();
  closeCatalanKeyboard();
  conversationCache = [];
  friendCache = [];
  memberCache.clear();
  friendRequestLoadPromise = null;
  friendRequestRefreshQueued = false;
  friendRequestsLoadedOnce = false;
  friendRequestKnownIds.clear();
  lastFriendRequestsSignature = null;
  appStarted = false;
  logoutInFlight = false;
  sessionStorage.removeItem('xifre_current_conversation');
  closeAllModals();
  $('#settings-modal')?.classList.add('hidden');
  showScreen('landing');
  // Explicitly force the landing state after Supabase's SIGNED_OUT event has settled.
  setTimeout(() => {
    if (!currentUser && !appStarted) {
      $('#main-screen')?.classList.remove('active');
      showScreen('landing');
    }
  }, 0);
}

function closeAllModals() {
$$('.modal').forEach(m => m.classList.add('hidden'));
$('#message-menu')?.classList.add('hidden');
}

/* ------------------------------------------------------------------------ */
/* Friends */
/* ------------------------------------------------------------------------ */
async function loadFriends() {
if (!currentUser) return;
const rpc = await supabase.rpc('xifre_get_my_friends');
if (!rpc.error) {
  friendCache = (rpc.data || []).map(friend => ({ ...friend, display_name: friend.display_name || friend.username }));
} else {
  console.warn('FRIENDS RPC', rpc.error);
  // Safe fallback for installations where the migration has not yet been applied.
  const base = await supabase.from('friendships').select('user1_id,user2_id').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
  if (base.error) {
    console.error('FRIENDS FALLBACK', base.error);
    return; // Keep the last known friends instead of replacing it with an empty list.
  }
  const ids = [...new Set((base.data || []).map(row => String(row.user1_id) === String(currentUser.id) ? row.user2_id : row.user1_id).filter(Boolean))];
  if (!ids.length) friendCache = [];
  else {
    const result = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').in('id', ids);
    if (result.error) {
      console.error('FRIEND PROFILES FALLBACK', result.error);
      return;
    }
    friendCache = result.data || [];
  }
}
renderFriendsModal();
renderGroupSelection();
renderGroupAddSelection();
renderConversations();
renderPresenceIndicators();
}
async function searchPeople(query) {
const list = $('#friend-search-results');
if (!list) return;
if (peopleSearchTimer) clearTimeout(peopleSearchTimer);
const clean = normalizeUsername(query);
if (!clean) {
renderPeople(friendCache.map(f => ({ ...f, relationship: 'friend' })));
return;
}
if (clean.replace(/^@+|@+$/g, '').length < 1) {
list.innerHTML = '<div class="empty-sidebar">Escribe un username o @.</div>';
return;
}
list.innerHTML = '<div class="empty-sidebar">Buscando...</div>';
peopleSearchTimer = setTimeout(async () => {
const { data, error } = await supabase.rpc('xifre_search_people', { p_query: clean });
if (error) {
list.innerHTML = `<div class="empty-sidebar">${esc(error.message)}</div>`;
return;
}
renderPeople(data || []);
}, 180);
}

function renderPeople(results) {
const list = $('#friend-search-results');
if (!list) return;
list.innerHTML = '';
if (!results.length) {
  list.innerHTML = '<div class="empty-sidebar">No se ha encontrado a nadie.</div>';
  return;
}
results.forEach(person => {
  const targetId = String(person.id || '');
  const relationship = person.relationship || 'none';
  const row = document.createElement('div');
  row.className = 'search-result';
  const handle = String(person.email_handle || '').trim();
  const status = relationship === 'friend' ? 'Amigo' : relationship === 'outgoing_pending' ? 'Solicitud enviada' : relationship === 'incoming_pending' ? 'Te ha enviado una solicitud' : 'No conectado';
  row.innerHTML = `
    <span class="search-avatar presence-host">${avatarHTML(person.username, person.avatar_url, 'private', '', person.avatar_color)}${presenceDotHTML(targetId)}</span>
    <div class="result-copy"><strong>${esc(person.username || person.display_name || 'Usuario')}</strong><small>@${esc(handle || person.username || 'usuario')}</small><small class="relationship-status">${esc(status)}</small></div>`;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = `result-action ${relationship === 'friend' ? '' : 'secondary'}`;
  const refreshSearch = () => searchPeople($('#friend-search')?.value || '');
  if (relationship === 'friend') {
    action.textContent = 'Abrir';
    action.addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(targetId); });
  } else if (relationship === 'outgoing_pending') {
    action.textContent = 'Cancelar';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_cancel_friend_request', { p_target_user: targetId });
        if (error) throw error;
        toast('Solicitud cancelada. Ya puedes volver a añadir a esta persona.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  } else if (relationship === 'incoming_pending') {
    action.textContent = 'Aceptar';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_accept_friend_request_from', { p_sender_user: targetId });
        if (error) throw error;
        await Promise.all([loadFriends(), loadFriendRequests()]);
        toast('Solicitud aceptada. Ahora sois amigos.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  } else {
    action.textContent = 'Añadir';
    action.addEventListener('click', async () => {
      if (!isValidUuid(targetId)) return toast('No se ha podido identificar a esta persona. Vuelve a buscarla.', 'error');
      action.disabled = true;
      try {
        const { error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: targetId });
        if (error) throw error;
        toast('Solicitud enviada.', 'success');
        await refreshSearch();
      } catch (error) {
        action.disabled = false;
        toast(friendlyError(error), 'error');
      }
    });
  }
  row.appendChild(action);
  list.appendChild(row);
});
}
function renderFriendsModal() {
const list = $('#friends-modal-list');
if (!list) return;
list.innerHTML = '';
if (!friendCache.length) {
list.innerHTML = '<div class="empty-sidebar">Todavía no tienes amigos.</div>';
return;
}
friendCache.forEach(friend => {
const row = document.createElement('div');
row.className = 'friend-item';
row.innerHTML = `<span class="friend-avatar presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', 'friend-avatar', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><div class="friend-copy"><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></div><button class="open-chat" type="button">Abrir</button>`;
row.querySelector('button').addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(friend.id); });
list.appendChild(row);
});
}

async function loadFriendRequests() {
  if (!currentUser) return;
  if (friendRequestLoadPromise) {
    // If an accept/reject happens during a poll, force one fresh query after this one finishes.
    friendRequestRefreshQueued = true;
    return friendRequestLoadPromise;
  }
  const userId = String(currentUser.id);
  const list = $('#friend-requests-list');
  if (list && !list.children.length) list.innerHTML = '<div class="empty-sidebar">Cargando solicitudes…</div>';
  friendRequestLoadPromise = (async () => {
    const { data, error } = await supabase.rpc('xifre_get_friend_requests');
    if (String(currentUser?.id || '') !== userId) return;
    if (error) {
      console.error('FRIEND REQUESTS RPC', error);
      setModalMessage('requests-message', `No se pudieron cargar las solicitudes: ${friendlyError(error)}`, 'error');
      // Preserve the last good UI and badge on network/RLS/RPC failure.
      return;
    }
    setModalMessage('requests-message', '');
    const requests = (data || []).map(req => ({
      id: req.request_id || req.id,
      sender_id: req.sender_id,
      receiver_id: userId,
      created_at: req.created_at,
      sender: {
        id: req.sender_id,
        username: req.username,
        display_name: req.display_name,
        avatar_url: req.avatar_url,
        avatar_color: req.avatar_color,
        email_handle: req.email_handle
      }
    })).filter(req => isValidUuid(req.id) && isValidUuid(req.sender_id));
    const signature = JSON.stringify(requests.map(req => [req.id, req.sender_id, req.created_at, req.sender.username, req.sender.avatar_url]));
    const ids = new Set(requests.map(req => String(req.id)));
    if (friendRequestsLoadedOnce) {
      const fresh = requests.filter(req => !friendRequestKnownIds.has(String(req.id)));
      if (fresh.length && document.visibilityState === 'visible') {
        toast(fresh.length === 1 ? `Nueva solicitud de amistad de @${fresh[0].sender.username || 'usuario'}.` : `Tienes ${fresh.length} nuevas solicitudes de amistad.`, 'info');
      }
    }
    friendRequestsLoadedOnce = true;
    friendRequestKnownIds = ids;
    setFriendRequestBadge(requests.length);
    if (signature !== lastFriendRequestsSignature || list?.dataset.requestSignature !== signature) {
      lastFriendRequestsSignature = signature;
      renderRequests(requests);
      renderPresenceIndicators();
      if (list) list.dataset.requestSignature = signature;
    }
  })().finally(() => {
    friendRequestLoadPromise = null;
    if (friendRequestRefreshQueued && currentUser) {
      friendRequestRefreshQueued = false;
      queueMicrotask(() => { void loadFriendRequests().catch(error => console.warn('QUEUED REQUEST REFRESH', error)); });
    }
  });
  return friendRequestLoadPromise;
}

function setFriendRequestBadge(count) {
  const value = Math.max(0, Number(count) || 0);
  for (const selector of ['#friend-request-badge', '#friend-request-tab-badge']) {
    const badge = $(selector);
    if (!badge) continue;
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.classList.toggle('hidden', value === 0);
    badge.setAttribute('aria-label', `${value} solicitudes pendientes`);
  }
}

function renderRequests(requests) {
const list = $('#friend-requests-list');
if (!list) return;
list.innerHTML = '';
if (!requests.length) { list.dataset.requestSignature = '[]'; list.innerHTML = '<div class="empty-sidebar">No hay solicitudes.</div>'; return; }
requests.forEach(req => {
const row = document.createElement('div');
row.className = 'request-item';
row.innerHTML = `<span class="request-avatar presence-host">${avatarHTML(req.sender.username || 'Usuario', req.sender.avatar_url, 'private', 'request-avatar', req.sender.avatar_color)}${presenceDotHTML(req.sender_id)}</span><div class="request-copy"><strong>${esc(req.sender.username || 'Usuario')}</strong><small>@${esc(req.sender.email_handle || req.sender.username || 'usuario')}</small><small>Quiere añadirte como amigo</small></div><div class="request-actions"><button class="request-accept" type="button">Aceptar</button><button class="request-reject" type="button">Rechazar</button></div>`;
const [accept, reject] = $$('.request-actions button', row);
accept.addEventListener('click', () => acceptRequest(req, row));
reject.addEventListener('click', () => rejectRequest(req, row));
list.appendChild(row);
});
}

async function acceptRequest(req, row) {
  const buttons = $$('.request-actions button', row);
  buttons.forEach(button => button.disabled = true);
  try {
    const { error } = await supabase.rpc('xifre_accept_friend_request', { p_request_id: req.id });
    if (error) throw error;
    row?.remove();
    setFriendRequestBadge(Math.max(0, Number($('#friend-request-badge')?.textContent || 0) - 1));
    toast('Ahora sois amigos.', 'success');
    const refreshes = await Promise.allSettled([loadFriends(), loadFriendRequests(), loadConversations()]);
    for (const result of refreshes) if (result.status === 'rejected') console.warn('POST-ACCEPT REFRESH', result.reason);
  } catch (error) {
    buttons.forEach(button => button.disabled = false);
    toast(friendlyError(error), 'error');
  }
}
async function rejectRequest(req, row) {
  const buttons = $$('.request-actions button', row);
  buttons.forEach(button => button.disabled = true);
  try {
    const { error } = await supabase.rpc('xifre_reject_friend_request', { p_request_id: req.id });
    if (error) throw error;
    row?.remove();
    setFriendRequestBadge(Math.max(0, Number($('#friend-request-badge')?.textContent || 0) - 1));
    toast('Solicitud rechazada.', 'success');
    await loadFriendRequests().catch(error => console.warn('POST-REJECT REFRESH', error));
  } catch (error) {
    buttons.forEach(button => button.disabled = false);
    toast(friendlyError(error), 'error');
  }
}
/* ------------------------------------------------------------------------ */
/* Conversations */
/* ------------------------------------------------------------------------ */
async function loadConversations() {
  if (!currentUser) return [];
  const requestSequence = ++conversationLoadSequence;
  const ownerAtStart = String(currentUser.id);
  const { data, error } = await supabase.rpc('xifre_get_my_conversations');
  if (error) { console.warn('CONVERSATIONS', error); return conversationCache; }
  if (!currentUser || String(currentUser.id) !== ownerAtStart || requestSequence !== conversationLoadSequence) return conversationCache;
  const unique = new Map();
  for (const row of data || []) {
    if (!row?.id) continue;
    unique.set(String(row.id), { ...row, displayName: row.display_name || row.name || (row.type === 'group' ? 'Grupo' : 'Chat privado') });
  }
  conversationCache = [...unique.values()];
  conversationCache.sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0));
  renderConversations();
  return conversationCache;
}

function renderConversations(filter = conversationFilter) {
const list = $('#conversation-list'); if (!list) return;
list.innerHTML = '';
setText('chat-count', conversationCache.length);
const q = normalizeUsername(filter);
const visible = conversationCache.filter(c => !q || normalizeUsername(c.displayName || c.name).includes(q) || normalizeUsername(c.username).includes(q));
if (!visible.length) { list.innerHTML = `<div class="empty-sidebar">${q ? 'No se encontraron conversaciones.' : 'No tienes conversaciones todavía.'}</div>`; return; }
visible.forEach(conversation => {
const isGroup = conversation.type === 'group';
const label = conversation.displayName || conversation.name || (isGroup ? 'Grupo' : 'Chat privado');
const row = document.createElement('button'); row.type='button';
const unread = Number(conversation.unread_count || 0);
const mentioned = !!conversation.has_mention;
row.className = `conversation${String(currentConversation)===String(conversation.id)?' active':''}${unread?' unread':''}${isGroup?' group-conversation':''}`;
const peerId = isGroup ? '' : conversationPeerId(conversation);
const previewText = conversation.last_message ? messagePreviewText(conversation.last_message) : (isGroup ? `${conversation.member_count||0} miembros` : 'Conversación');
row.innerHTML = `${presenceAvatarHTML(label, conversation.avatar_url, isGroup?'group':'private','conversation-avatar-image',conversation.avatar_color,peerId,'conversation-avatar-wrap')}<span class="conversation-copy"><span class="conversation-name">${esc(label)}</span><span class="conversation-preview ${conversation.message_type==='system'?'conversation-system':''}">${esc(previewText)}</span></span><span class="conversation-tail">${mentioned?'<span class="conversation-mention-badge">@</span>':''}${unread?`<span class="conversation-unread-badge">${unread>99?'99+':unread}</span>`:''}<span class="conversation-meta">${esc(formatListTime(conversation.last_message_at))}</span></span>`;
row.addEventListener('click',()=>openConversation(conversation.id,conversation));
row.addEventListener('contextmenu',e=>{e.preventDefault(); openConversationMenu(conversation,e.clientX,e.clientY);});
list.appendChild(row);
});
renderPresenceIndicators();
}

function openConversationSearch() {
openModal('conversation-search-modal');
const input=$('#conversation-search-input'); input.value=''; renderConversationSearch(''); setTimeout(()=>input.focus(),0);
}
function renderConversationSearch(query) {
const list=$('#conversation-search-results'); if(!list)return;
const q=normalizeUsername(query); const matches=conversationCache.filter(c=>!q||normalizeUsername(c.displayName||c.name).includes(q)||normalizeUsername(c.username).includes(q));
list.innerHTML='';
if(!matches.length){list.innerHTML='<div class="empty-sidebar">No se encontraron conversaciones.</div>';return;}
matches.forEach(c=>{const row=document.createElement('button');row.type='button';row.className='friend-item';const group=c.type==='group';const peerId = group ? '' : conversationPeerId(c); row.innerHTML=`<span class="friend-avatar presence-host">${avatarHTML(c.displayName,c.avatar_url,group?'group':'private','friend-avatar',c.avatar_color)}${presenceDotHTML(peerId)}</span><div class="friend-copy"><strong>${esc(c.displayName)}</strong><small>${group?'Grupo':'@'+esc(c.username||'')}</small></div><span class="open-chat">Abrir</span>`;row.addEventListener('click',()=>{closeModal('conversation-search-modal');openConversation(c.id,c);});list.appendChild(row);});
}

function openConversationMenu(conversation,x,y){
selectedConversationForMenu=conversation; const menu=$('#conversation-menu'); if(!menu)return; menu.classList.remove('hidden'); menu.style.left=`${Math.min(x,window.innerWidth-210)}px`; menu.style.top=`${Math.min(y,window.innerHeight-70)}px`;
}
function closeConversationMenu(){ $('#conversation-menu')?.classList.add('hidden'); selectedConversationForMenu=null; }
async function markConversationRead(id){ if(!id||!currentUser)return; const {error}=await supabase.rpc('xifre_mark_read',{p_conversation_id:id}); if(!error){const c=conversationCache.find(x=>String(x.id)===String(id));if(c){c.unread_count=0;c.has_mention=false;}renderConversations();} closeConversationMenu(); }

async function openPrivateChat(friendId) {
try {
const { data, error } = await supabase.rpc('create_private_chat', { other_user: friendId });
if (error) throw error;
const id = String(data || '');
await loadConversations();
await openConversation(id);
} catch (error) {
toast(friendlyError(error), 'error');
}
}

async function hydrateMemberProfiles(members) {
  const list = Array.isArray(members) ? members : [];
  const ids = [...new Set(list.map(getMemberId).filter(isValidUuid))];
  if (!ids.length) return list;
  try {
    const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,email_handle').in('id', ids);
    if (error) throw error;
    const profiles = new Map((data || []).map(profile => [String(profile.id), profile]));
    return list.map(member => {
      const p = profiles.get(getMemberId(member)) || {};
      return { ...member, username: member.username || p.username, display_name: member.display_name || p.display_name, avatar_url: member.avatar_url || p.avatar_url, avatar_color: member.avatar_color || p.avatar_color, email_handle: member.email_handle || p.email_handle || '' };
    });
  } catch (error) {
    console.warn('MEMBER PROFILE DETAILS', error);
    return list;
  }
}

async function openConversation(id, cached = null) {
  if (!id || !currentUser) return false;
  const conversationId = String(id);
  const openSequence = ++conversationOpenSequence;
  const isCurrentOpen = () => openSequence === conversationOpenSequence && String(currentConversation || '') === conversationId;
  const isAlreadyOpen = String(currentConversation || '') === conversationId;
  let conversation = cached || conversationCache.find(c => String(c.id) === conversationId);
  if (!conversation) {
    await loadConversations();
    // A slower click must not take over after the user has selected another chat.
    if (openSequence !== conversationOpenSequence) return false;
    conversation = conversationCache.find(c => String(c.id) === conversationId);
  }
  if (!conversation || openSequence !== conversationOpenSequence) return false;

  // Never carry a pending image into another DM/group by accident.
  if (String(currentConversation || '') !== conversationId && pendingChatAttachment) {
    clearPendingChatAttachment(false);
    toast('El adjunto se ha quitado porque has cambiado de conversación.', 'info');
  }

  try {
    currentConversation = conversationId;
    currentConversationData = conversation;
    sessionStorage.setItem('xifre_current_conversation', conversationId);

    const memberResponse = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: conversationId });
    if (!isCurrentOpen()) return false;
    if (memberResponse.error) throw memberResponse.error;

    const hydrated = await hydrateMemberProfiles(memberResponse.data || []);
    if (!isCurrentOpen()) return false;
    currentMembers = hydrated;
    memberCache.set(conversationId, currentMembers);

    updateChatHeader();
    renderRightPane();
    renderConversations();
    await loadMessages(conversationId, !isAlreadyOpen);
    if (!isCurrentOpen()) return false;

    const readResult = await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId });
    if (!isCurrentOpen()) return false;
    if (readResult.error) console.warn('MARK READ', readResult.error);
    const readRow = conversationCache.find(c => String(c.id) === conversationId);
    if (readRow) { readRow.unread_count = 0; readRow.has_mention = false; }
    renderConversations();
    setupTypingChannel(conversationId);
    setupMessageChannel(conversationId);
    $('#message-input').disabled = false;
    updateSendState();
    resizeMessageInput();
    updateMessageCharacterCount();
    $('#message-input').focus();
    return true;
  } catch (error) {
    // Errors from an obsolete open attempt must not overwrite the active chat.
    if (!isCurrentOpen()) return false;
    console.error('OPEN CONVERSATION', error);
    currentConversation = conversationId;
    currentConversationData = conversation;
    showChatError(error?.message || 'No se pudo abrir esta conversación.');
    return false;
  }
}
async function restoreConversation() {
if (!currentUser) return;
const saved = sessionStorage.getItem('xifre_current_conversation');
if (!saved) return;
const conversation = conversationCache.find(c => String(c.id) === String(saved));
if (conversation) await openConversation(saved, conversation);
}

function updateChatHeader() {
const isGroup = currentConversationData?.type === 'group';
let name = currentConversationData?.displayName || currentConversationData?.name || (isGroup ? 'Grupo' : 'Conversación');
let url = currentConversationData?.avatar_url || null;
let subtitle = '';
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
name = other?.username || name;
url = other?.avatar_url || null;
subtitle = 'Mensaje directo';
} else {
subtitle = `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`;
}
avatarInto($('#chat-avatar'), name, url, isGroup ? 'group' : 'private', isGroup ? '' : (currentMembers.find(m=>String(m.user_id)!==String(currentUser.id))?.avatar_color || ''));
const chatPeer = isGroup ? null : currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
ensurePresenceDot($('#chat-avatar'), getMemberId(chatPeer));
setText('chat-title', name);
setText('chat-subtitle', subtitle);
$('#chat-info-button')?.classList.remove('hidden');
}

/* ------------------------------------------------------------------------ */
/* Messages */
/* ------------------------------------------------------------------------ */
function messageObject(row) {
return { ...row };
}

function isSafeChatMediaPath(path) {
  return typeof path === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9_-]{8,100}\.(?:png|jpe?g|webp|gif)$/i.test(path);
}

function parseImageAttachmentContent(content) {
  const source = String(content || '');
  const match = source.match(/^\[\[XIFRE_IMAGE:([^\]\r\n]+)\]\](?:\r?\n([\s\S]*))?$/i);
  if (!match || !isSafeChatMediaPath(match[1])) return null;
  return { path: match[1], caption: match[2] || '' };
}

function makeImageAttachmentContent(path, caption = '') {
  const cleanCaption = String(caption || '').trim();
  return `${CHAT_IMAGE_MARKER_PREFIX}${path}]]${cleanCaption ? `\n${cleanCaption}` : ''}`;
}

function messagePreviewText(content) {
  const attachment = parseImageAttachmentContent(content);
  if (!attachment) return String(content || '');
  const caption = attachment.caption.trim();
  return caption ? `🖼️ ${caption}` : '🖼️ Imagen adjunta';
}

async function getSignedChatMediaUrl(path) {
  if (!isSafeChatMediaPath(path)) throw new Error('Ruta de imagen no válida.');
  const cached = signedChatMediaCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 90_000) return cached.url;
  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  const url = data?.signedUrl || data?.signedURL;
  if (!url) throw new Error('Supabase no devolvió el enlace temporal de la imagen.');
  signedChatMediaCache.set(path, { url, expiresAt: Date.now() + 55 * 60 * 1000 });
  return url;
}

async function resolveMessageAttachmentUrls(messages) {
  // Limit simultaneous signed-URL requests when opening long chats with many images.
  const queue = (messages || []).filter(message => parseImageAttachmentContent(message?.content));
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const message = queue[cursor++];
      const attachment = parseImageAttachmentContent(message?.content);
      if (!attachment) continue;
      try {
        message.attachment_signed_url = await getSignedChatMediaUrl(attachment.path);
        message.attachment_load_error = false;
      } catch (error) {
        message.attachment_signed_url = '';
        message.attachment_load_error = true;
        // Do not fail message history because one attachment is missing or cannot be signed.
        console.warn('CHAT IMAGE URL', error?.message || error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => worker()));
  return messages;
}

function chatAttachmentExtension(file) {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[String(file?.type || '').toLowerCase()] || '';
}

function validateChatAttachment(file) {
  if (!file) throw new Error('Selecciona una imagen o GIF.');
  if (!chatAttachmentExtension(file)) throw new Error('Formato no admitido. Usa PNG, JPG, WEBP o GIF.');
  if (file.size > CHAT_MEDIA_MAX_BYTES) throw new Error('La imagen supera el límite de 8 MB.');
  if (file.size <= 0) throw new Error('El archivo está vacío.');
  return true;
}

function createChatFileId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function syncAttachmentMessageLimit() {
  const input = $('#message-input');
  if (!input) return;
  input.maxLength = pendingChatAttachment ? CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT : CHAT_MESSAGE_MAX_CHARS;
  updateMessageCharacterCount();
}

function setPendingChatAttachment(file) {
  if (!currentConversation) { toast('Selecciona una conversación antes de adjuntar una imagen.', 'info'); return false; }
  try { validateChatAttachment(file); }
  catch (error) { toast(error.message, 'error'); return false; }
  clearPendingChatAttachment(false);
  pendingChatAttachment = file;
  pendingChatAttachmentGeneration++;
  pendingChatAttachmentObjectUrl = URL.createObjectURL(file);
  const preview = $('#chat-attachment-preview');
  const image = $('#chat-attachment-preview-image');
  if (image) {
    image.src = pendingChatAttachmentObjectUrl;
    image.alt = `Vista previa de ${file.name || 'imagen adjunta'}`;
  }
  setText('chat-attachment-preview-name', file.name || (file.type === 'image/gif' ? 'imagen.gif' : 'imagen adjunta'));
  preview?.classList.remove('hidden');
  $('#attachment-menu')?.classList.add('hidden');
  $('#composer-plus-button')?.setAttribute('aria-expanded', 'false');
  syncAttachmentMessageLimit();
  updateSendState();
  $('#message-input')?.focus({ preventScroll: true });
  return true;
}

function clearPendingChatAttachment(restoreInput = true) {
  pendingChatAttachment = null;
  pendingChatAttachmentGeneration++;
  if (pendingChatAttachmentObjectUrl) {
    try { URL.revokeObjectURL(pendingChatAttachmentObjectUrl); } catch {}
  }
  pendingChatAttachmentObjectUrl = null;
  const image = $('#chat-attachment-preview-image');
  if (image) image.removeAttribute('src');
  $('#chat-attachment-preview')?.classList.add('hidden');
  const fileInput = $('#chat-attachment-input');
  if (fileInput) fileInput.value = '';
  syncAttachmentMessageLimit();
  updateSendState();
  if (restoreInput) $('#message-input')?.focus({ preventScroll: true });
}

function toggleAttachmentMenu() {
  const menu = $('#attachment-menu');
  const button = $('#composer-plus-button');
  if (!menu || !button || button.disabled) return;
  if (!currentConversation) { toast('Selecciona una conversación antes de adjuntar una imagen.', 'info'); return; }
  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (opening) {
    const rect = button.getBoundingClientRect();
    const width = 245;
    menu.style.width = `${Math.min(width, window.innerWidth - 20)}px`;
    menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - Math.min(width, window.innerWidth - 20) - 10))}px`;
    menu.style.top = `${Math.max(10, rect.top - 76)}px`;
  }
}

function closeAttachmentMenu() {
  $('#attachment-menu')?.classList.add('hidden');
  $('#composer-plus-button')?.setAttribute('aria-expanded', 'false');
}

async function uploadChatAttachment(file, conversationId) {
  validateChatAttachment(file);
  const extension = chatAttachmentExtension(file);
  const path = `${currentUser.id}/${conversationId}/${createChatFileId()}.${extension}`;
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type,
    metadata: { originalName: String(file.name || `imagen.${extension}`).slice(0, 180) }
  });
  if (error) throw error;
  return path;
}


async function loadMessages(conversationId, scrollToBottom = false) {
  const requestedId = String(conversationId || '');
  if (!requestedId || !currentUser) return;
  const ownerAtStart = String(currentUser.id);
  const sequence = (messageLoadSequences.get(requestedId) || 0) + 1;
  messageLoadSequences.set(requestedId, sequence);
  let response = await supabase.rpc('xifre_get_messages_v17', {
    p_conversation_id: requestedId,
    p_limit: 500
  });
  // Allow a temporarily un-migrated deployment to keep reading messages while SQL is updated.
  if (response.error && (response.error.code === 'PGRST202' || /xifre_get_messages_v17/i.test(String(response.error.message || '')))) {
    response = await supabase.rpc('xifre_get_messages', { p_conversation_id: requestedId, p_limit: 500 });
  }
  if (response.error) throw response.error;
  if (String(currentUser?.id || '') !== ownerAtStart || String(currentConversation || '') !== requestedId) return;
  if (messageLoadSequences.get(requestedId) !== sequence) return;
  const messages = (response.data || []).map(messageObject);
  await resolveMessageAttachmentUrls(messages);
  if (String(currentUser?.id || '') !== ownerAtStart || String(currentConversation || '') !== requestedId) return;
  if (messageLoadSequences.get(requestedId) !== sequence) return; // Ignore out-of-order poll/realtime responses.
  renderMessages(messages, scrollToBottom);
  void loadMessageReactions(requestedId).catch(error => console.debug('REACTIONS LOAD', error));
}

function messageRenderSignature(message) {
  return JSON.stringify([
    message?.content, message?.created_at, message?.edited_at || null, message?.sender_id,
    message?.sender_username, message?.sender_avatar_url, message?.sender_avatar_color,
    message?.reply_to, message?.reply_sender_id, message?.reply_sender_username,
    message?.reply_sender_avatar_url, message?.reply_content, message?.mentions || [],
    !!message?.mention_everyone, message?.message_type || 'user',
    message?.attachment_signed_url || '', !!message?.attachment_load_error
  ]);
}

function renderMessageContent(content, message) {
  const source = String(content || '');
  const mentionedIds = new Set((message?.mentions || []).map(id => String(id)));
  const hasMentionData = Array.isArray(message?.mentions);
  const membersByName = new Map();
  for (const member of [...(currentMembers || [])].sort((a, b) => String(b.username || '').length - String(a.username || '').length)) {
    const username = String(member.username || '').trim();
    if (username) membersByName.set(username.toLowerCase(), member);
  }

  // URLs are links only when they use HTTP(S) or www.; clicking is intercepted by the warning modal.
  // Mention token parsing and escaping remain independent to prevent HTML injection.
  const tokenRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)|(^|[^a-z0-9_])@([a-z0-9_]+)/gi;
  let html = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(source)) !== null) {
    const linkToken = match[1];
    if (linkToken) {
      const tokenStart = match.index;
      let cleanLink = linkToken;
      const trailing = cleanLink.match(/[.,!?;:)\]}]+$/)?.[0] || '';
      if (trailing) cleanLink = cleanLink.slice(0, -trailing.length);
      if (!cleanLink) continue;
      const candidate = /^www\./i.test(cleanLink) ? `https://${cleanLink}` : cleanLink;
      let safe = false;
      try { const parsed = new URL(candidate); safe = parsed.protocol === 'http:' || parsed.protocol === 'https:'; } catch {}
      html += esc(source.slice(lastIndex, tokenStart));
      if (safe) {
        html += `<a class="chat-link" href="${esc(candidate)}" target="_blank" rel="noopener noreferrer nofollow" data-external-url="${esc(candidate)}">${esc(cleanLink)}</a>`;
      } else {
        html += esc(cleanLink);
      }
      lastIndex = tokenStart + cleanLink.length;
      continue;
    }

    const prefix = match[2] || '';
    const name = match[3] || '';
    const tokenStart = match.index + prefix.length;
    const tokenEnd = tokenStart + name.length + 1;
    html += esc(source.slice(lastIndex, tokenStart));
    if (name.toLowerCase() === 'everyone' && currentConversationData?.type === 'group' && message?.mention_everyone) {
      html += '<span class="mention-token everyone">@everyone</span>';
    } else {
      const member = membersByName.get(name.toLowerCase());
      const memberId = getMemberId(member);
      const explicitlyMentioned = memberId && mentionedIds.has(String(memberId));
      const canStyleLegacyMention = !hasMentionData && !!member;
      if (member && (explicitlyMentioned || canStyleLegacyMention)) {
        const isSelf = String(memberId) === String(currentUser?.id);
        html += `<span class="mention-token${isSelf ? ' self' : ''}">@${esc(member.username)}</span>`;
      } else {
        html += esc(`@${name}`);
      }
    }
    lastIndex = tokenEnd;
  }
  html += esc(source.slice(lastIndex));
  return html;
}

function messageMentionsMe(message) {
  if (!message || String(message.sender_id) === String(currentUser?.id)) return false;
  const mine = String(currentUser?.id || '');
  const explicit = Array.isArray(message.mentions) && message.mentions.some(id => String(id) === mine);
  return explicit || (currentConversationData?.type === 'group' && !!message.mention_everyone);
}

function renderMessages(messages, forceBottom = false) {
  const box = $('#messages');
  if (!box) return;
  const ordered = [...(messages || [])].sort((a, b) => {
    const delta = new Date(a.created_at || 0) - new Date(b.created_at || 0);
    return delta || String(a.id || '').localeCompare(String(b.id || ''));
  });
  const incomingIds = new Set(ordered.map(item => String(item.id || '')).filter(Boolean));
  const existingNodes = new Map([...box.querySelectorAll('[data-message-id]')].map(node => [String(node.dataset.messageId), node]));
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const originalScrollTop = box.scrollTop;
  const boxTop = box.getBoundingClientRect().top;
  const anchor = [...existingNodes.values()].find(node => node.getBoundingClientRect().bottom > boxTop + 1);
  const anchorId = anchor?.dataset.messageId || '';
  const anchorTop = anchor?.getBoundingClientRect().top || 0;
  let changed = false;
  let addedAny = false;

  if (!ordered.length) {
    if (existingNodes.size || !box.querySelector('.chat-welcome')) {
      box.innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
      if (forceBottom) box.scrollTop = box.scrollHeight;
    }
    return;
  }

  for (const [id, node] of existingNodes) {
    if (!incomingIds.has(id)) { node.remove(); existingNodes.delete(id); changed = true; }
  }
  const welcome = box.querySelector('.chat-welcome');
  if (welcome) { welcome.remove(); changed = true; }
  const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
  for (let i = 0; i < ordered.length; i++) {
    const message = ordered[i];
    const id = String(message.id || '');
    if (!id) continue;
    const existing = existingNodes.get(id);
    if (existing) {
      // A background poll must never destroy an editor or steal focus from the user.
      if (String(editingMessageId || '') === id) continue;
      if (existing.dataset.messageSignature !== messageRenderSignature(message)) {
        const updated = renderOneMessage(message, profiles, existing);
        if (updated) existingNodes.set(id, updated);
        changed = true;
      }
      continue;
    }
    const node = renderOneMessage(message, profiles);
    if (!node) continue;
    existingNodes.set(id, node);
    const nextExisting = ordered.slice(i + 1).map(next => existingNodes.get(String(next.id || ''))).find(Boolean);
    if (nextExisting && nextExisting !== node) box.insertBefore(node, nextExisting);
    changed = true;
    addedAny = true;
  }

  if (changed) applyMessageGrouping();
  if (forceBottom || (wasNearBottom && addedAny)) {
    box.scrollTop = box.scrollHeight;
  } else if (changed && anchorId) {
    const anchorAfter = box.querySelector(`[data-message-id="${CSS.escape(anchorId)}"]`);
    if (anchorAfter) {
      const delta = anchorAfter.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 0.5) box.scrollTop = Math.max(0, originalScrollTop + delta);
    } else box.scrollTop = originalScrollTop;
  } else if (!changed) {
    // Stable DOM is important: polls must not blink or move text selection.
    return;
  }
}

function applyMessageGrouping() {
  const box = $('#messages');
  if (!box) return;
  const rows = [...box.children].filter(node => node.dataset?.messageId);
  let previous = null;
  for (const row of rows) {
    row.classList.remove('grouped-message');
    if (!row.classList.contains('message-row') || !row.dataset.senderId) {
      previous = null;
      continue;
    }
    const senderId = String(row.dataset.senderId || '');
    const time = Date.parse(row.dataset.createdAt || '');
    if (previous && senderId === previous.senderId && Number.isFinite(time) && Number.isFinite(previous.time)) {
      const delta = time - previous.time;
      if (delta >= 0 && delta < 60_000) row.classList.add('grouped-message');
    }
    previous = { senderId, time };
  }
}

function renderOneMessage(message, profiles = new Map(), existingNode = null) {
  const box = $('#messages');
  if (!box || !message?.id) return null;
  const id = String(message.id);
  const existing = existingNode || box.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  const signature = messageRenderSignature(message);
  if (existing && existing.dataset.messageSignature === signature) return existing;
  $('.chat-welcome', box)?.remove();
  if (message.message_type === 'system') {
    const row = document.createElement('div');
    row.className = 'system-message-row';
    row.dataset.messageId = id;
    row.dataset.senderId = String(message.sender_id || '');
    row.dataset.createdAt = String(message.created_at || '');
    row.dataset.messageSignature = signature;
    row.dataset.messageType = 'system';
    row.innerHTML = `<span>${esc(message.content || '')}</span>`;
    if (existing) existing.replaceWith(row); else box.appendChild(row);
    return row;
  }
  const mine = String(message.sender_id) === String(currentUser?.id);
  const cached = profiles.get(String(message.sender_id)) || currentMembers.find(member => getMemberId(member) === String(message.sender_id)) || {};
  const sender = {
    username: message.sender_username || cached.username || 'Usuario',
    avatar_url: message.sender_avatar_url || cached.avatar_url || null,
    avatar_color: message.sender_avatar_color || cached.avatar_color || ''
  };
  const mentioned = !mine && messageMentionsMe(message);
  const attachment = parseImageAttachmentContent(message.content);
  const bodyText = attachment ? attachment.caption : String(message.content || '');
  const imageMarkup = attachment
    ? (message.attachment_signed_url
      ? `<div class="message-image-attachment"><img src="${esc(message.attachment_signed_url)}" alt="Imagen adjunta" loading="lazy" decoding="async"></div>`
      : `<div class="message-image-attachment message-image-unavailable"><span>${message.attachment_load_error ? 'No se pudo cargar esta imagen' : 'Cargando imagen…'}</span></div>`)
    : '';
  const stamp = formatMessageTime(message.created_at);
  const exactStamp = formatExactMessageTime(message.created_at);
  const row = document.createElement('article');
  row.className = `message-row${mine ? ' mine' : ''}${mentioned ? ' mentioned' : ''}`;
  row.dataset.messageId = id;
  row.dataset.senderId = String(message.sender_id || '');
  row.dataset.createdAt = String(message.created_at || '');
  row.dataset.messageSignature = signature;
  row.innerHTML = `
    <span class="message-grouped-time" aria-hidden="true">${esc(formatTime(message.created_at))}</span>
    <span class="message-avatar">${avatarHTML(sender.username, sender.avatar_url, 'private', '', sender.avatar_color)}${presenceDotHTML(message.sender_id, 'presence-dot-message')}</span>
    <div class="message-body">
      ${message.reply_to ? `<div class="message-reply-preview" data-reply-target="${esc(message.reply_to)}"><span class="reply-line"></span><span class="reply-avatar">${avatarHTML(message.reply_sender_username || 'Usuario', message.reply_sender_avatar_url, 'private', '', message.reply_sender_avatar_color || '')}</span><div class="message-reply-copy"><strong>${esc(message.reply_sender_username || 'Usuario')}</strong><span>${esc(messagePreviewText(message.reply_content || ''))}</span></div></div>` : ''}
      <div class="message-meta"><span class="message-author">${esc(sender.username)}</span><span class="message-time" title="${esc(exactStamp)}">${esc(stamp)}</span>${message.edited_at ? '<span class="message-edited" title="Este mensaje ha sido editado">(editado)</span>' : ''}</div>
      <div class="message-content">${imageMarkup}${bodyText.trim() ? `<div class="message-caption">${renderMessageContent(bodyText, message)}</div>` : ''}${message.edited_at ? '<span class="message-edited-inline"> (editado)</span>' : ''}</div>
      <div class="message-reactions" data-reactions-for="${esc(id)}"></div>
    </div>
    <div class="message-actions">
      <button class="message-action" type="button" data-message-action="reply" title="Responder" aria-label="Responder">↩</button>
      <button class="message-action" type="button" data-message-action="react" title="Añadir reacción" aria-label="Añadir reacción">☺</button>
      ${mine ? '<button class="message-action" type="button" data-message-action="edit" title="Editar mensaje" aria-label="Editar mensaje">✎</button>' : ''}
      <button class="message-action more" type="button" data-message-action="more" title="Más" aria-label="Más opciones">•••</button>
    </div>`;
  row.querySelector('[data-message-action="reply"]')?.addEventListener('click', event => { event.stopPropagation(); setReplyTo(message); highlightMessage(message.id); });
  row.querySelector('[data-message-action="react"]')?.addEventListener('click', event => { event.stopPropagation(); openEmojiPicker(event.currentTarget, 'reaction', id); });
  row.querySelector('[data-message-action="edit"]')?.addEventListener('click', event => { event.stopPropagation(); startEditMessage(message, row); });
  row.querySelector('[data-message-action="more"]')?.addEventListener('click', event => { event.stopPropagation(); openMessageMenu(message, event.currentTarget); });
  row.querySelector('.message-reply-preview')?.addEventListener('click', () => highlightMessage(message.reply_to));
  row.addEventListener('contextmenu', event => { event.preventDefault(); openMessageMenu(message, row); });
  if (existing) existing.replaceWith(row); else box.appendChild(row);
  return row;
}

function startEditMessage(message, row) {
  if (!message || !row || String(message.sender_id) !== String(currentUser?.id) || message.message_type === 'system') return;
  if (editingMessageId) return;
  const contentNode = $('.message-content', row);
  if (!contentNode) return;
  editingMessageId = String(message.id);
  const originalAttachment = parseImageAttachmentContent(message.content);
  const initial = originalAttachment ? originalAttachment.caption : String(message.content || '');
  const wrap = document.createElement('div');
  wrap.className = 'message-edit-wrap';
  const editor = document.createElement('textarea');
  editor.className = 'message-edit-input';
  editor.maxLength = 2000;
  editor.value = initial;
  editor.setAttribute('aria-label', 'Editar mensaje');
  const actions = document.createElement('div');
  actions.className = 'message-edit-actions';
  const hint = document.createElement('span'); hint.textContent = 'Esc para cancelar · Enter para guardar · Shift+Enter para nueva línea';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'message-edit-cancel'; cancel.textContent = 'Cancelar';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'message-edit-save'; save.textContent = 'Guardar';
  actions.append(hint, cancel, save); wrap.append(editor, actions);
  contentNode.replaceWith(wrap);
  const finishLocal = () => {
    if (String(editingMessageId) === String(message.id)) editingMessageId = null;
    // Restore the untouched original content node, including any image preview and reactions.
    if (wrap.isConnected) wrap.replaceWith(contentNode);
  };
  cancel.addEventListener('click', finishLocal);
  save.addEventListener('click', async () => {
    save.disabled = cancel.disabled = true;
    try { await saveMessageEdit(message, editor.value, row); }
    catch (error) { toast(friendlyError(error), 'error'); save.disabled = cancel.disabled = false; }
  });
  editor.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); finishLocal(); }
    else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); save.click(); }
  });
  editor.style.height = 'auto'; editor.style.height = `${Math.min(Math.max(editor.scrollHeight, 54), 180)}px`;
  editor.addEventListener('input', () => { editor.style.height = 'auto'; editor.style.height = `${Math.min(Math.max(editor.scrollHeight, 54), 180)}px`; });
  editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length);
}

async function saveMessageEdit(message, updatedContent, row) {
  const originalAttachment = parseImageAttachmentContent(message.content);
  const editedText = String(updatedContent || '').trim();
  if (!editedText && !originalAttachment) throw new Error('El mensaje no puede estar vacío.');
  const content = originalAttachment ? makeImageAttachmentContent(originalAttachment.path, editedText) : editedText;
  if (content.length > 2000) throw new Error('El mensaje editado es demasiado largo.');
  const conversationId = String(message.conversation_id || currentConversation || '');
  const derived = deriveMentions(editedText);
  const mentionedIds = new Set(derived.ids.filter(isValidUuid));
  // Responder también notifica/resalta al autor original de la respuesta.
  const replySenderId = String(message.reply_sender_id || '');
  if (isValidUuid(replySenderId) && replySenderId !== String(currentUser?.id)) mentionedIds.add(replySenderId);

  const { data, error } = await supabase.rpc('xifre_edit_message_v17', {
    p_message_id: message.id,
    p_content: content,
    p_mentions: [...mentionedIds],
    p_mention_everyone: !!derived.everyone
  });
  if (error) throw error;
  messageLoadSequences.set(conversationId, (messageLoadSequences.get(conversationId) || 0) + 1);
  editingMessageId = null;

  const updated = (Array.isArray(data) ? data[0] : data) || {};
  const patched = {
    ...message,
    ...updated,
    content,
    attachment_signed_url: message.attachment_signed_url || '',
    attachment_load_error: !!message.attachment_load_error,
    edited_at: updated.edited_at || new Date().toISOString(),
    mentions: Array.isArray(updated.mentions) ? updated.mentions : [...mentionedIds],
    mention_everyone: Object.prototype.hasOwnProperty.call(updated, 'mention_everyone') ? !!updated.mention_everyone : !!derived.everyone
  };
  if (String(currentConversation || '') === conversationId) {
    const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
    const currentRow = $(`[data-message-id="${CSS.escape(String(message.id))}"]`, $('#messages'));
    if (currentRow) renderOneMessage(patched, profiles, currentRow);
    applyMessageGrouping();
  }
  toast('Mensaje editado.', 'success');

  // The edit is already saved. A transient list/message refresh failure must not
  // leave the editor open or make the user think they need to submit it again.
  const refreshes = await Promise.allSettled([
    loadMessages(conversationId, false),
    loadConversations()
  ]);
  for (const result of refreshes) if (result.status === 'rejected') console.warn('POST-EDIT REFRESH', result.reason);
}
function highlightMessage(id){
$$('.message-row', $('#messages')).forEach(r=>r.classList.remove('reply-target'));
const row=$(`[data-message-id="${CSS.escape(String(id))}"]`,$('#messages')); if(!row)return; row.classList.add('reply-target'); row.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>row.classList.remove('reply-target'),1600);
}

function setReplyTo(message) {
replyTarget = message;
setText('replying-name', `@${message.sender_username || 'usuario'}`);
setText('replying-content', messagePreviewText(message.content || ''));
$('#reply-bar')?.classList.remove('hidden');
$('#message-input')?.focus();
}

function clearReply() {
replyTarget = null;
$('#reply-bar')?.classList.add('hidden');
setText('replying-name', '');
setText('replying-content', '');
}

function openMessageMenu(message, anchor) {
const menu = $('#message-menu');
if (!menu) return;
menuMessage = message;
$('#delete-message-menu')?.classList.toggle('hidden', String(message.sender_id) !== String(currentUser.id));
$('#edit-message-menu')?.classList.toggle('hidden', String(message.sender_id) !== String(currentUser.id) || message.message_type === 'system');
menu.classList.remove('hidden');
const rect = anchor.getBoundingClientRect();
const width = 180;
let left = rect.right - width;
let top = rect.bottom + 5;
if (left < 8) left = 8;
if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
if (top + 80 > window.innerHeight) top = rect.top - 90;
menu.style.left = `${left}px`;
menu.style.top = `${top}px`;
}

function closeMessageMenu() {
$('#message-menu')?.classList.add('hidden');
menuMessage = null;
}

async function deleteMessage(message) {
const ok = await askConfirm('Eliminar mensaje', 'Este mensaje se eliminará de la conversación.', 'Eliminar');
if (!ok) return;
const { error } = await supabase.rpc('xifre_delete_message', { p_message_id: message.id });
if (error) return toast(friendlyError(error), 'error');
closeMessageMenu();
const row = $(`[data-message-id="${CSS.escape(String(message.id))}"]`);
row?.remove();
if (!$$('.message-row', $('#messages')).length) $('#messages').innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
if (replyTarget?.id === message.id) clearReply();
await loadConversations();
toast('Mensaje eliminado.', 'success');
}

function updateMentionPicker() {
  const input = $('#message-input');
  const picker = $('#mention-picker');
  if (!input || !picker) return;
  const value = input.value;
  const position = input.selectionStart ?? value.length;
  const before = value.slice(0, position);
  const match = before.match(/(^|[^a-z0-9_])@([a-z0-9_]*)$/i);
  if (!currentConversation || !match) { picker.classList.add('hidden'); return; }
  const query = match[2].toLowerCase();
  const people = (currentMembers || []).filter(member => {
    const id = getMemberId(member);
    return id && id !== String(currentUser?.id) && isValidUuid(id) && String(member.username || '').toLowerCase().startsWith(query);
  }).slice(0, 8);
  const choices = [...people];
  if (currentConversationData?.type === 'group' && 'everyone'.startsWith(query)) {
    choices.unshift({ id: null, username: 'everyone', display_name: 'everyone', everyone: true });
  }
  picker.innerHTML = '';
  mentionPickerIndex = 0;
  if (!choices.length) { picker.classList.add('hidden'); return; }
  choices.forEach((person, index) => {
    const row = document.createElement('div');
    row.className = `mention-item${index === 0 ? ' active' : ''}${person.everyone ? ' mention-item-everyone' : ''}`;
    if (person.everyone) {
      row.innerHTML = '<span class="mention-avatar mention-everyone-avatar">@</span><span class="mention-item-copy"><strong>@everyone</strong><small>Mencionar a todos los miembros</small></span>';
    } else {
      row.innerHTML = `${avatarHTML(person.username, person.avatar_url, 'private', 'mention-avatar', person.avatar_color)}<span class="mention-item-copy"><strong>${esc(person.username)}</strong><small>@${esc(person.username)}</small></span>`;
    }
    row.addEventListener('mousedown', event => { event.preventDefault(); selectMention(person); });
    picker.appendChild(row);
  });
  picker.classList.remove('hidden');
}

function selectMention(person) {
  const input = $('#message-input');
  const value = input?.value || '';
  if (!input || !person) return;
  const everyone = person.everyone === true;
  const id = everyone ? '' : getMemberId(person);
  const username = everyone ? 'everyone' : String(person.username || '').trim();
  if (!username || (!everyone && !isValidUuid(id))) {
    $('#mention-picker')?.classList.add('hidden');
    toast('No se pudo identificar correctamente a ese miembro. Actualiza el chat e inténtalo otra vez.', 'error');
    return;
  }
  const position = input.selectionStart ?? value.length;
  const before = value.slice(0, position);
  const match = before.match(/(^|[^a-z0-9_])@([a-z0-9_]*)$/i);
  if (!match) return;
  const start = position - match[2].length - 1;
  const token = `@${username} `;
  input.value = value.slice(0, start) + token + value.slice(position);
  const cursor = start + token.length;
  input.focus(); input.setSelectionRange(cursor, cursor);
  if (everyone) mentionEverywhere = true; else currentMentionIds.add(id);
  $('#mention-picker')?.classList.add('hidden');
  resizeMessageInput(); updateSendState(); scheduleTyping();
}

function updateMessageCharacterCount() {
  const input = $('#message-input');
  const counter = $('#message-character-count');
  if (!input || !counter) return;
  const max = Number(input.maxLength) > 0 ? Number(input.maxLength) : 2000;
  const remaining = Math.max(0, max - String(input.value || '').length);
  counter.textContent = String(remaining);
  counter.classList.toggle('hidden', remaining > 20);
  counter.classList.toggle('at-zero', remaining === 0);
  counter.classList.toggle('near-limit', remaining > 0 && remaining <= 20);
  counter.setAttribute('aria-label', `Quedan ${remaining} caracteres`);
}

function updateSendState() {
  const input = $('#message-input');
  const button = $('#send-button');
  if (button) button.disabled = !currentConversation || sendInFlight || (!String(input?.value || '').trim() && !pendingChatAttachment);
  updateMessageCharacterCount();
  updateKeyboardSuggestions();
}

function deriveMentions(content) {
  const ids = new Set();
  const text = String(content || '');
  for (const member of currentMembers || []) {
    const id = getMemberId(member);
    const username = String(member.username || '').trim();
    if (!username || !id || !isValidUuid(id) || id === String(currentUser?.id)) continue;
    const expression = new RegExp(`(^|[^a-z0-9_])@${escapeRegExp(username)}(?![a-z0-9_])`, 'i');
    if (expression.test(text)) ids.add(id);
  }
  const everyone = currentConversationData?.type === 'group' && /(^|[^a-z0-9_])@everyone(?![a-z0-9_])/i.test(text);
  return { ids: [...ids], everyone };
}

async function sendMessage() {
  if (sendInFlight || !currentUser || !currentConversation) return;
  const input = $('#message-input');
  const rawDraft = String(input?.value || '');
  const textContent = rawDraft.trim();
  const sendingAttachment = pendingChatAttachment;
  const attachmentGeneration = pendingChatAttachmentGeneration;
  if (!textContent && !sendingAttachment) return;
  if (sendingAttachment && textContent.length > CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT) {
    toast(`El texto con imagen no puede superar ${CHAT_MESSAGE_WITH_IMAGE_MAX_TEXT} caracteres.`, 'error');
    return;
  }
  if (!sendingAttachment && textContent.length > CHAT_MESSAGE_MAX_CHARS) {
    toast(`El mensaje no puede superar ${CHAT_MESSAGE_MAX_CHARS} caracteres.`, 'error');
    return;
  }
  const conversationId = String(currentConversation);
  const sendingReply = replyTarget;
  const button = $('#send-button');
  let persisted = false;
  let uploadedPath = '';
  // Capture the current chat's mentions before awaiting Storage; the user may click another chat meanwhile.
  const derived = deriveMentions(textContent);
  const safeMentions = new Set(derived.ids.filter(isValidUuid));
  const replySenderId = String(sendingReply?.sender_id || '');
  if (isValidUuid(replySenderId) && replySenderId !== String(currentUser.id)) safeMentions.add(replySenderId);
  sendInFlight = true;
  if (button) button.disabled = true;
  $('#composer-plus-button')?.setAttribute('disabled', 'disabled');
  try {
    let contentToPersist = textContent;
    // Upload privately first; only the object path (never a public URL) is stored in messages.
    if (sendingAttachment) {
      const path = `${currentUser.id}/${conversationId}/${createChatFileId()}.${chatAttachmentExtension(sendingAttachment)}`;
      const imageMarkerLength = makeImageAttachmentContent(path, '').length;
      if (textContent.length + imageMarkerLength + (textContent ? 1 : 0) > CHAT_MESSAGE_MAX_CHARS) {
        throw new Error('El texto es demasiado largo para adjuntarlo a esta imagen.');
      }
      uploadedPath = path;
      const { error: uploadError } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, sendingAttachment, {
        upsert: false,
        cacheControl: '3600',
        contentType: sendingAttachment.type,
        metadata: { originalName: String(sendingAttachment.name || `imagen.${chatAttachmentExtension(sendingAttachment)}`).slice(0, 180) }
      });
      if (uploadError) throw uploadError;
      contentToPersist = makeImageAttachmentContent(path, textContent);
    }
    const { data, error } = await supabase.rpc('xifre_send_message', {
      p_conversation_id: conversationId,
      p_content: contentToPersist,
      p_reply_to: sendingReply?.id || null,
      p_mentions: [...safeMentions],
      p_mention_everyone: !!derived.everyone
    });
    if (error) throw error;
    persisted = true;
    messageLoadSequences.set(conversationId, (messageLoadSequences.get(conversationId) || 0) + 1);
    const sent = Array.isArray(data) ? data[0] : data;
    if (uploadedPath && sent) {
      try { sent.attachment_signed_url = await getSignedChatMediaUrl(uploadedPath); sent.attachment_load_error = false; }
      catch (error) { sent.attachment_signed_url = ''; sent.attachment_load_error = true; console.warn('NEW IMAGE SIGN URL', error); }
    }
    if (String(currentConversation) !== conversationId) {
      if (pendingChatAttachment === sendingAttachment && sendingAttachment) clearPendingChatAttachment(false);
      toast('El mensaje se ha enviado en la conversación anterior.', 'success');
      return;
    }

    if (input && input.value === rawDraft) {
      input.value = '';
      resizeMessageInput();
      if (replyTarget === sendingReply) clearReply();
      currentMentionIds.clear(); mentionEverywhere = false;
      $('#mention-picker')?.classList.add('hidden');
      stopTypingBroadcast();
    }
    if (sendingAttachment && pendingChatAttachment === sendingAttachment && pendingChatAttachmentGeneration === attachmentGeneration) {
      clearPendingChatAttachment(false);
    }
    if (sent?.id) {
      if (sendingReply) {
        sent.reply_sender_id = sent.reply_sender_id || sendingReply.sender_id;
        sent.reply_sender_username = sent.reply_sender_username || sendingReply.sender_username;
        sent.reply_sender_avatar_url = sent.reply_sender_avatar_url || sendingReply.sender_avatar_url;
        sent.reply_content = sent.reply_content || sendingReply.content;
      }
      const profiles = new Map((currentMembers || []).map(member => [getMemberId(member), member]));
      renderOneMessage(sent, profiles);
      applyMessageGrouping();
    }
    const box = $('#messages');
    if (box) box.scrollTop = box.scrollHeight;
    if (textContent) recordComposerWordUsage(textContent);

    // A list/read-state refresh must never make an already-sent message appear unsent.
    const refreshes = await Promise.allSettled([
      loadConversations(),
      supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId })
    ]);
    for (const result of refreshes) if (result.status === 'rejected' || result.value?.error) console.warn('POST-SEND REFRESH', result.reason || result.value?.error);
  } catch (error) {
    if (uploadedPath && !persisted) {
      try { await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([uploadedPath]); }
      catch (cleanupError) { console.warn('ORPHAN IMAGE CLEANUP', cleanupError); }
    }
    if (persisted) {
      console.warn('MESSAGE SENT; UI RECOVERY', error);
      toast('El mensaje se ha enviado, pero no se ha actualizado la vista. No hace falta reenviarlo.', 'info');
      if (String(currentConversation) === conversationId) void loadMessages(conversationId, false).catch(refreshError => console.warn('MESSAGE RECOVERY', refreshError));
    } else {
      toast(friendlyError(error), 'error');
    }
  } finally {
    sendInFlight = false;
    $('#composer-plus-button')?.removeAttribute('disabled');
    updateSendState();
    if (input?.isConnected && currentConversation) input.focus({ preventScroll: true });
  }
}
/* ------------------------------------------------------------------------ */
/* Emoji picker and message reactions */
/* ------------------------------------------------------------------------ */
function closeEmojiPicker() {
  $('#emoji-picker-popover')?.classList.add('hidden');
  $('#composer-emoji-button')?.setAttribute('aria-expanded', 'false');
  emojiPickerMessageId = null;
}

function openEmojiPicker(anchor, mode = 'compose', messageId = null) {
  const popover = $('#emoji-picker-popover');
  const grid = $('#emoji-grid');
  if (!popover || !grid || !anchor) return;
  emojiPickerMode = mode;
  emojiPickerMessageId = messageId ? String(messageId) : null;
  const search = $('#emoji-search');
  if (search) search.value = '';
  popover.classList.remove('hidden');
  $('#composer-emoji-button')?.setAttribute('aria-expanded', mode === 'compose' ? 'true' : 'false');
  renderEmojiCategories();
  renderEmojiGrid('');
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const height = Math.min(460, window.innerHeight - 24);
  let left = rect.right - width;
  let top = rect.top - height - 8;
  if (left < 12) left = 12;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
  if (top < 12) top = rect.bottom + 8;
  if (top + height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - height - 12);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.width = `${width}px`;
  popover.style.height = `${height}px`;
  if (search) search.focus({ preventScroll: true });
}

function resizeMessageInput() {
  const input = $('#message-input');
  if (!input || input.tagName !== 'TEXTAREA') return;
  input.style.height = 'auto';
  const maxHeight = 128;
  const nextHeight = Math.min(Math.max(input.scrollHeight, 28), maxHeight);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function insertEmojiAtCursor(emoji) {
  const input = $('#message-input');
  if (!input || input.disabled || !emoji) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  const cursor = start + emoji.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  resizeMessageInput();
  updateMentionPicker();
  updateSendState();
  scheduleTyping();
}

function makeEmojiItems(source) {
  return source.split(',').map(item => {
    const [emoji, name = 'emoji'] = item.trim().split('|');
    return { emoji, name };
  }).filter(item => item.emoji);
}

// Built-in catalog: no external JSON, CDN fetch or IndexedDB dependency.
const EMOJI_CATEGORIES = [
  { id:'smileys', label:'Caras', icon:'😀', items: makeEmojiItems('😀|cara feliz,😃|sonrisa grande,😄|sonrisa ojos cerrados,😁|sonrisa dientes,😆|reír,😅|risa nerviosa,😂|llorar de risa,🤣|rodar de risa,🥲|sonrisa emocionada,😊|sonrisa tímida,😇|inocente,🙂|sonrisa,🙃|cara al revés,😉|guiño,😌|aliviado,😍|enamorado,🥰|sonrisas con corazones,😘|beso,😗|beso,😋|delicioso,😛|lengua,😜|guiño lengua,🤪|loco,😝|lengua ojos cerrados,🤑|dinero,🤗|abrazo,🤭|mano en la boca,🫢|sorpresa mano,🫣|mirar entre dedos,🤫|silencio,🤔|pensando,🫡|saludo,🤐|boca cerrada,🤨|ceja levantada,😐|neutral,😑|sin expresión,😶|sin boca,🫥|línea de puntos,😏|sonrisa pícara,😒|molesto,🙄|ojos en blanco,😬|mueca,🤥|mentiroso,😔|triste,😪|somnoliento,🤤|babear,😴|dormido,😷|mascarilla,🤒|enfermo,🤕|herido,🤢|asco,🤮|vomitar,🥵|calor,🥶|frío,🥴|mareado,😵|mareado,🤯|cabeza explotando,🥳|fiesta,🥸|disfraz,😎|gafas de sol,🤓|empollón,🧐|investigar,😕|confundido,🫤|escéptico,😟|preocupado,🙁|triste,☹️|cara triste,😮|boca abierta,😯|sorprendido,😲|asombrado,😳|avergonzado,🥺|suplicar,🥹|emocionado,😦|angustiado,😧|angustia,😨|asustado,😰|sudor frío,😥|aliviado triste,😢|llorar,😭|llorar mucho,😱|gritar,😖|frustrado,😣|sufrir,😞|decepcionado,😓|sudando,😩|cansado,😫|agotado,🥱|bostezo,😤|resoplar,😡|enfadado,😠|enojado,🤬|insulto,😈|diablillo,👿|diablo,💀|calavera,☠️|calavera huesos,💩|caca,🤡|payaso,👻|fantasma,👽|alien,🤖|robot,🎃|calabaza,😺|gato feliz,😸|gato sonrisa,😹|gato risa,😻|gato enamorado,🙀|gato asustado,😿|gato llorando,😾|gato enfadado,💯|cien puntos,💥|explosión,💫|mareo,💦|gotas,💨|viento,💤|dormir') },
  { id:'people', label:'Personas', icon:'👋', items: makeEmojiItems('👋|saludar,🤚|mano levantada,🖐️|mano abierta,✋|alto,🖖|vulcano,🫱|mano derecha,🫲|mano izquierda,🫳|palma abajo,🫴|palma arriba,👌|ok,🤌|dedos juntos,🤏|pequeño,✌️|victoria,🤞|suerte,🫰|corazón dedos,🤟|te quiero,🤘|rock,🤙|llámame,👈|izquierda,👉|derecha,👆|arriba,👇|abajo,☝️|índice arriba,👍|pulgar arriba,👎|pulgar abajo,✊|puño,👊|puñetazo,🤛|puño izquierda,🤜|puño derecha,👏|aplaudir,🙌|manos arriba,🫶|corazón manos,🤝|apretón manos,🙏|rezar gracias,✍️|escribir,💅|pintar uñas,💪|fuerza,🦾|brazo mecánico,🦿|pierna mecánica,🦵|pierna,🦶|pie,👂|oreja,🦻|audífono,👃|nariz,🧠|cerebro,🫀|corazón anatómico,🫁|pulmones,🦷|diente,🦴|hueso,👀|ojos,👁️|ojo,👅|lengua,👄|boca,💋|beso marca,🩸|sangre,👶|bebé,🧒|niño,👦|chico,👧|chica,🧑|persona,👨|hombre,👩|mujer,🧔|barba,👴|anciano,👵|anciana,🙍|persona enfadada,🙋|levantar mano,🙆|ok persona,🙅|no persona,💁|información,🙇|reverencia,🤦|facepalm,🤷|encogerse de hombros,🧏|persona sorda,🧑‍💻|tecnólogo,👨‍🎓|estudiante,👩‍🎓|estudiante mujer,🧑‍🚀|astronauta,🧑‍🎨|artista') },
  { id:'animals', label:'Animales', icon:'🐻', items: makeEmojiItems('🐶|perro,🐱|gato,🐭|ratón,🐹|hámster,🐰|conejo,🦊|zorro,🐻|oso,🐼|panda,🐨|koala,🐯|tigre,🦁|león,🐮|vaca,🐷|cerdo,🐸|rana,🐵|mono,🙈|mono no ver,🙉|mono no oír,🙊|mono no hablar,🐒|mono,🐔|gallina,🐧|pingüino,🐦|pájaro,🐤|pollito,🦆|pato,🦅|águila,🦉|búho,🦇|murciélago,🐺|lobo,🐗|jabalí,🐴|caballo,🦄|unicornio,🐝|abeja,🪱|gusano,🦋|mariposa,🐌|caracol,🐞|mariquita,🐜|hormiga,🪰|mosca,🦟|mosquito,🪳|cucaracha,🕷️|araña,🦂|escorpión,🐢|tortuga,🐍|serpiente,🦎|lagarto,🦖|tirano saurio,🦕|dinosaurio,🐙|pulpo,🦑|calamar,🦐|gamba,🦞|langosta,🦀|cangrejo,🐡|pez globo,🐠|pez tropical,🐟|pez,🐬|delfín,🐳|ballena,🦈|tiburón,🐊|cocodrilo,🐅|tigre,🐆|leopardo,🦓|cebra,🦍|gorila,🦧|orangután,🦣|mamut,🐘|elefante,🦛|hipopótamo,🦏|rinoceronte,🐪|camello,🦒|jirafa,🦘|canguro,🦬|bisonte,🐃|búfalo,🐂|buey,🐄|vaca,🐎|caballo carreras,🐖|cerdo,🐏|carnero,🐑|oveja,🦙|llama,🐐|cabra,🦌|ciervo,🐕|perro,🐩|caniche,🦮|perro guía,🐈|gato,🪶|pluma,🦚|pavo real,🦜|loro,🦢|cisne,🦩|flamenco,🕊️|paloma,🐇|liebre,🦝|mapache,🦨|mofeta,🦡|tejón,🦦|nutria,🦥|perezoso,🐁|ratón,🐿️|ardilla,🦔|erizo,🌵|cactus,🌲|árbol,🌳|árbol frondoso,🌴|palmera,🌱|brote,🌿|hierba,☘️|trébol,🍀|trébol suerte,🍁|hoja otoño,🍂|hojas caídas,🍃|hoja al viento,🌷|tulipán,🌹|rosa,🌺|hibisco,🌸|flor cerezo,🌼|flor,🌻|girasol,🌞|sol cara,🌝|luna cara,🌚|luna oscura,🌈|arcoíris,☀️|sol,⛅|nubes y sol,🌧️|lluvia,⛈️|tormenta,❄️|nieve,🔥|fuego,💧|gota agua,🌊|ola') },
  { id:'food', label:'Comida', icon:'🍕', items: makeEmojiItems('🍏|manzana verde,🍎|manzana,🍐|pera,🍊|mandarina,🍋|limón,🍌|plátano,🍉|sandía,🍇|uvas,🍓|fresa,🫐|arándanos,🍈|melón,🍒|cerezas,🍑|melocotón,🥭|mango,🍍|piña,🥥|coco,🥝|kiwi,🍅|tomate,🍆|berenjena,🥑|aguacate,🥦|brócoli,🥬|lechuga,🥒|pepino,🌶️|chile,🫑|pimiento,🌽|maíz,🥕|zanahoria,🫒|aceituna,🧄|ajo,🧅|cebolla,🥔|patata,🍠|boniato,🥐|croissant,🥯|bagel,🍞|pan,🥖|barra pan,🥨|pretzel,🧀|queso,🥚|huevo,🍳|huevo frito,🧈|mantequilla,🥞|tortitas,🧇|gofre,🥓|bacon,🥩|carne,🍗|pollo,🍖|carne hueso,🌭|perrito caliente,🍔|hamburguesa,🍟|patatas fritas,🍕|pizza,🫓|pan plano,🥪|bocadillo,🥙|falafel,🧆|falafel,🌮|taco,🌯|burrito,🫔|tamal,🥗|ensalada,🥘|paella,🫕|fondue,🥫|conserva,🍝|espaguetis,🍜|ramen,🍲|sopa,🍛|curry,🍣|sushi,🍱|bento,🥟|dumplings,🦪|ostra,🍤|gamba frita,🍙|onigiri,🍚|arroz,🍘|galleta arroz,🍥|pastel pescado,🥠|galleta fortuna,🥮|pastel luna,🍢|brocheta,🍡|dango,🍧|hielo raspado,🍨|helado,🍦|helado cono,🥧|tarta,🧁|cupcake,🍰|pastel,🎂|cumpleaños,🍮|flan,🍭|piruleta,🍬|caramelo,🍫|chocolate,🍿|palomitas,🍩|donut,🍪|galleta,🌰|castaña,🥜|cacahuetes,🍯|miel,🥛|leche,🍼|biberón,☕|café,🫖|tetera,🍵|té,🧃|zumo,🥤|refresco,🧋|bubble tea,🍶|sake,🍺|cerveza,🍻|brindis cervezas,🥂|brindis copas,🍷|vino,🥃|whisky,🍸|cóctel,🍹|bebida tropical,🧉|mate,🍾|champán,🧊|hielo') },
  { id:'activity', label:'Actividades', icon:'⚽', items: makeEmojiItems('⚽|fútbol,🏀|baloncesto,🏈|fútbol americano,⚾|béisbol,🥎|softbol,🎾|tenis,🏐|voleibol,🏉|rugby,🥏|disco,🎱|bola ocho,🪀|yoyó,🏓|ping pong,🏸|bádminton,🏒|hockey,🏑|hockey hierba,🥍|lacrosse,🏏|críquet,🪃|bumerán,🥅|portería,⛳|golf,🪁|cometa,🏹|arco,🎣|pesca,🤿|buceo,🥊|boxeo,🥋|artes marciales,🎽|camiseta deportiva,🛹|monopatín,🛼|patines,🛷|trineo,⛸️|patinaje,🥌|curling,🎿|esquí,⛷️|esquiador,🏂|snowboard,🪂|paracaídas,🏋️|pesas,🤼|lucha,🤸|gimnasia,⛹️|baloncesto persona,🤺|esgrima,🤾|balonmano,🏌️|golfista,🏇|carreras caballos,🧘|meditación,🏄|surf,🏊|natación,🤽|waterpolo,🚣|remo,🧗|escalada,🚵|bicicleta montaña,🚴|ciclismo,🏆|trofeo,🥇|medalla oro,🥈|medalla plata,🥉|medalla bronce,🏅|medalla,🎖️|condecoración,🏵️|roseta,🎗️|lazo,🎫|entrada,🎟️|ticket,🎪|circo,🤹|malabares,🎭|teatro,🩰|ballet,🎨|arte,🎬|cine,🎤|micrófono,🎧|auriculares,🎼|partitura,🎹|piano,🥁|tambor,🪘|percusión,🎷|saxofón,🎺|trompeta,🪗|acordeón,🎸|guitarra,🪕|banjo,🎻|violín,🪈|flauta,🎲|dado,♟️|ajedrez,🎯|diana,🎳|bolos,🎮|videojuegos,🕹️|joystick,🧩|puzzle,🪅|piñata,🪩|bola disco,🎰|tragaperras') },
  { id:'travel', label:'Lugares', icon:'🚀', items: makeEmojiItems('🚗|coche,🚕|taxi,🚙|todoterreno,🚌|autobús,🚎|trolebús,🏎️|coche carreras,🚓|policía,🚑|ambulancia,🚒|bomberos,🚐|furgoneta,🛻|pickup,🚚|camión,🚛|tráiler,🚜|tractor,🛵|scooter,🏍️|moto,🛺|rickshaw,🚲|bicicleta,🛴|patinete,🛹|monopatín,🛼|patines,🚨|sirena,🚔|coche policía,🚍|bus acercándose,🚘|coche frontal,🚖|taxi frontal,🚡|teleférico,🚠|funicular,🚟|tren suspendido,🚃|vagón,🚋|tranvía,🚞|tren montaña,🚝|monorraíl,🚄|tren rápido,🚅|tren bala,🚈|metro ligero,🚇|metro,🚊|tranvía,🚉|estación,✈️|avión,🛫|despegue,🛬|aterrizaje,🛩️|avioneta,💺|asiento,🚁|helicóptero,🛸|ovni,🚀|cohete,🛰️|satélite,🛶|canoa,⛵|velero,🚤|lancha,🛥️|barco,🛳️|crucero,⛴️|ferry,🚢|barco,⚓|ancla,🛟|salvavidas,🗺️|mapa,🗿|moái,🗽|estatua libertad,🗼|torre Tokio,🏰|castillo,🏯|castillo japonés,🏟️|estadio,🎡|noria,🎢|montaña rusa,🎠|carrusel,⛲|fuente,⛱️|sombrilla,🏖️|playa,🏝️|isla,🏜️|desierto,🌋|volcán,⛰️|montaña,🏔️|montaña nevada,🗻|monte Fuji,🏕️|camping,⛺|tienda campaña,🛖|cabaña,🏠|casa,🏡|casa jardín,🏢|oficina,🏬|centro comercial,🏣|oficina postal,🏥|hospital,🏦|banco,🏨|hotel,🏪|tienda,🏫|escuela,🏛️|edificio clásico,⛪|iglesia,🕌|mezquita,🛕|templo,🕍|sinagoga,🕋|kaaba,⛩️|santuario,🌃|noche ciudad,🌆|atardecer ciudad,🌇|puesta de sol,🌉|puente noche,🎑|luna cosecha,🌌|vía láctea,🌠|estrella fugaz') },
  { id:'objects', label:'Objetos', icon:'💡', items: makeEmojiItems('⌚|reloj,📱|móvil,📲|móvil flecha,💻|portátil,🖥️|ordenador,🖨️|impresora,⌨️|teclado,🖱️|ratón ordenador,🖲️|trackball,💽|disco,💾|disquete,💿|cd,📀|dvd,📼|videocinta,📷|cámara,📸|flash cámara,📹|videocámara,🎥|cine cámara,📽️|proyector,📺|televisión,📻|radio,🎙️|micrófono estudio,🎚️|controles audio,🎛️|perillas,🧭|brújula,⏱️|cronómetro,⏰|despertador,⌛|reloj arena,⏳|arena corriendo,🔋|batería,🪫|batería baja,🔌|enchufe,💡|bombilla,🔦|linterna,🕯️|vela,🪔|lámpara,🧯|extintor,🛢️|barril,💸|dinero volando,💵|billetes,💴|yen,💶|euro,💷|libra,💰|saco dinero,💳|tarjeta,🪙|moneda,💎|diamante,⚖️|balanza,🪜|escalera,🧰|caja herramientas,🪛|destornillador,🔧|llave inglesa,🔨|martillo,⚒️|herramientas,🛠️|martillo llave,⛏️|pico,🪚|sierra,🔩|tornillo tuerca,⚙️|engranaje,🪤|trampa,🧱|ladrillo,🪨|piedra,🪵|madera,🧲|imán,🪝|gancho,🧪|tubo ensayo,🧫|placa Petri,🧬|ADN,🔬|microscopio,🔭|telescopio,📡|antena,💊|pastilla,🩹|tirita,🩺|estetoscopio,🚪|puerta,🪞|espejo,🪟|ventana,🛏️|cama,🛋️|sofá,🪑|silla,🚽|inodoro,🚿|ducha,🛁|bañera,🧴|loción,🧷|imperdible,🧹|escoba,🧺|cesta ropa,🧻|papel,🪣|cubo,🧼|jabón,🪥|cepillo dientes,🧽|esponja,🧯|extintor,🧸|oso peluche,🪆|muñecas,🖼️|cuadro,🎁|regalo,🎈|globo,🎀|lazo,🪄|varita mágica,🪅|piñata,🪩|bola disco,🧿|ojo turco,🪬|hamsa,🗝️|llave antigua,🔑|llave,🔒|candado,🔓|candado abierto,🔏|candado con pluma,🧳|maleta,🎒|mochila,👓|gafas,🕶️|gafas sol,🥽|gafas protección,🥼|bata,🦺|chaleco,👔|corbata,👕|camiseta,👖|vaqueros,🧣|bufanda,🧤|guantes,🧥|abrigo,🧦|calcetines,👗|vestido,👘|kimono,🥻|sari,🩱|bañador,🩳|pantalón corto,👙|bikini,👚|blusa,👛|monedero,👜|bolso,👝|bolsito,🛍️|bolsas compras,👞|zapato,👟|zapatilla,🥾|bota senderismo,🥿|bailarina,👠|tacón,👡|sandalia,🩴|chancla,👢|bota,👑|corona,👒|sombrero mujer,🎩|sombrero copa,🧢|gorra,🪖|casco,⛑️|casco rescate') },
  { id:'symbols', label:'Símbolos', icon:'❤️', items: makeEmojiItems('❤️|corazón rojo,🩷|corazón rosa,🧡|corazón naranja,💛|corazón amarillo,💚|corazón verde,💙|corazón azul,🩵|corazón celeste,💜|corazón morado,🤎|corazón marrón,🖤|corazón negro,🩶|corazón gris,🤍|corazón blanco,💔|corazón roto,❤️‍🔥|corazón en llamas,❤️‍🩹|corazón curando,💕|dos corazones,💞|corazones girando,💓|latido,💗|creciendo,💖|brillante,💘|flecha corazón,💝|corazón regalo,💟|decoración corazón,❣️|exclamación corazón,💌|carta amor,💋|beso,💐|ramo,💍|anillo,💎|diamante,✨|destellos,⭐|estrella,🌟|estrella brillante,💫|mareo,🔥|fuego,💥|explosión,⚡|rayo,☄️|cometa,🌈|arcoíris,☀️|sol,🌙|luna,☁️|nube,❄️|copo nieve,☃️|muñeco nieve,💧|gota,🌊|ola,🎉|confeti,🎊|bola confeti,🎇|chispa,🎆|fuegos artificiales,🧨|petardo,🎀|lazo,🎁|regalo,✅|correcto,☑️|casilla marcada,✔️|marca,❌|cruz,❎|cruz verde,➕|más,➖|menos,➗|dividir,✖️|multiplicar,⚠️|advertencia,🚫|prohibido,⛔|entrada prohibida,🛑|stop,❗|exclamación,❓|pregunta,‼️|doble exclamación,⁉️|exclamación pregunta,💤|dormir,💬|bocadillo,🗨️|burbuja,🗯️|enfadado burbuja,💭|pensar,🔔|campana,🔕|campana silenciada,🎵|nota musical,🎶|notas musicales,🔒|candado,🔑|llave,🔗|enlace,🧡|naranja corazón,♻️|reciclaje,⚜️|flor de lis,🔱|tridente,📛|identificación,🔰|principiante,⭕|círculo,🔴|círculo rojo,🟠|círculo naranja,🟡|círculo amarillo,🟢|círculo verde,🔵|círculo azul,🟣|círculo morado,⚫|círculo negro,⚪|círculo blanco,🟤|círculo marrón,🟥|cuadrado rojo,🟧|cuadrado naranja,🟨|cuadrado amarillo,🟩|cuadrado verde,🟦|cuadrado azul,🟪|cuadrado morado,⬛|cuadrado negro,⬜|cuadrado blanco,🔶|rombo naranja,🔷|rombo azul,🔸|rombo pequeño naranja,🔹|rombo pequeño azul,🔺|triángulo rojo,🔻|triángulo hacia abajo,💠|rombo con punto,♠️|picas,♥️|corazones naipe,♦️|diamantes naipe,♣️|tréboles naipe,🃏|comodín,🔣|símbolos,🔤|letras,🔠|mayúsculas,🔡|minúsculas,🔢|números,♈|aries,♉|tauro,♊|géminis,♋|cáncer,♌|leo,♍|virgo,♎|libra,♏|escorpio,♐|sagitario,♑|capricornio,♒|acuario,♓|piscis,⛎|ofiuco') },
  { id:'flags', label:'Banderas', icon:'🏳️', items: makeEmojiItems('🏳️|bandera blanca,🏴|bandera negra,🏁|bandera a cuadros,🚩|bandera roja,🏳️‍🌈|bandera arcoíris,🏳️‍⚧️|bandera trans,🇪🇸|España,🇦🇩|Andorra,🇫🇷|Francia,🇵🇹|Portugal,🇮🇹|Italia,🇩🇪|Alemania,🇬🇧|Reino Unido,🇺🇸|Estados Unidos,🇨🇦|Canadá,🇲🇽|México,🇧🇷|Brasil,🇦🇷|Argentina,🇨🇱|Chile,🇨🇴|Colombia,🇵🇪|Perú,🇺🇾|Uruguay,🇯🇵|Japón,🇨🇳|China,🇰🇷|Corea del Sur,🇮🇳|India,🇦🇺|Australia,🇳🇿|Nueva Zelanda,🇳🇱|Países Bajos,🇧🇪|Bélgica,🇨🇭|Suiza,🇦🇹|Austria,🇸🇪|Suecia,🇳🇴|Noruega,🇩🇰|Dinamarca,🇫🇮|Finlandia,🇮🇪|Irlanda,🇵🇱|Polonia,🇺🇦|Ucrania,🇬🇷|Grecia,🇹🇷|Turquía,🇷🇺|Rusia,🇮🇱|Israel,🇸🇦|Arabia Saudí,🇿🇦|Sudáfrica,🇪🇬|Egipto,🇲🇦|Marruecos,🇳🇬|Nigeria,🇰🇪|Kenia,🇹🇭|Tailandia,🇻🇳|Vietnam,🇮🇩|Indonesia,🇵🇭|Filipinas,🇸🇬|Singapur,🇲🇾|Malasia,🇵🇰|Pakistán,🇧🇩|Bangladesh') }
];

let activeEmojiCategory = 'smileys';
function getRecentEmojis() {
  try { const value = JSON.parse(localStorage.getItem('xifre_recent_emojis') || '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 24) : []; }
  catch (_) { return []; }
}
function rememberEmoji(emoji) {
  try { localStorage.setItem('xifre_recent_emojis', JSON.stringify([emoji, ...getRecentEmojis().filter(item => item !== emoji)].slice(0, 24))); }
  catch (_) {}
}
function renderEmojiCategories() {
  const bar = $('#emoji-categories');
  if (!bar) return;
  bar.innerHTML = '';
  const categories = [{ id:'recent', label:'Recientes', icon:'🕘' }, ...EMOJI_CATEGORIES.map(({id,label,icon})=>({id,label,icon}))];
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `emoji-category${activeEmojiCategory === category.id ? ' active' : ''}`;
    button.dataset.emojiCategory = category.id; button.textContent = category.icon; button.title = category.label;
    button.setAttribute('aria-label', category.label); button.setAttribute('aria-pressed', activeEmojiCategory === category.id ? 'true' : 'false');
    bar.appendChild(button);
  }
}
function renderEmojiGrid(query = '') {
  const grid = $('#emoji-grid');
  if (!grid) return;
  const normalizeSearch = value => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = normalizeSearch(String(query || '').trim());
  let entries = [];
  if (term) {
    entries = EMOJI_CATEGORIES.flatMap(category => category.items.map(item => ({...item, category:category.label})))
      .filter(item => item.emoji.includes(term) || normalizeSearch(item.name).includes(term));
  } else if (activeEmojiCategory === 'recent') {
    const names = new Map(EMOJI_CATEGORIES.flatMap(category => category.items.map(item => [item.emoji, item.name])));
    entries = getRecentEmojis().map(emoji => ({ emoji, name:names.get(emoji) || 'reciente' }));
  } else {
    entries = (EMOJI_CATEGORIES.find(category => category.id === activeEmojiCategory) || EMOJI_CATEGORIES[0]).items;
  }
  grid.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'emoji-grid-empty';
    empty.textContent = term ? 'No se han encontrado emojis.' : 'Todavía no hay emojis recientes.'; grid.appendChild(empty); return;
  }
  for (const item of entries) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'emoji-choice'; button.dataset.emoji = item.emoji;
    button.textContent = item.emoji; button.title = item.name || 'Emoji'; button.setAttribute('role','option'); button.setAttribute('aria-label',`${item.emoji} ${item.name || 'emoji'}`);
    grid.appendChild(button);
  }
}
function chooseEmoji(emoji) {
  const cleanEmoji = String(emoji || '');
  if (!cleanEmoji) return;
  rememberEmoji(cleanEmoji);
  const mode = emojiPickerMode;
  const messageId = emojiPickerMessageId;
  closeEmojiPicker();
  if (mode === 'reaction') {
    if (messageId) void toggleMessageReaction(messageId, cleanEmoji);
  } else {
    insertEmojiAtCursor(cleanEmoji);
  }
}
function setupEmojiPicker() {
  const popover = $('#emoji-picker-popover');
  const grid = $('#emoji-grid');
  const bar = $('#emoji-categories');
  const search = $('#emoji-search');
  if (!popover || !grid || !bar || popover.dataset.xifreBound === 'true') return;
  popover.dataset.xifreBound = 'true';
  renderEmojiCategories();
  renderEmojiGrid('');
  search?.addEventListener('input', () => renderEmojiGrid(search.value));
  bar.addEventListener('click', event => {
    const button = event.target.closest('[data-emoji-category]');
    if (!button) return;
    activeEmojiCategory = button.dataset.emojiCategory || 'smileys';
    if (search) search.value = '';
    renderEmojiCategories(); renderEmojiGrid('');
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-emoji]');
    if (button) chooseEmoji(button.dataset.emoji);
  });
}

function renderMessageReactions(messageRow, reactionRows) {
  const container = $('.message-reactions', messageRow);
  if (!container) return false;
  const emojiMap = new Map();
  for (const reaction of reactionRows || []) {
    const emoji = String(reaction.emoji || '');
    const uid = String(reaction.user_id || '');
    if (!emoji) continue;
    if (!emojiMap.has(emoji)) emojiMap.set(emoji, { emoji, users: new Set() });
    if (uid) emojiMap.get(emoji).users.add(uid);
  }
  const groups = [...emojiMap.values()].sort((a,b) => a.emoji.localeCompare(b.emoji));
  const signature = groups.map(group => `${group.emoji}:${group.users.size}:${group.users.has(String(currentUser?.id)) ? 1 : 0}`).join('|');
  if (container.dataset.reactionSignature === signature) return false;
  if (container.dataset.reactionSignature === undefined && groups.length === 0) {
    container.dataset.reactionSignature = '';
    return false;
  }
  container.dataset.reactionSignature = signature;
  container.innerHTML = '';
  groups.forEach(group => {
    const button = document.createElement('button');
    const mine = group.users.has(String(currentUser?.id));
    button.type = 'button';
    button.className = `message-reaction${mine ? ' active' : ''}`;
    button.dataset.emoji = group.emoji;
    button.title = `${group.users.size} reacción${group.users.size === 1 ? '' : 'es'} · ${mine ? 'Quitar tu reacción' : 'Reaccionar'}`;
    button.setAttribute('aria-label', button.title);
    const face = document.createElement('span'); face.textContent = group.emoji;
    const count = document.createElement('span'); count.className = 'message-reaction-count'; count.textContent = String(group.users.size);
    button.append(face, count);
    button.addEventListener('click', () => void toggleMessageReaction(messageRow.dataset.messageId, group.emoji));
    container.appendChild(button);
  });
  if (groups.length) {
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'message-reaction-add'; add.textContent = '+';
    add.title = 'Añadir reacción'; add.setAttribute('aria-label', 'Añadir reacción');
    add.addEventListener('click', () => openEmojiPicker(add, 'reaction', messageRow.dataset.messageId));
    container.appendChild(add);
  }
  return true;
}

async function loadMessageReactions(conversationId = currentConversation) {
  const id = String(conversationId || '');
  if (!id || !currentUser || String(currentConversation) !== id) return;
  const sequence = (reactionLoadSequences.get(id) || 0) + 1;
  reactionLoadSequences.set(id, sequence);
  const { data, error } = await supabase.rpc('xifre_get_message_reactions', { p_conversation_id: id });
  if (error) throw error;
  if (String(currentConversation) !== id || reactionLoadSequences.get(id) !== sequence) return;
  const rows = data || [];
  const byMessage = new Map();
  rows.forEach(reaction => {
    const messageId = String(reaction.message_id || '');
    if (!byMessage.has(messageId)) byMessage.set(messageId, []);
    byMessage.get(messageId).push(reaction);
  });
  const box = $('#messages');
  if (!box) return;
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  const originalScrollTop = box.scrollTop;
  const boxTop = box.getBoundingClientRect().top;
  const anchor = [...box.querySelectorAll('[data-message-id]')].find(node => node.getBoundingClientRect().bottom > boxTop + 1);
  const anchorTop = anchor?.getBoundingClientRect().top || 0;
  let changed = false;
  $$('.message-row[data-message-id]', box).forEach(row => {
    if (renderMessageReactions(row, byMessage.get(String(row.dataset.messageId)) || [])) changed = true;
  });
  if (!changed) return;
  if (wasNearBottom) box.scrollTop = box.scrollHeight;
  else if (anchor) box.scrollTop = Math.max(0, originalScrollTop + anchor.getBoundingClientRect().top - anchorTop);
  else box.scrollTop = originalScrollTop;
}

async function toggleMessageReaction(messageId, emoji) {
  const cleanId = String(messageId || '');
  const cleanEmoji = String(emoji || '');
  if (!isValidUuid(cleanId) || !cleanEmoji || !currentConversation) return;
  try {
    const { error } = await supabase.rpc('xifre_toggle_message_reaction', { p_message_id: cleanId, p_emoji: cleanEmoji });
    if (error) throw error;
    await loadMessageReactions(currentConversation);
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

/* ------------------------------------------------------------------------ */
/* Realtime typing + messages */
/* ------------------------------------------------------------------------ */
function stopChatRealtime() {
if (messageChannel) supabase?.removeChannel(messageChannel);
if (typingChannel) supabase?.removeChannel(typingChannel);
messageChannel = null;
typingChannel = null;
if (messagePoll) clearInterval(messagePoll);
messagePoll = null;
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = null;
clearRemoteTypingUsers();
}

function setupMessageChannel(conversationId) {
  if (messageChannel) supabase.removeChannel(messageChannel);
  messageChannel = supabase.channel(`xifre:messages:${conversationId}:${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
      if (String(currentConversation) !== String(conversationId)) return;
      // The sender already renders its RPC response; the poll/realtime ID de-duplicates it.
      if (String(payload.new?.sender_id) !== String(currentUser?.id)) {
        await loadMessages(conversationId, false).catch(() => {});
        await loadConversations().catch(() => {});
      }
      const box = $('#messages');
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 80) {
        await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId }).catch(() => {});
        const c = conversationCache.find(item => String(item.id) === String(conversationId));
        if (c) { c.unread_count = 0; c.has_mention = false; }
        renderConversations();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessages(conversationId, false).catch(() => {});
      await loadConversations().catch(() => {});
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessages(conversationId, false).catch(() => {});
      await loadConversations().catch(() => {});
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async () => {
      if (String(currentConversation) !== String(conversationId)) return;
      await loadMessageReactions(conversationId).catch(() => {});
    })
    .subscribe();
  if (messagePoll) clearInterval(messagePoll);
  messagePoll = setInterval(() => {
    if (document.visibilityState === 'visible' && String(currentConversation) === String(conversationId)) {
      loadMessages(conversationId, false).catch(() => {});
    }
  }, 3000);
}

function clearRemoteTypingUsers() {
  for (const timer of remoteTypingTimers.values()) clearTimeout(timer);
  remoteTypingTimers.clear();
  remoteTypingUsers.clear();
  setTypingVisible(false);
}

function refreshTypingIndicator() {
  const names = [...remoteTypingUsers.values()].map(item => item.username).filter(Boolean);
  const count = names.length;
  const el = $('#typing-indicator');
  if (!el) return;
  el.classList.toggle('hidden', count === 0);
  if (!count) return;
  let label;
  if (count >= 3) label = 'Varias personas están escribiendo...';
  else if (count === 2) label = `${names[0]} y ${names[1]} están escribiendo...`;
  else label = `${names[0]} está escribiendo...`;
  setText('typing-text', label);
  el.setAttribute('aria-label', label);
}

function setupTypingChannel(conversationId) {
  if (typingChannel) supabase.removeChannel(typingChannel);
  clearRemoteTypingUsers();
  const channelConversationId = String(conversationId);
  typingChannel = supabase.channel(`xifre:typing:${channelConversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, event => {
      if (String(currentConversation || '') !== channelConversationId) return;
      const payload = event?.payload || {};
      const senderId = String(payload.user_id || '');
      if (!senderId || senderId === String(currentUser?.id || '')) return; // never count our own typing
      if (!payload.typing) {
        remoteTypingUsers.delete(senderId);
        const oldTimer = remoteTypingTimers.get(senderId);
        if (oldTimer) clearTimeout(oldTimer);
        remoteTypingTimers.delete(senderId);
        refreshTypingIndicator();
        return;
      }
      const member = currentMembers.find(item => getMemberId(item) === senderId);
      const username = String(member?.username || payload.username || 'Alguien');
      remoteTypingUsers.set(senderId, { username, lastSeen: Date.now() });
      const oldTimer = remoteTypingTimers.get(senderId);
      if (oldTimer) clearTimeout(oldTimer);
      remoteTypingTimers.set(senderId, setTimeout(() => {
        remoteTypingUsers.delete(senderId);
        remoteTypingTimers.delete(senderId);
        refreshTypingIndicator();
      }, 4200));
      refreshTypingIndicator();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') stopTypingBroadcast();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') clearRemoteTypingUsers();
    });
}

async function broadcastTyping(isTyping) {
if (!typingChannel || !currentUser || !currentConversation) return;
try {
await typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: currentUser.id, username: currentProfile?.username || 'Usuario', typing: !!isTyping } });
} catch (error) {
console.debug('TYPING', error);
}
}

function scheduleTyping() {
if (!currentConversation) return;
void broadcastTyping(true);
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = setTimeout(() => void broadcastTyping(false), 1600);
}

function stopTypingBroadcast() {
if (typingStopTimer) clearTimeout(typingStopTimer);
typingStopTimer = null;
void broadcastTyping(false);
}

function setTypingVisible(visible, username = '') {
  const el = $('#typing-indicator');
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  if (visible && username) setText('typing-text', `${username} está escribiendo...`);
}

/* ------------------------------------------------------------------------ */
/* Right panel */
/* ------------------------------------------------------------------------ */
function renderRightPane() {
const empty = $('.right-pane-empty');
const dm = $('#right-dm-content');
const group = $('#right-group-content');
const isGroup = currentConversationData?.type === 'group';
empty?.classList.add('hidden');
dm?.classList.toggle('hidden', isGroup);
group?.classList.toggle('hidden', !isGroup);
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
const name = other?.username || 'Usuario';
avatarInto($('#right-profile-avatar'), name, other?.avatar_url, 'private', other?.avatar_color);
ensurePresenceDot($('#right-profile-avatar'), getMemberId(other));
setText('right-profile-name', name);
setText('right-profile-handle', `@${other?.email_handle || other?.username || 'usuario'}`);
renderPresenceIndicators();
} else {
const name = currentConversationData?.name || 'Grupo';
ensurePresenceDot($('#right-profile-avatar'), '');
avatarInto($('#right-group-avatar'), name, currentConversationData?.avatar_url, 'group');
setText('right-group-name', name);
setText('right-group-count', `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`);
const list = $('#right-group-members');
list.innerHTML = '';
currentMembers.forEach(member => {
const row = document.createElement('div');
row.className = 'right-member';
row.innerHTML = `<span class="right-member-avatar-wrap presence-host">${avatarHTML(member.username, member.avatar_url, 'private', 'member-avatar', member.avatar_color)}${presenceDotHTML(getMemberId(member))}</span><span class="right-member-name">${esc(member.username || 'Usuario')}</span>${member.is_owner?'<span class="member-role-crown crown-owner" title="Creador">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin" title="Administrador">♛</span>':''}`;
row.addEventListener('click',e=>{if(e.defaultPrevented)return;showMemberProfile(member,row);});
row.addEventListener('contextmenu',e=>{e.preventDefault();openMemberMenu(member,e.clientX,e.clientY);});
list.appendChild(row);
});
renderPresenceIndicators();
}
}

function showMemberProfile(member, anchor) {
  const popover = $('#member-profile-popover');
  if (!popover || !member) return;
  selectedMember = member;
  avatarInto($('#member-profile-avatar'), member.username, member.avatar_url, 'private', member.avatar_color || '');
  ensurePresenceDot($('#member-profile-avatar'), getMemberId(member));
  setText('member-profile-name', member.username || 'Usuario');
  setText('member-profile-username', `@${member.email_handle || member.username || 'usuario'}`);
  const role = $('#member-profile-role');
  const roleName = member.is_owner ? 'Creador del grupo' : member.is_admin ? 'Administrador del grupo' : 'Miembro del grupo';
  setText('member-profile-role', roleName);
  role?.classList.remove('role-owner', 'role-admin', 'role-member');
  role?.classList.add(member.is_owner ? 'role-owner' : member.is_admin ? 'role-admin' : 'role-member');
  popover.classList.remove('hidden');
  const anchorRect = anchor?.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 12;
  let left = anchorRect ? anchorRect.left : (window.innerWidth - popRect.width) / 2;
  let top = anchorRect ? anchorRect.bottom + 8 : margin;
  if (left + popRect.width > window.innerWidth - margin) left = window.innerWidth - popRect.width - margin;
  if (left < margin) left = margin;
  if (top + popRect.height > window.innerHeight - margin) top = anchorRect ? anchorRect.top - popRect.height - 8 : window.innerHeight - popRect.height - margin;
  if (top < margin) top = margin;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  updateMemberProfileFriendAction(member);
  renderPresenceIndicators();
}

async function updateMemberProfileFriendAction(member) {
  const button = $('#member-profile-add-friend');
  if (!button || !member) return;
  const id = getMemberId(member);
  const token = ++memberStatusRequestToken;
  memberFriendStatus = 'none';
  if (!isValidUuid(id) || id === String(currentUser?.id)) { button.classList.add('hidden'); return; }

  // Friends cache is authoritative for this common case: no spinner / permanent "Comprobando".
  if (friendCache.some(friend => String(friend.id) === id)) {
    memberFriendStatus = 'friend';
    button.classList.add('hidden');
    return;
  }
  button.classList.remove('hidden');
  button.disabled = false;
  button.textContent = 'Añadir amigo';

  let timeoutId;
  try {
    const statusPromise = supabase.rpc('xifre_get_friend_request_status', { p_target_user: id });
    const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('La comprobación está tardando demasiado')), 2800); });
    const response = await Promise.race([statusPromise, timeoutPromise]);
    if (response.error) throw response.error;
    if (token !== memberStatusRequestToken || String(getMemberId(selectedMember)) !== id) return;
    const raw = response.data;
    const statusValue = Array.isArray(raw) ? raw[0] : raw;
    memberFriendStatus = String(statusValue?.status || statusValue?.relationship || statusValue || 'none');
    if (memberFriendStatus === 'friend') { button.classList.add('hidden'); return; }
    button.classList.remove('hidden');
    button.disabled = false;
    button.textContent = memberFriendStatus === 'incoming_pending' ? 'Aceptar solicitud' : memberFriendStatus === 'outgoing_pending' ? 'Cancelar solicitud' : 'Añadir amigo';
  } catch (error) {
    console.warn('MEMBER FRIEND STATUS', error);
    if (token !== memberStatusRequestToken || String(getMemberId(selectedMember)) !== id) return;
    // A failed status lookup is not allowed to block the action. The server-side operation
    // will return a clear result if a request already exists.
    memberFriendStatus = 'none';
    button.classList.remove('hidden');
    button.disabled = false;
    button.textContent = 'Añadir amigo';
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sendFriendRequestFromMemberProfile() {
  const member = selectedMember;
  const button = $('#member-profile-add-friend');
  const id = getMemberId(member);
  if (!member || !button || !isValidUuid(id) || id === String(currentUser?.id)) return;
  const previousStatus = memberFriendStatus;
  memberStatusRequestToken++;
  button.disabled = true;
  try {
    let error = null;
    if (previousStatus === 'incoming_pending') {
      ({ error } = await supabase.rpc('xifre_accept_friend_request_from', { p_sender_user: id }));
    } else if (previousStatus === 'outgoing_pending') {
      ({ error } = await supabase.rpc('xifre_cancel_friend_request', { p_target_user: id }));
    } else {
      ({ error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: id }));
    }
    if (error) throw error;
    await Promise.all([loadFriends(), loadFriendRequests()]);
    await updateMemberProfileFriendAction(member);
    if (previousStatus === 'incoming_pending') toast('Solicitud aceptada. Ahora sois amigos.', 'success');
    else if (previousStatus === 'outgoing_pending') toast('Solicitud cancelada.', 'success');
    else toast('Solicitud de amistad enviada.', 'success');
  } catch (error) {
    button.disabled = false;
    toast(friendlyError(error), 'error');
    await updateMemberProfileFriendAction(member);
  }
}
function closeMemberProfile(){ memberStatusRequestToken++; $('#member-profile-popover')?.classList.add('hidden'); const button=$('#member-profile-add-friend'); if(button){button.disabled=false;button.classList.add('hidden');button.textContent='Añadir amigo';} selectedMember=null; }
function openMemberMenu(member,x,y){
selectedMember=member; const menu=$('#member-menu'); if(!menu)return; const me=currentMembers.find(m=>String(m.user_id)===String(currentUser.id)); const creator=!!me?.is_owner, admin=!!me?.is_admin;
const canManage=creator||admin; const targetIsAdmin=!!member.is_admin||!!member.is_owner; $('#member-menu [data-member-menu="kick"]')?.classList.toggle('hidden',!canManage||member.is_owner||(!creator&&targetIsAdmin)); $('#member-menu [data-member-menu="grant"]')?.classList.toggle('hidden',!creator||member.is_owner||member.is_admin); $('#member-menu [data-member-menu="revoke"]')?.classList.toggle('hidden',!creator||!member.is_admin); menu.classList.remove('hidden'); menu.style.left=`${Math.min(x,window.innerWidth-205)}px`; menu.style.top=`${Math.min(y,window.innerHeight-150)}px`;
}
function closeMemberMenu(){ $('#member-menu')?.classList.add('hidden'); selectedMember=null; }
async function memberAction(action){
const member=selectedMember; closeMemberMenu(); if(!member||!currentConversation)return;
let fn='',args={p_conversation_id:currentConversation,p_user_id:member.user_id}; if(action==='kick')fn='xifre_remove_group_member'; if(action==='grant')fn='xifre_grant_group_admin'; if(action==='revoke')fn='xifre_revoke_group_admin'; if(!fn)return;
const {error}=await supabase.rpc(fn,args); if(error)return toast(friendlyError(error),'error'); memberCache.delete(currentConversation); const r=await supabase.rpc('xifre_get_conversation_members',{p_conversation_id:currentConversation}); if(r.error)return toast(friendlyError(r.error),'error'); currentMembers=await hydrateMemberProfiles(r.data||[]); memberCache.set(currentConversation,currentMembers); renderRightPane(); await openChatInfo(); await loadMessages(currentConversation); await loadConversations(); toast(action==='kick'?'Persona expulsada.':action==='grant'?'Administrador añadido.':'Administrador retirado.','success');
}

/* ------------------------------------------------------------------------ */
/* Groups */
/* ------------------------------------------------------------------------ */
function renderGroupSelection() {
const list = $('#group-friends-list');
if (!list) return;
list.innerHTML = '';
friendCache.forEach(friend => {
const row = document.createElement('label');
row.className = 'selection-item';
row.innerHTML = `<input type="checkbox" class="group-friend-check" value="${esc(friend.id)}"><span class="presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></span>`;
list.appendChild(row);
});
updateGroupSelectedCount();
}

function updateGroupSelectedCount() {
setText('group-selected-count', `${$$('.group-friend-check:checked', $('#group-friends-list')).length} seleccionados`);
}

async function createGroup() {
const name = String($('#group-name')?.value || '').trim();
const ids = $$('.group-friend-check:checked', $('#group-friends-list')).map(i => i.value);
if (!name) return setModalMessage('group-message', 'Escribe un nombre para el grupo.', 'error');
if (!ids.length) return setModalMessage('group-message', 'Selecciona al menos un amigo.', 'error');
const button = $('#create-group-submit');
setLoading(button, true);
try {
const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: ids });
if (error) throw error;
closeModal('group-modal');
$('#group-name').value = '';
await loadConversations();
await openConversation(String(data));
} catch (error) {
setModalMessage('group-message', friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function openChatInfo() {
if (!currentConversation) return;
const isGroup = currentConversationData?.type === 'group';
if (!isGroup) {
const other = currentMembers.find(m => String(m.user_id) !== String(currentUser.id));
setText('info-title', other?.username || 'Usuario');
setText('info-subtitle', 'Mensaje directo');
$('#group-edit-section')?.classList.add('hidden');
renderInfoMembers(currentMembers);
} else {
setText('info-title', currentConversationData?.name || 'Grupo');
setText('info-subtitle', `${currentMembers.length} miembros`);
renderInfoMembers(currentMembers);
const meMember=currentMembers.find(m=>String(m.user_id)===String(currentUser.id));
const canManage=!!(meMember?.is_owner||meMember?.is_admin);
$('#group-edit-section')?.classList.toggle('hidden', !canManage);
$('#delete-group-button')?.classList.toggle('hidden', !meMember?.is_owner);
setModalMessage('group-settings-message', '');
$('#group-edit-name').value = currentConversationData?.name || 'Grupo';
if (!pendingGroupAvatarFile) avatarInto($('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', currentConversationData?.avatar_url, 'group');
renderGroupAddSelection();
}
openModal('chat-info-modal');
}

function renderInfoMembers(members) {
const list = $('#info-members');
if (!list) return;
list.innerHTML = '';
members.forEach(member => {
const row = document.createElement('div');
row.className = 'friend-item';
row.innerHTML = `<span class="friend-avatar presence-host">${avatarHTML(member.username, member.avatar_url, 'private', 'friend-avatar', member.avatar_color)}${presenceDotHTML(getMemberId(member))}</span><div class="friend-copy"><strong>${esc(member.username || 'Usuario')}</strong><small>@${esc(member.email_handle || member.username || 'usuario')}</small></div><span>${member.is_owner?'<span class="member-role-crown crown-owner">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin">♛</span>':''}</span>`;
row.addEventListener('click',()=>showMemberProfile(member,row));
row.addEventListener('contextmenu',e=>{e.preventDefault();openMemberMenu(member,e.clientX,e.clientY);});
list.appendChild(row);
});
}

function renderGroupAddSelection() {
const list = $('#group-add-list');
if (!list) return;
const currentIds = new Set(currentMembers.map(m => String(m.user_id)));
const candidates = friendCache.filter(f => !currentIds.has(String(f.id)));
list.innerHTML = '';
candidates.forEach(friend => {
const row = document.createElement('label');
row.className = 'selection-item';
row.innerHTML = `<input type="checkbox" class="group-add-check" value="${esc(friend.id)}"><span class="presence-host">${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color)}${presenceDotHTML(friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.email_handle || friend.username)}</small></span>`;
list.appendChild(row);
});
updateGroupAddCount();
}

function updateGroupAddCount() {
setText('group-add-selected-count', `${$$('.group-add-check:checked', $('#group-add-list')).length} seleccionados`);
}

async function addGroupMembers() {
if (!currentConversation) return;
const ids = $$('.group-add-check:checked', $('#group-add-list')).map(i => i.value);
if (!ids.length) return toast('Selecciona al menos una persona.', 'info');
const button = $('#add-group-members-button');
setLoading(button, true);
try {
const { error } = await supabase.rpc('xifre_add_group_members', { p_conversation_id: currentConversation, p_member_ids: ids });
if (error) throw error;
memberCache.delete(currentConversation);
const result = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: currentConversation });
if (result.error) throw result.error;
currentMembers = await hydrateMemberProfiles(result.data || []);
memberCache.set(currentConversation, currentMembers);
updateChatHeader();
renderRightPane();
await openChatInfo();
toast('Personas añadidas.', 'success');
} catch (error) {
toast(friendlyError(error), 'error');
} finally {
setLoading(button, false);
}
}

async function saveGroupSettings() {
  if (!currentConversation || currentConversationData?.type !== 'group') return;
  const conversationId = String(currentConversation);
  const button = $('#save-group-settings');
  const name = String($('#group-edit-name')?.value || '').trim();
  if (!name) return setModalMessage('group-settings-message', 'El nombre es obligatorio.', 'error');
  setLoading(button, true);
  try {
    let avatarUrl = null;
    if (pendingGroupAvatarFile) {
      const path = `${currentUser.id}/groups/${conversationId}/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingGroupAvatarFile)}`;
      avatarUrl = await uploadAvatar(pendingGroupAvatarFile, path);
    }
    const { data, error } = await supabase.rpc('xifre_update_group_v17', {
      p_conversation_id: conversationId,
      p_name: name,
      p_avatar_url: avatarUrl,
      p_remove_avatar: !!removeGroupAvatarRequested && !pendingGroupAvatarFile
    });
    if (error) throw error;
    const updated = Array.isArray(data) ? data[0] : data;
    currentConversationData.name = updated?.name || name;
    currentConversationData.displayName = currentConversationData.name;
    if (updated && Object.prototype.hasOwnProperty.call(updated, 'avatar_url')) currentConversationData.avatar_url = updated.avatar_url || null;
    const local = conversationCache.find(item => String(item.id) === conversationId);
    if (local) { local.name = currentConversationData.name; local.displayName = currentConversationData.name; local.avatar_url = currentConversationData.avatar_url || null; }
    pendingGroupAvatarFile = null; pendingGroupAvatarURL = null; removeGroupAvatarRequested = false;
    const fileInput = $('#group-avatar-file'); if (fileInput) fileInput.value = '';
    updateChatHeader(); renderRightPane(); renderConversations();
    avatarInto($('#group-edit-avatar-preview'), currentConversationData.name, currentConversationData.avatar_url, 'group');
    setModalMessage('group-settings-message', 'Cambios guardados.', 'success');
  } catch (error) {
    setModalMessage('group-settings-message', friendlyError(error), 'error');
  } finally { setLoading(button, false); }
}

async function deleteGroup() {
if (!currentConversation) return;
const ok = await askConfirm('Eliminar grupo', 'Se eliminarán el grupo, sus mensajes y sus miembros. Esta acción no se puede deshacer.', 'Eliminar grupo');
if (!ok) return;
const deletedConversation = currentConversation;
const { error } = await supabase.rpc('xifre_delete_group', { p_conversation_id: deletedConversation });
if (error) return toast(friendlyError(error), 'error');
closeModal('chat-info-modal');
stopChatRealtime();
currentConversation = null;
currentConversationData = null;
currentMembers = [];
memberCache.delete(deletedConversation);
sessionStorage.removeItem('xifre_current_conversation');
resetChatView();
await loadConversations();
toast('Grupo eliminado.', 'success');
}

/* ------------------------------------------------------------------------ */
/* Avatar upload / profile settings */
/* ------------------------------------------------------------------------ */
function fileExt(file) {
const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
return map[file?.type] || 'png';
}

function validateImage(file) {
if (!file) throw new Error('No se ha seleccionado ninguna imagen.');
if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error('Solo se permiten PNG, JPG, WEBP o GIF.');
if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5 MB.');
}

async function uploadAvatar(file, path) {
validateImage(file);
const { error } = await supabase.storage.from('xifre-avatars').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
if (error) throw error;
const result = supabase.storage.from('xifre-avatars').getPublicUrl(path);
if (result.error) throw result.error;
return `${result.data.publicUrl}?v=${Date.now()}`;
}

function previewFile(file, target, name, kind) {
try { validateImage(file); } catch (error) { toast(error.message, 'error'); return; }
const oldUrl = target.dataset.objectUrl;
if (oldUrl) URL.revokeObjectURL(oldUrl);
const url = URL.createObjectURL(file);
target.innerHTML = avatarHTML(name, url, kind);
target.dataset.objectUrl = url;
}

function openSettings() {
syncProfileUI();
applyTheme(currentTheme());
$('#settings-modal')?.classList.remove('hidden');
}

async function saveProfileSettings() {
  if (!currentUser) return;
  const button = $('#save-profile-settings');
  const username = normalizeUsername($('#settings-username')?.value);
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return setModalMessage('profile-settings-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
  setLoading(button, true);
  try {
    let avatarUrl = null;
    if (pendingProfileAvatarFile) {
      const path = `${currentUser.id}/profile/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingProfileAvatarFile)}`;
      avatarUrl = await uploadAvatar(pendingProfileAvatarFile, path);
    }
    const { data, error } = await supabase.rpc('xifre_update_profile_v17', {
      p_username: username,
      p_display_name: username,
      p_avatar_url: avatarUrl,
      p_remove_avatar: !!removeProfileAvatarRequested && !pendingProfileAvatarFile
    });
    if (error) throw error;
    currentProfile = Array.isArray(data) ? data[0] : data;
    if (currentProfile && !currentProfile.email_handle) currentProfile.email_handle = emailHandle(currentUser?.email);
    pendingProfileAvatarFile = null; pendingProfileAvatarURL = null; removeProfileAvatarRequested = false;
    const fileInput = $('#profile-avatar-file'); if (fileInput) fileInput.value = '';
    const preview = $('#settings-avatar-preview'); if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
    syncProfileUI(); memberCache.clear();
    await Promise.all([loadFriends(), loadConversations()]);
    if (currentConversation) {
      const conv = conversationCache.find(item => String(item.id) === String(currentConversation));
      if (conv) currentConversationData = conv;
      await loadMessages(currentConversation, false);
      updateChatHeader(); renderRightPane();
    }
    setModalMessage('profile-settings-message', 'Cambios guardados.', 'success');
  } catch (error) {
    setModalMessage('profile-settings-message', friendlyError(error), 'error');
  } finally { setLoading(button, false); }
}

/* ------------------------------------------------------------------------ */
/* Custom confirmation */
/* ------------------------------------------------------------------------ */
function askConfirm(title, text, okText = 'Confirmar') {
return new Promise(resolve => {
confirmResolver = resolve;
setText('confirm-title', title);
setText('confirm-text', text);
setText('confirm-ok', okText);
$('#confirm-modal')?.classList.remove('hidden');
});
}

function finishConfirm(value) {
if (!confirmResolver) return;
const resolver = confirmResolver;
confirmResolver = null;
$('#confirm-modal')?.classList.add('hidden');
resolver(value);
}

/* ------------------------------------------------------------------------ */
/* Modals / reset */
/* ------------------------------------------------------------------------ */
function openModal(id) {
$(`#${id}`)?.classList.remove('hidden');
}
function closeModal(id) {
$(`#${id}`)?.classList.add('hidden');
}

/* ------------------------------------------------------------------------ */
/* Catalan on-screen keyboard + locally learned word suggestions             */
/* ------------------------------------------------------------------------ */
const CATALAN_COMMON_WORDS = (`que de no la el y en un una es por con del los las se para como más pero también ya sí porque cuando qué quién dónde yo tú él ella nosotros vosotros ellos me te nos os le les mi tu su esto esta estos estas aquí allí muy mucho poco bien mal mejor peor hoy ayer mañana ahora luego antes después siempre nunca quizá hola adiós gracias por favor perdón vale claro exacto perfecto genial bueno buena necesito quieres quiero puedes puedo podemos tienen tengo hacer decir ir venir ver saber poder querer dar quedar poner hablar pensar pasar encontrar llegar dejar llevar mirar intentar parecer volver sentir vivir jugar estudiar leer escribir comer beber dormir salir entrar abrir cerrar enviar recibir mensaje mensajes grupo grupos amigo amiga amigos amigas persona personas usuario nombre foto perfil cuenta tarea trabajo proyecto examen nota clase profesor alumno alumna escuela instituto asignatura español castellano catalán inglés matemáticas ciencias historia música deporte fútbol baloncesto videojuego juego canción película serie libro ordenador móvil teléfono internet página web aplicación programa archivo imagen vídeo documento enlace problema error solución ayuda pregunta respuesta idea cosa algo nada todo alguien nadie mismo misma diferente igual primero segundo tercero último otra otro nuevo nueva pequeño pequeña grande largo corta fácil difícil interesante importante necesario posible rápido lenta contento contenta triste cansado cansada ocupado ocupada libre disponible conectado conectada preparado preparada listo lista correcto correcta pedir enviar recibir añadir eliminar cambiar guardar subir bajar compartir olvidar recordar esperar empezar acabar continuar parar probar funcionar arreglar crear actualizar comprobar revisar buscar elegir decidir responder aceptar rechazar invitar solicitar instalar descargar ejecutar imprimir copiar pegar mover seleccionar mostrar ocultar activar desactivar permitir utilizar usar entrar salir iniciar sesión cerrar sesión me gusta me encantan no me gusta está bien está mal es verdad seguro realmente quizá no lo creo no lo recuerdo no me importa no tengo ni idea tengo una idea ahora mismo un momento un segundo espera ya vuelvo qué pasa qué quieres qué necesitas qué hacemos dónde estás dónde vamos cuándo quedamos a qué hora qué día qué problema qué solución lo miro te ayudo te lo envío te lo paso ya lo he hecho ya lo he visto lo he enviado lo tengo no lo tengo todavía ya está falta faltan minutos segundos rato un rato un poco un poco más muchísimo bastante casi suficiente enseguida pronto tarde demasiado de nuevo también tampoco todavía aunque mientras entonces así además igualmente especialmente exactamente simplemente normalmente probablemente francamente quizá gracias hola qué tal cómo estás cómo va todo muy bien todo bien sin problema no pasa nada lo siento no lo sé no lo entiendo entendido creo pienso quiero quisiera puedes podemos tenemos vamos hacemos dime explica urgente luego te digo luego hablamos hasta luego hasta mañana nos vemos hablamos claro que sí claro que no por supuesto`).split(/\s+/u);

const CATALAN_KEYBOARD_LAYOUTS = {
  letters: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l','ç'],
    ['SHIFT','z','x','c','v','b','n','m','BACKSPACE'],
    ['?123','à','è','é','í','ï','ò','ó','ú','ü'],
    ['·',',','APOSTROPHE','SPACE','.','ENTER']
  ],
  symbols: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['@','#','€','%','&','-','+','(',')','/'],
    ['*','"',':',';','!','?','¿','¡','BACKSPACE'],
    ['ABC','_','\\','|','~','<','>','=','[',']'],
    ['·',',','APOSTROPHE','SPACE','.','ENTER']
  ]
};

function keyboardUsageStorageKey() {
  return `xifre_cat_keyboard_usage_${String(currentUser?.id || 'local')}`;
}
function getKeyboardWordUsage() {
  const owner = String(currentUser?.id || 'local');
  if (keyboardWordUsageCache && keyboardWordUsageOwner === owner) return keyboardWordUsageCache;
  let usage = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(keyboardUsageStorageKey()) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) usage = parsed;
  } catch { usage = {}; }
  keyboardWordUsageOwner = owner;
  keyboardWordUsageCache = usage;
  return usage;
}
function normalizeCatalanWord(word) {
  return String(word || '').toLocaleLowerCase('ca').normalize('NFC');
}
function normalizeCatalanPrefix(word) {
  return normalizeCatalanWord(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function recordComposerWordUsage(text) {
  const usage = getKeyboardWordUsage();
  const words = String(text || '').match(/[\p{L}·'’-]{2,32}/gu) || [];
  for (const word of words) {
    const normalized = normalizeCatalanWord(word);
    usage[normalized] = Math.min(9999, Number(usage[normalized] || 0) + 1);
  }
  const entries = Object.entries(usage).sort((a,b) => Number(b[1]) - Number(a[1])).slice(0, 1200);
  keyboardWordUsageCache = Object.fromEntries(entries);
  try { localStorage.setItem(keyboardUsageStorageKey(), JSON.stringify(keyboardWordUsageCache)); } catch {}
}
function keyboardWordContext() {
  const input = $('#message-input');
  if (!input) return { prefix: '', start: 0, end: 0 };
  const value = String(input.value || '');
  const cursor = input.selectionStart ?? value.length;
  const left = value.slice(0, cursor).match(/[\p{L}·'’-]+$/u)?.[0] || '';
  const right = value.slice(cursor).match(/^[\p{L}·'’-]+/u)?.[0] || '';
  return { prefix: left, start: cursor - left.length, end: cursor + right.length };
}
function keyboardSuggestionWords(prefix) {
  const usage = getKeyboardWordUsage();
  const common = [...new Set(CATALAN_COMMON_WORDS.filter(word => word.length > 0))];
  const normalizedPrefix = normalizeCatalanPrefix(prefix);
  const baseRank = new Map(common.map((word, index) => [normalizeCatalanWord(word), index]));
  const learnedWords = Object.keys(usage);
  const pool = [...new Set([...learnedWords, ...common])];
  let words = normalizedPrefix
    ? pool.filter(word => normalizeCatalanPrefix(word).startsWith(normalizedPrefix))
    : pool.slice(0, 80);
  words.sort((a,b) => {
    const useDelta = Number(usage[normalizeCatalanWord(b)] || 0) - Number(usage[normalizeCatalanWord(a)] || 0);
    if (useDelta) return useDelta;
    return (baseRank.get(normalizeCatalanWord(a)) ?? 10000) - (baseRank.get(normalizeCatalanWord(b)) ?? 10000);
  });
  // Keep up to three distinct options and avoid suggesting the same normalized token twice.
  const unique = [];
  const seen = new Set();
  for (const word of words) {
    const key = normalizeCatalanWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key); unique.push(word);
    if (unique.length === 3) break;
  }
  return unique;
}
function updateKeyboardSuggestions() {
  const box = $('#keyboard-suggestions');
  if (!box) return;
  const context = keyboardWordContext();
  const words = keyboardSuggestionWords(context.prefix);
  box.innerHTML = '';
  words.forEach(word => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'keyboard-suggestion';
    button.dataset.keyboardSuggestion = word;
    button.textContent = word;
    box.appendChild(button);
  });
  if (!words.length) {
    const fallback = document.createElement('span');
    fallback.className = 'keyboard-suggestion-empty';
    fallback.textContent = 'Escriu per veure suggeriments';
    box.appendChild(fallback);
  }
}
function renderCatalanKeyboard() {
  const target = $('#catalan-keyboard-rows');
  if (!target) return;
  target.innerHTML = '';
  const layout = keyboardSymbols ? CATALAN_KEYBOARD_LAYOUTS.symbols : CATALAN_KEYBOARD_LAYOUTS.letters;
  layout.forEach(keys => {
    const row = document.createElement('div');
    row.className = 'catalan-keyboard-row';
    for (const rawKey of keys) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalan-key';
      let key = rawKey;
      if (rawKey === 'SHIFT') { button.dataset.keyboardAction = 'shift'; button.classList.add('keyboard-special'); key = keyboardShift ? '⇧✓' : '⇧'; }
      else if (rawKey === 'BACKSPACE') { button.dataset.keyboardAction = 'backspace'; button.classList.add('keyboard-special'); key = '⌫'; }
      else if (rawKey === 'SPACE') { button.dataset.keyboardAction = 'space'; button.classList.add('keyboard-space'); key = 'Espai'; }
      else if (rawKey === 'ENTER') { button.dataset.keyboardAction = 'enter'; button.classList.add('keyboard-special'); key = '↵'; }
      else if (rawKey === '?123' || rawKey === 'ABC') { button.dataset.keyboardAction = 'symbols'; button.classList.add('keyboard-mode'); key = rawKey; }
      else if (rawKey === 'APOSTROPHE') { key = '’'; button.dataset.keyboardKey = "'"; }
      else button.dataset.keyboardKey = rawKey;
      button.textContent = keyboardShift && /^[a-zçàèéíïòóúü]$/u.test(key) ? key.toLocaleUpperCase('ca') : key;
      if (rawKey === 'SHIFT') button.title = 'Majúscules';
      if (rawKey === 'BACKSPACE') button.title = 'Esborrar';
      if (rawKey === 'SPACE') button.title = 'Espai';
      if (rawKey === 'ENTER') button.title = 'Salt de línia';
      row.appendChild(button);
    }
    target.appendChild(row);
  });
}
function positionCatalanKeyboard() {
  const popover = $('#catalan-keyboard-popover');
  const button = $('#composer-keyboard-button');
  if (!popover || !button || !keyboardOpen) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(580, window.innerWidth - 20);
  popover.style.width = `${width}px`;
  let left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));
  let top = rect.top - popover.offsetHeight - 8;
  if (top < 8) top = Math.min(window.innerHeight - popover.offsetHeight - 8, rect.bottom + 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(8, top)}px`;
}
function openCatalanKeyboard() {
  const popover = $('#catalan-keyboard-popover');
  if (!popover) return;
  keyboardOpen = true;
  popover.classList.remove('hidden');
  $('#composer-keyboard-button')?.setAttribute('aria-expanded', 'true');
  renderCatalanKeyboard();
  updateKeyboardSuggestions();
  requestAnimationFrame(positionCatalanKeyboard);
}
function closeCatalanKeyboard() {
  keyboardOpen = false;
  $('#catalan-keyboard-popover')?.classList.add('hidden');
  $('#composer-keyboard-button')?.setAttribute('aria-expanded', 'false');
}
function toggleCatalanKeyboard() {
  if (keyboardOpen) closeCatalanKeyboard();
  else if (!currentConversation) toast('Selecciona una conversación para escribir.', 'info');
  else openCatalanKeyboard();
}
function insertIntoComposer(text, usageSuggestion = false) {
  const input = $('#message-input');
  if (!input || input.disabled) return;
  const value = String(input.value || '');
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? start;
  let insert = String(text ?? '');
  if (usageSuggestion) {
    const context = keyboardWordContext();
    const left = context.start;
    const right = context.end;
    const suffix = value.slice(right);
    const addSpace = !suffix || (!/^\s/u.test(suffix) && !/^[,.;:!?…)}\]]/u.test(suffix));
    insert = `${insert}${addSpace ? ' ' : ''}`;
    input.value = value.slice(0, left) + insert + suffix;
    const cursor = left + insert.length;
    input.focus({ preventScroll: true }); input.setSelectionRange(cursor, cursor);
    recordComposerWordUsage(String(text));
  } else {
    input.value = value.slice(0, start) + insert + value.slice(end);
    const cursor = start + insert.length;
    input.focus({ preventScroll: true }); input.setSelectionRange(cursor, cursor);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  resizeMessageInput();
  updateMentionPicker();
  updateSendState();
  scheduleTyping();
  positionCatalanKeyboard();
}
function performCatalanKeyboardAction(action, rawKey = '') {
  const input = $('#message-input');
  if (!input || input.disabled) return;
  if (action === 'shift') {
    keyboardShift = !keyboardShift;
    renderCatalanKeyboard();
    updateKeyboardSuggestions();
    return;
  }
  if (action === 'symbols') {
    keyboardSymbols = !keyboardSymbols;
    keyboardShift = false;
    renderCatalanKeyboard();
    return;
  }
  if (action === 'space') { insertIntoComposer(' '); keyboardShift = false; renderCatalanKeyboard(); return; }
  if (action === 'enter') { insertIntoComposer('\n'); keyboardShift = false; renderCatalanKeyboard(); return; }
  if (action === 'backspace') {
    const value = String(input.value || '');
    let start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    if (start === end && start > 0) {
      const before = value.slice(0, start);
      const previousCodePoint = Array.from(before).pop() || '';
      start -= previousCodePoint.length;
    }
    input.value = value.slice(0, start) + value.slice(end);
    input.focus({ preventScroll: true }); input.setSelectionRange(start, start);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resizeMessageInput(); updateMentionPicker(); updateSendState(); scheduleTyping();
    return;
  }
  const key = String(rawKey || '');
  if (!key) return;
  const character = keyboardShift ? key.toLocaleUpperCase('ca') : key;
  insertIntoComposer(character);
  if (keyboardShift && /^[a-zçàèéíïòóúü]$/iu.test(key)) {
    keyboardShift = false;
    renderCatalanKeyboard();
  }
}

$('#composer-keyboard-button')?.addEventListener('click', event => {
  event.preventDefault(); event.stopPropagation(); toggleCatalanKeyboard();
});
$('#catalan-keyboard-close')?.addEventListener('click', closeCatalanKeyboard);
$('#catalan-keyboard-popover')?.addEventListener('click', event => {
  const suggestion = event.target.closest('[data-keyboard-suggestion]');
  if (suggestion) { insertIntoComposer(suggestion.dataset.keyboardSuggestion || '', true); return; }
  const key = event.target.closest('[data-keyboard-key]');
  if (key) { performCatalanKeyboardAction('', key.dataset.keyboardKey || ''); return; }
  const action = event.target.closest('[data-keyboard-action]');
  if (action) performCatalanKeyboardAction(action.dataset.keyboardAction || '');
});
$('#message-input')?.addEventListener('keyup', event => {
  if (['ArrowLeft','ArrowRight','Home','End','Control','Shift','Alt'].includes(event.key)) updateKeyboardSuggestions();
});
$('#message-input')?.addEventListener('click', updateKeyboardSuggestions);
window.addEventListener('resize', () => { positionCatalanKeyboard(); if (!$('#attachment-menu')?.classList.contains('hidden')) closeAttachmentMenu(); });

function resetChatView() {
conversationOpenSequence++;
stopChatRealtime();
setText('chat-title', 'XIFRE');
setText('chat-subtitle', 'Selecciona una conversación');
avatarInto($('#chat-avatar'), 'XIFRE', null, 'private');
$('#chat-info-button')?.classList.add('hidden');
$('#message-input').disabled = true;
$('#message-input').value = '';
clearPendingChatAttachment(false);
closeAttachmentMenu();
closeCatalanKeyboard();
resizeMessageInput();
updateMessageCharacterCount();
$('#send-button').disabled = true;
clearReply(); currentMentionIds.clear(); mentionEverywhere=false; $('#mention-picker')?.classList.add('hidden');
setTypingVisible(false);
$('#messages').innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Bienvenido a XIFRE</h3><p>Selecciona un chat de la izquierda para empezar.</p></div>';
$('.right-pane-empty')?.classList.remove('hidden');
$('#right-dm-content')?.classList.add('hidden');
$('#right-group-content')?.classList.add('hidden');
}

function showChatError(text) {
$('#messages').innerHTML = `<div class="chat-welcome"><div class="welcome-mark">!</div><h3>No se pudo abrir esta conversación</h3><p>${esc(text)}</p><button type="button" id="retry-chat" class="secondary-action" style="margin-top:12px">Reintentar</button></div>`;
$('#retry-chat')?.addEventListener('click', () => openConversation(currentConversation));
$('#message-input').disabled = true;
$('#send-button').disabled = true;
}

function showPeopleTab(tab){
$$('.people-tab').forEach(b=>b.classList.toggle('active',b.dataset.peopleTab===tab));
$$('.people-panel').forEach(p=>p.classList.toggle('active',p.id===`people-${tab==='add'?'add':tab}-panel`));
}

/* ------------------------------------------------------------------------ */
/* Event wiring */
/* ------------------------------------------------------------------------ */
function bind() {
// Presence activity is low-frequency; mouse movement only refreshes activity every 15 seconds.
document.addEventListener('pointerdown', notePresenceActivity, { passive: true });
document.addEventListener('keydown', notePresenceActivity, true);
document.addEventListener('touchstart', notePresenceActivity, { passive: true });
let lastPointerPresenceNotice = 0;
document.addEventListener('pointermove', () => {
  const now = Date.now();
  if (now - lastPointerPresenceNotice < 15000) return;
  lastPointerPresenceNotice = now;
  notePresenceActivity();
}, { passive: true });
// Un solo submit handler por formulario.
$('#login-form')?.addEventListener('submit', event => {
event.preventDefault();
event.stopPropagation();
void login();
});
$('#register-form')?.addEventListener('submit', event => {
event.preventDefault();
event.stopPropagation();
void register();
});

document.addEventListener('click', event => {
const chatLink = event.target.closest('a.chat-link[data-external-url]');
if (chatLink) { event.preventDefault(); event.stopPropagation(); openExternalLinkWarning(chatLink.dataset.externalUrl || chatLink.href); return; }
const go = event.target.closest('[data-go]');
if (go) {
event.preventDefault();
event.stopPropagation();
showScreen(go.dataset.go);
return;
}
const action = event.target.closest('[data-action]');
if (action) {
const type = action.dataset.action;
if (type === 'open-settings') openSettings();
else if (type === 'close-settings') $('#settings-modal')?.classList.add('hidden');
else if (type === 'logout') void logout();
else if (type === 'open-friend') { openModal('people-modal'); showPeopleTab('add'); $('#friend-search').value=''; searchPeople(''); $('#friend-search').focus(); }
else if (type === 'open-friends') { openModal('people-modal'); showPeopleTab('friends'); renderFriendsModal(); }
else if (type === 'open-requests') { openModal('people-modal'); showPeopleTab('requests'); void loadFriendRequests(); }
else if (type === 'open-people') { openModal('people-modal'); showPeopleTab('friends'); renderFriendsModal(); }
else if (type === 'open-conversation-search') openConversationSearch();
else if (type === 'open-group') { openModal('group-modal'); renderGroupSelection(); $('#group-name').focus(); }
else if (type === 'create-group') void createGroup();
else if (type === 'open-chat-info') void openChatInfo();
else if (type === 'close-member-profile') closeMemberProfile();
else if (type === 'send-member-friend-request') void sendFriendRequestFromMemberProfile();
else if (type === 'close-emoji-picker') closeEmojiPicker();
else if (type === 'save-group-settings') void saveGroupSettings();
else if (type === 'add-group-members') void addGroupMembers();
else if (type === 'request-delete-group') void deleteGroup();
else if (type === 'save-profile-settings') void saveProfileSettings();
else if (type === 'composer-placeholder') { event.preventDefault(); toggleAttachmentMenu(); }
else if (type === 'confirm-external-link') confirmExternalLink();
else if (type === 'cancel-external-link') closeExternalLinkWarning();
else if (type === 'resend') void resendConfirmation();
else if (type === 'close-modal') closeModal(action.dataset.modal);
}

const tab = event.target.closest('[data-settings-tab]');
if (tab) {
const value = tab.dataset.settingsTab;
$$('.settings-tab-button').forEach(b => b.classList.toggle('active', b.dataset.settingsTab === value));
$('#settings-profile-tab')?.classList.toggle('active', value === 'profile');
$('#settings-appearance-tab')?.classList.toggle('active', value === 'appearance');
}

const theme = event.target.closest('[data-theme-choice]');
if (theme) applyTheme(theme.dataset.themeChoice);

const messageAction = event.target.closest('[data-message-menu]');
if (messageAction) {
if (messageAction.dataset.messageMenu === 'reply' && menuMessage) setReplyTo(menuMessage);
if (messageAction.dataset.messageMenu === 'edit' && menuMessage) { const message = menuMessage; const row = $(`[data-message-id="${CSS.escape(String(message.id))}"]`); if (row) startEditMessage(message, row); }
if (messageAction.dataset.messageMenu === 'delete' && menuMessage) void deleteMessage(menuMessage);
closeMessageMenu();
}

if (event.target.closest('#confirm-ok')) finishConfirm(true);
if (event.target.closest('#confirm-cancel')) finishConfirm(false);
if (event.target.closest('#cancel-reply')) clearReply();
});

document.addEventListener('click', event => {
if (!event.target.closest('#message-menu')) closeMessageMenu();
if (!event.target.closest('#conversation-menu')) closeConversationMenu();
if (!event.target.closest('#emoji-picker-popover') && !event.target.closest('#composer-emoji-button') && !event.target.closest('[data-message-action="react"]') && !event.target.closest('.message-reaction-add')) closeEmojiPicker();
if (!event.target.closest('#catalan-keyboard-popover') && !event.target.closest('#composer-keyboard-button')) closeCatalanKeyboard();
if (!event.target.closest('#attachment-menu') && !event.target.closest('#composer-plus-button') && !event.target.closest('#upload-chat-attachment')) closeAttachmentMenu();
}, true);

$('#friend-search')?.addEventListener('input', e => searchPeople(e.target.value));
$('#conversation-filter-input')?.addEventListener('input', event => {
  conversationFilter = String(event.target.value || '');
  $('#conversation-filter-clear')?.classList.toggle('hidden', !conversationFilter);
  renderConversations();
});
$('#conversation-filter-clear')?.addEventListener('click', () => {
  const input = $('#conversation-filter-input');
  if (input) { input.value = ''; input.focus(); }
  conversationFilter = '';
  $('#conversation-filter-clear')?.classList.add('hidden');
  renderConversations();
});
$('#composer-emoji-button')?.addEventListener('click', event => {
  event.stopPropagation();
  const popover = $('#emoji-picker-popover');
  if (popover && !popover.classList.contains('hidden') && emojiPickerMode === 'compose') closeEmojiPicker();
  else openEmojiPicker(event.currentTarget, 'compose');
});
setupEmojiPicker();
resizeMessageInput();
$('#conversation-search-input')?.addEventListener('input',e=>{clearTimeout(conversationSearchTimer);conversationSearchTimer=setTimeout(()=>renderConversationSearch(e.target.value),120);});
document.addEventListener('click',event=>{const tab=event.target.closest('[data-people-tab]');if(tab)showPeopleTab(tab.dataset.peopleTab);});
document.addEventListener('click',event=>{const a=event.target.closest('[data-member-menu]');if(a)void memberAction(a.dataset.memberMenu);});
document.addEventListener('click',event=>{if(!event.target.closest('#member-menu'))closeMemberMenu();if(!event.target.closest('#member-profile-popover')&&!event.target.closest('.right-member')&&!event.target.closest('#info-members .friend-item'))closeMemberProfile();});
document.addEventListener('click',event=>{const a=event.target.closest('[data-conversation-menu]');if(a&&selectedConversationForMenu)void markConversationRead(selectedConversationForMenu.id);});
$('#group-friends-list')?.addEventListener('change', updateGroupSelectedCount);
$('#group-add-list')?.addEventListener('change', updateGroupAddCount);

$('#profile-avatar-file')?.addEventListener('change', event => {
const file = event.target.files?.[0];
if (!file) return;
try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
pendingProfileAvatarFile = file;
removeProfileAvatarRequested = false;
previewFile(file, $('#settings-avatar-preview'), currentProfile?.username || 'Usuario', 'private', currentProfile?.avatar_color || '');
setModalMessage('profile-settings-message', '');
});

$('#group-avatar-file')?.addEventListener('change', event => {
const file = event.target.files?.[0];
if (!file) return;
try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
pendingGroupAvatarFile = file;
removeGroupAvatarRequested = false;
previewFile(file, $('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', 'group');
setModalMessage('group-settings-message', '');
});

$('#remove-profile-avatar')?.addEventListener('click', () => {
  pendingProfileAvatarFile = null;
  removeProfileAvatarRequested = true;
  const input = $('#profile-avatar-file'); if (input) input.value = '';
  const preview = $('#settings-avatar-preview');
  if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
  avatarInto(preview, currentProfile?.username || 'Usuario', null, 'private', currentProfile?.avatar_color || '');
  setModalMessage('profile-settings-message', 'La foto se quitará al guardar los cambios.', '');
});
$('#remove-group-avatar')?.addEventListener('click', () => {
  pendingGroupAvatarFile = null;
  removeGroupAvatarRequested = true;
  const input = $('#group-avatar-file'); if (input) input.value = '';
  const preview = $('#group-edit-avatar-preview');
  if (preview?.dataset.objectUrl) { URL.revokeObjectURL(preview.dataset.objectUrl); delete preview.dataset.objectUrl; }
  avatarInto(preview, currentConversationData?.name || 'Grupo', null, 'group');
  setModalMessage('group-settings-message', 'La foto se quitará al guardar los cambios.', '');
});

$('#composer-plus-button')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  toggleAttachmentMenu();
});
$('#upload-chat-attachment')?.addEventListener('click', event => {
  event.preventDefault();
  closeAttachmentMenu();
  $('#chat-attachment-input')?.click();
});
$('#chat-attachment-input')?.addEventListener('change', event => {
  const input = event.target;
  const file = input.files?.[0];
  if (file) setPendingChatAttachment(file);
  input.value = '';
});
$('#remove-chat-attachment')?.addEventListener('click', () => clearPendingChatAttachment(true));
$('#message-input')?.addEventListener('paste', event => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(item => String(item.type || '').startsWith('image/'));
  const file = imageItem?.getAsFile?.();
  if (file) {
    event.preventDefault();
    setPendingChatAttachment(file);
  }
});
for (const dropTarget of [$('#messages'), $('#message-form')].filter(Boolean)) {
  dropTarget.addEventListener('dragover', event => {
    const hasImage = [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && String(item.type || '').startsWith('image/'));
    if (hasImage) { event.preventDefault(); $('#main-screen .center-pane')?.classList.add('chat-drag-over'); }
  });
  dropTarget.addEventListener('dragleave', event => {
    if (!dropTarget.contains(event.relatedTarget)) $('#main-screen .center-pane')?.classList.remove('chat-drag-over');
  });
  dropTarget.addEventListener('drop', event => {
    $('#main-screen .center-pane')?.classList.remove('chat-drag-over');
    const file = [...(event.dataTransfer?.files || [])].find(item => String(item.type || '').startsWith('image/'));
    if (file) { event.preventDefault(); setPendingChatAttachment(file); }
  });
}

$('#message-form')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
$('#message-input')?.addEventListener('input', () => {
resizeMessageInput();
const value = String($('#message-input').value || '').trim();
currentMentionIds.clear(); // mentions are recalculated from current text on send
mentionEverywhere = false;
updateMentionPicker();
updateSendState();
updateKeyboardSuggestions();
if (value) scheduleTyping(); else stopTypingBroadcast();
});
$('#message-input')?.addEventListener('keydown', event => {
const picker=$('#mention-picker');
if(!picker.classList.contains('hidden')){
const items=$$('.mention-item',picker);
if(event.key==='ArrowDown'){event.preventDefault();mentionPickerIndex=Math.min(mentionPickerIndex+1,items.length-1);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='ArrowUp'){event.preventDefault();mentionPickerIndex=Math.max(mentionPickerIndex-1,0);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
if(event.key==='Enter'&&!event.shiftKey&&items.length){event.preventDefault();items[mentionPickerIndex]?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return;}
if(event.key==='Escape'){picker.classList.add('hidden');return;}
}
if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!sendInFlight) void sendMessage(); }
});
$('#message-input')?.addEventListener('blur', () => stopTypingBroadcast());
$('#messages')?.addEventListener('scroll',()=>{const box=$('#messages');if(!currentConversation||!box)return;if(box.scrollHeight-box.scrollTop-box.clientHeight<12){const c=conversationCache.find(x=>String(x.id)===String(currentConversation));if(c&&(Number(c.unread_count)||c.has_mention)){void supabase.rpc('xifre_mark_read',{p_conversation_id:currentConversation}).then(()=>{c.unread_count=0;c.has_mention=false;renderConversations();});}}});

document.addEventListener('keydown', event => {
if (event.key === 'Escape') {
if (!$('#external-link-modal')?.classList.contains('hidden')) return closeExternalLinkWarning();
if (!$('#emoji-picker-popover')?.classList.contains('hidden')) return closeEmojiPicker();
if (!$('#message-menu').classList.contains('hidden')) return closeMessageMenu();
if (!$('#confirm-modal').classList.contains('hidden')) return finishConfirm(false);
if (!$('#settings-modal').classList.contains('hidden')) return $('#settings-modal').classList.add('hidden');
$$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
}
});

document.addEventListener('visibilitychange', () => {
if (!currentUser) return;
if (document.visibilityState === 'visible') presenceActivityAt = Date.now();
void trackPresence(true);
renderPresenceIndicators();
if (document.visibilityState !== 'visible') return;
void loadConversations().then(async () => {
  if (currentConversation) {
    const fresh = conversationCache.find(c => String(c.id) === String(currentConversation));
    if (fresh) currentConversationData = fresh;
    // Refresh in place. Do not reopen the chat or reset its scroll position.
    await loadMessages(currentConversation, false).catch(() => {});
    updateChatHeader();
    renderRightPane();
    return;
  }
  await restoreConversation();
}).catch(() => {});
});

window.addEventListener('beforeunload', () => {
if (currentConversation) sessionStorage.setItem('xifre_current_conversation', String(currentConversation));
});
}

async function init() {
bind();
applyTheme(currentTheme());

if (!window.supabase?.createClient) {
showScreen('landing');
return;
}

try {
supabase = window.supabase.createClient(CONFIG.url, CONFIG.key, {
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: true,
storageKey: 'xifre-auth-v9'
}
});

supabase.auth.onAuthStateChange((event, session) => {
setTimeout(() => {
if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session) {
if (session.access_token) void supabase.realtime.setAuth(session.access_token).catch(error => console.warn('REALTIME AUTH REFRESH', error));
void startApplication(session);
return;
}
if (event === 'SIGNED_OUT') {
stopPresenceTracking();
currentUser = null;
currentProfile = null;
appStarted = false;
resetChatView();
closeAllModals();
if (domainSessionSignOut) {
  domainSessionSignOut = false;
  showScreen('login');
  setMessage('login-message', 'Solo se permiten cuentas del dominio vedruna', 'error');
  return;
}
showScreen('landing');
}
}, 0);
});

const { data, error } = await supabase.auth.getSession();
if (error) throw error;

if (data?.session?.user) {
await startApplication(data.session);
} else if (!appStarted) {
showScreen('landing');
}
} catch (error) {
console.error('INIT', error);
// Nunca navegamos a landing por un error secundario de la app.
// Si la librería/cliente falla de verdad, mostramos login con el error.
showScreen('login');
setMessage('login-message', `No se pudo conectar con XIFRE: ${friendlyError(error)}`, 'error');
}
}

window.XIFRE = { showScreen, login, register, logout };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
})();
