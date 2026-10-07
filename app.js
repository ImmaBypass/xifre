/* XIFRE - robust client */
(() => {
  'use strict';

  const CONFIG = {
    url: 'https://doppekualeyvrlbtumze.supabase.co',
    key: 'sb_publishable_96LHpw9bFMWX6tAl6p_6qA__ZANADwE'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let supabase = null;
  let currentUser = null;
  let currentProfile = null;
  let currentConversation = null;
  let messageChannel = null;
  let requestChannel = null;
  let appStarted = false;
  let pendingEmail = sessionStorage.getItem('xifre_pending_email') || '';

  const screens = ['landing', 'login', 'register', 'email'];

  function screenElement(name) {
    return document.getElementById(`${name}-screen`);
  }

  function animateScreen(screen) {
    if (!screen) return;
    screen.classList.remove('screen-entering');
    void screen.offsetWidth;
    requestAnimationFrame(() => screen.classList.add('screen-entering'));
  }

  function showScreen(name) {
    if (!screens.includes(name)) name = 'landing';

    const target = screenElement(name);
    if (!target) return;

    const main = document.getElementById('main-screen');
    if (main) main.classList.remove('active');

    screens.forEach(key => {
      const el = screenElement(key);
      if (el) el.classList.toggle('active', key === name);
    });

    animateScreen(target);

    if (name === 'login') {
      setTimeout(() => $('#login-email')?.focus(), 420);
    }
    if (name === 'register') {
      setTimeout(() => $('#register-username')?.focus(), 420);
    }
  }

  function showMainApp() {
    screens.forEach(key => screenElement(key)?.classList.remove('active'));
    const main = document.getElementById('main-screen');
    if (!main) return;
    main.classList.add('active');
    main.classList.remove('main-entering');
    void main.offsetWidth;
    requestAnimationFrame(() => main.classList.add('main-entering'));
  }

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function setMessage(id, text = '', type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message${type ? ` ${type}` : ''}`;
  }

  function setModalMessage(id, text = '', type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `modal-message${type ? ` ${type}` : ''}`;
  }

  function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('loading', loading);
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function toast(text, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = text;
    container.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
      item.classList.remove('show');
      setTimeout(() => item.remove(), 350);
    }, 3500);
  }

  function supabaseReady() {
    return !!supabase;
  }

  function redirectURL() {
    return window.location.origin + window.location.pathname;
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('email not confirmed')) return 'Primero tienes que confirmar tu correo electrónico.';
    if (message.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.';
    if (message.includes('user already registered')) return 'Ese correo ya está registrado.';
    if (message.includes('password should be at least')) return 'La contraseña es demasiado corta.';
    if (message.includes('rate limit')) return 'Demasiados intentos. Espera un poco y vuelve a intentarlo.';
    if (message.includes('redirect')) return 'La URL de redirección no está permitida en Supabase.';
    return error?.message || 'Ha ocurrido un error. Inténtalo de nuevo.';
  }

  async function checkUsername(username) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .limit(1);
    if (error) throw error;
    return !data?.length;
  }

  async function register() {
    const form = $('#register-form');
    const button = $('#register-button');
    const username = normalizeUsername($('#register-username')?.value);
    const email = String($('#register-email')?.value || '').trim();
    const password = String($('#register-password')?.value || '');

    setMessage('register-message', '');

    if (!supabaseReady()) {
      setMessage('register-message', 'La interfaz funciona, pero Supabase no se ha cargado. Comprueba tu conexión y recarga.', 'error');
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setMessage('register-message', 'El username debe tener 3–20 caracteres y solo puede usar letras, números y _.', 'error');
      return;
    }
    if (!email) {
      setMessage('register-message', 'Escribe tu correo electrónico.', 'error');
      return;
    }
    if (password.length < 6) {
      setMessage('register-message', 'La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }

    setLoading(button, true);
    setMessage('register-message', 'Comprobando username...', 'success');

    try {
      if (!(await checkUsername(username))) {
        setMessage('register-message', 'Ese username ya está ocupado.', 'error');
        return;
      }

      setMessage('register-message', 'Creando cuenta...', 'success');

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: redirectURL()
        }
      });

      if (error) throw error;

      pendingEmail = email;
      sessionStorage.setItem('xifre_pending_email', email);

      if (data?.session) {
        await startApplication();
      } else {
        const confirmation = $('#confirmation-email');
        if (confirmation) confirmation.textContent = email;
        showScreen('email');
      }
    } catch (error) {
      console.error('XIFRE REGISTER:', error);
      setMessage('register-message', friendlyAuthError(error), 'error');
    } finally {
      setLoading(button, false);
    }
  }

  async function resendConfirmation() {
    if (!supabaseReady()) return;
    if (!pendingEmail) {
      showScreen('register');
      setMessage('register-message', 'Escribe tu correo otra vez para poder reenviar la confirmación.', 'error');
      return;
    }

    const button = $('#resend-confirmation');
    setLoading(button, true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: { emailRedirectTo: redirectURL() }
      });
      if (error) throw error;
      toast('Correo de confirmación reenviado.', 'success');
    } catch (error) {
      console.error('XIFRE RESEND:', error);
      toast(friendlyAuthError(error), 'error');
    } finally {
      setLoading(button, false);
    }
  }

  async function login() {
    const button = $('#login-button');
    const email = String($('#login-email')?.value || '').trim();
    const password = String($('#login-password')?.value || '');

    setMessage('login-message', '');

    if (!supabaseReady()) {
      setMessage('login-message', 'La interfaz funciona, pero Supabase no se ha cargado. Comprueba tu conexión y recarga.', 'error');
      return;
    }
    if (!email || !password) {
      setMessage('login-message', 'Introduce el correo y la contraseña.', 'error');
      return;
    }

    setLoading(button, true);
    setMessage('login-message', 'Iniciando sesión...', 'success');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error('No se recibió una sesión válida.');
      sessionStorage.removeItem('xifre_pending_email');
      pendingEmail = '';
      await startApplication();
    } catch (error) {
      console.error('XIFRE LOGIN:', error);
      const friendly = friendlyAuthError(error);
      setMessage('login-message', friendly, 'error');
      if (String(error?.message || '').toLowerCase().includes('email not confirmed')) {
        pendingEmail = email;
        sessionStorage.setItem('xifre_pending_email', email);
        setTimeout(() => {
          const confirmation = $('#confirmation-email');
          if (confirmation) confirmation.textContent = email;
          showScreen('email');
        }, 350);
      }
    } finally {
      setLoading(button, false);
    }
  }

  async function loadProfile() {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.error('PROFILE:', error);
      currentProfile = { username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario' };
      return;
    }

    currentProfile = data || { username: normalizeUsername(currentUser.user_metadata?.username) || 'usuario' };

    $('#profile-name').textContent = currentProfile.display_name || currentProfile.username || 'Usuario';
    $('#profile-username').textContent = `@${currentProfile.username || 'usuario'}`;
    $('#profile-avatar').textContent = (currentProfile.username || 'U').charAt(0).toUpperCase();
  }

  async function startApplication() {
    if (!supabaseReady()) return;
    if (appStarted && currentUser) {
      showMainApp();
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) throw error || new Error('No hay usuario.');
      currentUser = data.user;
      appStarted = true;
      await loadProfile();
      showMainApp();
      await Promise.allSettled([loadFriends(), loadConversations()]);
      setupRequestRealtime();
    } catch (error) {
      console.error('XIFRE APP:', error);
      currentUser = null;
      appStarted = false;
      showScreen('login');
      setMessage('login-message', 'No se pudo cargar tu cuenta. Revisa la configuración de Supabase.', 'error');
    }
  }

  async function logout() {
    if (!supabaseReady()) {
      showScreen('landing');
      return;
    }
    await supabase.auth.signOut();
  }

  function closeApplication() {
    currentUser = null;
    currentProfile = null;
    currentConversation = null;
    appStarted = false;
    if (messageChannel) supabase.removeChannel(messageChannel);
    if (requestChannel) supabase.removeChannel(requestChannel);
    messageChannel = null;
    requestChannel = null;
    showScreen('landing');
  }

  async function loadFriends() {
    if (!currentUser) return;
    const { data: sent } = await supabase.from('friendships').select('user1_id,user2_id').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
    const ids = [];
    (sent || []).forEach(row => {
      const id = row.user1_id === currentUser.id ? row.user2_id : row.user1_id;
      if (id && !ids.includes(id)) ids.push(id);
    });
    if (!ids.length) {
      renderFriends([]);
      return;
    }
    const { data: profiles, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids);
    if (error) {
      console.error('FRIENDS:', error);
      return;
    }
    renderFriends(profiles || []);
  }

  function renderFriends(profiles) {
    let section = $('#friends-section');
    if (!section) {
      section = document.createElement('div');
      section.id = 'friends-section';
      section.innerHTML = `<div class="sidebar-section-title">Amigos</div><div id="friends-list" class="conversation-list"></div>`;
      const list = $('#conversation-list');
      list?.parentElement?.insertBefore(section, list);
    }
    const list = $('#friends-list');
    if (!list) return;
    list.innerHTML = '';
    if (!profiles.length) {
      list.innerHTML = '<div class="empty-sidebar">Todavía no tienes amigos.</div>';
      return;
    }
    profiles.forEach(friend => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'conversation friend-item';
      item.innerHTML = `<div class="conversation-name">@${escapeHTML(friend.username)}</div><div class="conversation-type">Abrir chat</div>`;
      item.addEventListener('click', () => openPrivateChat(friend.id));
      list.appendChild(item);
    });
  }

  async function sendFriendRequest() {
    if (!currentUser) return;
    const input = $('#friend-username');
    const username = normalizeUsername(input?.value);
    if (!username) {
      setModalMessage('friend-message', 'Escribe un username.', 'error');
      return;
    }
    if (currentProfile && username === currentProfile.username) {
      setModalMessage('friend-message', 'No puedes añadirte a ti mismo.', 'error');
      return;
    }
    const { data: profile, error } = await supabase.from('profiles').select('id,username').eq('username', username).maybeSingle();
    if (error || !profile) {
      setModalMessage('friend-message', error ? 'No se pudo buscar el usuario.' : 'No existe ese username.', 'error');
      return;
    }
    const { data: friendship } = await supabase.from('friendships').select('id').or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${profile.id}),and(user1_id.eq.${profile.id},user2_id.eq.${currentUser.id})`).maybeSingle();
    if (friendship) {
      setModalMessage('friend-message', 'Ya sois amigos.', 'success');
      return;
    }
    const { error: requestError } = await supabase.from('friend_requests').insert({ sender_id: currentUser.id, receiver_id: profile.id });
    if (requestError) {
      console.error(requestError);
      setModalMessage('friend-message', 'No se pudo enviar la solicitud.', 'error');
      return;
    }
    setModalMessage('friend-message', 'Solicitud enviada.', 'success');
    if (input) input.value = '';
  }

  async function loadConversations() {
    if (!currentUser) return;
    const { data, error } = await supabase.from('conversation_members').select('conversation_id, conversations(id,type,name,owner_id,created_at)').eq('user_id', currentUser.id);
    if (error) {
      console.error('CONVERSATIONS:', error);
      return;
    }
    const map = new Map();
    (data || []).forEach(row => row.conversations && map.set(row.conversations.id, row.conversations));
    renderConversations([...map.values()]);
  }

  function renderConversations(conversations) {
    const list = $('#conversation-list');
    if (!list) return;
    list.innerHTML = '';
    if (!conversations.length) {
      list.innerHTML = '<div class="empty-sidebar">No tienes conversaciones.</div>';
      return;
    }
    conversations.forEach(conversation => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `conversation${currentConversation === conversation.id ? ' active' : ''}`;
      item.innerHTML = `<div class="conversation-name">${escapeHTML(conversation.name || (conversation.type === 'group' ? 'Grupo' : 'Chat privado'))}</div><div class="conversation-type">${conversation.type === 'group' ? 'Grupo' : 'Privado'}</div>`;
      item.addEventListener('click', () => openConversation(conversation.id, conversation));
      list.appendChild(item);
    });
  }

  async function openPrivateChat(friendId) {
    const { data, error } = await supabase.rpc('create_private_chat', { other_user: friendId });
    if (error) {
      console.error(error);
      toast('No se pudo abrir el chat privado.', 'error');
      return;
    }
    await loadConversations();
    await openConversation(data);
  }

  async function openConversation(conversationId, object = null) {
    currentConversation = conversationId;
    const conversation = object || await getConversation(conversationId);
    if (!conversation) return;
    $('#chat-title').textContent = conversation.name || (conversation.type === 'group' ? 'Grupo' : 'Chat privado');
    $('#chat-subtitle').textContent = conversation.type === 'group' ? 'Grupo' : 'Chat privado';
    await loadMessages(conversationId);
    subscribeMessages(conversationId);
    $('#message-input')?.focus();
    await loadConversations();
  }

  async function getConversation(id) {
    const { data, error } = await supabase.from('conversations').select('id,type,name,owner_id,created_at').eq('id', id).maybeSingle();
    if (error) console.error(error);
    return data || null;
  }

  async function loadMessages(conversationId) {
    const box = $('#messages');
    if (!box) return;
    const { data, error } = await supabase.from('messages').select('id,conversation_id,sender_id,content,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      box.innerHTML = '<div class="empty-chat"><div class="empty-chat-logo">!</div><h3>No se pudieron cargar los mensajes</h3><p>Revisa las políticas RLS de Supabase.</p></div>';
      return;
    }
    box.innerHTML = '';
    for (const message of data || []) await renderMessage(message, true);
    scrollMessages();
  }

  async function renderMessage(message, append = true) {
    const box = $('#messages');
    if (!box) return;
    const mine = currentUser && message.sender_id === currentUser.id;
    const bubble = document.createElement('div');
    bubble.className = `message-row ${mine ? 'mine' : 'theirs'}`;
    bubble.innerHTML = `<div class="message-bubble"><div class="message-content">${escapeHTML(message.content)}</div><div class="message-time">${formatTime(message.created_at)}</div></div>`;
    if (append) box.appendChild(bubble); else box.prepend(bubble);
  }

  function subscribeMessages(conversationId) {
    if (messageChannel) supabase.removeChannel(messageChannel);
    messageChannel = supabase.channel(`xifre-messages-${conversationId}-${Date.now()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
      if (payload.new.sender_id === currentUser?.id) return;
      await renderMessage(payload.new);
      scrollMessages();
    }).subscribe();
  }

  async function sendMessage() {
    if (!currentUser || !currentConversation) return;
    const input = $('#message-input');
    const content = String(input?.value || '').trim();
    if (!content) return;
    input.value = '';
    const { data, error } = await supabase.from('messages').insert({ conversation_id: currentConversation, sender_id: currentUser.id, content }).select().single();
    if (error) {
      console.error(error);
      input.value = content;
      toast('No se pudo enviar el mensaje.', 'error');
      return;
    }
    await renderMessage(data);
    scrollMessages();
  }

  async function createGroup() {
    const name = String($('#group-name')?.value || '').trim();
    const raw = String($('#group-members')?.value || '');
    const usernames = raw.split(',').map(normalizeUsername).filter(Boolean);
    if (!name) return setModalMessage('group-message', 'Escribe un nombre para el grupo.', 'error');

    let memberIds = [];
    if (usernames.length) {
      const { data: profiles, error } = await supabase.from('profiles').select('id,username').in('username', usernames);
      if (error) return setModalMessage('group-message', 'No se pudieron buscar los usuarios.', 'error');
      const found = new Set((profiles || []).map(p => p.username));
      const missing = usernames.filter(u => !found.has(u));
      if (missing.length) return setModalMessage('group-message', `No existe: @${missing.join(', @')}`, 'error');
      memberIds = (profiles || []).map(p => p.id);
    }

    const { data: conversationId, error } = await supabase.rpc('create_group', { group_name: name, member_ids: memberIds });
    if (error) {
      console.error(error);
      return setModalMessage('group-message', 'No se pudo crear el grupo.', 'error');
    }
    closeModal('group-modal');
    await loadConversations();
    await openConversation(conversationId);
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function scrollMessages() {
    const box = $('#messages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function setupRealtime() {
    if (!currentUser || !supabaseReady()) return;
    if (requestChannel) supabase.removeChannel(requestChannel);
    requestChannel = supabase.channel(`xifre-requests-${currentUser.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${currentUser.id}` }, () => {
      toast('Tienes una nueva solicitud de amistad.', 'info');
    }).subscribe();
  }

  function bindEvents() {
    /* Navegación: un único listener delegado. Un fallo de otra función no puede dejar muerto Entrar. */
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-go]');
      if (nav) {
        event.preventDefault();
        const target = nav.dataset.go;
        setMessage('login-message', '');
        setMessage('register-message', '');
        showScreen(target);
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action) return;
      const type = action.dataset.action;
      if (type === 'logout') logout();
      if (type === 'resend') resendConfirmation();
      if (type === 'close-modal') closeModal(action.dataset.modal);
      if (type === 'open-friend') {
        $('#friend-modal')?.classList.remove('hidden');
        $('#friend-username')?.focus();
      }
      if (type === 'open-group') {
        $('#group-modal')?.classList.remove('hidden');
        $('#group-name')?.focus();
      }
      if (type === 'send-friend') sendFriendRequest();
      if (type === 'create-group') createGroup();
    });

    $('#login-form')?.addEventListener('submit', event => { event.preventDefault(); login(); });
    $('#register-form')?.addEventListener('submit', event => { event.preventDefault(); register(); });
    $('#message-form')?.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        $$('.modal:not(.hidden)').forEach(modal => modal.classList.add('hidden'));
      }
      if (event.key === 'Enter' && event.target.matches('#friend-username')) {
        event.preventDefault();
        sendFriendRequest();
      }
    });
  }

  function initSupabase() {
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(CONFIG.url, CONFIG.key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        supabase.auth.onAuthStateChange((event, session) => {
          setTimeout(async () => {
            if (event === 'SIGNED_IN' && session) await startApplication();
            if (event === 'SIGNED_OUT') closeApplication();
          }, 0);
        });
      } else {
        console.error('XIFRE: Supabase CDN no cargado.');
      }
    } catch (error) {
      console.error('XIFRE: Supabase init:', error);
      supabase = null;
    }
  }

  async function bootAuth() {
    showScreen('landing');
    if (!supabaseReady()) return;

    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) await startApplication();
    } catch (error) {
      console.error('XIFRE SESSION:', error);
      showScreen('landing');
    }
  }

  function start() {
    bindEvents();
    initSupabase();
    bootAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
