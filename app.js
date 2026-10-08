(() => {
  'use strict';

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
  let conversationCache = [];
  let friendCache = [];
  let memberCache = new Map();
  let currentMentionIds = new Set();
  let mentionEverywhere = false;
  let mentionPickerIndex = 0;
  let selectedMember = null;
  let selectedConversationForMenu = null;
  let conversationListPoll = null;
  let lastMessagesSignature = '';
  let pendingChatImages = [];
  let dragDepth = 0;
  const SCHOOL_EMAIL_DOMAIN = '@vedrunaimmaculada.cat';

  const screens = ['landing', 'login', 'register', 'email'];

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeSchoolEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isSchoolEmail(value) {
    return normalizeSchoolEmail(value).endsWith(SCHOOL_EMAIL_DOMAIN);
  }

  function schoolHandleFromEmail(value) {
    const email = normalizeSchoolEmail(value);
    return isSchoolEmail(email) ? email.slice(0, -SCHOOL_EMAIL_DOMAIN.length) : '';
  }

  function schoolHandle(profile = currentProfile) {
    return String(profile?.school_handle || schoolHandleFromEmail(currentUser?.email) || 'usuario').trim().toLowerCase();
  }

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function avatarHTML(name, url, kind = 'private', className = '', color = '', stableId = '') {
    const safeName = String(name || (kind === 'group' ? 'Grupo' : 'Usuario')).trim() || (kind === 'group' ? 'Grupo' : 'Usuario');
    const initial = kind === 'group' ? '#' : (safeName.charAt(0).toUpperCase() || 'X');
    const safeUrl = String(url || '').trim();
    const palette = ['avatar-blue','avatar-yellow','avatar-red','avatar-green','avatar-orange'];
    const source = String(color || '').trim();
    let colorClass = source && palette.includes(source) ? source : '';
    if (!colorClass) {
      const key = String(stableId || safeName);
      let hash = 0;
      for (const ch of key) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
      colorClass = kind === 'group' ? 'avatar-group' : palette[Math.abs(hash) % palette.length];
    }
    const classes = `${esc(className)} ${kind === 'group' ? 'avatar-group' : ''}`.trim();
    const fallbackClasses = `avatar-fallback ${colorClass} ${kind === 'group' ? 'group-fallback' : ''}`;
    return `<span class="avatar-media ${classes}" aria-hidden="true"><span class="${fallbackClasses}">${esc(initial)}</span>${safeUrl ? `<img class="avatar-img" src="${esc(safeUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}</span>`;
  }

  function avatarInto(element, name, url, kind = 'private', color = '', stableId = '') {
    if (!element) return;
    element.innerHTML = avatarHTML(name, url, kind, '', color, stableId);
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
    if (lower.includes('rate limit') || lower.includes('too many requests') || Number(error?.status) === 429) return 'Se ha alcanzado temporalmente el límite de peticiones de Supabase. Espera un poco antes de volver a intentarlo.';
    return message || 'No se pudo completar la operación.';
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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
  /* Theme                                                                    */
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
  /* Auth                                                                     */
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
    const email = normalizeSchoolEmail($('#register-email')?.value);
    const password = String($('#register-password')?.value || '');
    setMessage('register-message', '');

    if (!isSchoolEmail(email)) return setMessage('register-message', 'Necesitas un correo del dominio vedruna', 'error');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setMessage('register-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
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
    const email = normalizeSchoolEmail($('#login-email')?.value);
    const password = String($('#login-password')?.value || '');
    setMessage('login-message', '');

    if (!email || !password) {
      setMessage('login-message', 'Introduce el correo y la contraseña.', 'error');
      return;
    }
    if (!isSchoolEmail(email)) {
      setMessage('login-message', 'Necesitas un correo del dominio vedruna', 'error');
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
    const email = normalizeSchoolEmail(sessionStorage.getItem('xifre_pending_email') || '');
    if (!email) return showScreen('register');
    if (!isSchoolEmail(email)) { toast('Necesitas un correo del dominio vedruna', 'error'); showScreen('login'); return; }
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
    if (!isSchoolEmail(currentUser.email)) {
      await supabase.auth.signOut().catch(() => {});
      showScreen('login');
      setMessage('login-message', 'Necesitas un correo del dominio vedruna', 'error');
      throw new Error('Necesitas un correo del dominio vedruna');
    }
    const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,school_handle').eq('id', currentUser.id).maybeSingle();
    if (error) console.warn('PROFILE LOAD', error);
    currentProfile = data || {
      id: currentUser.id,
      username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
      display_name: normalizeUsername(currentUser.user_metadata?.username) || 'usuario',
      avatar_url: null,
      avatar_color: '',
      school_handle: schoolHandleFromEmail(currentUser.email)
    };
    currentProfile.display_name = currentProfile.username;
    if (!currentProfile.school_handle) {
      try {
        const ensured = await supabase.rpc('xifre_ensure_school_handle');
        if (!ensured.error && ensured.data) currentProfile.school_handle = String(ensured.data);
      } catch (e) { console.warn('SCHOOL HANDLE', e); }
    }
    syncProfileUI();
  }

  function syncProfileUI() {
    const username = currentProfile?.username || 'usuario';
    const handle = schoolHandle();
    setText('profile-name', username);
    setText('profile-username', `@${handle}`);
    setText('bottom-profile-name', username);
    setText('bottom-profile-username', `@${handle}`);
    setText('settings-nav-name', username);
    setText('settings-nav-username', `@${handle}`);
    setText('settings-preview-username', `@${handle}`);
    setText('settings-preview-name', username);
    setText('settings-preview-handle', `@${handle}`);
    avatarInto($('#profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color);
    avatarInto($('#bottom-profile-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color, currentUser?.id);
    avatarInto($('#settings-nav-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color, currentUser?.id);
    if (!pendingProfileAvatarFile) {
      avatarInto($('#settings-avatar-preview'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color, currentUser?.id);
      avatarInto($('#settings-preview-avatar'), username, currentProfile?.avatar_url, 'private', currentProfile?.avatar_color, currentUser?.id);
    }
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
      if (!isSchoolEmail(sessionUser.email)) {
        await supabase.auth.signOut().catch(() => {});
        showScreen('login');
        setMessage('login-message', 'Necesitas un correo del dominio vedruna', 'error');
        throw new Error('Necesitas un correo del dominio vedruna');
      }

      currentUser = sessionUser;
      appStarted = true;
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
        if (data?.session?.user && isSchoolEmail(data.session.user.email)) {
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
    const ok = await askConfirm('Cerrar sesión', '¿Seguro que quieres cerrar tu sesión en XIFRE?', 'Cerrar sesión');
    if (!ok) return;
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('LOGOUT', error);
    } finally {
      stopChatRealtime();
      if (conversationListPoll) clearInterval(conversationListPoll);
      conversationListPoll = null;
      currentUser = null;
      currentProfile = null;
      currentConversation = null;
      currentConversationData = null;
      currentMembers = [];
      appStarted = false;
      sessionStorage.removeItem('xifre_current_conversation');
      closeAllModals();
      $('#settings-modal')?.classList.add('hidden');
      showScreen('landing');
    }
  }

  function closeAllModals() {
    $$('.modal').forEach(m => m.classList.add('hidden'));
    $('#message-menu')?.classList.add('hidden');
  }

  /* ------------------------------------------------------------------------ */
  /* Friends                                                                  */
  /* ------------------------------------------------------------------------ */
  async function loadFriends() {
    if (!currentUser) return;
    const { data, error } = await supabase.from('friendships').select('user1_id,user2_id').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
    if (error) { console.warn('FRIENDS', error); return friendCache; }
    const ids = [...new Set((data || []).map(row => String(row.user1_id) === String(currentUser.id) ? row.user2_id : row.user1_id).filter(Boolean))];
    if (!ids.length) { friendCache = []; return friendCache; }
    const result = await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_color,school_handle').in('id', ids);
    if (!result.error) friendCache = result.data || [];
  }

  async function searchPeople(query) {
    const list = $('#friend-search-results');
    if (!list) return;
    if (peopleSearchTimer) clearTimeout(peopleSearchTimer);
    const clean = normalizeUsername(query).replace(/^@+/, '');
    if (!clean) {
      renderPeople(friendCache.map(f => ({ ...f, relationship: 'friend' })));
      return;
    }
    if (clean.length < 1) {
      renderPeople(friendCache.map(f => ({ ...f, relationship: 'friend' })));
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
      const relationship = person.relationship || 'none';
      const row = document.createElement('div');
      row.className = 'search-result';
      row.innerHTML = `
        <span class="search-avatar">${avatarHTML(person.username, person.avatar_url, 'private', '', person.avatar_color, person.id)}</span>
        <div class="result-copy"><strong>${esc(person.username)}</strong><small>@${esc(person.school_handle || person.username || 'usuario')}</small></div>`;
      const action = document.createElement('button');
      action.type = 'button';
      action.className = `result-action ${relationship === 'friend' ? '' : 'secondary'}`;
      if (relationship === 'friend') {
        action.textContent = 'Abrir';
        action.addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(person.id); });
      } else if (relationship === 'outgoing_pending' || relationship === 'incoming_pending') {
        action.textContent = 'Pendiente';
        action.disabled = true;
      } else {
        action.textContent = 'Añadir';
        action.addEventListener('click', async () => {
          action.disabled = true;
          try {
            const { error } = await supabase.rpc('xifre_send_friend_request', { p_target_user: person.id });
            if (error) throw error;
            action.textContent = 'Pendiente';
            toast('Solicitud enviada.', 'success');
          } catch (error) {
            action.disabled = false;
            action.textContent = 'Añadir';
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
      row.innerHTML = `${avatarHTML(friend.username, friend.avatar_url, 'private', 'friend-avatar', friend.avatar_color, friend.id)}<div class="friend-copy"><strong>${esc(friend.username)}</strong><small>@${esc(friend.school_handle || friend.username)}</small></div><button class="open-chat" type="button">Abrir</button>`;
      row.querySelector('button').addEventListener('click', async () => { closeModal('people-modal'); await openPrivateChat(friend.id); });
      list.appendChild(row);
    });
  }

  async function loadFriendRequests() {
    if (!currentUser) return;
    const base = await supabase.from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('receiver_id', currentUser.id).order('created_at', { ascending: false });
    if (base.error) return renderRequests([]);
    const ids = [...new Set((base.data || []).map(x => x.sender_id))];
    let profiles = [];
    if (ids.length) {
      const result = await supabase.from('profiles').select('id,username,avatar_url,avatar_color,school_handle').in('id', ids);
      if (!result.error) profiles = result.data || [];
    }
    const map = new Map(profiles.map(p => [p.id, p]));
    renderRequests((base.data || []).map(req => ({ ...req, sender: map.get(req.sender_id) || {} })));
  }

  function renderRequests(requests) {
    const list = $('#friend-requests-list');
    if (!list) return;
    list.innerHTML = '';
    if (!requests.length) { list.innerHTML = '<div class="empty-sidebar">No hay solicitudes</div>'; return; }
    requests.forEach(req => {
      const row = document.createElement('div');
      row.className = 'request-item';
      row.innerHTML = `${avatarHTML(req.sender.username || 'Usuario', req.sender.avatar_url, 'private', 'request-avatar', req.sender.avatar_color, req.sender.id)}<div class="request-copy"><strong>${esc(req.sender.username || 'Usuario')}</strong><small>@${esc(req.sender.school_handle || req.sender.username || 'usuario')}</small></div><div class="request-actions"><button class="request-accept" type="button">Aceptar</button><button class="request-reject" type="button">Rechazar</button></div>`;
      const [accept, reject] = $$('.request-actions button', row);
      accept.addEventListener('click', () => acceptRequest(req, row));
      reject.addEventListener('click', () => rejectRequest(req, row));
      list.appendChild(row);
    });
  }

  async function acceptRequest(req, row) {
    $$('.request-actions button', row).forEach(b => b.disabled = true);
    try {
      const first = String(currentUser.id) < String(req.sender_id) ? currentUser.id : req.sender_id;
      const second = String(currentUser.id) < String(req.sender_id) ? req.sender_id : currentUser.id;
      const exists = await supabase.from('friendships').select('user1_id,user2_id').eq('user1_id', first).eq('user2_id', second).maybeSingle();
      if (exists.error) throw exists.error;
      if (!exists.data) {
        const insert = await supabase.from('friendships').insert({ user1_id: first, user2_id: second });
        if (insert.error) throw insert.error;
      }
      const remove = await supabase.from('friend_requests').delete().eq('id', req.id).eq('receiver_id', currentUser.id);
      if (remove.error) throw remove.error;
      row.remove();
      await loadFriends();
      toast('Ahora sois amigos.', 'success');
    } catch (error) {
      $$('.request-actions button', row).forEach(b => b.disabled = false);
      toast(friendlyError(error), 'error');
    }
  }

  async function rejectRequest(req, row) {
    const button = $('.request-reject', row);
    button.disabled = true;
    try {
      const { error } = await supabase.from('friend_requests').delete().eq('id', req.id).eq('receiver_id', currentUser.id);
      if (error) throw error;
      row.remove();
    } catch (error) {
      button.disabled = false;
      toast(friendlyError(error), 'error');
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Conversations                                                            */
  /* ------------------------------------------------------------------------ */
  async function loadConversations() {
    if (!currentUser) return [];
    const { data, error } = await supabase.rpc('xifre_get_my_conversations');
    if (error) { console.warn('CONVERSATIONS', error); return conversationCache; }
    conversationCache = (data || []).map(row => ({ ...row, displayName: row.display_name || row.name || (row.type === 'group' ? 'Grupo' : 'Chat privado') }));
    conversationCache.sort((a,b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
    renderConversations();
    return conversationCache;
  }

  function renderConversations(filter = $('#conversation-search-input')?.value || '') {
    const list = $('#conversation-list');
    if (!list) return;
    const q = normalizeUsername(filter).replace(/^@+/, '');
    list.innerHTML = '';
    setText('chat-count', conversationCache.length);
    const visible = conversationCache.filter(c => {
      if (!q) return true;
      const haystack = [c.displayName, c.name, c.username, c.last_message].map(normalizeUsername).join(' ');
      return haystack.includes(q);
    });
    if (!visible.length) {
      list.innerHTML = `<div class="empty-sidebar">${q ? 'No se encontraron conversaciones.' : 'No tienes conversaciones todavía.'}</div>`;
      return;
    }
    visible.forEach(conversation => {
      const isGroup = conversation.type === 'group';
      const label = conversation.displayName || conversation.name || (isGroup ? 'Grupo' : 'Chat privado');
      const row = document.createElement('button');
      row.type = 'button';
      const unread = Number(conversation.unread_count || 0);
      const mentioned = !!conversation.has_mention;
      row.className = `conversation${String(currentConversation)===String(conversation.id)?' active':''}${unread?' unread':''}`;
      row.innerHTML = `${avatarHTML(label, conversation.avatar_url, isGroup?'group':'private','conversation-avatar-image',conversation.avatar_color,conversation.id)}<span class="conversation-copy"><span class="conversation-name">${esc(label)}</span><span class="conversation-preview ${conversation.message_type==='system'?'conversation-system':''}">${esc(conversation.last_message || (isGroup ? `${conversation.member_count||0} miembros` : 'Conversación'))}</span></span><span class="conversation-tail">${mentioned?'<span class="conversation-mention-badge">@</span>':''}${unread?`<span class="conversation-unread-badge">${unread>99?'99+':unread}</span>`:''}<span class="conversation-meta">${esc(formatListTime(conversation.last_message_at))}</span></span>`;
      row.addEventListener('click',()=>openConversation(conversation.id,conversation));
      row.addEventListener('contextmenu',e=>{e.preventDefault(); openConversationMenu(conversation,e.clientX,e.clientY);});
      list.appendChild(row);
    });
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

  async function openConversation(id, cached = null) {
    if (!id || !currentUser) return false;
    const conversationId = String(id);
    let conversation = cached || conversationCache.find(c => String(c.id) === conversationId);
    if (!conversation) {
      await loadConversations();
      conversation = conversationCache.find(c => String(c.id) === conversationId);
    }
    if (!conversation) return false;

    try {
      if (String(currentConversation) !== conversationId) lastMessagesSignature = '';
      currentConversation = conversationId;
      currentConversationData = conversation;
      sessionStorage.setItem('xifre_current_conversation', conversationId);
      const { data: members, error } = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: conversationId });
      if (error) throw error;
      currentMembers = members || [];
      memberCache.set(conversationId, currentMembers);

      updateChatHeader();
      renderRightPane();
      renderConversations();
      await loadMessages(conversationId, true);
      await supabase.rpc('xifre_mark_read', { p_conversation_id: conversationId });
      const readRow = conversationCache.find(c => String(c.id) === conversationId); if (readRow) { readRow.unread_count = 0; readRow.has_mention = false; }
      renderConversations();
      setupTypingChannel(conversationId);
      setupMessageChannel(conversationId);
      $('#message-input').disabled = false;
      updateSendState();
      $('#message-input').focus();
      return true;
    } catch (error) {
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
    const otherMember = currentMembers.find(m=>String(m.user_id)!==String(currentUser.id));
    avatarInto($('#chat-avatar'), name, url, isGroup ? 'group' : 'private', isGroup ? '' : (otherMember?.avatar_color || ''), otherMember?.user_id || currentConversation);
    setText('chat-title', name);
    setText('chat-subtitle', subtitle);
    $('#chat-info-button')?.classList.remove('hidden');
  }

  /* ------------------------------------------------------------------------ */
  /* Messages                                                                 */
  /* ------------------------------------------------------------------------ */
  function messageObject(row) {
    return { ...row };
  }

  function normalizeAttachments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(a => a && typeof a.url === 'string' && a.url && /^image\/(png|jpeg|webp|gif)$/i.test(String(a.type || '')))
      .map(a => ({ url: String(a.url), name: String(a.name || 'imagen'), size: Number(a.size || 0), type: String(a.type || '') }));
  }

  function messageSignature(messages) {
    return messages.map(m => `${m.id}|${m.created_at}|${m.content || ''}|${m.reply_to || ''}|${(m.mentions || []).join(',')}|${!!m.mention_everyone}|${m.message_type || ''}|${JSON.stringify(m.attachments || [])}`).join('||');
  }

  async function loadMessages(conversationId, forceBottom = false) {
    const { data, error } = await supabase.rpc('xifre_get_messages', { p_conversation_id: conversationId, p_limit: 500 });
    if (error) throw error;
    const messages = (data || []).map(messageObject);
    const signature = messageSignature(messages);
    if (!forceBottom && String(currentConversation) === String(conversationId) && signature === lastMessagesSignature) return;
    lastMessagesSignature = signature;
    renderMessages(messages, forceBottom);
  }

  function renderMessageContent(content, message) {
    const members = currentMembers || [];
    let html = esc(content || '');
    if (currentConversationData?.type === 'group') html = html.replace(/@everyone\b/gi, '<span class="mention-token everyone">@everyone</span>');
    members.forEach(m => {
      const username = String(m.username || '').trim();
      const userId = String(m.user_id || '');
      if (!username || !userId) return;
      const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`@${escapedUsername}\\b`, 'gi'), `<span class="mention-token ${userId===String(currentUser.id)?'self':''}">@${esc(username)}</span>`);
    });
    return html;
  }

  function messageMentionsMe(message) {
    return String(message.sender_id) !== String(currentUser.id) && (message.mention_everyone || (message.mentions || []).some(id => String(id) === String(currentUser.id)));
  }

  function renderAttachments(attachments) {
    const items = normalizeAttachments(attachments);
    if (!items.length) return '';
    return `<div class="message-attachments">${items.map((a,i)=>`<button class="message-attachment" type="button" data-image-url="${esc(a.url)}" data-image-name="${esc(a.name)}" aria-label="Abrir imagen ${i+1}"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"></button>`).join('')}</div>`;
  }

  function renderMessages(messages, forceBottom = false) {
    const box = $('#messages');
    if (!box) return;
    const oldScrollHeight = box.scrollHeight;
    const oldScrollTop = box.scrollTop;
    const oldDistance = oldScrollHeight - oldScrollTop - box.clientHeight;
    const wasNearBottom = forceBottom || oldDistance < 100;
    box.innerHTML = '';
    if (!messages.length) {
      box.innerHTML = '<div class="chat-welcome"><div class="welcome-mark">X</div><h3>Sin mensajes todavía</h3><p>Escribe el primer mensaje.</p></div>';
      return;
    }
    const profiles = new Map(currentMembers.map(m => [String(m.user_id), m]));
    messages.forEach(m => renderOneMessage(m, profiles));
    requestAnimationFrame(() => {
      if (wasNearBottom) box.scrollTop = box.scrollHeight;
      else box.scrollTop = Math.max(0, oldScrollTop + (box.scrollHeight - oldScrollHeight));
    });
  }

  function renderOneMessage(message, profiles = new Map()) {
    const box = $('#messages');
    if (!box || !message?.id) return;
    if (box.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) return;
    $('.chat-welcome', box)?.remove();
    if (message.message_type === 'system') {
      const row = document.createElement('div');
      row.className = 'system-message-row';
      row.dataset.messageId = String(message.id);
      row.innerHTML = `<span>${esc(message.content || '')}</span>`;
      box.appendChild(row);
      return;
    }
    const mine = String(message.sender_id) === String(currentUser.id);
    const cached = profiles.get(String(message.sender_id)) || {};
    const sender = {
      username: message.sender_username || cached.username || 'Usuario',
      avatar_url: message.sender_avatar_url || cached.avatar_url || null,
      avatar_color: message.sender_avatar_color || cached.avatar_color || '',
      school_handle: message.sender_school_handle || cached.school_handle || ''
    };
    const mentioned = !mine && messageMentionsMe(message);
    const row = document.createElement('article');
    row.className = `message-row${mine ? ' mine' : ''}${mentioned ? ' mentioned' : ''}`;
    row.dataset.messageId = String(message.id);
    const reply = message.reply_to ? `<div class="message-reply-preview" data-reply-target="${esc(message.reply_to)}"><span class="reply-line"></span><span class="reply-avatar">${avatarHTML(message.reply_sender_username || 'Usuario', message.reply_sender_avatar_url, 'private', '', message.reply_sender_avatar_color || '', message.reply_to)}</span><div class="message-reply-copy"><strong>${esc(message.reply_sender_username || 'Usuario')}</strong><span>${esc(message.reply_content || '[Imagen]')}</span></div></div>` : '';
    row.innerHTML = `<span class="message-avatar">${avatarHTML(sender.username, sender.avatar_url, 'private', '', sender.avatar_color, sender.user_id || message.sender_id)}</span><div class="message-body">${reply}<div class="message-meta"><span class="message-author">${esc(sender.username)}</span><span class="message-username">@${esc(sender.username)}</span><span class="message-time">${esc(formatTime(message.created_at))}</span></div><div class="message-content">${renderMessageContent(message.content, message)}</div>${renderAttachments(message.attachments)}</div><div class="message-actions"><button class="message-action" type="button" data-message-action="reply" title="Responder">↩</button><button class="message-action more" type="button" data-message-action="more" title="Más">•••</button></div>`;
    row.querySelector('[data-message-action="reply"]').addEventListener('click', e => { e.stopPropagation(); setReplyTo(message); highlightMessage(message.id); });
    row.querySelector('[data-message-action="more"]').addEventListener('click', e => { e.stopPropagation(); openMessageMenu(message, e.currentTarget); });
    row.querySelector('.message-reply-preview')?.addEventListener('click', () => highlightMessage(message.reply_to));
    row.querySelectorAll('[data-image-url]').forEach(btn => btn.addEventListener('click', () => openImageLightbox(btn.dataset.imageUrl, btn.dataset.imageName || '')));
    row.addEventListener('contextmenu', e => { e.preventDefault(); openMessageMenu(message, row); });
    box.appendChild(row);
  }

  function highlightMessage(id) {
    $$('.message-row', $('#messages')).forEach(r => r.classList.remove('reply-target'));
    const row = $(`[data-message-id="${CSS.escape(String(id))}"]`, $('#messages'));
    if (!row) return;
    row.classList.add('reply-target');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('reply-target'), 1600);
  }

  function setReplyTo(message) {
    replyTarget = message;
    setText('replying-name', `@${message.sender_username || 'usuario'}`);
    setText('replying-content', message.content || (normalizeAttachments(message.attachments).length ? '[Imagen]' : ''));
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
    await loadMessages(currentConversation, false).catch(() => {});
    await loadConversations();
    toast('Mensaje eliminado.', 'success');
  }

  function updateMentionPicker() {
    const input = $('#message-input');
    const picker = $('#mention-picker');
    if (!input || !picker) return;
    const value = input.value;
    const before = value.slice(0, input.selectionStart ?? value.length);
    const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
    if (!currentConversation || !match) { picker.classList.add('hidden'); return; }
    const query = match[2].toLowerCase();
    const people = currentMembers
      .filter(m => String(m.user_id) !== String(currentUser.id))
      .filter(m => String(m.username || '').toLowerCase().startsWith(query));
    if (!people.length) { picker.classList.add('hidden'); return; }
    mentionPickerIndex = Math.min(Math.max(mentionPickerIndex, 0), Math.max(people.length - 1, 0));
    picker.innerHTML = '';
    people.slice(0, 8).forEach((person, index) => {
      const row = document.createElement('div');
      row.className = `mention-item${index === mentionPickerIndex ? ' active' : ''}`;
      row.innerHTML = `${avatarHTML(person.username, person.avatar_url, 'private', 'mention-avatar', person.avatar_color, person.user_id)}<span class="mention-item-copy"><strong>${esc(person.username)}</strong><small>@${esc(person.username)}</small></span>`;
      row.addEventListener('mousedown', e => { e.preventDefault(); selectMention(person); });
      picker.appendChild(row);
    });
    picker.classList.remove('hidden');
  }

  function selectMention(person) {
    const input = $('#message-input');
    if (!input || !person?.user_id || !person?.username) return;
    const value = input.value;
    const pos = input.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
    if (!match) return;
    const start = pos - match[2].length - 1;
    const token = `@${person.username} `;
    input.value = value.slice(0, start) + token + value.slice(pos);
    input.focus();
    const newPos = start + token.length;
    input.setSelectionRange(newPos, newPos);
    $('#mention-picker').classList.add('hidden');
    currentMentionIds.add(String(person.user_id));
    updateSendState();
    scheduleTyping();
  }

  function updateSendState() {
    const input = $('#message-input');
    const button = $('#send-button');
    if (!button) return;
    button.disabled = !(String(input?.value || '').trim() || pendingChatImages.length);
  }

  function deriveMentions(content) {
    const ids = [];
    for (const m of currentMembers) {
      const username = String(m.username || '').trim();
      const userId = String(m.user_id || '').trim();
      if (!username || !userId) continue;
      if (new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(content)) ids.push(userId);
    }
    return { ids: [...new Set(ids)].filter(Boolean), everyone: currentConversationData?.type === 'group' && /@everyone\b/i.test(content) };
  }

  function clearPendingChatImages() {
    pendingChatImages.forEach(item => { try { URL.revokeObjectURL(item.previewUrl); } catch {} });
    pendingChatImages = [];
    renderAttachmentPreview();
    updateSendState();
  }

  function chatImageExtension(file) {
    return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[file?.type] || 'png';
  }

  function validateChatImage(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) throw new Error('Solo puedes subir PNG, JPG, WEBP o GIF.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Cada imagen puede pesar como máximo 10 MB.');
  }

  function renderAttachmentPreview() {
    const box = $('#attachment-preview');
    if (!box) return;
    if (!pendingChatImages.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = pendingChatImages.map((item, index) => `<div class="attachment-card"><img src="${esc(item.previewUrl)}" alt="${esc(item.file.name)}"><button class="attachment-remove" type="button" data-attachment-remove="${index}" aria-label="Quitar imagen">×</button></div>`).join('');
    box.querySelectorAll('[data-attachment-remove]').forEach(btn => btn.addEventListener('click', () => {
      const index = Number(btn.dataset.attachmentRemove);
      const item = pendingChatImages[index];
      if (item) { try { URL.revokeObjectURL(item.previewUrl); } catch {} }
      pendingChatImages.splice(index, 1);
      renderAttachmentPreview();
      updateSendState();
    }));
  }

  function addChatImages(fileList) {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    for (const file of files) {
      if (pendingChatImages.length >= 4) { toast('Máximo 4 imágenes por mensaje.', 'error'); break; }
      try { validateChatImage(file); } catch (error) { toast(error.message, 'error'); continue; }
      const duplicate = pendingChatImages.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
      if (duplicate) continue;
      pendingChatImages.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    renderAttachmentPreview();
    updateSendState();
  }

  function openImageLightbox(url, name = '') {
    const lightbox = $('#image-lightbox');
    const img = $('#image-lightbox-image');
    if (!lightbox || !img) return;
    img.src = url;
    img.alt = name;
    lightbox.classList.remove('hidden');
  }

  function closeImageLightbox() {
    const lightbox = $('#image-lightbox');
    const img = $('#image-lightbox-image');
    lightbox?.classList.add('hidden');
    if (img) img.src = '';
  }

  async function sendMessage() {
    if (!currentUser || !currentConversation) return;
    const input = $('#message-input');
    const content = String(input?.value || '').trim();
    if (!content && !pendingChatImages.length) return;
    const button = $('#send-button');
    if (button) button.disabled = true;
    const filesToSend = pendingChatImages.map(item => item.file);
    const uploadedPaths = [];
    try {
      const derived = deriveMentions(content);
      const mentions = [...new Set([...derived.ids, ...currentMentionIds])].filter(Boolean);
      const attachments = [];
      for (const file of filesToSend) {
        const path = `${currentUser.id}/${currentConversation}/${Date.now()}-${crypto.randomUUID()}.${chatImageExtension(file)}`;
        const upload = await supabase.storage.from('xifre-chat').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
        if (upload.error) throw upload.error;
        uploadedPaths.push(path);
        const publicUrl = supabase.storage.from('xifre-chat').getPublicUrl(path).data?.publicUrl;
        if (!publicUrl) throw new Error('No se pudo obtener la URL de la imagen.');
        attachments.push({ path, url: publicUrl, name: file.name, size: file.size, type: file.type });
      }
      const { data, error } = await supabase.rpc('xifre_send_message', {
        p_conversation_id: currentConversation,
        p_content: content,
        p_reply_to: replyTarget?.id || null,
        p_mentions: mentions,
        p_mention_everyone: derived.everyone,
        p_attachments: attachments
      });
      if (error) throw error;
      const sent = Array.isArray(data) ? data[0] : data;
      input.value = '';
      clearReply();
      currentMentionIds.clear();
      mentionEverywhere = false;
      $('#mention-picker')?.classList.add('hidden');
      stopTypingBroadcast();
      clearPendingChatImages();
      await loadMessages(currentConversation, true);
      await loadConversations();
      await supabase.rpc('xifre_mark_read', { p_conversation_id: currentConversation });
      return sent;
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from('xifre-chat').remove(uploadedPaths).catch(() => {});
      toast(friendlyError(error), 'error');
    } finally {
      updateSendState();
      input?.focus();
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Realtime typing + messages                                               */
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
    setTypingVisible(false);
  }

  function setupMessageChannel(conversationId) {
    if (messageChannel) supabase.removeChannel(messageChannel);
    messageChannel = supabase.channel(`xifre:messages:${conversationId}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
        if (String(payload.new?.sender_id) === String(currentUser.id)) return;
        if (String(currentConversation) !== String(conversationId)) return;
        await loadMessages(conversationId, false).catch(() => {});
        await loadConversations().catch(() => {});
        const box=$('#messages'); if(box && box.scrollHeight-box.scrollTop-box.clientHeight<80) { await supabase.rpc('xifre_mark_read',{p_conversation_id:conversationId}).catch(()=>{}); const c=conversationCache.find(x=>String(x.id)===String(conversationId)); if(c){c.unread_count=0;c.has_mention=false;} renderConversations(); }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async () => {
        if (String(currentConversation) !== String(conversationId)) return;
        await loadMessages(conversationId, false).catch(() => {});
        await loadConversations().catch(() => {});
      })
      .subscribe();
    if (messagePoll) clearInterval(messagePoll);
    messagePoll = setInterval(() => {
      if (document.visibilityState === 'visible' && String(currentConversation) === String(conversationId)) {
        loadMessages(conversationId, false).catch(() => {});
      }
    }, 2500);
  }

  function setupTypingChannel(conversationId) {
    if (typingChannel) supabase.removeChannel(typingChannel);
    setTypingVisible(false);
    typingChannel = supabase.channel(`xifre:typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, payload => {
        const senderId = String(payload.payload?.user_id || '');
        if (!senderId || senderId === String(currentUser.id)) return;
        if (payload.payload?.typing) {
          const sender = currentMembers.find(m => String(m.user_id) === senderId);
          setTypingVisible(true, sender?.username || payload.payload?.username || 'Alguien');
          setTimeout(() => setTypingVisible(false, sender?.username || ''), 3500);
        } else {
          setTypingVisible(false);
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') stopTypingBroadcast();
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
    if (visible) setText('typing-text', `${username} está escribiendo...`);
  }

  /* ------------------------------------------------------------------------ */
  /* Right panel                                                              */
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
      avatarInto($('#right-profile-avatar'), name, other?.avatar_url, 'private', other?.avatar_color, other?.user_id);
      setText('right-profile-name', name);
      setText('right-profile-handle', `@${other?.school_handle || other?.username || 'usuario'}`);
    } else {
      const name = currentConversationData?.name || 'Grupo';
      avatarInto($('#right-group-avatar'), name, currentConversationData?.avatar_url, 'group');
      setText('right-group-name', name);
      setText('right-group-count', `${currentMembers.length} miembro${currentMembers.length === 1 ? '' : 's'}`);
      const list = $('#right-group-members');
      if (!list) return;
      list.innerHTML = '';
      currentMembers.forEach(member => {
        const row = document.createElement('div');
        row.className = 'right-member';
        row.innerHTML = `${avatarHTML(member.username, member.avatar_url, 'private', 'member-avatar', member.avatar_color, member.user_id)}<span class="right-member-copy"><span class="right-member-name">${esc(member.username || 'Usuario')}</span><small>@${esc(member.school_handle || member.username || 'usuario')}</small></span>${member.is_owner?'<span class="member-role-crown crown-owner" title="Creador">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin" title="Administrador">♛</span>':''}`;
        row.addEventListener('click', e => { if (!e.defaultPrevented) showMemberProfile(member, row); });
        row.addEventListener('contextmenu', e => { e.preventDefault(); closeMemberProfile(); openMemberMenu(member, e.clientX, e.clientY); });
        list.appendChild(row);
      });
    }
  }

  function showMemberProfile(member, anchor) {
    const pop = $('#member-profile-popover');
    if (!pop || !member) return;
    selectedMember = member;
    avatarInto($('#member-profile-avatar'), member.username, member.avatar_url, 'private', member.avatar_color, member.user_id);
    setText('member-profile-name', member.username || 'Usuario');
    setText('member-profile-username', `@${member.school_handle || member.username || 'usuario'}`);
    const role = $('#member-profile-role');
    role?.classList.add('hidden');
    role?.classList.remove('owner','admin');
    if (member.is_owner) { role?.classList.remove('hidden'); role?.classList.add('owner'); setText('member-profile-role','Creador'); }
    else if (member.is_admin) { role?.classList.remove('hidden'); role?.classList.add('admin'); setText('member-profile-role','Administrador'); }
    pop.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const width = 280, height = 245;
    let left = Math.min(r.right + 8, window.innerWidth - width - 10);
    if (left < 10) left = 10;
    let top = Math.min(r.top, window.innerHeight - height - 10);
    if (top < 10) top = 10;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function closeMemberProfile() {
    $('#member-profile-popover')?.classList.add('hidden');
    selectedMember = null;
  }

  function openMemberMenu(member, x, y) {
    selectedMember = member;
    const menu = $('#member-menu');
    if (!menu) return;
    const me = currentMembers.find(m => String(m.user_id) === String(currentUser.id));
    const creator = !!me?.is_owner;
    const admin = !!me?.is_admin;
    const canManage = creator || admin;
    const targetIsAdmin = !!member.is_admin || !!member.is_owner;
    $('#member-menu [data-member-menu="kick"]')?.classList.toggle('hidden', !canManage || member.is_owner || (!creator && targetIsAdmin));
    $('#member-menu [data-member-menu="grant"]')?.classList.toggle('hidden', !creator || member.is_owner || member.is_admin);
    $('#member-menu [data-member-menu="revoke"]')?.classList.toggle('hidden', !creator || !member.is_admin);
    menu.classList.remove('hidden');
    menu.style.left = `${Math.min(x, window.innerWidth - 205)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
  }

  function closeMemberMenu() { $('#member-menu')?.classList.add('hidden'); selectedMember = null; }

  async function memberAction(action) {
    const member = selectedMember;
    closeMemberMenu();
    if (!member || !currentConversation) return;
    let fn = '';
    const args = { p_conversation_id: currentConversation, p_user_id: member.user_id };
    if (action === 'kick') fn = 'xifre_remove_group_member';
    if (action === 'grant') fn = 'xifre_grant_group_admin';
    if (action === 'revoke') fn = 'xifre_revoke_group_admin';
    if (!fn) return;
    const { error } = await supabase.rpc(fn, args);
    if (error) return toast(friendlyError(error), 'error');
    memberCache.delete(currentConversation);
    const r = await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: currentConversation });
    if (r.error) return toast(friendlyError(r.error), 'error');
    currentMembers = r.data || [];
    memberCache.set(currentConversation, currentMembers);
    renderRightPane();
    await openChatInfo();
    await loadMessages(currentConversation, false);
    await loadConversations();
    toast(action === 'kick' ? 'Persona expulsada.' : action === 'grant' ? 'Administrador añadido.' : 'Administrador retirado.', 'success');
  }

  /* ------------------------------------------------------------------------ */
  /* Groups                                                                   */
  /* ------------------------------------------------------------------------ */
  function renderGroupSelection() {
    const list = $('#group-friends-list');
    if (!list) return;
    list.innerHTML = '';
    friendCache.forEach(friend => {
      const row = document.createElement('label');
      row.className = 'selection-item';
      row.innerHTML = `<input type="checkbox" class="group-friend-check" value="${esc(friend.id)}"><span>${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color, friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.school_handle || friend.username)}</small></span>`;
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
      row.innerHTML = `${avatarHTML(member.username, member.avatar_url, 'private', 'friend-avatar', member.avatar_color, member.user_id)}<div class="friend-copy"><strong>${esc(member.username || 'Usuario')}</strong><small>@${esc(member.school_handle || member.username || 'usuario')}</small></div><span>${member.is_owner?'<span class="member-role-crown crown-owner">♛</span>':member.is_admin?'<span class="member-role-crown crown-admin">♛</span>':''}</span>`;
      row.addEventListener('click', () => showMemberProfile(member, row));
      row.addEventListener('contextmenu', e => { e.preventDefault(); closeMemberProfile(); openMemberMenu(member, e.clientX, e.clientY); });
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
      row.innerHTML = `<input type="checkbox" class="group-add-check" value="${esc(friend.id)}"><span>${avatarHTML(friend.username, friend.avatar_url, 'private', '', friend.avatar_color, friend.id)}</span><span><strong>${esc(friend.username)}</strong><small>@${esc(friend.school_handle || friend.username)}</small></span>`;
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
      currentMembers = result.data || [];
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
    const button = $('#save-group-settings');
    const name = String($('#group-edit-name').value || '').trim();
    if (!name) return setModalMessage('group-settings-message', 'El nombre es obligatorio.', 'error');
    setLoading(button, true);
    try {
      let avatarUrl = null;
      if (pendingGroupAvatarFile) {
        const path = `${currentUser.id}/groups/${currentConversation}/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingGroupAvatarFile)}`;
        avatarUrl = await uploadAvatar(pendingGroupAvatarFile, path);
      }
      const { data, error } = await supabase.rpc('xifre_update_group', { p_conversation_id: currentConversation, p_name: name, p_avatar_url: avatarUrl });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      currentConversationData.name = updated?.name || name;
      currentConversationData.displayName = currentConversationData.name;
      if (updated?.avatar_url) currentConversationData.avatar_url = updated.avatar_url;
      const local = conversationCache.find(c => String(c.id) === String(currentConversation));
      if (local) { local.name = currentConversationData.name; local.displayName = currentConversationData.name; local.avatar_url = currentConversationData.avatar_url || null; }
      pendingGroupAvatarFile = null;
      pendingGroupAvatarURL = null;
      updateChatHeader();
      renderRightPane();
      renderConversations();
      avatarInto($('#group-edit-avatar-preview'), currentConversationData.name, currentConversationData.avatar_url, 'group');
      setModalMessage('group-settings-message', 'Cambios guardados.', 'success');
    } catch (error) {
      setModalMessage('group-settings-message', friendlyError(error), 'error');
    } finally {
      setLoading(button, false);
    }
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
  /* Avatar upload / profile settings                                         */
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

  function previewFile(file, target, name, kind, color = '') {
    try { validateImage(file); } catch (error) { toast(error.message, 'error'); return; }
    const oldUrl = target?.dataset.objectUrl;
    if (oldUrl) { try { URL.revokeObjectURL(oldUrl); } catch {} }
    const url = URL.createObjectURL(file);
    if (target) { target.innerHTML = avatarHTML(name, url, kind, '', color); target.dataset.objectUrl = url; }
  }

  function openSettings() {
    syncProfileUI();
    applyTheme(currentTheme());
    $('#settings-modal')?.classList.remove('hidden');
    if (!pendingProfileAvatarFile) { avatarInto($('#settings-avatar-preview'), currentProfile?.username || 'Usuario', currentProfile?.avatar_url, 'private', currentProfile?.avatar_color); avatarInto($('#settings-preview-avatar'), currentProfile?.username || 'Usuario', currentProfile?.avatar_url, 'private', currentProfile?.avatar_color); }
  }

  async function saveProfileSettings() {
    if (!currentUser) return;
    const button = $('#save-profile-settings');
    const username = normalizeUsername($('#settings-username').value);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setModalMessage('profile-settings-message', 'El username debe tener 3–20 caracteres y solo letras, números y _.', 'error');
    setLoading(button, true);
    try {
      let avatarUrl = null;
      if (pendingProfileAvatarFile) {
        const path = `${currentUser.id}/profile/${Date.now()}-${crypto.randomUUID()}.${fileExt(pendingProfileAvatarFile)}`;
        avatarUrl = await uploadAvatar(pendingProfileAvatarFile, path);
      }
      const { data, error } = await supabase.rpc('xifre_update_profile', { p_username: username, p_display_name: username, p_avatar_url: avatarUrl });
      if (error) throw error;
      currentProfile = Array.isArray(data) ? data[0] : data;
      const previewTargets = [$('#settings-avatar-preview'), $('#settings-preview-avatar')];
      previewTargets.forEach(target => { const u = target?.dataset.objectUrl; if (u) { try { URL.revokeObjectURL(u); } catch {} } if (target) delete target.dataset.objectUrl; });
      pendingProfileAvatarFile = null;
      pendingProfileAvatarURL = null;
      syncProfileUI();
      memberCache.clear();
      await loadFriends();
      await loadConversations();
      if (currentConversation) {
        await supabase.rpc('xifre_get_conversation_members', { p_conversation_id: currentConversation }).then(r => { if (!r.error) currentMembers = r.data || []; }).catch(() => {});
        updateChatHeader();
        renderRightPane();
        await loadMessages(currentConversation, false);
      }
      setModalMessage('profile-settings-message', 'Cambios guardados.', 'success');
    } catch (error) {
      setModalMessage('profile-settings-message', friendlyError(error), 'error');
    } finally {
      setLoading(button, false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Custom confirmation                                                      */
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
  /* Modals / reset                                                           */
  /* ------------------------------------------------------------------------ */
  function openModal(id) {
    $(`#${id}`)?.classList.remove('hidden');
  }
  function closeModal(id) {
    $(`#${id}`)?.classList.add('hidden');
  }

  function resetChatView() {
    stopChatRealtime();
    lastMessagesSignature = '';
    clearPendingChatImages();
    setText('chat-title', 'XIFRE');
    setText('chat-subtitle', 'Selecciona una conversación');
    avatarInto($('#chat-avatar'), 'XIFRE', null, 'private');
    $('#chat-info-button')?.classList.add('hidden');
    $('#message-input').disabled = true;
    $('#message-input').value = '';
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
  /* Event wiring                                                             */
  /* ------------------------------------------------------------------------ */
  function bind() {
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
        else if (type === 'open-group') { openModal('group-modal'); renderGroupSelection(); $('#group-name').focus(); }
        else if (type === 'create-group') void createGroup();
        else if (type === 'open-chat-info') void openChatInfo();
        else if (type === 'save-group-settings') void saveGroupSettings();
        else if (type === 'add-group-members') void addGroupMembers();
        else if (type === 'request-delete-group') void deleteGroup();
        else if (type === 'save-profile-settings') void saveProfileSettings();
        else if (type === 'open-chat-image-picker') { $('#chat-image-file')?.click(); return; }
        else if (type === 'resend') void resendConfirmation();
        else if (type === 'close-modal') closeModal(action.dataset.modal);
        else if (type === 'close-member-profile') closeMemberProfile();
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
    }, true);

    $('#friend-search')?.addEventListener('input', e => searchPeople(e.target.value));
    $('#settings-username')?.addEventListener('input', e => {
      const value = normalizeUsername(e.target.value) || 'usuario';
      setText('settings-preview-name', value);
      setText('settings-preview-username', `@${schoolHandle()}`);
    });
    $('#conversation-search-input')?.addEventListener('input', e => { const clear = $('#conversation-search-clear'); clear?.classList.toggle('hidden', !e.target.value); renderConversations(e.target.value); });
    $('#conversation-search-clear')?.addEventListener('click', () => { const input = $('#conversation-search-input'); if (!input) return; input.value = ''; input.focus(); $('#conversation-search-clear')?.classList.add('hidden'); renderConversations(''); });
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
      previewFile(file, $('#settings-avatar-preview'), currentProfile?.username || 'Usuario', 'private', currentProfile?.avatar_color);
      previewFile(file, $('#settings-preview-avatar'), currentProfile?.username || 'Usuario', 'private', currentProfile?.avatar_color);
    });

    $('#group-avatar-file')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { validateImage(file); } catch (error) { event.target.value = ''; toast(error.message, 'error'); return; }
      pendingGroupAvatarFile = file;
      previewFile(file, $('#group-edit-avatar-preview'), currentConversationData?.name || 'Grupo', 'group');
    });

    $('#message-form')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
    $('#message-input')?.addEventListener('input', () => {
      const value = String($('#message-input').value || '').trim();
      updateMentionPicker();
      updateSendState();
      if (value || pendingChatImages.length) scheduleTyping(); else stopTypingBroadcast();
    });
    $('#message-input')?.addEventListener('keydown', event => {
      const picker=$('#mention-picker');
      if(!picker.classList.contains('hidden')){
        const items=$$('.mention-item',picker);
        if(event.key==='ArrowDown'){event.preventDefault();mentionPickerIndex=Math.min(mentionPickerIndex+1,items.length-1);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
        if(event.key==='ArrowUp'){event.preventDefault();mentionPickerIndex=Math.max(mentionPickerIndex-1,0);items.forEach((x,i)=>x.classList.toggle('active',i===mentionPickerIndex));return;}
        if(event.key==='Enter'&&items.length){event.preventDefault();items[mentionPickerIndex]?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return;}
        if(event.key==='Escape'){picker.classList.add('hidden');return;}
      }
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
    });
    $('#message-input')?.addEventListener('blur', () => stopTypingBroadcast());
    $('#chat-image-file')?.addEventListener('change', event => {
      addChatImages(event.target.files);
      event.target.value = '';
    });
    $('#message-input')?.addEventListener('paste', event => {
      const images = [];
      for (const item of [...(event.clipboardData?.items || [])]) {
        if (item.kind === 'file' && /^image\//i.test(item.type)) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length) { event.preventDefault(); addChatImages(images); }
    });
    $('.center-pane')?.addEventListener('dragenter', event => { event.preventDefault(); dragDepth += 1; if (event.dataTransfer?.types?.includes('Files')) $('#chat-drop-overlay')?.classList.remove('hidden'); });
    $('.center-pane')?.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer?.types?.includes('Files')) event.dataTransfer.dropEffect = 'copy'; });
    $('.center-pane')?.addEventListener('dragleave', event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#chat-drop-overlay')?.classList.add('hidden'); });
    $('.center-pane')?.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('#chat-drop-overlay')?.classList.add('hidden'); addChatImages(event.dataTransfer?.files); });
    $('#image-lightbox-close')?.addEventListener('click', closeImageLightbox);
    $('#image-lightbox')?.addEventListener('click', event => { if (event.target.id === 'image-lightbox') closeImageLightbox(); });
    $('#messages')?.addEventListener('scroll',()=>{const box=$('#messages');if(!currentConversation||!box)return;if(box.scrollHeight-box.scrollTop-box.clientHeight<12){const c=conversationCache.find(x=>String(x.id)===String(currentConversation));if(c&&(Number(c.unread_count)||c.has_mention)){void supabase.rpc('xifre_mark_read',{p_conversation_id:currentConversation}).then(()=>{c.unread_count=0;c.has_mention=false;renderConversations();});}}});

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!$('#image-lightbox').classList.contains('hidden')) return closeImageLightbox();
        if (!$('#member-profile-popover').classList.contains('hidden')) return closeMemberProfile();
        if (!$('#member-menu').classList.contains('hidden')) return closeMemberMenu();
        if (!$('#message-menu').classList.contains('hidden')) return closeMessageMenu();
        if (!$('#confirm-modal').classList.contains('hidden')) return finishConfirm(false);
        if (!$('#settings-modal').classList.contains('hidden')) return $('#settings-modal').classList.add('hidden');
        $$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUser) {
        void loadConversations().then(() => {
          if (currentConversation) return loadMessages(currentConversation, false);
          return restoreConversation();
        }).catch(() => {});
      }
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
            void startApplication(session);
            return;
          }
          if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentProfile = null;
            appStarted = false;
            resetChatView();
            closeAllModals();
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
