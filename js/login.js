const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const inputs = loginForm.querySelectorAll("input");
        const username = inputs[0].value.trim();
        const password = inputs[1].value;

        let users = JSON.parse(localStorage.getItem("users")) || [];

        // Match user
        const user = users.find(
            u => u.username === username && u.password === password
        );

        if (!user) {
            alert("Invalid username or password");
            return;
        }

        // Store logged-in user
        localStorage.setItem("loggedInUser", username);

        alert("Login successful!");
        window.location.href = "profile.html";
    });
}