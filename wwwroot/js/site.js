// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.

  document.addEventListener("DOMContentLoaded", function () {
    document.body.classList.add("fade-in");

    document.querySelectorAll("a.btn").forEach(function (link) {
      link.addEventListener("click", function (e) {
        const href = link.getAttribute("href");
        if (href) {
          e.preventDefault();
          document.body.classList.remove("fade-in");
          document.body.classList.add("fade-out");
          setTimeout(function () {
            window.location.href = href;
          }, 250);
        }
      });
    });
  });