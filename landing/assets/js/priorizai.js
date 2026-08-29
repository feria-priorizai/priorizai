/* PriorizAI — landing
   Interacciones mínimas: navbar pegada, revelado al scroll,
   conteo de cifras, barras comparativas y validación del formulario. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Año en el footer ---- */
  var y = document.getElementById('pzYear');
  if (y) y.textContent = new Date().getFullYear();

  /* ---- Navbar: borde al hacer scroll ---- */
  var nav = document.getElementById('pzNavbar');
  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Cierra el menú móvil al navegar ---- */
  var menu = document.getElementById('pzNavMenu');
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (menu.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(menu).hide();
      }
    });
  });

  /* ---- Panel de triage: recorridos medidos, no fijos ----
     La tarjeta "Alta" tiene que quedar exactamente donde estaba la primera,
     así que el desplazamiento sale de las alturas reales de las filas (que
     cambian si el diagnóstico envuelve a dos líneas en anchos angostos). */
  var list = document.querySelector('.pz-triage__list');
  if (list && !reduce) {
    var promote = list.querySelector('.pz-ic--promote');
    var shifted = [].slice.call(list.querySelectorAll('.pz-ic--shift'));
    var first = list.querySelector('.pz-ic');

    if (promote && first && shifted.length) {
      var waapi = typeof promote.animate === 'function';
      var running = [];

      /* El reordenamiento es el único movimiento del panel: la fila "Alta" sube
         al primer puesto y las otras tres bajan un lugar, todo en un mismo
         gesto. Con transiciones CSS el navegador decide cuándo arranca cada una
         y se desincronizan; con la Web Animations API se les fija el mismo
         startTime. */
      var play = function (forward) {
        /* Se mide en cada vuelta: el recorrido cambia si la ventana se
           redimensionó o si un diagnóstico pasó a ocupar dos líneas. */
        var up = promote.offsetTop - first.offsetTop;
        var down = promote.offsetHeight +
                   (parseFloat(getComputedStyle(promote).marginBottom) || 0);
        if (!up || !down) return;

        promote.classList.toggle('is-up', forward);

        if (!waapi) {                       /* respaldo: transición CSS */
          shifted.forEach(function (el) {
            el.style.transform = forward ? 'translateY(' + down + 'px)' : '';
          });
          promote.style.transform = forward ? 'translateY(' + (-up) + 'px)' : '';
          return;
        }

        var opts = {
          duration: 800,
          easing: 'cubic-bezier(.65,.05,.25,1)',
          fill: 'forwards'
        };
        var frames = function (px) {
          var a = { transform: 'translateY(0px)' };
          var b = { transform: 'translateY(' + px + 'px)' };
          return forward ? [a, b] : [b, a];
        };

        var previous = running;
        running = shifted.map(function (el) { return el.animate(frames(down), opts); });
        running.push(promote.animate(frames(-up), opts));

        /* Un único origen temporal: las cuatro filas se mueven al unísono. */
        var tl = running[0].timeline;
        if (tl && tl.currentTime !== null) {
          running.forEach(function (a) { a.startTime = tl.currentTime; });
        }
        previous.forEach(function (a) { a.cancel(); });
      };

      var sort  = function () { play(true); };
      var reset = function () { play(false); };

      var t2;
      var cycle = function () {
        sort();
        t2 = setTimeout(reset, 3200);
      };

      /* Solo corre mientras el panel está a la vista. */
      var timer = null;
      var start = function () {
        if (timer) return;
        cycle();
        timer = setInterval(cycle, 5600);
      };
      var stop = function () {
        clearInterval(timer); clearTimeout(t2);
        timer = null;
        /* Fuera de pantalla vuelve al orden original de golpe, sin animar. */
        running.forEach(function (a) { a.cancel(); });
        running = [];
        shifted.forEach(function (el) { el.style.transform = ''; });
        promote.style.transform = '';
        promote.classList.remove('is-up');
      };

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries[0].isIntersecting ? start() : stop();
        }, { threshold: 0.25 }).observe(list);
      } else {
        start();
      }
    }
  }

  /* ---- Revelado al entrar en pantalla ---- */
  var revealables = document.querySelectorAll('.pz-reveal');

  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
    document.querySelectorAll('.progress-bar[data-w]').forEach(function (b) {
      b.style.width = b.dataset.w + '%';
    });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);

        var bar = e.target.querySelector('.progress-bar[data-w]');
        if (bar) {
          setTimeout(function () { bar.style.width = bar.dataset.w + '%'; }, 220);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { io.observe(el); });

    /* Barras que no viven dentro de un .pz-reveal */
    document.querySelectorAll('.progress-bar[data-w]').forEach(function (b) {
      if (!b.closest('.pz-reveal')) b.style.width = b.dataset.w + '%';
    });
  }

  /* ---- Conteo de las cifras del riel ---- */
  var counters = document.querySelectorAll('[data-count]');
  if (!reduce && 'IntersectionObserver' in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        cio.unobserve(el);

        /* El número vive en el primer nodo de texto; el <small> («millón»,
           «min») queda intacto porque solo tocamos ese nodo. */
        var num = el.firstChild;
        if (!num || num.nodeType !== 3) return;

        var target = parseFloat(el.dataset.count);
        var finalText = num.nodeValue;          /* «8», «86,7%», … tal cual va en el HTML */
        var t0 = null;
        var dur = 900;
        var done = false;

        var settle = function () {
          if (done) return;
          done = true;
          num.nodeValue = finalText;
        };

        var tick = function (t) {
          if (done) return;
          if (t0 === null) t0 = t;
          var p = Math.min((t - t0) / dur, 1);
          if (p >= 1) { settle(); return; }
          num.nodeValue = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        /* Red de seguridad: si rAF se detiene (pestaña en segundo plano,
           ahorro de energía), la cifra real se muestra igual. */
        setTimeout(settle, 1600);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  /* ---- Formulario ---- */
  var form = document.getElementById('pzForm');
  var msg = document.getElementById('pzFormMsg');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      form.classList.add('was-validated');

      if (!form.checkValidity()) {
        msg.textContent = 'Revisa los campos marcados.';
        msg.style.color = '#C22B2B';
        var bad = form.querySelector(':invalid');
        if (bad) bad.focus();
        return;
      }

      /* Sin backend: se abre el cliente de correo con la solicitud armada.
         Reemplazar por un POST al endpoint real cuando exista. */
      var d = new FormData(form);
      var cuerpo =
        'Nombre: ' + d.get('nombre') + '\n' +
        'Correo: ' + d.get('email') + '\n' +
        'Institución: ' + d.get('institucion') + '\n' +
        'Rol: ' + d.get('rol') + '\n\n' +
        (d.get('mensaje') || '');

      window.location.href =
        'mailto:contacto@priorizai.cl' +
        '?subject=' + encodeURIComponent('Solicitud de demo PriorizAI — ' + d.get('institucion')) +
        '&body=' + encodeURIComponent(cuerpo);

      msg.textContent = 'Abriendo tu cliente de correo…';
      msg.style.color = 'var(--pz-green-ink)';
    });
  }
})();
