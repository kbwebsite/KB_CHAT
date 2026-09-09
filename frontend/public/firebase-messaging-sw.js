/* Kryzen background-push handler (Firebase compat, static file).
 * Config is fetched at runtime from /api/config so no keys are baked in.
 * Only registered by the web app when push is configured; never in the APK.
 */
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

(function () {
  function show(title, body, url) {
    return self.registration.showNotification(title || 'Kryzen', {
      body: body || 'New message',
      icon: '/kryzen-logo.svg',
      badge: '/kryzen-logo.svg',
      data: { url: url || '/chat' },
    });
  }

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var url = (event.notification.data && event.notification.data.url) || '/chat';
    event.waitUntil(
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (list) {
          for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (c.url.indexOf('/chat') !== -1 && 'focus' in c) {
              try { c.navigate(url); } catch (e) {}
              return c.focus();
            }
          }
          if (clients.openWindow) return clients.openWindow(url);
        }),
    );
  });

  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      var fb = res && res.data && res.data.firebase;
      if (!fb || !fb.apiKey) return;
      try {
        firebase.initializeApp(fb);
        var messaging = firebase.messaging();
        messaging.onBackgroundMessage(function (payload) {
          var n = (payload && payload.notification) || {};
          var d = (payload && payload.data) || {};
          var link = d.conversation_id ? '/chat?conv=' + d.conversation_id : '/chat';
          return show(n.title, n.body, link);
        });
      } catch (e) {}
    })
    .catch(function () {});
})();
