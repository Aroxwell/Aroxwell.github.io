// Aroxwell signup form — shared by every freebie page.
// Each page's <form class="signup" data-freebie="<freebie-key>"> sends
// { email, freebie } to the Cloudflare Worker, which adds the contact to EmailOctopus.
// The key must match an entry in the Worker's `freebieConfig`.

(function () {
  var WORKER_URL = "https://aroxwell-email.aroxwellbusiness.workers.dev";

  document.querySelectorAll("form.signup").forEach(function (form) {
    var input = form.querySelector("input[type=email]");
    var button = form.querySelector("button");
    var error = form.querySelector(".signup-error");
    var bar = form.querySelector(".glass-bar");
    var success = document.getElementById(form.getAttribute("data-success"));

    function showError(msg) {
      error.textContent = msg;
      input.setAttribute("aria-invalid", "true");
      if (bar) bar.classList.add("invalid");
      input.focus();
    }

    input.addEventListener("input", function () {
      error.textContent = "";
      input.removeAttribute("aria-invalid");
      if (bar) bar.classList.remove("invalid");
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var email = input.value.trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("Please enter a valid email address.");
        return;
      }

      error.textContent = "";
      form.classList.add("is-loading");
      button.disabled = true;

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 15000);

      try {
        var body = { email: email };
        var freebie = form.getAttribute("data-freebie");
        if (freebie) body.freebie = freebie;

        var response = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        var result = await response.json().catch(function () { return {}; });
        var status = result.emailOctopusStatus;

        if (status === 200 || status === 201) {
          form.hidden = true;
          if (success) { success.hidden = false; success.focus(); }
        } else if (status === 409) {
          showError("You're already on the list. Can't find the email? Check your spam or Promotions folder.");
        } else {
          console.warn("Signup failed", result);
          showError("Something went wrong on our side. Please try again in a minute.");
        }
      } catch (e) {
        showError("Couldn't connect. Check your internet connection and try again.");
      } finally {
        clearTimeout(timer);
        form.classList.remove("is-loading");
        button.disabled = false;
      }
    });
  });
})();
