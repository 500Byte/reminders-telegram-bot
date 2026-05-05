using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
    services = [
        (name = "main", worker = .worker),
    ],
    sockets = [
        (service = "main", name = "http", address = "*:8080", http = ()),
    ]
);

const worker :Workerd.Worker = (
    modules = [
        (name = "worker", esModule = embed "index.js"),
    ],
    compatibilityDate = "2024-11-11",
      bindings = [
    (
      name = "SECRET_TELEGRAM_API_TOKEN",
      text = "put your token here before building your docker image"
    ),
  ],
);

