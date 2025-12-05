const API_BASE = sql8.freesqldatabase.com

// --- Utilities ---
function isAuthenticated() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return !!(token || user);
}

function saveAuthResponse(res) {
    if (!res) return;
    if (res.token) {
        localStorage.setItem('token', res.token);
        if (res.user) localStorage.setItem('user', JSON.stringify(res.user));
    } else if (res.user && res.user.token) {
        localStorage.setItem('token', res.user.token);
        localStorage.setItem('user', JSON.stringify(res.user));
    } else if (res.user) {
        localStorage.setItem('user', JSON.stringify(res.user));
    } else {
        localStorage.setItem('user', JSON.stringify(res));
    }
}

function requireAuth(redirectTo = null) {
    if (!isAuthenticated()) {
        const next = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : '';
        window.location.href = `login.html${next}`;
        return false;
    }
    return true;
}

// --- API wrapper (attaches JWT if present) ---
async function apiRequest(endpoint, method = 'GET', data = null) {
    const url = API_BASE + endpoint;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (data) options.body = JSON.stringify(data);

    try {
        const res = await fetch(url, options);
        if (res.status === 401) {
            localStorage.removeItem('token');
            throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    } catch (err) {
        // fallback to local demo data
        return localStorageFallback(endpoint, method, data);
    }
}

// --- LocalStorage fallback + sample books seed ---
function ensureSampleBooks() {
    if (!localStorage.getItem('books')) {
        const sample = [
            { id: 1, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', description: 'Classic novel', available: true, category: 'Fiction' },
            { id: 2, title: 'A Brief History of Time', author: 'Stephen Hawking', description: 'Science book', available: true, category: 'Science' },
            { id: 3, title: 'Sapiens', author: 'Yuval Noah Harari', description: 'History of humankind', available: true, category: 'History' },
            { id: 4, title: 'Think and Grow Rich', author: 'Napoleon Hill', description: 'Self improvement', available: true, category: 'Business' },
            { id: 5, title: 'The Art of War', author: 'Sun Tzu', description: 'Strategy classic', available: true, category: 'Art' }
        ];
        localStorage.setItem('books', JSON.stringify(sample));
    }
    if (!localStorage.getItem('users')) localStorage.setItem('users', JSON.stringify([]));
    if (!localStorage.getItem('borrows')) localStorage.setItem('borrows', JSON.stringify([]));
}

function localStorageFallback(endpoint, method, data) {
    ensureSampleBooks();
    // simple matching of endpoints
    if (endpoint === '/books' && method === 'GET') {
        return JSON.parse(localStorage.getItem('books'));
    }
    if (endpoint === '/books' && method === 'POST') {
        const books = JSON.parse(localStorage.getItem('books'));
        data.id = books.length ? Math.max(...books.map(b => b.id)) + 1 : 1;
        books.push(data);
        localStorage.setItem('books', JSON.stringify(books));
        return data;
    }
    if (endpoint === '/users/register' && method === 'POST') {
        const users = JSON.parse(localStorage.getItem('users'));
        users.push({ id: users.length + 1, username: data.username, email: data.email, password: data.password });
        localStorage.setItem('users', JSON.stringify(users));
        return { message: 'ok' };
    }
    if (endpoint === '/users/login' && method === 'POST') {
        const users = JSON.parse(localStorage.getItem('users'));
        const user = users.find(u => (u.email === data.email || u.username === data.email) && u.password === data.password);
        if (!user) throw new Error('Invalid credentials');
        // fake token
        const token = 'demo-token-' + btoa(user.username);
        return { user: { id: user.id, username: user.username, email: user.email }, token };
    }
    if (endpoint === '/borrows' && method === 'POST') {
        const borrows = JSON.parse(localStorage.getItem('borrows'));
        borrows.push({ id: borrows.length + 1, userId: data.user_id || 0, bookId: data.book_id, borrowed_at: new Date().toISOString() });
        localStorage.setItem('borrows', JSON.stringify(borrows));
        // mark book unavailable
        const books = JSON.parse(localStorage.getItem('books'));
        const b = books.find(x => x.id === data.book_id || x.id == data.bookId);
        if (b) b.available = false;
        localStorage.setItem('books', JSON.stringify(books));
        return { message: 'borrowed' };
    }
    if (endpoint.startsWith('/return/') && method === 'POST') {
        const borrows = JSON.parse(localStorage.getItem('borrows'));
        const id = parseInt(endpoint.split('/').pop());
        const rec = borrows.find(r => r.id === id);
        if (rec) {
            rec.returned_at = new Date().toISOString();
            const books = JSON.parse(localStorage.getItem('books'));
            const b = books.find(x => x.id === rec.bookId);
            if (b) b.available = true;
            localStorage.setItem('books', JSON.stringify(books));
            localStorage.setItem('borrows', JSON.stringify(borrows));
            return { message: 'returned' };
        }
        throw new Error('Borrow not found');
    }
    if (endpoint === '/borrows' && method === 'GET') {
        return JSON.parse(localStorage.getItem('borrows'));
    }
    return null;
}

// --- Catalog Page with Search/Borrow: require auth to view ---
async function loadCatalog() {
    if (!requireAuth('catalog.html')) return;
    const list = document.getElementById('book-list');
    const searchBox = document.getElementById('search-box');
    if (!list) return;
    let books = await apiRequest('/books');
    // normalize backend vs fallback shapes
    books = (books || []).map((b, i) => ({ id: b.id || i+1, title: b.title, author: b.author, description: b.description, available: (b.status ? b.status === 'available' : (typeof b.available === 'undefined' ? true : b.available)) }));
    function render(filtered) {
        if (!filtered.length) { list.innerHTML = '<p>No books found.</p>'; return; }
        list.innerHTML = filtered.map(b =>
            `<div class="book-item">
                <h3>${b.title}</h3>
                <p>${b.author}</p>
                <a href="book.html?id=${b.id}">View Details</a><br>
                ${b.available ? `<button onclick="borrowBook(${b.id})">Borrow</button>` : '<span style="color:#888;">Not available</span>'}
            </div>`
        ).join('');
    }
    render(books);
    if (searchBox) {
        searchBox.oninput = function() {
            const q = searchBox.value.toLowerCase();
            render(books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)));
        };
    }
}

// Borrow by book id (works with API or fallback)
window.borrowBook = async function(bookId) {
    if (!requireAuth('catalog.html')) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    try {
        // try API (requires authenticated token)
        await apiRequest('/borrows', 'POST', { book_id: bookId });
        alert('Book borrowed.');
    } catch (err) {
        alert('Unable to borrow book: ' + (err.message || err));
    }
    // refresh
    if (document.getElementById('book-list')) loadCatalog();
    if (document.getElementById('book-details')) loadBookDetails();
};

// Book details (requires auth)
async function loadBookDetails() {
    if (!requireAuth('book.html')) return;
    const details = document.getElementById('book-details');
    if (!details) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const books = await apiRequest('/books');
    const book = (books || []).find(b => String(b.id) === String(id));
    if (!book) { details.innerHTML = '<p>Book not found.</p>'; return; }
    const available = (book.status ? book.status === 'available' : (typeof book.available === 'undefined' ? true : book.available));
    let borrowBtn = available ? `<button onclick="borrowBook(${book.id})">Borrow</button>` : '<span style="color:#888;">Not available</span>';
    details.innerHTML = `<h2>${book.title}</h2><p>Author: ${book.author}</p><p>${book.description || ''}</p>${borrowBtn}`;
}

window.returnBook = async function(borrowId) {
    if (!requireAuth('profile.html')) return;
    try {
        await apiRequest(`/return/${borrowId}`, 'POST');
        alert('Returned.');
        if (document.getElementById('profile-info')) loadProfile();
        if (document.getElementById('book-details')) loadBookDetails();
    } catch (err) {
        alert('Return failed: ' + (err.message || err));
    }
};

// --- Login/Register examples that store token ---
function handleLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.onsubmit = async function(e) {
        e.preventDefault();
        const email = form.querySelector('[name="email"]') ? form.email.value : form[0].value;
        const password = form.querySelector('[name="password"]') ? form.password.value : form[1].value;
        try {
            const res = await apiRequest('/users/login', 'POST', { email, password });
            saveAuthResponse(res);
            window.location.href = (new URLSearchParams(window.location.search).get('next')) || 'profile.html';
        } catch (err) {
            alert('Login failed. Try demo credentials or register.');
        }
    };
}

function handleRegister() {
    const form = document.getElementById('register-form');
    if (!form) return;
    form.onsubmit = async function(e) {
        e.preventDefault();
        const username = form.querySelector('[name="username"]') ? form.username.value : form[0].value;
        const email = form.querySelector('[name="email"]') ? form.email.value : form[1].value;
        const password = form.querySelector('[name="password"]') ? form.password.value : form[2].value;
        try {
            const res = await apiRequest('/users/register', 'POST', { username, email, password });
            // do not auto-login — require email verification
            alert(res.message || 'Registered. Please check your email and verify before logging in.');
            window.location.href = 'login.html';
        } catch (err) {
            alert('Registration failed: ' + (err.message || err));
        }
    };
}

// --- Profile ---
async function loadProfile() {
    if (!requireAuth('profile.html')) return;
    const info = document.getElementById('profile-info');
    if (!info) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    let html = `<h2>${user.username}</h2><p>${user.email || ''}</p><button onclick="logout()">Logout</button>`;
    try {
        const borrows = await apiRequest('/borrows', 'GET');
        if (borrows && borrows.length) {
            html += '<h3>Borrowed Books</h3><ul>';
            for (const b of borrows) {
                html += `<li>${b.title || 'Book #' + b.book_id} ${b.id ? `<button onclick="returnBook(${b.id})">Return</button>` : ''}</li>`;
            }
            html += '</ul>';
        } else {
            html += '<p>No borrowed books.</p>';
        }
    } catch {
        html += '<p>Unable to load borrowed books.</p>';
    }
    info.innerHTML = html;
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// --- Nav buttons: ensure Books requires auth ---
document.addEventListener('DOMContentLoaded', () => {
    ensureSampleBooks();
    // wire catalog/books button if present
    const catalogLink = document.querySelectorAll('a[href="catalog.html"], #books-btn, .btn-catalog');
    catalogLink.forEach(el => {
        el.addEventListener('click', function(e) {
            // if anchor, allow requireAuth to redirect; prevent default so we can check
            e.preventDefault();
            const target = this.getAttribute('href') || 'catalog.html';
            if (requireAuth('catalog.html')) window.location.href = target;
        });
    });

    // show/hide login/profile in header (IDs optional)
    const loginLink = document.getElementById('login-link');
    const registerLink = document.getElementById('register-link');
    const profileLink = document.getElementById('profile-link');
    const logoutBtn = document.getElementById('logout-btn');

    if (isAuthenticated()) {
        if (loginLink) loginLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        if (profileLink) profileLink.style.display = '';
        if (logoutBtn) logoutBtn.style.display = '';
    } else {
        if (loginLink) loginLink.style.display = '';
        if (registerLink) registerLink.style.display = '';
        if (profileLink) profileLink.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    if (document.getElementById('message')) showMessage();
    if (document.getElementById('book-list')) loadCatalog();
    if (document.getElementById('book-details')) loadBookDetails();
    if (document.getElementById('login-form')) handleLogin();
    if (document.getElementById('register-form')) handleRegister();
    if (document.getElementById('profile-info')) loadProfile();
});
