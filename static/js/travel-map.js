/*
 * Travel page: Leaflet map of trips plus a photo gallery lightbox.
 *
 * Reads trip data from the #travel-data JSON script tag rendered by
 * templates/travel.html and no-ops if #travel-map is absent. Leaflet is
 * vendored under static/vendor/leaflet/ and loaded before this file.
 * Gallery styles live in travel.html's extra_head block (.travel-gallery-*).
 */
(function () {
  'use strict';

  var mapEl = document.getElementById('travel-map');
  var dataEl = document.getElementById('travel-data');
  if (!mapEl || !dataEl) return;

  var trips;
  try {
    trips = JSON.parse(dataEl.textContent || '[]');
  } catch (err) {
    return;
  }
  var tripsBySlug = {};
  trips.forEach(function (trip) { tripsBySlug[trip.slug] = trip; });

  // ---------------------------------------------------------------- map
  var map = null;
  var markers = {};
  if (typeof L !== 'undefined' && trips.length) {
    // Point Leaflet at the vendored marker images (directory of marker-icon.png).
    var markerIcon = mapEl.getAttribute('data-marker-icon');
    if (markerIcon) L.Icon.Default.imagePath = markerIcon.replace(/[^\/]+$/, '');

    map = L.map(mapEl, {
      worldCopyJump: true,
      scrollWheelZoom: false, // keep page scrolling predictable; click/tap to zoom
      tap: false,
    });
    map.on('focus click', function () { map.scrollWheelZoom.enable(); });
    map.on('blur mouseout', function () { map.scrollWheelZoom.disable(); });

    L.tileLayer(mapEl.getAttribute('data-tile-url'), {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    var bounds = [];
    trips.forEach(function (trip) {
      var marker = L.marker([trip.lat, trip.lng], {
        title: trip.name + ', ' + trip.country,
        alt: trip.name + ', ' + trip.country,
        keyboard: true,
      }).addTo(map);
      marker.bindTooltip(trip.name, { direction: 'top', offset: [-14, -14], className: 'travel-marker-label' });
      marker.on('click', function () { openGallery(trip.slug, 0, true); });
      marker.on('keypress', function (e) {
        var key = e.originalEvent && e.originalEvent.key;
        if (key === 'Enter' || key === ' ') openGallery(trip.slug, 0, true);
      });
      markers[trip.slug] = marker;
      bounds.push([trip.lat, trip.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 6);
    } else {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    }
  }

  // ------------------------------------------------------------ gallery
  var gallery = null;   // root overlay element
  var ui = {};          // named child elements
  var current = { trip: null, index: 0 };
  var lastFocus = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildGallery() {
    gallery = el('div', 'travel-gallery');
    gallery.hidden = true;
    gallery.setAttribute('role', 'dialog');
    gallery.setAttribute('aria-modal', 'true');
    gallery.setAttribute('aria-labelledby', 'travel-gallery-title');

    var dialog = el('div', 'travel-gallery-dialog');
    gallery.appendChild(dialog);

    ui.close = el('button', 'travel-gallery-close', '×');
    ui.close.type = 'button';
    ui.close.setAttribute('aria-label', 'Close gallery');
    dialog.appendChild(ui.close);

    var header = el('div', 'travel-gallery-header');
    ui.meta = el('div', 'travel-gallery-meta');
    ui.title = el('h2', null);
    ui.title.id = 'travel-gallery-title';
    ui.summary = el('p', null);
    header.appendChild(ui.meta);
    header.appendChild(ui.title);
    header.appendChild(ui.summary);
    dialog.appendChild(header);

    var stage = el('div', 'travel-gallery-stage');
    ui.prev = el('button', 'travel-gallery-nav travel-gallery-prev', '‹');
    ui.prev.type = 'button';
    ui.prev.setAttribute('aria-label', 'Previous photo');
    ui.next = el('button', 'travel-gallery-nav travel-gallery-next', '›');
    ui.next.type = 'button';
    ui.next.setAttribute('aria-label', 'Next photo');
    ui.img = el('img', null);
    ui.img.decoding = 'async';
    stage.appendChild(ui.prev);
    stage.appendChild(ui.img);
    stage.appendChild(ui.next);
    dialog.appendChild(stage);

    var captionRow = el('div', 'travel-gallery-caption');
    ui.caption = el('span', null);
    ui.counter = el('span', 'travel-gallery-counter');
    ui.counter.setAttribute('aria-live', 'polite');
    captionRow.appendChild(ui.caption);
    captionRow.appendChild(ui.counter);
    dialog.appendChild(captionRow);

    ui.thumbs = el('div', 'travel-gallery-thumbs');
    ui.thumbs.setAttribute('role', 'list');
    dialog.appendChild(ui.thumbs);

    ui.album = el('a', 'travel-gallery-album', 'See the full album ↗');
    ui.album.target = '_blank';
    ui.album.rel = 'noopener noreferrer';
    dialog.appendChild(ui.album);

    document.body.appendChild(gallery);

    ui.close.addEventListener('click', closeGallery);
    ui.prev.addEventListener('click', function () { step(-1); });
    ui.next.addEventListener('click', function () { step(1); });
    gallery.addEventListener('click', function (e) {
      if (e.target === gallery) closeGallery(); // backdrop only
    });
    document.addEventListener('keydown', function (e) {
      if (gallery.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeGallery(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'Tab') trapFocus(e);
    });

    // Swipe left/right on the stage.
    var touchStartX = null;
    stage.addEventListener('touchstart', function (e) {
      touchStartX = e.touches.length === 1 ? e.touches[0].clientX : null;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    });
  }

  function trapFocus(e) {
    var focusable = gallery.querySelectorAll('button:not([disabled]), a[href]');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function renderPhoto() {
    var trip = current.trip;
    var photo = trip.photos[current.index];
    ui.img.src = photo.src;
    ui.img.alt = photo.alt || (trip.name + ' photo ' + (current.index + 1));
    ui.caption.textContent = photo.caption || '';
    ui.counter.textContent = (current.index + 1) + ' / ' + trip.photos.length;
    ui.prev.disabled = current.index === 0;
    ui.next.disabled = current.index === trip.photos.length - 1;
    Array.prototype.forEach.call(ui.thumbs.children, function (btn, i) {
      var active = i === current.index;
      btn.setAttribute('aria-current', active ? 'true' : 'false');
      if (active && btn.scrollIntoView) {
        btn.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
    // Preload neighbours for snappy arrow/swipe navigation.
    [current.index - 1, current.index + 1].forEach(function (i) {
      if (trip.photos[i]) { var pre = new Image(); pre.src = trip.photos[i].src; }
    });
  }

  function step(delta) {
    if (!current.trip) return;
    var next = current.index + delta;
    if (next < 0 || next >= current.trip.photos.length) return;
    current.index = next;
    renderPhoto();
  }

  function openGallery(slug, index, updateHash) {
    var trip = tripsBySlug[slug];
    if (!trip) return;
    if (!gallery) buildGallery();
    lastFocus = document.activeElement;
    current.trip = trip;
    current.index = Math.min(Math.max(index || 0, 0), trip.photos.length - 1);

    ui.meta.textContent = trip.dates + (trip.sample ? ' · sample' : '');
    ui.title.textContent = trip.name + ', ' + trip.country;
    ui.summary.textContent = trip.summary;
    ui.thumbs.innerHTML = '';
    trip.photos.forEach(function (photo, i) {
      var btn = el('button', null);
      btn.type = 'button';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', 'Photo ' + (i + 1) + ' of ' + trip.photos.length);
      var thumb = el('img', null);
      thumb.src = photo.thumb || photo.src;
      thumb.alt = '';
      thumb.loading = 'lazy';
      btn.appendChild(thumb);
      btn.addEventListener('click', function () { current.index = i; renderPhoto(); });
      ui.thumbs.appendChild(btn);
    });
    ui.thumbs.style.display = trip.photos.length > 1 ? '' : 'none';
    if (trip.album_url) {
      ui.album.href = trip.album_url;
      ui.album.style.display = '';
    } else {
      ui.album.removeAttribute('href');
      ui.album.style.display = 'none';
    }
    renderPhoto();

    gallery.hidden = false;
    document.body.classList.add('travel-gallery-open');
    ui.close.focus();
    if (updateHash && window.history && history.replaceState) {
      history.replaceState(null, '', '#' + slug);
    }
  }

  function closeGallery() {
    if (!gallery || gallery.hidden) return;
    gallery.hidden = true;
    document.body.classList.remove('travel-gallery-open');
    current.trip = null;
    if (window.history && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Trip cards: open the gallery instead of jumping to the anchor.
  Array.prototype.forEach.call(document.querySelectorAll('[data-trip]'), function (card) {
    card.addEventListener('click', function (e) {
      var slug = card.getAttribute('data-trip');
      if (!tripsBySlug[slug]) return;
      e.preventDefault();
      openGallery(slug, 0, true);
      if (map && markers[slug]) map.panTo(markers[slug].getLatLng());
    });
  });

  // Deep link: /travel#<slug> opens that trip; hash changes while open follow suit.
  function openFromHash() {
    var slug = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (slug && tripsBySlug[slug]) {
      openGallery(slug, 0, false);
      if (map && markers[slug]) map.panTo(markers[slug].getLatLng());
    }
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();
