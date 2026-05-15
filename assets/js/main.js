document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");

  document
    .querySelectorAll("[data-scroll-target]")
    .forEach((element) => {
      element.addEventListener("click", () => {
        const selector = element.getAttribute("data-scroll-target");
        if (!selector) {
          return;
        }

        const target = document.querySelector(selector);
        if (!target) {
          return;
        }

        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
});
