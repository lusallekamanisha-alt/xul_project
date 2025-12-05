const registerForm = document.getElementById("register-form");
if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const inputs = registerForm.querySelectorAll("input");
        const username = inputs[0].value.trim();
        const email = inputs[1].value.trim();
        const password = inputs[2].value;

        let users = JSON.parse(localStorage.getItem("users")) || [];

        // Check if username already exists
        if (users.some(u => u.username === username)) {
            alert("Username already taken!");
            return;
        }

        // Save new user
        users.push({ username, email, password });
        localStorage.setItem("users", JSON.stringify(users));

        alert("Registration successful!");
        window.location.href = "login.html";
    });
}