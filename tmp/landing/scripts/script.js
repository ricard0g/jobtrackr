// Mobile Navbar
const mobileBtn = document.getElementById("mobile-button");
const mobileNavList = document.querySelector(".header__inner-list-mobile");

mobileBtn.addEventListener("click", (e) => {
	mobileNavList.classList.toggle("show-inner-list-mobile");
});

mobileNavList.addEventListener("click", (e) => {
	mobileNavList.classList.toggle("show-inner-list-mobile");
});

// Smooth scroll
let navbar;
if (window.innerWidth > 768) {
	navbar = document.querySelector(".header__navbar");
	console.log(navbar);
} else {
	navbar = document.querySelector(".header__navbar-mobile");
	console.log(navbar);
}

navbar.addEventListener("click", (e) => {
	const eTarget = e.target.closest("a");

	e.preventDefault();

	if (!eTarget || !eTarget.getAttribute("href")?.startsWith("#")) return;

	console.log(eTarget);
	console.log(eTarget.getAttribute("href"));

	const sectionSelected = document.getElementById(
		eTarget.getAttribute("href").replace("#", ""),
	);

	sectionSelected.scrollIntoView({ behavior: "smooth" });
});

// Footer Date
const yearDateSpan = document.getElementById("year-date");
yearDateSpan.innerHTML = new Date().getFullYear();
