const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mobileSidebar = document.getElementById("mobile-sidebar");
const sidebarClose = document.getElementById("sidebar-close");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarLinks = document.querySelectorAll(".sidebar-link");

function openSidebar() {
  mobileSidebar.classList.add("active");
  sidebarOverlay.classList.add("active");
  mobileMenuToggle.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  mobileSidebar.classList.remove("active");
  sidebarOverlay.classList.remove("active");
  mobileMenuToggle.classList.remove("active");
  document.body.style.overflow = "";
}

mobileMenuToggle.addEventListener("click", function (e) {
  if (mobileSidebar.classList.contains("active")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

sidebarLinks.forEach((link) => {
  link.addEventListener("click", function () {
    closeSidebar();
  });
});

window.addEventListener("resize", function () {
  if (window.innerWidth > 768 && mobileSidebar.classList.contains("active")) {
    closeSidebar();
  }
});

function isMobileDevice() {
  return window.innerWidth <= 768;
}

function isTabletDevice() {
  return window.innerWidth <= 1024 && window.innerWidth > 768;
}

// Authentication functionality
document.addEventListener("DOMContentLoaded", function () {
  // Password toggle functionality
  const passwordToggles = document.querySelectorAll(".password-toggle");

  passwordToggles.forEach((toggle) => {
    toggle.addEventListener("click", function () {
      const passwordField = this.parentElement.querySelector("input");
      const toggleText = this.querySelector(".password-toggle-text");

      if (passwordField.type === "password") {
        passwordField.type = "text";
        toggleText.textContent = "Hide";
      } else {
        passwordField.type = "password";
        toggleText.textContent = "Show";
      }
    });
  });

  // Login form handling
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const remember = document.getElementById("remember").checked;

      // Basic validation
      if (!email || !password) {
        alert("Please fill in all required fields.");
        return;
      }

      // Here you would typically send data to your server
      console.log("Login attempt:", { email, password, remember });
      alert(
        "Login functionality would be implemented here. Redirecting to home page..."
      );

      // Simulate successful login - redirect to home page
      window.location.href = "index.html";
    });
  }

  // Signup form handling
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const firstName = document.getElementById("firstName").value;
      const lastName = document.getElementById("lastName").value;
      const email = document.getElementById("email").value;
      const phone = document.getElementById("phone").value;
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;
      const termsAccepted = document.getElementById("terms").checked;
      const newsletter = document.getElementById("newsletter").checked;

      // Basic validation
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        alert("Please fill in all required fields.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      if (password.length < 8) {
        alert("Password must be at least 8 characters long.");
        return;
      }

      if (!termsAccepted) {
        alert("Please accept the Terms of Service and Privacy Policy.");
        return;
      }

      // Here you would typically send data to your server
      console.log("Signup attempt:", {
        firstName,
        lastName,
        email,
        phone,
        password,
        newsletter,
      });

      alert("Account created successfully! Redirecting to login page...");

      // Simulate successful signup - redirect to login page
      window.location.href = "login.html";
    });
  }

  // Social login buttons (placeholder functionality)
  const socialButtons = document.querySelectorAll(".social-button");
  socialButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const provider = this.classList.contains("google-btn")
        ? "Google"
        : "Facebook";
      alert(`${provider} authentication would be implemented here.`);
    });
  });
});
