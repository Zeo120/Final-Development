function attachPasswordToggle(input) {
  if (!input || input.dataset.passwordToggleBound === "true") {
    return;
  }

  if (input.parentElement && input.parentElement.classList.contains("password-input-wrapper")) {
    input.dataset.passwordToggleBound = "true";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "password-input-wrapper";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "password-toggle";
  toggle.textContent = "Show";
  toggle.title = "Show or hide password";

  toggle.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    toggle.textContent = isPassword ? "Hide" : "Show";
  });

  wrapper.appendChild(toggle);
  input.dataset.passwordToggleBound = "true";
}

function attachGlobalPasswordToggles() {
  document.querySelectorAll("input[type='password']").forEach(attachPasswordToggle);
}

document.addEventListener("DOMContentLoaded", () => {
  attachGlobalPasswordToggles();
});
