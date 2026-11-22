/*
 * Orbit's push service worker (agent-design AG16; 设计稿 §5.3).
 *
 * It does two things and nothing else:
 *   push              shows the reminder the server sent: the fixed title and the one fixed sentence.
 *   notificationclick opens Orbit's own inbox. The address is built here; nothing in the message can change where a
 *                     click goes. What the reminder is about is read by the inbox page after sign-in.
 * It has no fetch handler: it never sees, caches or changes a page or an API request.
 */
"use strict";

var INBOX_PATH = "/app/inbox?tab=notifications";
var DELIVERY_ID = /^[A-Za-z0-9:_-]{1,96}$/;

function text(value, fallback, limit) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function inboxUrl(deliveryId) {
  var url = new URL(INBOX_PATH, self.location.origin);
  if (typeof deliveryId === "string" && DELIVERY_ID.test(deliveryId)) url.searchParams.set("delivery", deliveryId);
  return url.href;
}

self.addEventListener("push", function (event) {
  var message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch (error) {
    message = {};
  }
  if (!message || typeof message !== "object") message = {};
  var deliveryId = message.data && typeof message.data.deliveryId === "string" && DELIVERY_ID.test(message.data.deliveryId) ? message.data.deliveryId : null;
  var title = text(message.title, "Orbit", 60);
  var options = {
    body: text(message.body, "", 200),
    // Only the opaque id is kept on the notification.
    data: { deliveryId: deliveryId },
    // A second round for the same period replaces the first instead of stacking.
    tag: deliveryId || "orbit-reminder",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = inboxUrl(event.notification.data && event.notification.data.deliveryId);
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function (windows) {
      for (var index = 0; index < windows.length; index += 1) {
        var client = windows[index];
        var sameSite = false;
        try {
          sameSite = new URL(client.url).origin === self.location.origin;
        } catch (error) {
          sameSite = false;
        }
        if (sameSite && typeof client.navigate === "function" && typeof client.focus === "function") {
          return client.navigate(target).then(function (opened) {
            return (opened || client).focus();
          });
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
