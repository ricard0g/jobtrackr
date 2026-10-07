const mobileButton = document.getElementById("mobile-button");
const mobileLinks = document.querySelector(".header__inner-list-mobile");

mobileButton?.addEventListener("click", () => {
  const open = mobileButton.getAttribute("aria-expanded") !== "true";
  mobileButton.setAttribute("aria-expanded", String(open));
  mobileButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  mobileLinks?.classList.toggle("show-inner-list-mobile", open);
});

mobileLinks?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    mobileLinks.classList.remove("show-inner-list-mobile");
    mobileButton?.setAttribute("aria-expanded", "false");
    mobileButton?.setAttribute("aria-label", "Open menu");
  }
});

for (const question of document.querySelectorAll(".faq__question-group dt")) {
  const toggle = () => {
    const open = question
      .closest(".faq__question-group")
      .classList.toggle("is-open");
    question.setAttribute("aria-expanded", String(open));
  };
  question.addEventListener("click", toggle);
  question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  });
}

document.getElementById("year-date").textContent = new Date().getFullYear();
