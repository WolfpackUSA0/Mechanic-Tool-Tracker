
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : { title: "Tool Control", body: "New alert" };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body }));
});
