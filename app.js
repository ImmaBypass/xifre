/* =========================================================
   XIFRE
   APPLICATION
   ========================================================= */


/* =========================================================
   SUPABASE
   ========================================================= */

/*
   PON AQUÍ TUS DATOS DE SUPABASE.

   Project URL:
   https://xxxxxxxx.supabase.co

   Publishable key:
   sb_publishable_xxxxxxxxx
*/

const SUPABASE_URL =
    "TU_SUPABASE_URL";

const SUPABASE_KEY =
    "TU_SUPABASE_PUBLISHABLE_KEY";


const supabase =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;

let currentProfile = null;

let currentConversation = null;

let messageChannel = null;

let requestChannel = null;


/* =========================================================
   DOM
   ========================================================= */

const screens = {

    landing:
        document.getElementById(
            "landing-screen"
        ),

    login:
        document.getElementById(
            "login-screen"
        ),

    register:
        document.getElementById(
            "register-screen"
        ),

    email:
        document.getElementById(
            "email-screen"
        )

};


const mainScreen =
    document.getElementById(
        "main-screen"
    );


/* =========================================================
   SCREEN NAVIGATION
   ========================================================= */

function showScreen(name) {

    Object.values(screens)
        .forEach(screen => {

            screen.classList.remove(
                "active"
            );

        });


    if (screens[name]) {

        screens[name]
            .classList.add(
                "active"
            );

    }


    if (name === "login") {

        setTimeout(() => {

            document
                .getElementById(
                    "login-email"
                )
                .focus();

        }, 350);

    }


    if (name === "register") {

        setTimeout(() => {

            document
                .getElementById(
                    "register-username"
                )
                .focus();

        }, 350);

    }

}


/* =========================================================
   MAIN APP VISIBILITY
   ========================================================= */

function showMainApp() {

    Object.values(screens)
        .forEach(screen => {

            screen.classList.remove(
                "active"
            );

        });


    mainScreen.classList.add(
        "active"
    );

}


function hideMainApp() {

    mainScreen.classList.remove(
        "active"
    );

}


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeUsername(
    username
) {

    return username
        .trim()
        .toLowerCase();

}


function setAuthMessage(
    elementId,
    message,
    type = ""
) {

    const element =
        document.getElementById(
            elementId
        );


    if (!element) return;


    element.textContent =
        message;


    element.className =
        "auth-message";


    if (type) {

        element.classList.add(
            type
        );

    }

}


function setButtonLoading(
    button,
    loading
) {

    if (!button) return;


    if (loading) {

        button.classList.add(
            "loading"
        );

        button.disabled =
            true;

    } else {

        button.classList.remove(
            "loading"
        );

        button.disabled =
            false;

    }

}


function getRedirectURL() {

    return (
        window.location.origin +
        window.location.pathname
    );

}


function escapeHTML(value) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        value ?? "";

    return div.innerHTML;

}


/* =========================================================
   LANDING
   ========================================================= */

document
    .getElementById(
        "enter-button"
    )
    .addEventListener(
        "click",
        () => {

            showScreen("login");

        }
    );


/* =========================================================
   LOGIN / REGISTER NAVIGATION
   ========================================================= */

document
    .getElementById(
        "go-register"
    )
    .addEventListener(
        "click",
        () => {

            setAuthMessage(
                "login-message",
                ""
            );

            showScreen(
                "register"
            );

        }
    );


document
    .getElementById(
        "go-login"
    )
    .addEventListener(
        "click",
        () => {

            setAuthMessage(
                "register-message",
                ""
            );

            showScreen(
                "login"
            );

        }
    );


document
    .getElementById(
        "back-from-login"
    )
    .addEventListener(
        "click",
        () => {

            showScreen(
                "landing"
            );

        }
    );


document
    .getElementById(
        "back-from-register"
    )
    .addEventListener(
        "click",
        () => {

            showScreen(
                "landing"
            );

        }
    );


document
    .getElementById(
        "back-to-login-from-email"
    )
    .addEventListener(
        "click",
        () => {

            showScreen(
                "login"
            );

        }
    );


/* =========================================================
   REGISTER
   ========================================================= */

document
    .getElementById(
        "register-form"
    )
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            await register();

        }
    );


async function register() {

    const usernameInput =
        document.getElementById(
            "register-username"
        );

    const emailInput =
        document.getElementById(
            "register-email"
        );

    const passwordInput =
        document.getElementById(
            "register-password"
        );


    const username =
        normalizeUsername(
            usernameInput.value
        );

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;


    /* -----------------------------------------
       VALIDATION
       ----------------------------------------- */

    setAuthMessage(
        "register-message",
        ""
    );


    if (!username) {

        setAuthMessage(
            "register-message",
            "Escribe un username.",
            "error"
        );

        usernameInput.focus();

        return;
    }


    if (
        !/^[a-z0-9_]+$/.test(
            username
        )
    ) {

        setAuthMessage(
            "register-message",
            "El username solo puede contener letras, números y _.",
            "error"
        );

        usernameInput.focus();

        return;
    }


    if (username.length < 3) {

        setAuthMessage(
            "register-message",
            "El username debe tener al menos 3 caracteres.",
            "error"
        );

        return;
    }


    if (username.length > 20) {

        setAuthMessage(
            "register-message",
            "El username puede tener como máximo 20 caracteres.",
            "error"
        );

        return;
    }


    if (!email) {

        setAuthMessage(
            "register-message",
            "Introduce tu correo electrónico.",
            "error"
        );

        emailInput.focus();

        return;
    }


    if (password.length < 6) {

        setAuthMessage(
            "register-message",
            "La contraseña debe tener al menos 6 caracteres.",
            "error"
        );

        passwordInput.focus();

        return;
    }


    const button =
        document.getElementById(
            "register-button"
        );


    setButtonLoading(
        button,
        true
    );


    setAuthMessage(
        "register-message",
        "Comprobando username...",
        "success"
    );


    /* -----------------------------------------
       CHECK USERNAME
       ----------------------------------------- */

    const {
        data: existingProfile,
        error: usernameError
    } = await supabase
        .from("profiles")
        .select("id")
        .eq(
            "username",
            username
        )
        .maybeSingle();


    if (usernameError) {

        console.error(
            usernameError
        );


        setButtonLoading(
            button,
            false
        );


        setAuthMessage(
            "register-message",
            "No se pudo comprobar el username. Revisa la configuración de Supabase.",
            "error"
        );

        return;
    }


    if (existingProfile) {

        setButtonLoading(
            button,
            false
        );


        setAuthMessage(
            "register-message",
            "Ese username ya está ocupado.",
            "error"
        );

        return;
    }


    /* -----------------------------------------
       SUPABASE SIGN UP
       ----------------------------------------- */

    setAuthMessage(
        "register-message",
        "Creando cuenta...",
        "success"
    );


    const {
        data,
        error
    } = await supabase.auth.signUp({

        email:
            email,

        password:
            password,

        options: {

            emailRedirectTo:
                getRedirectURL(),

            data: {

                username:
                    username

            }

        }

    });


    if (error) {

        console.error(
            "SIGNUP ERROR:",
            error
        );


        setButtonLoading(
            button,
            false
        );


        setAuthMessage(
            "register-message",
            getFriendlyAuthError(
                error
            ),
            "error"
        );

        return;
    }


    /*
       Confirm Email is enabled.

       Therefore Supabase normally gives us:
       user = existing/new user
       session = null
    */

    if (!data.session) {

        document
            .getElementById(
                "confirmation-email"
            )
            .textContent =
                email;


        usernameInput.value = "";

        emailInput.value = "";

        passwordInput.value = "";


        setButtonLoading(
            button,
            false
        );


        showScreen(
            "email"
        );


        return;
    }


    /*
       Fallback in case Confirm Email
       has been disabled.
    */

    setButtonLoading(
        button,
        false
    );


    await startApplication();

}


/* =========================================================
   LOGIN
   ========================================================= */

document
    .getElementById(
        "login-form"
    )
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            await login();

        }
    );


async function login() {

    const email =
        document
            .getElementById(
                "login-email"
            )
            .value
            .trim();

    const password =
        document
            .getElementById(
                "login-password"
            )
            .value;


    const button =
        document.getElementById(
            "login-button"
        );


    setAuthMessage(
        "login-message",
        ""
    );


    if (!email || !password) {

        setAuthMessage(
            "login-message",
            "Introduce el correo y la contraseña.",
            "error"
        );

        return;
    }


    setButtonLoading(
        button,
        true
    );


    setAuthMessage(
        "login-message",
        "Iniciando sesión...",
        "success"
    );


    const {
        data,
        error
    } = await supabase.auth.signInWithPassword({

        email:
            email,

        password:
            password

    });


    if (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        setButtonLoading(
            button,
            false
        );


        setAuthMessage(
            "login-message",
            getFriendlyAuthError(
                error
            ),
            "error"
        );

        return;
    }


    if (!data.session) {

        setButtonLoading(
            button,
            false
        );


        setAuthMessage(
            "login-message",
            "No se pudo iniciar la sesión.",
            "error"
        );

        return;
    }


    setButtonLoading(
        button,
        false
    );


    await startApplication();

}


/* =========================================================
   AUTH ERROR MESSAGES
   ========================================================= */

function getFriendlyAuthError(
    error
) {

    const message =
        (
            error?.message ||
            ""
        ).toLowerCase();


    if (
        message.includes(
            "email not confirmed"
        )
    ) {

        return (
            "Primero tienes que confirmar tu correo electrónico."
        );

    }


    if (
        message.includes(
            "invalid login credentials"
        )
    ) {

        return (
            "El correo o la contraseña no son correctos."
        );

    }


    if (
        message.includes(
            "password should be at least"
        )
    ) {

        return (
            "La contraseña es demasiado corta."
        );

    }


    if (
        message.includes(
            "rate limit"
        )
    ) {

        return (
            "Demasiados intentos. Espera un poco y vuelve a intentarlo."
        );

    }


    return (
        error?.message ||
        "Ha ocurrido un error. Inténtalo de nuevo."
    );

}


/* =========================================================
   AUTH STATE
   ========================================================= */

supabase.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        console.log(
            "Xifre auth:",
            event
        );


        if (
            event ===
            "SIGNED_IN"
        ) {

            if (session) {

                await startApplication();

            }

        }


        if (
            event ===
            "SIGNED_OUT"
        ) {

            closeApplication();

        }

    }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initialize() {

    console.log(
        "Xifre starting..."
    );


    /*
       Detect errors returned by
       Supabase after email confirmation.
    */

    handleAuthURL();


    const {
        data,
        error
    } =
        await supabase.auth.getSession();


    if (error) {

        console.error(
            "SESSION ERROR:",
            error
        );

        showScreen(
            "landing"
        );

        return;
    }


    if (
        data.session
    ) {

        await startApplication();

        return;
    }


    showMainApp();

    hideMainApp();

    showScreen(
        "landing"
    );

}


/* =========================================================
   EMAIL CONFIRMATION URL
   ========================================================= */

function handleAuthURL() {

    const hash =
        window.location.hash;


    if (!hash) return;


    const params =
        new URLSearchParams(
            hash.substring(1)
        );


    const errorDescription =
        params.get(
            "error_description"
        );


    if (
        errorDescription
    ) {

        console.error(
            "AUTH REDIRECT ERROR:",
            errorDescription
        );


        showScreen(
            "login"
        );


        setAuthMessage(
            "login-message",
            decodeURIComponent(
                errorDescription
                    .replace(
                        /\+/g,
                        " "
                    )
            ),
            "error"
        );

    }


    /*
       The Supabase client processes
       the auth session itself.

       We remove the tokens from the
       visible URL after that.
    */

    if (
        hash.includes(
            "access_token"
        ) ||
        hash.includes(
            "refresh_token"
        )
    ) {

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname +
            window.location.search
        );

    }

}


/* =========================================================
   START APPLICATION
   ========================================================= */

async function startApplication() {

    const {
        data,
        error
    } =
        await supabase.auth.getUser();


    if (
        error ||
        !data.user
    ) {

        console.error(
            "USER ERROR:",
            error
        );

        return;
    }


    currentUser =
        data.user;


    await loadProfile();

    showMainApp();

    await loadFriends();

    await loadConversations();

    setupRequestRealtime();

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadProfile() {

    if (!currentUser) return;


    const {
        data,
        error
    } =
        await supabase
            .from("profiles")
            .select(
                "*"
            )
            .eq(
                "id",
                currentUser.id
            )
            .single();


    if (error) {

        console.error(
            "PROFILE ERROR:",
            error
        );

        return;
    }


    currentProfile =
        data;


    const avatar =
        document.getElementById(
            "profile-avatar"
        );


    const name =
        document.getElementById(
            "profile-name"
        );


    const username =
        document.getElementById(
            "profile-username"
        );


    avatar.textContent =
        (
            data.display_name ||
            data.username ||
            "?"
        )
            .charAt(0)
            .toUpperCase();


    name.textContent =
        data.display_name ||
        data.username;


    username.textContent =
        "@" +
        data.username;

}


/* =========================================================
   FRIENDS
   ========================================================= */

async function loadFriends() {

    if (!currentUser) return;


    const {
        data,
        error
    } =
        await supabase
            .from("friendships")
            .select(
                "user1_id,user2_id"
            )
            .or(
                "user1_id.eq." +
                currentUser.id +
                ",user2_id.eq." +
                currentUser.id
            );


    if (error) {

        console.error(
            "FRIENDS ERROR:",
            error
        );

        return;
    }


    const ids =
        (data || [])
            .map(
                friendship => {

                    if (
                        friendship.user1_id ===
                        currentUser.id
                    ) {

                        return friendship.user2_id;

                    }

                    return friendship.user1_id;

                }
            );


    if (!ids.length) {

        renderFriends(
            []
        );

        return;
    }


    const {
        data: profiles,
        error: profileError
    } =
        await supabase
            .from("profiles")
            .select(
                "id,username,display_name,avatar_url"
            )
            .in(
                "id",
                ids
            );


    if (profileError) {

        console.error(
            profileError
        );

        return;
    }


    renderFriends(
        profiles || []
    );

}


/* =========================================================
   RENDER FRIENDS
   ========================================================= */

function renderFriends(
    profiles
) {

    let section =
        document.getElementById(
            "friends-section"
        );


    if (!section) {

        section =
            document.createElement(
                "div"
            );


        section.id =
            "friends-section";


        section.innerHTML = `
            <div class="sidebar-section-title">
                Amigos
            </div>

            <div
                id="friends-list"
                class="conversation-list"
            ></div>
        `;


        const list =
            document.getElementById(
                "conversation-list"
            );


        list.parentElement.insertBefore(
            section,
            list
        );

    }


    const list =
        document.getElementById(
            "friends-list"
        );


    list.innerHTML = "";


    profiles.forEach(
        friend => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "conversation";


            item.innerHTML = `
                <div class="conversation-name">
                    @${escapeHTML(
                        friend.username
                    )}
                </div>

                <div class="conversation-type">
                    Abrir chat
                </div>
            `;


            item.addEventListener(
                "click",
                async () => {

                    await openPrivateChat(
                        friend.id
                    );

                }
            );


            list.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   FRIEND MODAL
   ========================================================= */

document
    .getElementById(
        "add-friend-button"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "friend-modal"
                )
                .classList.remove(
                    "hidden"
                );

            document
                .getElementById(
                    "friend-username"
                )
                .focus();

        }
    );


document
    .getElementById(
        "close-friend-modal"
    )
    .addEventListener(
        "click",
        () => {

            closeModal(
                "friend-modal"
            );

        }
    );


document
    .getElementById(
        "send-friend-button"
    )
    .addEventListener(
        "click",
        sendFriendRequest
    );


async function sendFriendRequest() {

    const input =
        document.getElementById(
            "friend-username"
        );


    const username =
        normalizeUsername(
            input.value
        );


    const message =
        document.getElementById(
            "friend-message"
        );


    if (!username) {

        message.textContent =
            "Escribe un username.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    if (
        currentProfile &&
        username ===
        currentProfile.username
    ) {

        message.textContent =
            "No puedes añadirte a ti mismo.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    const {
        data: profile,
        error
    } =
        await supabase
            .from("profiles")
            .select(
                "id,username"
            )
            .eq(
                "username",
                username
            )
            .maybeSingle();


    if (error) {

        console.error(
            error
        );

        message.textContent =
            "No se pudo buscar el usuario.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    if (!profile) {

        message.textContent =
            "No existe ese username.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    const {
        data: friendship
    } =
        await supabase
            .from("friendships")
            .select("id")
            .or(
                `and(user1_id.eq.${currentUser.id},user2_id.eq.${profile.id}),and(user1_id.eq.${profile.id},user2_id.eq.${currentUser.id})`
            )
            .maybeSingle();


    if (friendship) {

        message.textContent =
            "Ya sois amigos.";

        message.style.color =
            "#ffcf8c";

        return;
    }


    const {
        error: requestError
    } =
        await supabase
            .from("friend_requests")
            .insert({

                sender_id:
                    currentUser.id,

                receiver_id:
                    profile.id

            });


    if (requestError) {

        console.error(
            requestError
        );

        message.textContent =
            "No se pudo enviar la solicitud.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    message.textContent =
        "Solicitud enviada.";

    message.style.color =
        "#91efbb";


    input.value = "";

}


/* =========================================================
   CONVERSATIONS
   ========================================================= */

async function loadConversations() {

    if (!currentUser) return;


    const {
        data,
        error
    } =
        await supabase
            .from("conversation_members")
            .select(`
                conversation_id,
                conversations (
                    id,
                    type,
                    name,
                    owner_id,
                    created_at
                )
            `)
            .eq(
                "user_id",
                currentUser.id
            );


    if (error) {

        console.error(
            "CONVERSATIONS ERROR:",
            error
        );

        return;
    }


    const unique =
        new Map();


    (
        data || []
    ).forEach(
        row => {

            if (
                row.conversations
            ) {

                unique.set(
                    row.conversations.id,
                    row.conversations
                );

            }

        }
    );


    renderConversations(
        Array.from(
            unique.values()
        )
    );

}


/* =========================================================
   RENDER CONVERSATIONS
   ========================================================= */

function renderConversations(
    conversations
) {

    const list =
        document.getElementById(
            "conversation-list"
        );


    list.innerHTML = "";


    if (
        conversations.length === 0
    ) {

        list.innerHTML = `
            <div style="
                padding:12px;
                color:rgba(255,255,255,.3);
                font-size:11px;
            ">
                No tienes conversaciones.
            </div>
        `;

        return;
    }


    conversations.forEach(
        conversation => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "conversation";


            if (
                currentConversation ===
                conversation.id
            ) {

                item.classList.add(
                    "active"
                );

            }


            item.innerHTML = `
                <div class="conversation-name">
                    ${escapeHTML(
                        conversation.name ||
                        (
                            conversation.type ===
                            "group"
                                ? "Grupo"
                                : "Chat privado"
                        )
                    )}
                </div>

                <div class="conversation-type">
                    ${
                        conversation.type ===
                        "group"
                            ? "Grupo"
                            : "Privado"
                    }
                </div>
            `;


            item.addEventListener(
                "click",
                async () => {

                    await openConversation(
                        conversation.id,
                        conversation
                    );

                }
            );


            list.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   PRIVATE CHAT
   ========================================================= */

async function openPrivateChat(
    friendId
) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            "create_private_chat",
            {
                other_user:
                    friendId
            }
        );


    if (error) {

        console.error(
            "PRIVATE CHAT ERROR:",
            error
        );

        alert(
            "No se pudo abrir el chat privado."
        );

        return;
    }


    await loadConversations();


    await openConversation(
        data
    );

}


/* =========================================================
   OPEN CONVERSATION
   ========================================================= */

async function openConversation(
    conversationId,
    conversationObject = null
) {

    currentConversation =
        conversationId;


    const conversation =
        conversationObject ||
        await getConversation(
            conversationId
        );


    if (!conversation) {

        return;
    }


    document
        .getElementById(
            "chat-title"
        )
        .textContent =
            conversation.name ||
            (
                conversation.type ===
                "group"
                    ? "Grupo"
                    : "Chat privado"
            );


    document
        .getElementById(
            "chat-subtitle"
        )
        .textContent =
            conversation.type ===
            "group"
                ? "Grupo"
                : "Chat privado";


    await loadMessages(
        conversationId
    );


    subscribeMessages(
        conversationId
    );


    document
        .getElementById(
            "message-input"
        )
        .focus();


}


/* =========================================================
   GET CONVERSATION
   ========================================================= */

async function getConversation(
    conversationId
) {

    const {
        data,
        error
    } =
        await supabase
            .from("conversations")
            .select(
                "*"
            )
            .eq(
                "id",
                conversationId
            )
            .single();


    if (error) {

        console.error(
            error
        );

        return null;
    }


    return data;

}


/* =========================================================
   MESSAGES
   ========================================================= */

async function loadMessages(
    conversationId
) {

    const container =
        document.getElementById(
            "messages"
        );


    container.innerHTML = "";


    const {
        data,
        error
    } =
        await supabase
            .from("messages")
            .select(`
                id,
                conversation_id,
                sender_id,
                content,
                created_at,
                sender:profiles!messages_sender_id_fkey(
                    username,
                    display_name
                )
            `)
            .eq(
                "conversation_id",
                conversationId
            )
            .order(
                "created_at",
                {
                    ascending:
                        true
                }
            );


    if (error) {

        console.error(
            "MESSAGES ERROR:",
            error
        );

        return;
    }


    if (
        !data ||
        data.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-logo">
                    X
                </div>

                <h3>
                    Empieza la conversación
                </h3>

                <p>
                    Escribe el primer mensaje.
                </p>
            </div>
        `;

        return;
    }


    data.forEach(
        message => {

            renderMessage(
                message,
                false
            );

        }
    );


    scrollMessages();

}


/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function renderMessage(
    message,
    scroll = true
) {

    const container =
        document.getElementById(
            "messages"
        );


    const empty =
        container.querySelector(
            ".empty-chat"
        );


    if (empty) {

        empty.remove();

    }


    if (
        container.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;
    }


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "message";


    wrapper.dataset.messageId =
        message.id;


    if (
        message.sender_id ===
        currentUser.id
    ) {

        wrapper.classList.add(
            "mine"
        );

    }


    const bubble =
        document.createElement(
            "div"
        );


    bubble.className =
        "message-bubble";


    /*
       textContent is intentional.

       It prevents a user from sending
       HTML/JavaScript and having it
       execute in another user's browser.
    */

    bubble.textContent =
        message.content;


    const meta =
        document.createElement(
            "div"
        );


    meta.className =
        "message-meta";


    const username =
        message.sender?.username ||
        "usuario";


    meta.textContent =
        "@" +
        username +
        " · " +
        formatTime(
            message.created_at
        );


    wrapper.appendChild(
        bubble
    );

    wrapper.appendChild(
        meta
    );


    container.appendChild(
        wrapper
    );


    if (scroll) {

        scrollMessages();

    }

}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

document
    .getElementById(
        "message-form"
    )
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            if (
                !currentUser ||
                !currentConversation
            ) {

                return;
            }


            const input =
                document.getElementById(
                    "message-input"
                );


            const content =
                input.value.trim();


            if (!content) {

                return;
            }


            input.value = "";


            const {
                error
            } =
                await supabase
                    .from("messages")
                    .insert({

                        conversation_id:
                            currentConversation,

                        sender_id:
                            currentUser.id,

                        content:
                            content

                    });


            if (error) {

                console.error(
                    "SEND MESSAGE ERROR:",
                    error
                );


                input.value =
                    content;

            }

        }
    );


/* =========================================================
   MESSAGE REALTIME
   ========================================================= */

function subscribeMessages(
    conversationId
) {

    if (messageChannel) {

        supabase.removeChannel(
            messageChannel
        );

        messageChannel =
            null;

    }


    messageChannel =
        supabase
            .channel(
                "xifre-messages-" +
                conversationId +
                "-" +
                Date.now()
            )
            .on(
                "postgres_changes",
                {
                    event:
                        "INSERT",

                    schema:
                        "public",

                    table:
                        "messages",

                    filter:
                        "conversation_id=eq." +
                        conversationId

                },
                async payload => {

                    const {
                        data: sender
                    } =
                        await supabase
                            .from("profiles")
                            .select(
                                "username,display_name"
                            )
                            .eq(
                                "id",
                                payload.new.sender_id
                            )
                            .maybeSingle();


                    renderMessage({

                        ...payload.new,

                        sender:
                            sender ||
                            null

                    });

                }
            )
            .subscribe(
                status => {

                    console.log(
                        "Message realtime:",
                        status
                    );

                }
            );

}


/* =========================================================
   CREATE GROUP
   ========================================================= */

document
    .getElementById(
        "create-group-button"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "group-modal"
                )
                .classList.remove(
                    "hidden"
                );

            document
                .getElementById(
                    "group-name"
                )
                .focus();

        }
    );


document
    .getElementById(
        "close-group-modal"
    )
    .addEventListener(
        "click",
        () => {

            closeModal(
                "group-modal"
            );

        }
    );


document
    .getElementById(
        "create-group-submit"
    )
    .addEventListener(
        "click",
        createGroup
    );


async function createGroup() {

    const nameInput =
        document.getElementById(
            "group-name"
        );


    const membersInput =
        document.getElementById(
            "group-members"
        );


    const message =
        document.getElementById(
            "group-message"
        );


    const name =
        nameInput.value.trim();


    const usernames =
        membersInput.value
            .split(",")
            .map(
                value =>
                    normalizeUsername(
                        value
                    )
            )
            .filter(Boolean);


    if (!name) {

        message.textContent =
            "Escribe un nombre para el grupo.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    let memberIds = [];


    if (
        usernames.length
    ) {

        const {
            data: profiles,
            error
        } =
            await supabase
                .from("profiles")
                .select(
                    "id,username"
                )
                .in(
                    "username",
                    usernames
                );


        if (error) {

            console.error(
                error
            );

            message.textContent =
                "No se pudieron buscar los usuarios.";

            message.style.color =
                "#ff9b9b";

            return;
        }


        const found =
            new Set(
                (
                    profiles ||
                    []
                )
                    .map(
                        profile =>
                            profile.username
                    )
            );


        const missing =
            usernames.filter(
                username =>
                    !found.has(
                        username
                    )
            );


        if (
            missing.length
        ) {

            message.textContent =
                "No existe: @" +
                missing.join(
                    ", @"
                );

            message.style.color =
                "#ff9b9b";

            return;
        }


        memberIds =
            (
                profiles ||
                []
            )
                .map(
                    profile =>
                        profile.id
                );

    }


    const {
        data: conversationId,
        error
    } =
        await supabase.rpc(
            "create_group",
            {
                group_name:
                    name,

                member_ids:
                    memberIds

            }
        );


    if (error) {

        console.error(
            "CREATE GROUP ERROR:",
            error
        );

        message.textContent =
            "No se pudo crear el grupo.";

        message.style.color =
            "#ff9b9b";

        return;
    }


    closeModal(
        "group-modal"
    );


    await loadConversations();


    await openConversation(
        conversationId
    );

}


/* =========================================================
   REQUEST REALTIME
   ========================================================= */

function setupRequestRealtime() {

    if (
        !currentUser
    ) return;


    if (
        requestChannel
    ) {

        supabase.removeChannel(
            requestChannel
        );

    }


    requestChannel =
        supabase
            .channel(
                "xifre-requests-" +
                currentUser.id
            )
            .on(
                "postgres_changes",
                {
                    event:
                        "*",

                    schema:
                        "public",

                    table:
                        "friend_requests",

                    filter:
                        "receiver_id=eq." +
                        currentUser.id

                },
                payload => {

                    console.log(
                        "Friend request:",
                        payload
                    );

                }
            )
            .subscribe();

}


/* =========================================================
   LOGOUT
   ========================================================= */

document
    .getElementById(
        "logout-button"
    )
    .addEventListener(
        "click",
        async () => {

            await supabase.auth.signOut();

        }
    );


/* =========================================================
   CLOSE APPLICATION
   ========================================================= */

function closeApplication() {

    currentUser =
        null;

    currentProfile =
        null;

    currentConversation =
        null;


    if (
        messageChannel
    ) {

        supabase.removeChannel(
            messageChannel
        );

        messageChannel =
            null;

    }


    if (
        requestChannel
    ) {

        supabase.removeChannel(
            requestChannel
        );

        requestChannel =
            null;

    }


    hideMainApp();

    showScreen(
        "landing"
    );

}


/* =========================================================
   MODALS
   ========================================================= */

function closeModal(
    id
) {

    const modal =
        document.getElementById(
            id
        );


    if (modal) {

        modal.classList.add(
            "hidden"
        );

    }

}


/* =========================================================
   TIME
   ========================================================= */

function formatTime(
    timestamp
) {

    return new Date(
        timestamp
    ).toLocaleTimeString(
        "es-ES",
        {
            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );

}


/* =========================================================
   SCROLL
   ========================================================= */

function scrollMessages() {

    const container =
        document.getElementById(
            "messages"
        );


    container.scrollTop =
        container.scrollHeight;

}


/* =========================================================
   START
   ========================================================= */

initialize();
