document.addEventListener("DOMContentLoaded", () => {
  const main = document.getElementById("main-content");
  if (!main) return;

  main.classList.add("fade-in");

  document.querySelectorAll("a.btn").forEach(link => {
    link.addEventListener("click", e => {
      const href = link.getAttribute("href");
      if (!href) return;

      e.preventDefault();

      main.classList.add("fade-out");

      setTimeout(() => {
        window.location.href = href;
      }, 200); 
    });
  });
});